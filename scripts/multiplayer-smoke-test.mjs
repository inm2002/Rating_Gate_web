import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const vitePort = 5175
const wsPort = 8791
const url = `http://127.0.0.1:${vitePort}/`
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

process.env.VITE_WS_URL = `ws://127.0.0.1:${wsPort}`

const wsServer = spawn(process.execPath, ['scripts/ws-room-server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    BGM_WS_HOST: '127.0.0.1',
    BGM_WS_PORT: String(wsPort),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const waitForServer = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('WebSocket server did not start in time')), 7000)
  wsServer.stdout.on('data', (chunk) => {
    if (chunk.toString().includes('Bangumi room server listening')) {
      clearTimeout(timeout)
      resolve()
    }
  })
  wsServer.stderr.on('data', (chunk) => {
    console.error(chunk.toString())
  })
  wsServer.on('exit', (code) => {
    if (code !== null && code !== 0) reject(new Error(`WebSocket server exited with ${code}`))
  })
})

const viteServer = await createServer({
  logLevel: 'silent',
  server: {
    host: '127.0.0.1',
    port: vitePort,
    strictPort: true,
  },
})

try {
  await waitForServer
  await viteServer.listen()

  const browser = await chromium.launch({ executablePath: chromePath, headless: true })
  const host = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  const guest = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  const errors = []

  for (const page of [host, guest]) {
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.locator('#view-multiplayer').click()
    await page.waitForSelector('#room-entry-state:text("联机已连接")')
  }

  await host.locator('#player-name').fill('房主')
  await host.locator('#create-room').click()
  await host.waitForSelector('#room-lobby')
  const code = await host.locator('#room-code-display').inputValue()
  if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error(`Unexpected room code: ${code}`)

  await host.locator('#room-length-input').fill('1')
  await host.locator('#room-length-input').dispatchEvent('change')

  await guest.locator('#player-name').fill('挑战者')
  await guest.locator('#room-code-input').fill(code)
  await guest.locator('#join-room').click()
  await host.waitForSelector('#room-player-count:text("2/8")')
  await guest.waitForSelector('#room-player-count:text("2/8")')

  const hostPlayers = await host.locator('#room-player-list').innerText()
  const guestPlayers = await guest.locator('#room-player-list').innerText()
  if (!hostPlayers.includes('挑战者') || !guestPlayers.includes('房主')) {
    throw new Error(`Players did not sync:\nHost: ${hostPlayers}\nGuest: ${guestPlayers}`)
  }

  await host.locator('#room-start').click()
  await host.waitForSelector('#room-match:not([hidden])')
  await guest.waitForSelector('#room-match:not([hidden])')

  const hostQuestion = [
    await host.locator('#room-title-left').innerText(),
    await host.locator('#room-title-right').innerText(),
  ]
  const guestQuestion = [
    await guest.locator('#room-title-left').innerText(),
    await guest.locator('#room-title-right').innerText(),
  ]
  if (hostQuestion.join('|') !== guestQuestion.join('|')) {
    throw new Error(`Questions were not synchronized: ${hostQuestion.join(' / ')} vs ${guestQuestion.join(' / ')}`)
  }

  await host.locator('#room-answer-left').click()
  await host.waitForSelector('#room-match-note:text("等待房间内所有玩家")')
  await guest.locator('#room-answer-right').click()
  await host.waitForSelector('#room-status:text("本题结算")')
  await guest.waitForSelector('#room-status:text("本题结算")')
  await host.waitForSelector('#room-status:text("比赛结束")', { timeout: 4000 })
  await guest.waitForSelector('#room-status:text("比赛结束")', { timeout: 4000 })

  const hostScoreRows = await host.locator('#room-player-list').innerText()
  if (!/\d+ 分/.test(hostScoreRows)) throw new Error(`Scoreboard did not render scores: ${hostScoreRows}`)
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)

  await browser.close()
  console.log(`Multiplayer smoke test passed: room=${code}, question="${hostQuestion.join(' vs ')}"`)
} finally {
  await viteServer.close()
  wsServer.kill()
}
