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
const name = `Identity-${Date.now()}`
let browser, page
const errors = []
async function open() {
  browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
}
async function snapshot() {
  return page.evaluate(() => {
    const s = window.openPencil.getStore()
    const identity = n => n?.pluginData.find(p => p.pluginId === 'os.canvas' && p.key === 'os.canvas/nodeId')?.value
    return { nodes: [...s.graph.nodes.values()].filter(n => n.type !== 'CANVAS' && n.id !== s.graph.rootId).map(n => ({
      stableId: identity(n), parent: identity(s.graph.getNode(n.parentId)), type: n.type,
      x: n.x, y: n.y, width: n.width, height: n.height,
      unknown: n.pluginData.filter(p => p.pluginId === 'unknown.extension')
    })).sort((a, b) => a.stableId.localeCompare(b.stableId)),
      pages: s.graph.getPages().map(p => ({ stableId: identity(p), name: p.name })),
      view: { pageId: identity(s.graph.getNode(s.state.currentPageId)),
        panX: s.state.panX, panY: s.state.panY, zoom: s.state.zoom } }
  })
}
try {
  await open()
  const frameId = await page.evaluate(async name => {
    const s = window.openPencil.getStore()
    s.state.documentName = name
    const secondPage = s.graph.addPage('Second page')
    await s.switchPage(secondPage.id)
    const f = s.graph.createNode('FRAME', s.state.currentPageId, { x: 400, y: 200, width: 180, height: 140 })
    s.graph.createNode('RECTANGLE', f.id, { x: 20, y: 20, width: 70, height: 40,
      pluginData: [{ pluginId: 'unknown.extension', key: 'payload', value: '{"preserve":true}' }] })
    s.select([f.id])
    return f.id
  }, name)
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await page.evaluate(() => { window.openPencil.getStore().state.autosaveEnabled = false })
  const original = await snapshot()
  assert.equal(original.nodes.length, 2)
  await page.evaluate(id => window.openPencil.getStore().select([id]), frameId)
  // Focus the canvas without changing the selection before keyboard commands.
  await page.evaluate(() => { document.activeElement?.blur() })
  await page.keyboard.press('Control+d')
  await expect.poll(async () => (await snapshot()).nodes.length).toBe(4)
  const duplicated = await snapshot()
  assert.equal(new Set(duplicated.nodes.map(n => n.stableId)).size, 4)
  await page.keyboard.press('Control+z')
  assert.deepEqual((await snapshot()).nodes, original.nodes)
  await page.keyboard.press('Control+Shift+z')
  assert.deepEqual((await snapshot()).nodes, duplicated.nodes)
  await page.keyboard.press('Control+c')
  await expect.poll(() => page.evaluate(async () => {
    const item = (await navigator.clipboard.read())[0]
    return Boolean(item?.types.includes('text/html') && (await (await item.getType('text/html')).text()).includes('data-'))
  }), { timeout: 15000 }).toBe(true)
  await page.keyboard.press('Control+v')
  await expect.poll(async () => (await snapshot()).nodes.length, { timeout: 15000 }).toBe(6)
  const pasted = await snapshot()
  assert.equal(new Set(pasted.nodes.map(n => n.stableId)).size, 6)
  assert.equal(pasted.nodes.filter(n => n.unknown.length > 0).length, 3)
  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    s.setZoomAroundPoint(0.75, 0, 0)
    s.pan(37.5 - s.state.panX, -42.25 - s.state.panY)
  })
  const expected = await snapshot()
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await browser.close()
  await open()
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByRole('button', { name: `${name} · 2`, exact: true }).click()
  await expect.poll(snapshot, { timeout: 30000 }).toEqual(expected)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: resolve(output, 'identity-restored.png') })
  await writeFile(resolve(output, 'identity-persistence.json'), JSON.stringify({ status: 'passed', date: new Date().toISOString(),
    original, duplicated, pasted, restored: await snapshot(), errors,
    checks: ['nested duplicate gets unique IDs', 'undo/redo restores exact IDs', 'clipboard paste gets unique IDs',
      'unknown extension data retained', 'fresh browser restores IDs, parent relationships and exact viewport',
      'two page identities and non-default active page restored'] }, null, 2) + '\n')
  console.log('PASS: identities, duplicate, undo/redo, clipboard, viewport, fresh browser')
} catch (error) {
  await writeFile(resolve(output, 'identity-persistence-failure.txt'), String(error.stack ?? error))
  await page?.screenshot({ path: resolve(output, 'identity-persistence-failure.png') }).catch(() => {})
  throw error
} finally { await browser?.close() }
