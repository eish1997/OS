import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, 'output/dev-evidence/canvas-c03')
const path = await mkdtemp(join(tmpdir(), 'canvas-directory-ui-'))
const name = basename(path)
let browser, page
async function open() {
  browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
  await page.goto(`${process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
}
async function records() {
  return page.evaluate(async () => {
    const headers = { 'X-OS-Workspace': '1' }
    return { mounts: await (await fetch('/os-workspace/mounts', { headers })).json(),
      canvases: await (await fetch('/os-workspace/canvases', { headers })).json() }
  })
}
try {
  await mkdir(output, { recursive: true }); await open()
  await page.getByRole('textbox', { name: '本地目录路径' }).fill(path)
  await page.route('**/os-workspace/canvases/*', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    await route.abort('failed')
  })
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.unroute('**/os-workspace/canvases/*')
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect(page.getByRole('button', { name: `${name} · 1`, exact: true })).toBeVisible({ timeout: 30000 })
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  let state = await records()
  const mount = state.mounts.find(m => m.path === path)
  assert.ok(mount)
  const canvas = state.canvases.find(c => c.canvasId === mount.canvasId)
  assert.equal(canvas.metadata.mountId, mount.id)
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect(page.getByRole('button', { name: '加入目录', exact: true })).toBeEnabled()
  state = await records()
  assert.equal(state.canvases.filter(c => c.canvasId === mount.canvasId).length, 1)
  assert.equal(state.canvases.find(c => c.canvasId === mount.canvasId).revision, 1)
  await page.evaluate(() => {
    const s = window.openPencil.getStore(); s.state.autosaveEnabled = false
    s.graph.createNode('RECTANGLE', s.state.currentPageId, { name: 'Directory work', x: 400, y: 220, width: 100, height: 100 })
  })
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.getByRole('button', { name: `${name} · 2`, exact: true })).toBeVisible()
  await browser.close(); await open()
  await page.getByRole('button', { name: '我的目录', exact: true }).click()
  await page.getByLabel('本地目录列表').getByRole('button', { name: path, exact: true }).click()
  await expect.poll(() => page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].some(n => n.name === 'Directory work'))).toBe(true)
  state = await records()
  assert.equal(state.canvases.find(c => c.canvasId === mount.canvasId).metadata.mountId, mount.id)
  await page.screenshot({ path: resolve(output, 'directory-reopened.png') })
  await writeFile(resolve(output, 'mount-persistence.json'), JSON.stringify({ status: 'passed', date: new Date().toISOString(), mount,
    canvas: state.canvases.find(c => c.canvasId === mount.canvasId),
    checks: ['join creates scene', 'lost initialization response retries same canvas at revision 1', 'repeat join preserves canvas and revision', 'work saves in directory canvas', 'fresh browser directory list restores work'] }, null, 2))
  console.log('PASS: join directory, deduplicate, save work and fresh browser reopen')
} catch (error) {
  await writeFile(resolve(output, 'mount-failure.txt'), String(error.stack ?? error)); throw error
} finally { await browser?.close() }
