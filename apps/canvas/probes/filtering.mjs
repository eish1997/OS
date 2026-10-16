import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const evidence = resolve(root, process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c05')
const base = process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14250'
const renderer = process.env.OS_CANVAS_FILTER_RENDERER ?? 'retained'
assert.ok(['retained', 'tiled'].includes(renderer))
const evidenceName = renderer === 'tiled' ? 'filtering-tiled' : 'filtering'
const folder = await mkdtemp(join(tmpdir(), 'canvas-filter-ui-'))
await writeFile(join(folder, '素材.txt'), 'external asset')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
const errors = []
page.on('pageerror', error => errors.push(error.message))
async function snapshot() {
  return page.evaluate(() => {
    const s = window.openPencil.getStore()
    return [...s.graph.nodes.values()].filter(n => n.type !== 'DOCUMENT' && n.type !== 'CANVAS').map(n => ({
      uuid: n.pluginData.find(p => p.key === 'os.canvas/nodeId')?.value,
      name: n.name, x: n.x, y: n.y, width: n.width, height: n.height, visible: n.visible, text: n.text
    })).sort((a, b) => (a.uuid ?? a.name).localeCompare(b.uuid ?? b.name))
  })
}
async function selectedNames() {
  return page.evaluate(() => {
    const s = window.openPencil.getStore()
    return [...s.state.selectedIds].map(id => s.graph.getNode(id).name).sort()
  })
}
async function pixel(bytes) {
  return page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0)
    return [...context.getImageData(5, 5, 1, 1).data]
  }, bytes.toString('base64'))
}
try {
  await page.goto(`${base}/?test&os-canvas&no-rulers&renderer=${renderer}`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.getByRole('textbox', { name: '本地目录路径' }).fill(folder)
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect(page.locator('[data-slot="local-file-badge"]')).toHaveCount(1)
  const ids = await page.evaluate(() => {
    const s = window.openPencil.getStore()
    const fill = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }]
    const ink = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true }]
    const rect = s.graph.createNode('RECTANGLE', s.state.currentPageId, { name: 'Red shape', x: 420, y: 420, width: 160, height: 100, fills: fill })
    const text = s.graph.createNode('TEXT', s.state.currentPageId, { name: 'Loose note', text: '独立文字', x: 620, y: 420, width: 150, height: 60, fills: ink })
    const frame = s.graph.createNode('FRAME', s.state.currentPageId, { name: 'Design group', x: 800, y: 230, width: 170, height: 140 })
    s.graph.createNode('TEXT', frame.id, { name: 'Nested note', text: '组内文字', x: 10, y: 10, width: 120, height: 40, fills: ink })
    const child = s.graph.createNode('RECTANGLE', frame.id, { name: 'Nested shape', x: 10, y: 60, width: 100, height: 50,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0.8, b: 0.4, a: 1 }, opacity: 1, visible: true }] })
    s.select([]); s.requestRender()
    return { rect: rect.id, text: text.id, frame: frame.id, child: child.id }
  })
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  const before = await snapshot()
  const clip = await page.evaluate(id => {
    const s = window.openPencil.getStore(), n = s.graph.getNode(id)
    const area = document.querySelector('[data-test-id="canvas-area"]').getBoundingClientRect()
    return { x: area.x + s.state.panX + (n.x + 30) * s.state.zoom,
      y: area.y + s.state.panY + (n.y + 30) * s.state.zoom, width: 12, height: 12 }
  }, ids.rect)
  const shownPixels = await page.screenshot({ clip })
  assert.deepEqual(await pixel(shownPixels), [255, 0, 0, 255])
  const childClip = await page.evaluate(id => {
    const s = window.openPencil.getStore(), p = s.graph.getAbsolutePosition(id)
    const area = document.querySelector('[data-test-id="canvas-area"]').getBoundingClientRect()
    return { x: area.x + s.state.panX + (p.x + 15) * s.state.zoom,
      y: area.y + s.state.panY + (p.y + 15) * s.state.zoom, width: 12, height: 12 }
  }, ids.child)
  const childPixels = await page.screenshot({ clip: childClip })
  assert.deepEqual(await pixel(childPixels), [0, 204, 102, 255])
  await page.locator('[data-slot="local-filter-panel"] summary').click()
  await page.evaluate(id => window.openPencil.getStore().select([id]), ids.rect)
  await page.getByRole('button', { name: '筛选已关联本地', exact: true }).click()
  await expect(page.locator('[data-slot="local-filter-count"]')).toHaveText('显示 1 项 · 隐藏 3 项')
  assert.deepEqual(await selectedNames(), [])
  await expect.poll(async () => !(await page.screenshot({ clip })).equals(shownPixels)).toBe(true)
  await page.mouse.click(clip.x + 2, clip.y + 2)
  assert.deepEqual(await selectedNames(), [])
  await page.evaluate(id => window.openPencil.getStore().select([id]), ids.rect)
  assert.deepEqual(await selectedNames(), [], 'programmatic selection also excludes hidden content')
  await page.getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect.poll(async () => (await page.screenshot({ clip })).equals(shownPixels)).toBe(true)
  await page.getByRole('button', { name: '筛选仅画布内容', exact: true }).click()
  await page.getByRole('button', { name: '筛选文本', exact: true }).click()
  await expect(page.locator('[data-slot="local-filter-count"]')).toHaveText('显示 2 项 · 隐藏 2 项')
  await expect(page.locator('[data-slot="local-file-badge"]')).toHaveCount(0)
  await page.evaluate(() => window.openPencil.getStore().selectAll())
  assert.deepEqual(await selectedNames(), ['Design group', 'Loose note'])
  await page.getByRole('textbox', { name: '筛选名称或文件名' }).fill('nested')
  await expect(page.locator('[data-slot="local-filter-count"]')).toHaveText('显示 1 项 · 隐藏 3 项')
  assert.deepEqual(await selectedNames(), ['Design group'])
  await expect.poll(async () => (await page.screenshot({ clip: childClip })).equals(childPixels)).toBe(true)
  await page.evaluate(() => window.openPencil.getStore().pan(-5000, -5000))
  await page.getByRole('button', { name: '查看匹配内容', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.openPencil.getStore().state.panX)).toBeGreaterThan(-4000)
  assert.deepEqual(await snapshot(), before, 'filtering must not mutate authored data')
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: resolve(evidence, `${evidenceName}-active.png`) })
  await page.reload()
  await page.getByRole('button', { name: '我的目录', exact: true }).click()
  await page.getByLabel('本地目录列表').getByRole('button', { name: folder, exact: true }).click()
  await expect.poll(async () => (await snapshot()).length, { timeout: 30000 }).toBe(before.length)
  assert.deepEqual(await snapshot(), before, 'saving a filtered view retains every node and geometry')
  await page.locator('[data-slot="local-filter-panel"] summary').click()
  await expect(page.locator('[data-slot="local-filter-count"]')).toHaveText('显示 4 项 · 隐藏 0 项')
  assert.deepEqual(errors, [])
  await page.screenshot({ path: resolve(evidence, `${evidenceName}-restored.png`) })
  await writeFile(resolve(evidence, `${evidenceName}.json`), JSON.stringify({ status: 'passed', url: base, renderer, folder, before,
    checks: ['pixels hidden and restored', 'hidden click/selection/select-all protection', 'AND filters and subtree match',
      'generated labels excluded', 'file badge hidden', 'reveal matches moves viewport without rearranging', 'filter does not modify document', 'saved filtered document reopens intact'] }, null, 2))
  console.log('PASS: filtering hides pixels and hit targets while preserving saved artwork')
} catch (error) {
  await mkdir(evidence, { recursive: true })
  await writeFile(resolve(evidence, `${evidenceName}-failure.json`), JSON.stringify({ message: error.message, errors,
    nodes: await snapshot(), body: await page.locator('body').innerText() }, null, 2))
  throw error
} finally { await browser.close() }
