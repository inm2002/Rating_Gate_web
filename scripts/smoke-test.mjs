import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const port = 5174
const wsPort = 8790
const url = `http://127.0.0.1:${port}/`
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const testCoverPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
)

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

const waitForWsServer = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('WebSocket server did not start in time')), 7000)
  wsServer.stdout.on('data', (chunk) => {
    if (chunk.toString().includes('Bangumi room server listening')) {
      clearTimeout(timeout)
      resolve()
    }
  })
  wsServer.stderr.on('data', (chunk) => console.error(chunk.toString()))
  wsServer.on('exit', (code) => {
    if (code !== null && code !== 0) reject(new Error(`WebSocket server exited with ${code}`))
  })
})

const server = await createServer({
  logLevel: 'silent',
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
  },
})

try {
  await waitForWsServer
  await server.listen()

  const browser = await chromium.launch({ executablePath: chromePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  await page.addInitScript(() => {
    localStorage.setItem('rating-gate-analytics-consent-v1', 'declined')
  })
  const errors = []

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('http://127.0.0.1:8787/api/admin/analytics', async (route) => {
    const now = new Date().toISOString()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        generatedAt: now,
        updatedAt: now,
        consent: { shownCount: 2, acceptedCount: 1, declinedCount: 1, updatedAt: now },
        games: {
          total: 90,
          byMediaKind: { anime: 48, manga: 0, lightNovel: 0, galgame: 42 },
          byMode: { classic: 48, timed: 42 },
          accuracyBuckets: [0, 1, 3, 6, 10, 14, 20, 18, 12, 6],
          distributions: [
            {
              mediaKind: 'anime',
              mode: 'classic',
              length: 5,
              buckets: [0, 1, 2, 3, 6, 8, 11, 9, 6, 2],
              total: 48,
              updatedAt: now,
            },
            {
              mediaKind: 'galgame',
              mode: 'timed',
              length: 90,
              buckets: [0, 0, 1, 3, 4, 6, 9, 9, 7, 3],
              total: 42,
              updatedAt: now,
            },
          ],
        },
        pairs: { scannedPairs: 0, totalShown: 0, totalCorrect: 0, totalWrong: 0, topPairs: [] },
      }),
    })
  })
  await page.route('http://127.0.0.1:8787/api/analytics/benchmark**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        mediaKind: 'anime',
        mode: 'classic',
        length: 1,
        buckets: [0, 1, 2, 3, 6, 8, 11, 9, 6, 2],
        total: 48,
        updatedAt: new Date().toISOString(),
      }),
    })
  })
  await page.route('https://lain.bgm.tv/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: testCoverPng })
  })
  await page.route('http://127.0.0.1:8787/api/cover**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: testCoverPng })
  })

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
  await page.locator('[data-media-kind="manga"]').click()
  await page.waitForSelector('#prompt:text("哪部漫画评分更高")')
  await page.waitForSelector('#card-left img[src]')
  const mangaPool = await page.locator('#pool-count').innerText()
  const mangaExcludesHidden = await page.locator('#solo-anime-excludes').isHidden()
  const mangaPresetsHidden = await page.locator('#solo-anime-presets').isHidden()
  await page.locator('#manga-filter-completed + span').click()
  await page.waitForTimeout(200)
  const completedMangaPool = await page.locator('#pool-count').innerText()
  await page.locator('[data-media-kind="lightNovel"]').click()
  await page.waitForSelector('#prompt:text("哪部轻小说评分更高")')
  await page.waitForSelector('#card-left img[src]')
  const lightNovelPool = await page.locator('#pool-count').innerText()
  const lightNovelExcludesHidden = await page.locator('#solo-anime-excludes').isHidden()
  const lightNovelPresetsHidden = await page.locator('#solo-anime-presets').isHidden()
  await page.locator('#light-novel-filter-web + span').click()
  await page.waitForTimeout(200)
  const nonWebLightNovelPool = await page.locator('#pool-count').innerText()
  await page.locator('[data-media-kind="galgame"]').click()
  await page.waitForSelector('#prompt:text("哪部Galgame评分更高")')
  await page.waitForSelector('#title-left:not(:empty)')
  const galgamePool = await page.locator('#pool-count').innerText()
  const galgamePresetsHidden = await page.locator('#solo-anime-presets').isHidden()
  await page.locator('[data-galgame-audience="allAges"]').click()
  await page.waitForTimeout(200)
  const allAgesGalgamePool = await page.locator('#pool-count').innerText()
  await page.locator('[data-galgame-audience="adult"]').click()
  await page.waitForTimeout(200)
  const adultGalgamePool = await page.locator('#pool-count').innerText()
  const adultTitleCover = await page.locator('#poster-left').getAttribute('data-title-cover')
  await page.locator('[data-media-kind="anime"]').click()
  await page.waitForSelector('#prompt:text("哪部动画评分更高")')
  await page.locator('#score-min').fill('1')
  await page.waitForTimeout(100)
  const customPressed = await page
    .locator('[data-preset]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-pressed')))
  await page.locator('#score-min').fill('')
  await page.waitForTimeout(100)
  const soloScoreEmptyValue = await page.locator('#score-min').inputValue()
  const totalBeforeTypingShortcut = await page.locator('#metric-total').innerText()
  await page.locator('#score-min').type('1')
  await page.waitForTimeout(150)
  const totalAfterTypingShortcut = await page.locator('#metric-total').innerText()
  await page.locator('#score-min').fill('')
  await page.locator('#score-min').type('7.')
  await page.waitForTimeout(100)
  const soloScoreDecimalPending = await page.locator('#score-min').inputValue()
  await page.locator('#score-min').fill('')
  await page.locator('#score-min').type('4.9')
  await page.waitForTimeout(100)
  const soloScoreTypedValue = await page.locator('#score-min').inputValue()
  await page.locator('#year-min').fill('')
  await page.waitForTimeout(100)
  const soloYearEmptyValue = await page.locator('#year-min').inputValue()
  const totalBeforeSoloYearTyping = await page.locator('#metric-total').innerText()
  await page.locator('#year-min').type('1998')
  await page.waitForTimeout(250)
  const soloYearTypedValue = await page.locator('#year-min').inputValue()
  const totalAfterSoloYearTyping = await page.locator('#metric-total').innerText()
  await page.locator('[data-year-range="before2010"]').click()
  await page.waitForTimeout(150)
  const soloQuickYearMin = await page.locator('#year-min').inputValue()
  const soloQuickYearMax = await page.locator('#year-max').inputValue()
  const soloQuickYearPressed = await page.locator('[data-year-range="before2010"]').getAttribute('aria-pressed')
  await page.locator('#restart').click()
  await page.waitForTimeout(300)
  await page.locator('#solo-view .stage').click()
  const totalBeforeSoloShortcut = await page.locator('#metric-total').innerText()
  await page.keyboard.press('1')
  await page.waitForTimeout(500)
  const totalAfterSoloShortcut = await page.locator('#metric-total').innerText()
  await page.locator('#view-multiplayer').click()
  await page.waitForSelector('#room-entry-state:text("联机已连接")')
  await page.waitForTimeout(200)
  await page.locator('#player-name').fill('测试玩家')
  await page.locator('#create-room').click()
  await page.waitForSelector('#room-lobby:not([hidden])')
  const multiplayerPressed = await page.locator('#view-multiplayer').getAttribute('aria-pressed')
  const lobbyVisible = await page.locator('#room-lobby').isVisible()
  const roomCode = await page.locator('#room-code-display').inputValue()
  const roomCodeReadonly = await page.locator('#room-code-display').getAttribute('readonly')
  const roomCodeInputReadonly = await page.locator('#room-code-input').getAttribute('readonly')
  const playerRow = await page.locator('#room-player-list').innerText()
  await page.locator('#copy-room-code').click()
  await page.waitForTimeout(100)
  const toastText = await page.locator('#toast').innerText()
  await page.locator('#toast-close').click()
  const toastClosed = await page.locator('#toast').isHidden()
  await page.locator('#room-length-input').fill('12')
  await page.locator('#room-length-input').dispatchEvent('change')
  const classicLength = await page.locator('#room-length').innerText()
  await page.locator('#room-mode-timed').click()
  await page.waitForTimeout(100)
  await page.locator('#room-length-input').fill('120')
  await page.locator('#room-length-input').dispatchEvent('change')
  const roomModeNote = await page.locator('#room-mode-note').innerText()
  const roomLength = await page.locator('#room-length').innerText()
  await page.locator('[data-room-preset="akashi"]').click()
  await page.waitForTimeout(100)
  const roomScoreMax = await page.locator('#room-score-max').inputValue()
  const roomPool = await page.locator('#room-pool').innerText()
  await page.locator('[data-room-media-kind="manga"]').click()
  await page.waitForTimeout(300)
  const roomMangaPool = await page.locator('#room-pool').innerText()
  const roomMangaExcludesHidden = await page.locator('#room-anime-excludes').isHidden()
  const roomMangaPresetsHidden = await page.locator('#room-anime-presets').isHidden()
  await page.locator('#room-manga-filter-completed + span').click()
  await page.waitForTimeout(200)
  const roomCompletedMangaPool = await page.locator('#room-pool').innerText()
  await page.locator('[data-room-media-kind="galgame"]').click()
  await page.waitForTimeout(300)
  const roomGalgamePool = await page.locator('#room-pool').innerText()
  const roomGalgameExcludesHidden = await page.locator('#room-anime-excludes').isHidden()
  const roomGalgamePresetsHidden = await page.locator('#room-anime-presets').isHidden()
  await page.locator('[data-room-galgame-audience="adult"]').click()
  await page.waitForTimeout(200)
  const roomAdultGalgamePool = await page.locator('#room-pool').innerText()
  await page.locator('[data-room-media-kind="anime"]').click()
  await page.waitForTimeout(300)
  await page.locator('#room-score-min').fill('')
  await page.waitForTimeout(250)
  const roomScoreEmptyValue = await page.locator('#room-score-min').inputValue()
  await page.locator('#room-score-min').type('7.')
  await page.waitForTimeout(250)
  const roomScoreDecimalPending = await page.locator('#room-score-min').inputValue()
  await page.locator('#room-score-min').fill('')
  await page.locator('#room-score-min').type('4.9')
  await page.locator('#room-score-max').fill('')
  await page.locator('#room-score-max').type('7.5')
  await page.waitForTimeout(250)
  const roomScoreTypedMin = await page.locator('#room-score-min').inputValue()
  const roomScoreTypedMax = await page.locator('#room-score-max').inputValue()
  const roomPresetAfterScoreTyping = await page
    .locator('[data-room-preset]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-pressed')))
  await page.locator('#room-year-min').fill('')
  await page.waitForTimeout(250)
  const roomYearEmptyValue = await page.locator('#room-year-min').inputValue()
  await page.locator('#room-year-min').type('1998')
  await page.waitForTimeout(250)
  const roomYearTypedValue = await page.locator('#room-year-min').inputValue()
  const roomPresetAfterYearTyping = await page
    .locator('[data-room-preset]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-pressed')))
  await page.locator('[data-room-year-range="before2010"]').click()
  await page.waitForTimeout(250)
  const roomQuickYearMin = await page.locator('#room-year-min').inputValue()
  const roomQuickYearMax = await page.locator('#room-year-max').inputValue()
  const roomQuickYearPressed = await page.locator('[data-room-year-range="before2010"]').getAttribute('aria-pressed')
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
  await page.goto(`${url}#admin`, { waitUntil: 'networkidle' })
  await page.locator('#admin-token').fill('test-admin-token')
  await page.locator('#admin-auth button').click()
  await page.waitForSelector('#admin-dashboard:not([hidden])')
  const adminDistributionCards = await page.locator('.admin-distribution-card').count()
  const adminDistributionText = await page.locator('#admin-accuracy-bars').innerText()
  await page.locator('#view-solo').click()
  const soloHashAfterAdmin = new URL(page.url()).hash
  await page.evaluate(() => {
    location.hash = '#admin'
  })
  await page.waitForSelector('#admin-view:not([hidden])')
  const adminTokenAfterReentry = await page.locator('#admin-token').inputValue()
  const adminDashboardHiddenAfterReentry = await page.locator('#admin-dashboard').isHidden()
  await page.locator('#view-multiplayer').click()
  const multiplayerHashAfterAdmin = new URL(page.url()).hash

  const mobile = await browser.newPage({ viewport: { width: 390, height: 820 } })
  await mobile.addInitScript(() => {
    localStorage.setItem('rating-gate-analytics-consent-v1', 'declined')
  })
  await mobile.goto(url, { waitUntil: 'networkidle' })
  await mobile.waitForSelector('#card-right img[src]')

  await browser.close()

  if (title !== 'Rating;Gate') throw new Error(`Unexpected title: ${title}`)
  if (!ruleNote.includes('胜者进入下一轮')) throw new Error(`Missing rule note: ${ruleNote}`)
  if (standardPressed !== 'true') throw new Error('Standard preset was not highlighted initially')
  if (!/部$/.test(poolCount)) throw new Error(`Unexpected pool count: ${poolCount}`)
  if (akashiCount === '0 部' || akashiMax !== '4.9') throw new Error(`Akashi preset failed: ${akashiCount}`)
  if (!akashiDefaultExcludes) throw new Error('Preset default excludes were not checked')
  if (brahminYear !== '2009' || brahminRanking !== 'deep') throw new Error('Brahmin preset failed')
  if (totalAfterClick !== '1') throw new Error(`Answer click did not increment total: ${totalAfterClick}`)
  if (scores[0] === scores[1]) throw new Error(`Generated tied scores: ${scores.join(' vs ')}`)
  if (footerLinkCount !== 3) throw new Error(`Expected 3 footer links, found ${footerLinkCount}`)
  if (!footerText.includes('数据更新时间')) throw new Error('Footer did not include data update time')
  if (!footerText.includes('inm2002/Rating_Gate_web')) throw new Error('Footer did not include GitHub repository link')
  if (mangaPool === '0 部' || !mangaExcludesHidden || !mangaPresetsHidden) {
    throw new Error(
      `Manga solo pool did not switch cleanly: pool=${mangaPool}, excludes=${mangaExcludesHidden}, presets=${mangaPresetsHidden}`,
    )
  }
  if (completedMangaPool === mangaPool || completedMangaPool === '0 部') {
    throw new Error(`Completed manga filter did not narrow pool: ${mangaPool} -> ${completedMangaPool}`)
  }
  if (lightNovelPool === '0 部' || !lightNovelExcludesHidden || !lightNovelPresetsHidden) {
    throw new Error(
      `Light novel solo pool did not switch cleanly: pool=${lightNovelPool}, excludes=${lightNovelExcludesHidden}, presets=${lightNovelPresetsHidden}`,
    )
  }
  if (nonWebLightNovelPool === lightNovelPool || nonWebLightNovelPool === '0 部') {
    throw new Error(`Light novel Web filter did not narrow pool: ${lightNovelPool} -> ${nonWebLightNovelPool}`)
  }
  if (galgamePool === '0 部') throw new Error(`Galgame solo pool did not switch: ${galgamePool}`)
  if (!galgamePresetsHidden) throw new Error('Galgame solo presets should stay anime-only')
  if (allAgesGalgamePool === '0 部' || adultGalgamePool === '0 部' || adultTitleCover !== 'true') {
    throw new Error(
      `Galgame audience filters/title cover failed: allAges=${allAgesGalgamePool}, adult=${adultGalgamePool}, cover=${adultTitleCover}`,
    )
  }
  if (customPressed.some((value) => value !== 'false')) throw new Error('Custom filters should clear preset highlight')
  if (totalBeforeTypingShortcut !== totalAfterTypingShortcut) {
    throw new Error(`Typing 1 in score input should not answer: ${totalBeforeTypingShortcut} -> ${totalAfterTypingShortcut}`)
  }
  if (soloScoreEmptyValue !== '' || soloScoreDecimalPending !== '7.' || soloScoreTypedValue !== '4.9') {
    throw new Error(
      `Solo score input should allow decimal editing: empty=${soloScoreEmptyValue}, pending=${soloScoreDecimalPending}, typed=${soloScoreTypedValue}`,
    )
  }
  if (soloYearEmptyValue !== '' || soloYearTypedValue !== '1998') {
    throw new Error(`Solo year input should allow direct editing: empty=${soloYearEmptyValue}, typed=${soloYearTypedValue}`)
  }
  if (totalBeforeSoloYearTyping !== totalAfterSoloYearTyping) {
    throw new Error(`Typing in solo year input should not answer: ${totalBeforeSoloYearTyping} -> ${totalAfterSoloYearTyping}`)
  }
  if (soloQuickYearMin !== '1900' || soloQuickYearMax !== '2009' || soloQuickYearPressed !== 'true') {
    throw new Error(`Solo year shortcut failed: ${soloQuickYearMin}-${soloQuickYearMax}`)
  }
  if (multiplayerPressed !== 'true' || !lobbyVisible) throw new Error('Multiplayer room UI did not open')
  if (!/^[A-Z2-9]{6}$/.test(roomCode)) throw new Error(`Unexpected room code: ${roomCode}`)
  if (roomCodeReadonly === null || roomCodeInputReadonly !== null) {
    throw new Error('Generated room code should be read only while join input remains editable')
  }
  if (!toastText.includes(roomCode) || !toastClosed) throw new Error('Room code copy toast did not work')
  if (!playerRow.includes('测试玩家')) throw new Error('Created room did not show local player')
  if (classicLength !== '12 题') throw new Error('Classic room length did not update')
  if (!roomModeNote.includes('各自连续答题') || roomLength !== '120 秒') {
    throw new Error('Timed room mode did not update copy or length')
  }
  if (roomScoreMax !== '4.9' || roomPool === '0 部') throw new Error('Room preset settings did not apply')
  if (roomMangaPool === '0 部' || !roomMangaExcludesHidden || !roomMangaPresetsHidden) {
    throw new Error(
      `Room Manga pool did not switch cleanly: pool=${roomMangaPool}, excludes=${roomMangaExcludesHidden}, presets=${roomMangaPresetsHidden}`,
    )
  }
  if (roomCompletedMangaPool === roomMangaPool || roomCompletedMangaPool === '0 部') {
    throw new Error(`Room completed manga filter did not narrow pool: ${roomMangaPool} -> ${roomCompletedMangaPool}`)
  }
  if (roomGalgamePool === '0 部' || !roomGalgameExcludesHidden || !roomGalgamePresetsHidden) {
    throw new Error(
      `Room Galgame pool did not switch cleanly: pool=${roomGalgamePool}, excludes=${roomGalgameExcludesHidden}, presets=${roomGalgamePresetsHidden}`,
    )
  }
  if (roomAdultGalgamePool === '0 部') throw new Error('Room adult Galgame filter returned an empty pool')
  if (
    roomScoreEmptyValue !== '' ||
    roomScoreDecimalPending !== '7.' ||
    roomScoreTypedMin !== '4.9' ||
    roomScoreTypedMax !== '7.5'
  ) {
    throw new Error(
      `Room score input should allow decimal editing: empty=${roomScoreEmptyValue}, pending=${roomScoreDecimalPending}, min=${roomScoreTypedMin}, max=${roomScoreTypedMax}`,
    )
  }
  if (roomPresetAfterScoreTyping.some((value) => value !== 'false')) {
    throw new Error('Custom room score range should clear preset highlight')
  }
  if (roomYearEmptyValue !== '' || roomYearTypedValue !== '1998') {
    throw new Error(`Room year input should allow direct editing: empty=${roomYearEmptyValue}, typed=${roomYearTypedValue}`)
  }
  if (roomPresetAfterYearTyping.some((value) => value !== 'false')) {
    throw new Error('Custom room year range should clear preset highlight')
  }
  if (roomQuickYearMin !== '1900' || roomQuickYearMax !== '2009' || roomQuickYearPressed !== 'true') {
    throw new Error(`Room year shortcut failed: ${roomQuickYearMin}-${roomQuickYearMax}`)
  }
  if (!readyVisible) throw new Error('Timed ready dialog did not open')
  if (timerBeforeStart !== '90s' || timerStillPaused !== '90s') {
    throw new Error(`Timed mode started before confirmation: ${timerBeforeStart} -> ${timerStillPaused}`)
  }
  if (timerText !== '89s') throw new Error(`Timed mode did not start after confirmation: ${timerText}`)
  if (adminDistributionCards !== 2 || !adminDistributionText.includes('动画 · 经典') || !adminDistributionText.includes('Galgame · 限时')) {
    throw new Error(`Admin distributions should stay separated by comparable group: ${adminDistributionText}`)
  }
  if (totalBeforeSoloShortcut !== '0' || totalAfterSoloShortcut !== '1') {
    throw new Error(`Solo shortcut should answer outside inputs: ${totalBeforeSoloShortcut} -> ${totalAfterSoloShortcut}`)
  }
  if (soloHashAfterAdmin) throw new Error(`Solo navigation did not clear admin hash: ${soloHashAfterAdmin}`)
  if (adminTokenAfterReentry || !adminDashboardHiddenAfterReentry) {
    throw new Error('Admin session was still visible after leaving and re-entering admin')
  }
  if (multiplayerHashAfterAdmin) {
    throw new Error(`Multiplayer navigation did not clear admin hash: ${multiplayerHashAfterAdmin}`)
  }
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)

  console.log(`Smoke test passed: ${poolCount}, answered=${totalAfterClick}, timer=${timerText}`)
} finally {
  await server.close()
  wsServer.kill()
}
