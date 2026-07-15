import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'

const root = resolve(import.meta.dirname, '..')
const workerDir = join(root, 'worker')
const workerPort = 8792
const webPort = 5176
const adminToken = 'test-admin-token-for-local-analytics'
const persistDir = await mkdtemp(join(tmpdir(), 'rating-gate-analytics-'))
const vite = await createServer({
  root,
  logLevel: 'silent',
  server: { host: '127.0.0.1', port: webPort, strictPort: true },
})

const wranglerBin = join(workerDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const worker = spawn(process.execPath, [wranglerBin,
  'dev', '--ip', '127.0.0.1', '--port', String(workerPort), '--local',
  '--var', `ADMIN_TOKEN:${adminToken}`,
  '--var', `SEED_BASE_URL:http://127.0.0.1:${webPort}`,
  '--persist-to', persistDir,
], { cwd: workerDir, stdio: ['ignore', 'pipe', 'pipe'] })

let workerOutput = ''
worker.stdout.on('data', (chunk) => { workerOutput += chunk.toString() })
worker.stderr.on('data', (chunk) => { workerOutput += chunk.toString() })

const base = `http://127.0.0.1:${workerPort}`
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

async function waitForWorker() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/ws`)
      if (response.status === 426) return
    } catch {
      // Worker is still starting.
    }
    await sleep(250)
  }
  throw new Error(`Worker did not start.\n${workerOutput}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function runNode(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { output += chunk.toString() })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolvePromise(output) : reject(new Error(output)))
  })
}

function forbiddenKeys(value, path = '') {
  if (!value || typeof value !== 'object') return []
  const forbidden = /^(ip|userAgent|nickname|roomCode|adminToken|gameId)$/i
  return Object.entries(value).flatMap(([key, child]) => [
    ...(forbidden.test(key) ? [`${path}${key}`] : []),
    ...forbiddenKeys(child, `${path}${key}.`),
  ])
}

