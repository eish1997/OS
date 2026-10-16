import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, writeFile, rename, unlink, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c03')
const fixture = await mkdtemp(join(tmpdir(), 'canvas-file-nodes-'))
const folder = join(fixture, 'assets'), offline = join(fixture, 'offline')
await mkdir(folder); await mkdir(join(folder, 'child'))
await writeFile(join(folder, 'a.txt'), 'first'); await writeFile(join(folder, 'b.txt'), 'second')
const automatic = process.env.OS_CANVAS_AUTOMATIC_TEST === '1'
const evidence = automatic ? 'automatic-files' : 'file-nodes'
let browser, page
async function open() {
  browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
  await page.goto(`${process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
}
async function snapshot() {
  return page.evaluate(() => {
    const s = window.openPencil.getStore()
    return [...s.graph.nodes.values()].flatMap(n => {
      const raw = n.pluginData.find(p => p.key === 'os.canvas/fileLink')
      return raw ? [{ nodeId: n.id, ...JSON.parse(raw.value), x: n.x, y: n.y,
        labels: s.graph.getChildren(n.id).map(c => c.text),
        labelDetails: s.graph.getChildren(n.id).map(c => ({ text: c.text, x: c.x, y: c.y, width: c.width, height: c.height,
          visible: c.visible, fills: c.fills, font: c.fontFamily, fontSize: c.fontSize })) }] : []
    })
  })
}
async function refresh() {
  if (automatic) {
    await page.waitForResponse(response => response.url().endsWith('/poll') && response.ok(), { timeout: 20000 })
  } else await page.getByRole('button', { name: '刷新目录', exact: true }).click()
  await expect(page.getByRole('button', { name: '刷新目录', exact: true })).toBeEnabled()
}
async function save() {
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 30000 })
}
try {
  await mkdir(output, { recursive: true }); await open()
  await page.getByRole('textbox', { name: '本地目录路径' }).fill(folder)
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect.poll(async () => (await snapshot()).length, { timeout: 30000 }).toBe(3)
  await page.evaluate(() => { window.openPencil.getStore().state.autosaveEnabled = false })
  const initial = await snapshot(), a = initial.find(e => e.path === 'a.txt')
  await page.evaluate(id => { window.openPencil.getStore().select([id]); document.activeElement?.blur() }, a.nodeId)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => page.evaluate(() => window.openPencil.getStore().undo.peekUndo()?.label)).toBe('Nudge')
  const moved = (await snapshot()).find(e => e.id === a.id)
  const beforeRefreshHistory = await page.evaluate(() => ({ undo: window.openPencil.getStore().undo.peekUndo()?.label, redo: window.openPencil.getStore().undo.peekRedo()?.label }))
  assert.notEqual(moved.x, a.x)
  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    s.graph.createNode('TEXT', s.state.currentPageId, { name: 'My work', text: 'Keep this note', x: 400, y: 500, width: 240, height: 30 })
  })
  await rename(join(folder, 'a.txt'), join(folder, '中文素材.txt'))
  await appendFile(join(folder, '中文素材.txt'), ' changed')
  await unlink(join(folder, 'b.txt'))
  await refresh()
  let now = await snapshot(), renamed = now.find(e => e.id === a.id)
  assert.equal(renamed.path, '中文素材.txt'); assert.equal(renamed.x, moved.x)
  assert.equal(now.find(e => e.path === 'b.txt').availability, 'missing')
  assert.equal(await page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].find(n => n.name === 'My work')?.text), 'Keep this note')
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('Control+z')
  await writeFile(resolve(output, `${evidence}-history-debug.json`), JSON.stringify({ beforeRefreshHistory,
    afterUndo: await page.evaluate(() => ({ undo: window.openPencil.getStore().undo.peekUndo()?.label, redo: window.openPencil.getStore().undo.peekRedo()?.label,
      selected: [...window.openPencil.getStore().state.selectedIds] })) }, null, 2))
  await expect.poll(async () => (await snapshot()).find(e => e.id === a.id).x).toBe(a.x)
  await page.keyboard.press('Control+Shift+z')
  await expect.poll(async () => (await snapshot()).find(e => e.id === a.id).x).toBe(moved.x)
  const child = (await snapshot()).find(e => e.kind === 'directory')
  await page.evaluate(id => { const s = window.openPencil.getStore(); s.select([id]); s.deleteSelected() }, child.nodeId)
  await refresh()
  assert.equal((await snapshot()).length, 2)
  await save()
  // Only this test's temporary directory moves; offline scan must preserve both cards and work.
  await rename(folder, offline); await refresh()
  assert.ok((await snapshot()).every(e => e.labels.some(t => t.includes('目录离线'))))
  await rename(offline, folder); await refresh(); await save()
  await browser.close(); await open()
  await page.getByRole('button', { name: '我的目录', exact: true }).click()
  await page.getByLabel('本地目录列表').getByRole('button', { name: folder, exact: true }).click()
  await expect.poll(async () => (await snapshot()).length).toBe(2)
  now = await snapshot(); renamed = now.find(e => e.id === a.id)
  assert.equal(renamed.x, moved.x); assert.equal(renamed.path, '中文素材.txt')
  assert.ok(!now.some(e => e.id === child.id))
  if (automatic) {
    // A transient observer failure must recover without blocking ordinary saving.
    let failedPolls = 0
    await page.route('**/os-workspace/mounts/*/poll', async route => {
      failedPolls++
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"temporary observer failure"}' })
    }, { times: 1 })
    await writeFile(join(folder, '自动新增.txt'), 'new asset')
    await expect.poll(async () => (await snapshot()).length, { timeout: 20000 }).toBe(3)
    assert.equal(failedPolls, 1)
    assert.equal((await snapshot()).find(e => e.id === a.id).x, moved.x)
    await save()
    now = await snapshot()
  }
  await page.screenshot({ path: resolve(output, `${evidence}.png`) })
  await writeFile(resolve(output, `${evidence}.json`), JSON.stringify({ status: 'passed', url: process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230', automatic, date: new Date().toISOString(), initial, restored: now,
    checks: ['linked file cards', 'rename and missing state', 'geometry and undo retained', 'work note retained', 'removed display not recreated', 'offline retains content', 'fresh browser stable asset mapping'] }, null, 2))
  console.log('PASS: file cards, external refresh, layout/undo/work preservation, offline and restart')
} catch (error) {
  await writeFile(resolve(output, `${evidence}-failure.txt`), String(error.stack ?? error))
  await page?.screenshot({ path: resolve(output, `${evidence}-failure.png`) }).catch(() => {})
  throw error
} finally { await browser?.close() }
