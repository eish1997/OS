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
const name = `Layout-${Date.now()}`
let browser, page
const errors = []
async function open(rejectInitial = false) {
  browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', error => errors.push(error.message))
  if (rejectInitial) await page.route('**/os-workspace/layout', route => route.fulfill({ status: 503, body: 'test offline' }))
  const loaded = page.waitForResponse(r => r.url().endsWith('/os-workspace/layout') && r.request().method() === 'GET')
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  assert.equal((await loaded).status(), rejectInitial ? 503 : 200)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
}
async function api(path) {
  return page.evaluate(async path => (await fetch(`/os-workspace${path}`, { headers: { 'X-OS-Workspace': '1' } })).json(), path)
}
async function snapshot() {
  return page.evaluate(() => {
    const s = window.openPencil.getStore()
    return { nodes: [...s.graph.nodes.values()].map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height })),
      panX: s.state.panX, panY: s.state.panY, zoom: s.state.zoom, undo: s.undo.peekUndo()?.label, dirty: s.hasUnsavedChanges() }
  })
}
async function toggle(label) {
  const done = page.waitForResponse(r => r.url().endsWith('/os-workspace/layout') && r.request().method() === 'POST')
  await page.getByRole('button', { name: label, exact: true }).click()
  assert.equal((await done).status(), 200)
}
try {
  await open()
  for (const label of ['图层面板', '属性面板']) {
    if (await page.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed') !== 'true') await toggle(label)
  }
  await page.evaluate(name => { window.openPencil.getStore().state.documentName = name }, name)
  const bounds = await page.locator('[data-test-id="canvas-area"]').boundingBox()
  await page.keyboard.press('r')
  await page.mouse.move(bounds.x + 430, bounds.y + 200); await page.mouse.down()
  await page.mouse.move(bounds.x + 600, bounds.y + 320, { steps: 10 }); await page.mouse.up()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 15000 })
  const documentBefore = (await api('/canvases')).find(d => d.metadata.name === name)
  const stateBefore = await snapshot()
  await toggle('图层面板'); await toggle('属性面板')
  assert.deepEqual(await snapshot(), stateBefore)
  assert.deepEqual((await api('/canvases')).find(d => d.canvasId === documentBefore.canvasId), documentBefore)
  await browser.close(); await open()
  await expect(page.locator('[data-slot="os-layers-overlay"]')).toBeHidden()
  await expect(page.locator('[data-slot="os-properties-overlay"]')).toBeHidden()
  assert.deepEqual(await page.locator('[data-test-id="canvas-area"]').boundingBox(), await page.locator('[data-slot="os-canvas-workspace"]').boundingBox())
  await page.route('**/os-workspace/layout', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    const committed = await route.fetch(); assert.equal(committed.status(), 200)
    await route.abort('failed')
  })
  await page.getByRole('button', { name: '图层面板', exact: true }).click()
  await expect(page.getByRole('button', { name: '重试布局保存', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '属性面板', exact: true }).click()
  await page.unroute('**/os-workspace/layout')
  await page.getByRole('button', { name: '重试布局保存', exact: true }).click()
  await expect.poll(async () => (await api('/layout')).layout.panels).toEqual({ layers: true, properties: true })
  await expect(page.getByRole('button', { name: '重试布局保存', exact: true })).toHaveCount(0)
  assert.deepEqual((await api('/canvases')).find(d => d.canvasId === documentBefore.canvasId), documentBefore)
  await browser.close(); await open()
  await expect(page.locator('[data-slot="os-layers-overlay"]')).toBeVisible()
  await expect(page.locator('[data-slot="os-properties-overlay"]')).toBeVisible()
  await browser.close(); await open(true)
  await expect(page.getByRole('button', { name: '重试布局保存', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '图层面板', exact: true }).click()
  await page.unroute('**/os-workspace/layout')
  await page.getByRole('button', { name: '重试布局保存', exact: true }).click()
  await expect.poll(async () => (await api('/layout')).layout.panels.layers).toBe(false)
  await expect(page.locator('[data-slot="os-layers-overlay"]')).toBeHidden()
  await toggle('图层面板')
  const finalLayout = await api('/layout')
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'layout-persistence.json'), JSON.stringify({ status: 'passed', date: new Date().toISOString(),
    documentBefore, finalLayout, errors, checks: ['panel toggles preserve document, view, undo and canvas revision',
      'fresh browser restores hidden panels', 'canvas remains full window', 'lost reply retry retains later layout edits',
      'second restart restores final layout', 'initial load failure retry retains local edits'], limitations: ['only current two-panel visibility; full presets/window management belongs to C11'] }, null, 2) + '\n')
  console.log('PASS: independent layout, restart and idempotent retry')
} catch (error) {
  await writeFile(resolve(output, 'layout-failure.txt'), String(error.stack ?? error))
  await page?.screenshot({ path: resolve(output, 'layout-failure.png') }).catch(() => {})
  throw error
} finally { await browser?.close() }
