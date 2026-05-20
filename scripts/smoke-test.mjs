import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const port = 5174
const url = `http://127.0.0.1:${port}/`
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const server = await createServer({
  logLevel: 'silent',
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
  },
})

try {
  await server.listen()

  const browser = await chromium.launch({ executablePath: chromePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  const errors = []

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('#card-left img[src]')
  const title = await page.locator('h1').innerText()
  const poolCount = await page.locator('#pool-count').innerText()
  const ruleNote = await page.locator('#round-note').innerText()
  const standardPressed = await page.locator('[data-preset="standard"]').getAttribute('aria-pressed')
  await page.locator('[data-preset="akashi"]').click()
  await page.waitForTimeout(300)
  const akashiCount = await page.locator('#pool-count').innerText()
  const akashiMax = await page.locator('#score-max').inputValue()
  const akashiDefaultExcludes = await page
    .locator('#exclude-guochan, #exclude-movies, #exclude-oumei, #exclude-recap')
    .evaluateAll((nodes) => nodes.every((node) => node.checked))
  await page.locator('[data-preset="brahmin"]').click()
  await page.waitForTimeout(300)
  const brahminYear = await page.locator('#year-max').inputValue()
  const brahminRanking = await page.locator('#ranking').inputValue()
  await page.locator('[data-preset="standard"]').click()
  await page.waitForTimeout(300)
  await page.locator('#card-left').click()
  await page.waitForTimeout(1400)
  const totalAfterClick = await page.locator('#metric-total').innerText()
  const scores = await page.locator('.score-line').evaluateAll((nodes) => nodes.map((node) => node.textContent))
  const footerLinkCount = await page.locator('.site-footer a').count()
  const footerText = await page.locator('.site-footer').innerText()
  await page.locator('#score-min').fill('1')
  await page.waitForTimeout(100)
  const customPressed = await page
    .locator('[data-preset]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-pressed')))
  await page.locator('#view-multiplayer').click()
  await page.waitForTimeout(200)
  await page.locator('#player-name').fill('测试玩家')
  await page.locator('#create-room').click()
  const multiplayerPressed = await page.locator('#view-multiplayer').getAttribute('aria-pressed')
  const lobbyVisible = await page.locator('#room-lobby').isVisible()
  const roomCode = await page.locator('#room-code-display').inputValue()
  const roomCodeReadonly = await page.locator('#room-code-display').getAttribute('readonly')
  const roomCodeInputReadonly = await page.locator('#room-code-input').getAttribute('readonly')
  const playerRow = await page.locator('#room-player-list').innerText()
  await page.locator('#copy-room-code').click()
  await page.waitForTimeout(100)
  const copyRoomText = await page.locator('#copy-room-code').innerText()
  await page.locator('#room-mode-timed').click()
  await page.waitForTimeout(100)
  const roomModeNote = await page.locator('#room-mode-note').innerText()
  const roomLength = await page.locator('#room-length').innerText()
  await page.locator('[data-room-preset="akashi"]').click()
  await page.waitForTimeout(100)
  const roomScoreMax = await page.locator('#room-score-max').inputValue()
  const roomPool = await page.locator('#room-pool').innerText()
  await page.locator('#view-solo').click()
  await page.waitForTimeout(200)
  await page.locator('#mode-timed').click()
  const readyVisible = await page.locator('#timed-ready-dialog').isVisible()
  const timerBeforeStart = await page.locator('#metric-lives').innerText()
  await page.waitForTimeout(1100)
  const timerStillPaused = await page.locator('#metric-lives').innerText()
  await page.locator('#timed-start').click()
  await page.waitForTimeout(1200)
  const timerText = await page.locator('#metric-lives').innerText()

  const mobile = await browser.newPage({ viewport: { width: 390, height: 820 } })
  await mobile.goto(url, { waitUntil: 'networkidle' })
  await mobile.waitForSelector('#card-right img[src]')

  await browser.close()

  if (title !== '目标是番组鉴分王') throw new Error(`Unexpected title: ${title}`)
  if (!ruleNote.includes('胜者进入下一轮')) throw new Error(`Missing rule note: ${ruleNote}`)
  if (standardPressed !== 'true') throw new Error('Standard preset was not highlighted initially')
  if (!/部$/.test(poolCount)) throw new Error(`Unexpected pool count: ${poolCount}`)
  if (akashiCount === '0 部' || akashiMax !== '4.9') throw new Error(`Akashi preset failed: ${akashiCount}`)
  if (!akashiDefaultExcludes) throw new Error('Preset default excludes were not checked')
  if (brahminYear !== '2009' || brahminRanking !== 'deep') throw new Error('Brahmin preset failed')
  if (totalAfterClick !== '1') throw new Error(`Answer click did not increment total: ${totalAfterClick}`)
  if (scores[0] === scores[1]) throw new Error(`Generated tied scores: ${scores.join(' vs ')}`)
  if (footerLinkCount !== 2) throw new Error(`Expected 2 source links, found ${footerLinkCount}`)
  if (!footerText.includes('数据更新时间')) throw new Error('Footer did not include data update time')
  if (customPressed.some((value) => value !== 'false')) throw new Error('Custom filters should clear preset highlight')
  if (multiplayerPressed !== 'true' || !lobbyVisible) throw new Error('Multiplayer room UI did not open')
  if (!/^[A-Z2-9]{6}$/.test(roomCode)) throw new Error(`Unexpected room code: ${roomCode}`)
  if (roomCodeReadonly === null || roomCodeInputReadonly === null) throw new Error('Room code should be read only after creation')
  if (copyRoomText !== '已复制') throw new Error('Room code copy button did not respond')
  if (!playerRow.includes('测试玩家')) throw new Error('Created room did not show local player')
  if (!roomModeNote.includes('各自连续答题') || roomLength !== '90 秒') throw new Error('Timed room mode did not update copy')
  if (roomScoreMax !== '4.9' || roomPool === '0 部') throw new Error('Room preset settings did not apply')
  if (!readyVisible) throw new Error('Timed ready dialog did not open')
  if (timerBeforeStart !== '90s' || timerStillPaused !== '90s') {
    throw new Error(`Timed mode started before confirmation: ${timerBeforeStart} -> ${timerStillPaused}`)
  }
  if (timerText !== '89s') throw new Error(`Timed mode did not start after confirmation: ${timerText}`)
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)

  console.log(`Smoke test passed: ${poolCount}, answered=${totalAfterClick}, timer=${timerText}`)
} finally {
  await server.close()
}
