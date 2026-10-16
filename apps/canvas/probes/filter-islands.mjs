import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const evidence = resolve(root, process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c05')
const base = process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14250'
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
const errors = []
page.on('pageerror', error => errors.push(error.message))
async function source() {
  return page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].map(n => ({
    id: n.id, type: n.type, name: n.name, text: n.text, x: n.x, y: n.y, visible: n.visible
  })))
}
try {
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  const instanceId = await page.evaluate(() => {
    const s = window.openPencil.getStore(), graph = s.graph
    const component = graph.createNode('COMPONENT', s.state.currentPageId, {
      name: 'Filter input', x: 400, y: 200, width: 200, height: 40,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true }],
      componentPropertyDefinitions: [{ id: 'value', name: 'Value', type: 'TEXT', defaultValue: 'Name' }]
    })
    graph.createNode('TEXT', component.id, { name: 'Value', x: 10, y: 10, width: 180, height: 20,
      text: 'Name', componentPropertyReferences: [{ propertyId: 'value', field: 'TEXT' }] })
    s.setBehaviour(component.id, { kind: 'textField', booleans: {}, texts: { value: { propertyId: 'value' } }, numbers: {}, parts: {} })
    const instance = graph.createInstance(component.id, s.state.currentPageId, { x: 400, y: 350 })
    if (!instance) throw new Error('Instance missing')
    s.requestRender(); return instance.id
  })
  const before = await source()
  await page.locator('[data-slot="local-filter-panel"] summary').click()
  await page.getByRole('button', { name: '预览交互', exact: true }).click()
  const field = page.locator(`[data-island="${instanceId}"] input`)
  await expect(field).toHaveValue('Name')
  await field.fill('Keep this input')
  const original = await field.elementHandle()
  await page.getByRole('button', { name: '筛选图片', exact: true }).click()
  await expect(field).toBeHidden()
  await expect(field).toHaveCount(1)
  await expect(field).toHaveValue('Keep this input')
  assert.equal(await original.evaluate(el => el.isConnected), true)
  assert.equal(await page.evaluate(() => window.openPencil.getStore().state.play !== null), true)
  assert.deepEqual(await source(), before)
  await page.getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(field).toBeVisible()
  await expect(field).toHaveValue('Keep this input')
  assert.equal(await original.evaluate(el => el.isConnected), true)
  assert.deepEqual(errors, [])
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: resolve(evidence, 'filter-islands.png') })
  await writeFile(resolve(evidence, 'filter-islands.json'), JSON.stringify({ status: 'passed', url: base,
    checks: ['live input hidden', 'same DOM instance remains mounted', 'preview continues', 'input retained on restore', 'source unchanged'] }, null, 2))
  console.log('PASS: filtering hides interactive preview without discarding input or stopping preview')
} catch (error) {
  await mkdir(evidence, { recursive: true })
  await writeFile(resolve(evidence, 'filter-islands-failure.json'), JSON.stringify({ message: error.message, errors, body: await page.locator('body').innerText() }, null, 2))
  throw error
} finally { await browser.close() }
