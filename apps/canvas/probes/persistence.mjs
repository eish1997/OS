import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c02')
await mkdir(output, { recursive: true })
const base = process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'
const name = `Persistence-${Date.now()}`
let browser
let page
const errors = []
async function open() {
  browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
  return page
}
async function snapshot(page) {
  return page.evaluate(() => {
    const s = window.openPencil.getStore()
    return s.graph.getNode(s.state.currentPageId).childIds.map(id => {
      const n = s.graph.getNode(id)
      return { type: n.type, x: n.x, y: n.y, width: n.width, height: n.height }
    })
  })
}
try {
  page = await open()
  await page.evaluate(name => { window.openPencil.getStore().state.documentName = name }, name)
  const bounds = await page.locator('[data-test-id="canvas-area"]').boundingBox()
  await page.keyboard.press('r')
  await page.mouse.move(bounds.x + 450, bounds.y + 220)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 670, bounds.y + 380, { steps: 10 })
  await page.mouse.up()
  const original = await snapshot(page)
  assert.equal(original.length, 1)
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 30000 })
  await page.screenshot({ path: resolve(output, 'saved.png') })
  await browser.close()
  page = await open()
  assert.equal((await snapshot(page)).length, 0)
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await expect(page.getByLabel('本机画布列表')).toBeVisible()
  await writeFile(resolve(output, 'listed-names.json'), JSON.stringify(await page.getByLabel('本机画布列表').getByRole('button').allTextContents()))
  await page.getByRole('button', { name: `${name} · 1`, exact: true }).click()
  await expect.poll(() => snapshot(page), { timeout: 30000 }).toEqual(original)
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await page.screenshot({ path: resolve(output, 'reopened.png') })
  // The server commits but the response is lost. Retry must recover the same revision.
  const canvasBounds = await page.locator('[data-test-id="canvas-area"]').boundingBox()
  await page.keyboard.press('r')
  await page.mouse.move(canvasBounds.x + 400, canvasBounds.y + 100)
  await page.mouse.down()
  await page.mouse.move(canvasBounds.x + 490, canvasBounds.y + 160, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('有未保存改动')
  await page.route('**/os-workspace/canvases/*', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    await route.abort('failed')
  })
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('保存失败，可重试')
  const changed = await snapshot(page)
  assert.equal(changed.length, 2)
  await page.unroute('**/os-workspace/canvases/*')
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await expect(page.getByRole('button', { name: `${name} · 2`, exact: true })).toBeVisible()
  assert.deepEqual(await snapshot(page), changed)
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'persistence.json'), JSON.stringify({ status: 'passed', date: new Date().toISOString(),
    base, original, restored: original, afterRetry: changed, errors,
    checks: ['mouse drawing', 'UI save waits for disk service', 'fresh browser process', 'UI list and reopen retains geometry',
      'later edits mark dirty', 'lost response retains content and retry recovers revision 2 without duplicate commit'],
    limitations: ['this probe uses explicit save buttons', 'identity and view restoration are not asserted by this probe', 'no service process restart in this browser probe'] }, null, 2) + '\n')
  console.log('PASS: UI save and fresh browser reopen')
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'persistence-failure.png') }).catch(() => {})
  await writeFile(resolve(output, 'persistence-failure.txt'), String(error.stack ?? error))
  throw error
} finally { await browser?.close() }
