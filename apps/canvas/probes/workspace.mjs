import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import os from 'node:os'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const requireUpstream = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))
const { chromium, expect } = requireUpstream('@playwright/test')
const manifest = JSON.parse(await readFile(resolve(root, 'apps/canvas/upstream.json'), 'utf8'))
const output = resolve(root, 'output/dev-evidence/canvas-c01')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))

async function snapshot() {
  return page.evaluate(() => {
    const store = window.openPencil.getStore()
    return { nodes: [...store.graph.nodes.values()].map(n => ({ id: n.id, type: n.type,
      x: n.x, y: n.y, width: n.width, height: n.height, text: n.text })),
    zoom: store.state.zoom, panX: store.state.panX, panY: store.state.panY,
    sceneVersion: store.state.sceneVersion, tool: store.state.activeTool }
  })
}
const workspace = page.locator('[data-slot="os-canvas-workspace"]')
const canvas = page.locator('[data-test-id="canvas-area"]')
async function assertFullCanvas() {
  assert.deepEqual(await canvas.boundingBox(), await workspace.boundingBox())
}
try {
  const start = performance.now()
  await page.goto(`${process.env.OS_CANVAS_TEST_URL ?? `http://localhost:${manifest.appPort}`}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
  const loadMs = performance.now() - start
  await assertFullCanvas()
  const bounds = await canvas.boundingBox()
  assert.ok(bounds)
  await page.keyboard.press('r')
  await page.mouse.move(bounds.x + 500, bounds.y + 200)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 680, bounds.y + 320, { steps: 12 })
  await page.mouse.up()
  await page.keyboard.press('v')
  const before = await snapshot()
  assert.equal(before.nodes.filter(n => n.type === 'RECTANGLE').length, 1)
  const originalCanvas = await canvas.elementHandle()
  for (const label of ['图层面板', '属性面板', '图层面板', '属性面板']) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await assertFullCanvas()
    assert.deepEqual(await snapshot(), before)
    assert.equal(await originalCanvas.evaluate(el => el.isConnected), true)
  }
  // A panel surface must win hit testing and consume wheel input without moving the canvas.
  const left = await page.locator('[data-slot="os-layers-overlay"]').boundingBox()
  assert.ok(left)
  const panelHit = await page.evaluate(({ x, y }) =>
    Boolean(document.elementFromPoint(x, y)?.closest('[data-slot="os-layers-overlay"]')),
  { x: left.x + 20, y: left.y + left.height - 20 })
  assert.equal(panelHit, true)
  await page.mouse.move(left.x + 20, left.y + left.height - 20)
  await page.mouse.wheel(0, 200)
  assert.deepEqual(await snapshot(), before)
  const rightBefore = await page.locator('[data-slot="os-properties-overlay"]').boundingBox()
  await page.mouse.move(bounds.x + 750, bounds.y + 450)
  await page.mouse.wheel(0, 120)
  await expect.poll(async () => (await snapshot()).panY).not.toBe(before.panY)
  assert.deepEqual((await snapshot()).nodes, before.nodes)
  assert.deepEqual(await page.locator('[data-slot="os-properties-overlay"]').boundingBox(), rightBefore)
  await page.screenshot({ path: resolve(output, 'overlay-editing.png') })

  // Use the upstream scene and behaviour protocol to create a real browser-backed text field.
  const instanceId = await page.evaluate(() => {
    const store = window.openPencil.getStore()
    store.zoomTo100()
    const graph = store.graph
    const component = graph.createNode('COMPONENT', store.state.currentPageId, {
      name: 'OS input contract', x: 500, y: 350, width: 200, height: 40,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true }],
      componentPropertyDefinitions: [{ id: 'value', name: 'Value', type: 'TEXT', defaultValue: 'Name' }]
    })
    graph.createNode('TEXT', component.id, { name: 'Value', x: 10, y: 10, width: 180,
      height: 20, text: 'Name', componentPropertyReferences: [{ propertyId: 'value', field: 'TEXT' }] })
    store.setBehaviour(component.id, { kind: 'textField', booleans: {},
      texts: { value: { propertyId: 'value' } }, numbers: {}, parts: {} })
    const instance = graph.createInstance(component.id, store.state.currentPageId, { x: 500, y: 470 })
    if (!instance) throw new Error('Instance was not created')
    store.select([instance.id])
    store.zoomToFit()
    return instance.id
  })
  // Select and move the interactive instance through real editing input before preview.
  const target = await page.evaluate(id => {
    const s = window.openPencil.getStore()
    const n = s.graph.getNode(id)
    s.select([])
    return { x: (n.x + n.width / 2) * s.state.zoom + s.state.panX,
      y: (n.y + n.height / 2) * s.state.zoom + s.state.panY }
  }, instanceId)
  const editingBounds = await canvas.boundingBox()
  await page.mouse.click(editingBounds.x + target.x, editingBounds.y + target.y)
  await expect.poll(() => page.evaluate(() => [...window.openPencil.getStore().state.selectedIds])).toContain(instanceId)
  const beforeMove = (await snapshot()).nodes
  const instanceBefore = beforeMove.find(n => n.id === instanceId)
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await snapshot()).nodes.find(n => n.id === instanceId)?.x).toBe(instanceBefore.x + 1)
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await snapshot()).nodes).toEqual(beforeMove)
  const documentBeforePreview = (await snapshot()).nodes
  await page.getByRole('button', { name: '预览交互', exact: true }).click()
  await assertFullCanvas()
  const field = page.locator(`[data-island="${instanceId}"]`).locator('input')
  await expect(field).toHaveValue('Name')
  await field.fill('Canvas R T V')
  await expect(field).toHaveValue('Canvas R T V')
  assert.equal((await snapshot()).tool, 'SELECT')
  assert.deepEqual((await snapshot()).nodes, documentBeforePreview)
  const fieldBefore = await field.boundingBox()
  const zoomBefore = (await snapshot()).zoom
  await page.evaluate(() => {
    const store = window.openPencil.getStore()
    store.zoomToLevel(store.state.zoom * 0.75)
  })
  await expect.poll(async () => (await field.boundingBox())?.width).toBeCloseTo(fieldBefore.width * 0.75, 0)
  await expect(field).toHaveValue('Canvas R T V')
  assert.ok((await snapshot()).zoom < zoomBefore)
  await page.screenshot({ path: resolve(output, 'interactive-node.png') })
  await page.getByRole('button', { name: '返回编辑', exact: true }).click()
  await expect(field).toHaveCount(0)
  assert.deepEqual((await snapshot()).nodes, documentBeforePreview)
  assert.equal(await originalCanvas.evaluate(el => el.isConnected), true)
  await page.setViewportSize({ width: 1100, height: 720 })
  await assertFullCanvas()
  assert.deepEqual((await snapshot()).nodes, documentBeforePreview)
  assert.deepEqual(errors, [])
  const patches = {}
  for (const name of (await readdir(resolve(root, 'apps/canvas/patches'))).sort()) {
    patches[name] = createHash('sha256').update(await readFile(resolve(root, 'apps/canvas/patches', name))).digest('hex')
  }
  const result = { status: 'passed', upstream: manifest.commit, patches,
    date: new Date().toISOString(), browser: browser.version(), device: {
      platform: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 2 ** 30), viewport: [1440, 900]
    }, observations: { loadMs, nodeCount: documentBeforePreview.length }, checks: [
      'full content-window canvas', 'panel toggles retain canvas element, document and viewport',
      'panel hit testing and wheel interception', 'exposed canvas pans; panels remain screen-fixed',
      'interactive instance mouse selection, keyboard movement and undo',
      'real text field accepts input without tool shortcuts', 'interactive island follows zoom and keeps input',
      'preview does not change source document', 'window resize retains nodes and full canvas'
    ], limitations: ['interactive field uses upstream preview mode, not arbitrary generated code',
      'single startup observation is not the C05 performance budget acceptance',
      'desktop transparent hosting, web views and isolation await their separate tasks'], errors }
  await writeFile(resolve(output, 'workspace.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {})
  await writeFile(resolve(output, 'failure.txt'), String(error.stack ?? error) + '\n' + errors.join('\n'))
  throw error
} finally { await browser.close() }
