// Run against an explicitly supplied isolated canvas instance, never a user instance.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const address = process.env.OS_CANVAS_TEST_URL
if (!address) throw new Error('OS_CANVAS_TEST_URL must identify an isolated test instance')
const output = resolve(process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-embedding/standalone')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] })
const errors = [], requests = []
const report = { url: address, sample: 'one rectangle created by pointer, autosave and reopen', errors, requests }
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) requests.push({ url: response.url(), status: response.status() }) })
  const started = performance.now()
  await page.goto(`${address}/?test&os-canvas&no-rulers`)
  const canvas = page.locator('[data-test-id="canvas-element"][data-ready="1"]')
  await canvas.waitFor({ timeout: 90000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
  report.loadMs = performance.now() - started
  const name = `Embedding baseline ${Date.now()}`
  await page.evaluate(name => { window.openPencil.getStore().state.documentName = name }, name)
  await page.keyboard.press('r')
  await page.mouse.move(550, 330)
  const editStarted = performance.now()
  await page.mouse.down()
  await page.mouse.move(730, 450, { steps: 10 })
  await page.mouse.up()
  await page.waitForFunction(() => {
    const s = window.openPencil.getStore()
    return s.graph.getNode(s.state.currentPageId).childIds.length === 1
  })
  report.drawMs = performance.now() - editStarted
  await page.waitForFunction(() => document.querySelector('[data-slot="local-save-status"]')?.textContent?.trim() === '已保存到本机', undefined, { timeout: 30000 })
  const snapshot = () => page.evaluate(() => {
    const s = window.openPencil.getStore()
    return s.graph.getNode(s.state.currentPageId).childIds.map(id => {
      const n = s.graph.getNode(id)
      return { type: n.type, x: n.x, y: n.y, width: n.width, height: n.height }
    })
  })
  report.saved = await snapshot()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  report.metrics = (await cdp.send('Performance.getMetrics')).metrics
  await page.screenshot({ path: resolve(output, 'saved.png') })
  await page.reload()
  await canvas.waitFor({ timeout: 90000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByRole('button', { name: `${name} · 1`, exact: true }).click()
  await page.waitForFunction(() => window.openPencil.getStore().graph.getNode(window.openPencil.getStore().state.currentPageId).childIds.length === 1)
  assert.deepEqual(await snapshot(), report.saved)
  assert.equal(errors.length, 0, JSON.stringify(errors))
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = String(error.stack ?? error)
  throw error
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
