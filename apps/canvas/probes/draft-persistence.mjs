import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, 'output/dev-evidence/canvas-c02')
await mkdir(output, { recursive: true })
const base = process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'
const name = `Draft-${Date.now()}`
let browser, page
const errors = []
async function open() {
  browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
}
async function snapshot() {
  return page.evaluate(() => {
    const s = window.openPencil.getStore()
    return s.graph.getChildren(s.state.currentPageId).map(n => ({
      id: n.pluginData.find(p => p.pluginId === 'os.canvas' && p.key === 'os.canvas/nodeId')?.value,
      x: n.x, y: n.y, width: n.width, height: n.height
    }))
  })
}
async function draw(x) {
  const b = await page.locator('[data-test-id="canvas-area"]').boundingBox()
  await page.keyboard.press('r')
  await page.mouse.move(b.x + x, b.y + 200)
  await page.mouse.down()
  await page.mouse.move(b.x + x + 80, b.y + 260, { steps: 8 })
  await page.mouse.up()
}
try {
  await open()
  let emptyWrites = 0
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/os-workspace/canvases/')) emptyWrites++ })
  await page.evaluate(name => { window.openPencil.getStore().state.documentName = name }, name)
  // Longer than the one-second autosave timer: an untouched blank does not create a file.
  await page.waitForTimeout(1600)
  assert.equal(emptyWrites, 0)
  await draw(420)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(1600)
  assert.equal((await snapshot()).length, 0)
  assert.equal(emptyWrites, 0)
  await draw(420)
  const original = await snapshot()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 15000 })
  assert.equal(emptyWrites, 1)
  await browser.close()
  await open()
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByRole('button', { name: `${name} · 1`, exact: true }).click()
  await expect.poll(snapshot).toEqual(original)
  await browser.close()

  await open()
  const failedName = `${name}-retry`
  await page.evaluate(name => { window.openPencil.getStore().state.documentName = name }, failedName)
  let rejected = 0
  await page.route('**/os-workspace/canvases/*', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    rejected++
    await route.fulfill({ status: 503, body: 'test service unavailable' })
  })
  await draw(420)
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('保存失败，可重试', { timeout: 15000 })
  await draw(540)
  await page.waitForTimeout(1600)
  assert.equal(rejected, 1)
  const editedAfterFailure = await snapshot()
  assert.equal(editedAfterFailure.length, 2)
  await page.unroute('**/os-workspace/canvases/*')
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  // Retry protects the first snapshot; the later edit must then be saved separately.
  await expect(page.getByRole('button', { name: `${failedName} · 2`, exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await browser.close()
  await open()
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByRole('button', { name: `${failedName} · 2`, exact: true }).click()
  await expect.poll(snapshot).toEqual(editedAfterFailure)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: resolve(output, 'draft-restored.png') })
  await writeFile(resolve(output, 'draft-persistence.json'), JSON.stringify({ status: 'passed', date: new Date().toISOString(),
    original, editedAfterFailure, rejected, errors, checks: ['untouched blank does not write', 'undo before autosave does not create empty draft',
      'first drawing saved without a save click', 'fresh browser restores draft identity and geometry',
      'first-save failure retains edits and stops automatic retries', 'explicit retry plus later autosave preserves newer edits'] }, null, 2) + '\n')
  console.log('PASS: initial draft autosave, restart, failure and retry with later edits')
} catch (error) {
  await writeFile(resolve(output, 'draft-failure.txt'), String(error.stack ?? error))
  await page?.screenshot({ path: resolve(output, 'draft-failure.png') }).catch(() => {})
  throw error
} finally { await browser?.close() }
