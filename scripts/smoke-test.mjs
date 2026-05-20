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
  const poolCount = await page.locator('#pool-count').innerText()
  await page.locator('#card-left').click()
  await page.waitForTimeout(1400)
  const totalAfterClick = await page.locator('#metric-total').innerText()
  await page.locator('#mode-timed').click()
  await page.waitForTimeout(400)
  const timerText = await page.locator('#metric-lives').innerText()

  const mobile = await browser.newPage({ viewport: { width: 390, height: 820 } })
  await mobile.goto(url, { waitUntil: 'networkidle' })
  await mobile.waitForSelector('#card-right img[src]')

  await browser.close()

  if (!/部$/.test(poolCount)) throw new Error(`Unexpected pool count: ${poolCount}`)
  if (totalAfterClick !== '1') throw new Error(`Answer click did not increment total: ${totalAfterClick}`)
  if (!/s$/.test(timerText)) throw new Error(`Timed mode did not show seconds: ${timerText}`)
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)

  console.log(`Smoke test passed: ${poolCount}, answered=${totalAfterClick}, timer=${timerText}`)
} finally {
  await server.close()
}
