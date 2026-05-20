import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const endpoint = 'https://api.bgm.tv/v0/search/subjects'
const outputPath = resolve('public/anime-seed.json')
const metaOutputPath = resolve('public/anime-seed-meta.json')
const pageSize = 20
const sleepMs = 120
const maxPagesPerQuery = 25

const rankWindows = [
  [1, 500],
  [501, 1000],
  [1001, 1500],
  [1501, 2000],
  [2001, 2500],
  [2501, 3000],
  [3001, 3500],
  [3501, 4000],
  [4001, 4500],
  [4501, 5000],
  [5001, 5500],
  [5501, 6000],
  [6001, 6500],
  [6501, 7000],
  [7001, 7500],
  [7501, 8000],
  [8001, 8500],
  [8501, 9000],
]

const queries = [
  ...rankWindows.map(([from, to]) => ({
    label: `rank ${from}-${to}`,
    sort: 'rank',
    filter: { type: [2], nsfw: false, rank: [`>=${from}`, `<=${to}`] },
  })),
  {
    label: 'heat',
    sort: 'heat',
    filter: { type: [2], nsfw: false },
  },
  {
    label: 'score',
    sort: 'score',
    filter: { type: [2], nsfw: false },
  },
  {
    label: 'low score heat',
    sort: 'heat',
    filter: { type: [2], nsfw: false, rating: ['<5'] },
  },
  {
    label: 'low score rank',
    sort: 'rank',
    filter: { type: [2], nsfw: false, rating: ['<5'] },
  },
  {
    label: 'recent high vote',
    sort: 'heat',
    filter: { type: [2], nsfw: false, date: ['>=2018-01-01'] },
  },
]

function normalize(item) {
  const score = Number(item.rating?.score ?? 0)
  const votes = Number(item.rating?.total ?? 0)
  const image = item.images?.common ?? item.images?.large ?? item.image ?? ''
  if (item.type !== 2 || item.nsfw || score <= 0 || votes < 100 || !image) return null
  const tagNames = Array.isArray(item.tags) ? item.tags.map((tag) => tag.name).filter(Boolean) : []
  const metaTags = Array.isArray(item.meta_tags) ? item.meta_tags.filter(Boolean) : []
  return {
    id: item.id,
    name: item.name ?? '',
    nameCn: item.name_cn ?? '',
    score,
    votes,
    rank: item.rating?.rank ?? null,
    date: item.date ?? '',
    image,
    tags: [...new Set([...metaTags, ...tagNames])],
    platform: item.platform ?? '',
  }
}

function wait(ms) {
  return new Promise((resolveTimer) => setTimeout(resolveTimer, ms))
}

async function requestPage(query, offset) {
  const url = `${endpoint}?limit=${pageSize}&offset=${offset}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'AniScoreArenaPrototype/0.2 (local seed generator)',
    },
    body: JSON.stringify({
      keyword: '',
      sort: query.sort,
      filter: query.filter,
    }),
  })
  if (!response.ok) throw new Error(`${query.label}: HTTP ${response.status}`)
  return response.json()
}

async function collectQuery(query, byId) {
  let offset = 0
  let page = 0
  while (page < maxPagesPerQuery) {
    const payload = await requestPage(query, offset)
    const rows = payload.data.map(normalize).filter(Boolean)
    for (const row of rows) byId.set(row.id, row)

    process.stdout.write(
      `\r${query.label.padEnd(18)} page ${String(page + 1).padStart(2)} collected ${String(
        byId.size,
      ).padStart(4)}`,
    )

    offset += pageSize
    page += 1
    if (!payload.data.length || offset >= payload.total) break
    await wait(sleepMs)
  }
  process.stdout.write('\n')
}

const byId = new Map()
for (const query of queries) {
  await collectQuery(query, byId)
  await wait(sleepMs * 2)
}

const seed = [...byId.values()]
  .filter((item) => item.votes >= 100)
  .sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank
    if (a.rank) return -1
    if (b.rank) return 1
    return b.votes - a.votes
  })

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')
await writeFile(
  metaOutputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'Bangumi API',
      count: seed.length,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`Wrote ${seed.length} anime to ${outputPath}`)