try {
  await vite.listen()
  await waitForWorker()
  const subjects = JSON.parse(await readFile(join(root, 'public', 'anime-seed.json'), 'utf8'))
  const left = subjects[0]
  const right = subjects.find((subject) => subject.id !== left.id && subject.score !== left.score)
  const third = subjects.find((subject) => subject.id !== left.id && subject.id !== right.id && subject.score !== right.score)
  assert(right && third, 'Could not find distinct-score subjects for analytics test.')
  const winner = left.score > right.score ? left : right
  const secondWinner = right.score > third.score ? right : third
  const payload = {
    version: 2,
    source: 'solo',
    gameId: crypto.randomUUID(),
    mediaKind: 'anime',
    mode: 'classic',
    preset: 'standard',
    length: 2,
    answers: [
      { leftId: left.id, rightId: right.id, selectedId: winner.id },
      { leftId: right.id, rightId: third.id, selectedId: secondWinner.id === right.id ? third.id : right.id },
    ],
  }
  const submit = await fetch(`${base}/api/results`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  })
  const submitJson = await submit.json()
  assert(submit.ok && submitJson.acceptedAnswers === 2 && submitJson.correct === 1, 'v2 result was not stored correctly.')
  const duplicate = await fetch(`${base}/api/results`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }).then((response) => response.json())
  assert(duplicate.duplicate === true, 'Duplicate game was counted again.')

  const retryGameId = crypto.randomUUID()
  const invalidFirstAttempt = await fetch(`${base}/api/results`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      ...payload, gameId: retryGameId, answers: [{ leftId: -1, rightId: -2, selectedId: -1 }],
    }),
  })
  assert(invalidFirstAttempt.status === 400, 'Invalid analytics payload was unexpectedly accepted.')
  const validRetry = await fetch(`${base}/api/results`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      ...payload, gameId: retryGameId, answers: [payload.answers[0]], length: 1,
    }),
  }).then((response) => response.json())
  assert(validRetry.acceptedAnswers === 1 && !validRetry.duplicate, 'A failed submission poisoned the idempotency key.')

  const paginationAnchor = subjects.find((subject) => subject.score > 0)
  const paginationCandidates = subjects
    .filter((subject) => subject.id !== paginationAnchor.id && subject.score !== paginationAnchor.score)
    .slice(0, 1005)
  assert(paginationCandidates.length === 1005, 'Not enough seed subjects for the >1000 pair test.')
  for (let offset = 0; offset < paginationCandidates.length; offset += 80) {
    const batch = paginationCandidates.slice(offset, offset + 80)
    const batchPayload = {
      version: 2,
      source: 'multiplayer',
      gameId: crypto.randomUUID(),
      mediaKind: 'anime',
      mode: 'classic',
      preset: 'custom',
      length: batch.length,
      answers: batch.map((subject) => ({
        leftId: paginationAnchor.id,
        rightId: subject.id,
        selectedId: paginationAnchor.score > subject.score ? paginationAnchor.id : subject.id,
      })),
    }
    const response = await fetch(`${base}/api/results`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batchPayload),
    })
    assert(response.ok, `The >1000 pair test failed at offset ${offset}.`)
  }

  await fetch(`${base}/api/analytics/consent`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'accepted' }),
  })
  const authHeaders = { authorization: `Bearer ${adminToken}` }
  const report = await fetch(`${base}/api/admin/analytics`, { headers: authHeaders }).then((response) => response.json())
  assert(report.ok && report.games.total === 15, 'Admin report did not include all v2 games.')
  assert(report.pairs.totalShown === 1008 && report.pairs.totalCorrect === 1007, 'Admin pair totals are incorrect.')
  assert(report.pairs.scannedPairs > 1000, 'Admin report still truncates combinations at 1000.')
  assert(report.consent.acceptedCount === 1, 'v2 consent aggregate is missing.')
  assert(report.storage?.schemaVersion === 2, 'Admin report does not expose schema v2 health metadata.')

  const benchmark = await fetch(`${base}/api/analytics/benchmark?mediaKind=anime&mode=classic`).then((response) => response.json())
  assert(benchmark.total === 15, 'Public benchmark did not merge v2 data.')

  const exportResponse = await fetch(`${base}/api/admin/analytics/export?format=json`, { headers: authHeaders })
  const exported = await exportResponse.json()
  assert(exportResponse.ok && exported.manifest.analyticsSchemaVersion === 2, 'JSON export is invalid.')
  assert(exported.v2.pairs.length > 1000 && exported.v2.gamesDaily.length >= 2, 'JSON export is incomplete or truncated.')
  assert(forbiddenKeys(exported).length === 0, `Export contains forbidden fields: ${forbiddenKeys(exported).join(', ')}`)
  const unauthorizedExport = await fetch(`${base}/api/admin/analytics/export?format=json`)
  assert(unauthorizedExport.status === 401, 'Analytics export is accessible without the admin token.')

  const exportFile = join(persistDir, 'analytics-export.json')
  const reportDir = join(persistDir, 'report')
  await writeFile(exportFile, JSON.stringify(exported), 'utf8')
  await runNode([join(root, 'scripts', 'analyze-analytics.mjs'), exportFile, '--out', reportDir])
  const markdownReport = await readFile(join(reportDir, 'report.md'), 'utf8')
  assert(markdownReport.includes('Rating;Gate 匿名统计分析报告'), 'Local report generator did not create the report.')

  const csvResponse = await fetch(`${base}/api/admin/analytics/export?format=csv`, { headers: authHeaders })
  const csv = await csvResponse.text()
  assert(csvResponse.ok && csv.includes('subjectAId') && csv.includes('v2'), 'CSV export is invalid.')
  console.log('Analytics Worker integration test passed.')
} finally {
  const workerExited = new Promise((resolvePromise) => worker.once('exit', resolvePromise))
  worker.kill()
  await Promise.race([workerExited, sleep(5000)])
  await vite.close()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(persistDir, { recursive: true, force: true })
      break
    } catch (error) {
      if (attempt === 4) throw error
      await sleep(300)
    }
  }
}
