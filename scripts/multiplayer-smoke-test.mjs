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
  const analyticsPayloads = []
  for (const page of [host, guest]) {
    await page.route('http://127.0.0.1:8787/api/results', async (route) => {
      analyticsPayloads.push(JSON.parse(route.request().postData() || '{}'))
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })
  }
  await host.addInitScript(() => {
    localStorage.setItem('rating-gate-analytics-consent-v1', 'accepted')
  })
  await guest.addInitScript(() => {
    localStorage.setItem('rating-gate-analytics-consent-v1', 'declined')
  })
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
  await host.locator('[data-room-media-kind="lightNovel"]').click()
  await host.waitForSelector('[data-room-media-kind="lightNovel"][aria-pressed="true"]')
  await guest.waitForSelector('[data-room-media-kind="lightNovel"][aria-pressed="true"]')
  const guestLightNovelExcludesHidden = await guest.locator('#room-anime-excludes').isHidden()
  if (!guestLightNovelExcludesHidden) throw new Error('Guest should hide anime-only room excludes for light novels')
  await host.locator('[data-room-media-kind="manga"]').click()
  await host.waitForSelector('[data-room-media-kind="manga"][aria-pressed="true"]')
  await guest.waitForSelector('[data-room-media-kind="manga"][aria-pressed="true"]')
  const guestMangaExcludesHidden = await guest.locator('#room-anime-excludes').isHidden()
  if (!guestMangaExcludesHidden) throw new Error('Guest should hide anime-only room excludes for manga')
  await host.locator('#room-manga-filter-completed + span').click()
  await guest.waitForSelector('#room-manga-filter-completed:checked')
  await host.locator('#room-score-min').fill('')
  await host.locator('#room-score-min').type('1')
  const lobbyStillVisible = await host.locator('#room-lobby').isVisible()
  const battleStillHidden = await host.locator('#room-battle').isHidden()
  if (!lobbyStillVisible || !battleStillHidden) throw new Error('Typing 1 in lobby settings should not answer or leave lobby')
  await host.locator('#room-score-min').blur()
  await host.locator('#room-length-input').fill('1')
  await host.locator('#room-length-input').dispatchEvent('change')
  await host.waitForSelector('#room-length:text("1 题")')

  await host.locator('#room-start').click()
  await host.waitForSelector('#room-battle:not([hidden])')
  await guest.waitForSelector('#room-battle:not([hidden])')
  await host.waitForSelector('#room-info-media:text("漫画")')
  await host.waitForSelector('#room-image-left[src]')
  await guest.waitForSelector('#room-image-left[src]')

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

  await host.keyboard.press('1')
  await host.waitForSelector('#room-match-note:text("等待房间内所有玩家")')
  const selectedClass = await host.locator('#room-answer-left').getAttribute('class')
  if (!selectedClass.includes('is-selected')) throw new Error(`Keyboard selected answer was not highlighted: ${selectedClass}`)
  await guest.keyboard.press('2')
  await host.waitForSelector('#room-battle-status:text("结算中")')
  await guest.waitForSelector('#room-battle-status:text("结算中")')
  await host.waitForSelector('#room-battle-status:text("已结束")', { timeout: 4000 })
  await guest.waitForSelector('#room-battle-status:text("已结束")', { timeout: 4000 })
  await host.waitForSelector('#room-result-dialog[open]')
  await guest.waitForSelector('#room-result-dialog[open]')
  await waitFor(() => analyticsPayloads.some((payload) => payload.source === 'multiplayer'))
  const multiplayerPayload = analyticsPayloads.find((payload) => payload.source === 'multiplayer')
  if (!multiplayerPayload?.answers?.length) throw new Error('Multiplayer analytics did not include answers')

  const hostScoreRows = await host.locator('#room-battle-player-list').innerText()
  const rankText = await host.locator('#room-rank-list').innerText()
  if (!/\d+ 分/.test(hostScoreRows)) throw new Error(`Scoreboard did not render scores: ${hostScoreRows}`)
  if (!rankText.includes('房主') || !rankText.includes('挑战者')) throw new Error(`Ranking did not render players: ${rankText}`)
  await host.locator('#room-result-close').click()
  await host.waitForSelector('#room-lobby:not([hidden])')
  await guest.waitForSelector('#room-lobby:not([hidden])')
  const dialogClosed = await guest.locator('#room-result-dialog').evaluate((node) => !node.open)
  if (!dialogClosed) throw new Error('Guest result dialog did not close after returning to lobby')

  await host.locator('[data-room-media-kind="galgame"]').click()
  await host.waitForSelector('[data-room-media-kind="galgame"][aria-pressed="true"]')
  await guest.waitForSelector('[data-room-media-kind="galgame"][aria-pressed="true"]')
  await host.locator('[data-room-galgame-audience="adult"]').click()
  await guest.waitForSelector('[data-room-galgame-audience="adult"][aria-pressed="true"]')
  await host.locator('#room-mode-timed').click()
  await host.locator('#room-length-input').fill('30')
  await host.locator('#room-length-input').dispatchEvent('change')
  await host.locator('#room-start').click()
  await host.waitForSelector('#room-info-media:text("Galgame")')
  await guest.waitForSelector('#room-info-mode:text("限时")')
  await host.waitForSelector('#room-poster-left[data-title-cover="true"]')
  await host.keyboard.press('2')
  await host.waitForTimeout(500)
  const timedHostProgress = await host.locator('#room-info-progress').innerText()
  if (!timedHostProgress.includes('剩余')) throw new Error(`Timed room did not render local timer: ${timedHostProgress}`)
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)

  await browser.close()
  console.log(`Multiplayer smoke test passed: room=${code}, question="${hostQuestion.join(' vs ')}"`)
} finally {
  await viteServer.close()
  wsServer.kill()
}

function waitFor(predicate, timeout = 4000) {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve()
        return
      }
      if (Date.now() - startedAt > timeout) {
        reject(new Error('Timed out waiting for condition'))
        return
      }
      setTimeout(tick, 50)
    }
    tick()
  })
}
