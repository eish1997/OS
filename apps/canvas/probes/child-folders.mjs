import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c03')
const replaceChild = process.env.OS_CANVAS_REPLACE_CHILD_TEST === '1'
const evidence = replaceChild ? 'child-replacement' : 'child-folders'
const folder = await mkdtemp(join(tmpdir(), 'canvas-child-ui-')), child = join(folder, '子文件夹')
await mkdir(child); await writeFile(join(child, '子素材.txt'), 'asset')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
async function nodes() {
  return page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].flatMap(node => {
    const link = node.pluginData.find(item => item.key === 'os.canvas/fileLink')
    return link ? [{ nodeId: node.id, ...JSON.parse(link.value) }] : []
  }))
}
try {
  await page.goto(`${process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.getByRole('textbox', { name: '本地目录路径' }).fill(folder)
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect.poll(async () => (await nodes()).map(n => n.path)).toEqual(['子文件夹'])
  const entry = (await nodes())[0]
  await page.evaluate(id => {
    const store = window.openPencil.getStore()
    store.state.autosaveEnabled = false
    store.graph.createNode('RECTANGLE', store.state.currentPageId, { name: 'Parent work', x: 400, y: 400, width: 100, height: 80 })
    store.select([id])
  }, entry.nodeId)
  await page.getByRole('button', { name: '打开选中文件夹', exact: true }).click()
  await expect.poll(async () => (await nodes()).map(n => n.path), { timeout: 30000 }).toEqual(['子素材.txt'])
  const asset = (await nodes())[0]
  await page.evaluate(() => {
    const store = window.openPencil.getStore()
    store.graph.createNode('RECTANGLE', store.state.currentPageId, { name: 'Child work', x: 500, y: 400, width: 100, height: 80 })
  })
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await page.getByRole('button', { name: '我的目录', exact: true }).click()
  await page.getByLabel('本地目录列表').getByRole('button', { name: folder, exact: true }).click()
  await expect.poll(async () => (await nodes()).map(n => n.path)).toEqual(['子文件夹'])
  assert.equal(await page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].some(n => n.name === 'Parent work')), true)
  await page.evaluate(id => window.openPencil.getStore().select([id]), (await nodes())[0].nodeId)
  await page.getByRole('button', { name: '打开选中文件夹', exact: true }).click()
  await expect.poll(async () => (await nodes()).map(n => n.path)).toEqual(['子素材.txt'])
  assert.equal((await nodes())[0].id, asset.id)
  assert.equal(await page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].some(n => n.name === 'Child work')), true)
  assert.equal(await page.getByLabel('本地目录列表').getByRole('button', { name: child, exact: true }).count(), 1)
  if (replaceChild) {
    await page.getByLabel('本地目录列表').getByRole('button', { name: folder, exact: true }).click()
    await expect.poll(async () => (await nodes()).map(n => n.path)).toEqual(['子文件夹'])
    const parentLink = (await nodes())[0]
    const retired = await mkdtemp(join(tmpdir(), 'canvas-child-retained-'))
    await rename(child, join(retired, 'child'))
    await mkdir(child); await writeFile(join(child, '子素材.txt'), 'replacement')
    await expect.poll(async () => (await nodes())[0]?.availability, { timeout: 20000 }).toBe('replaced')
    await page.evaluate(id => window.openPencil.getStore().select([id]), parentLink.nodeId)
    await page.getByRole('button', { name: '重新关联原件', exact: true }).click()
    await page.getByRole('button', { name: '确认关联新原件', exact: true }).click()
    await expect.poll(async () => (await nodes())[0]?.availability).toBe('available')
    assert.equal((await nodes())[0].id, parentLink.id)
    await page.getByRole('button', { name: '打开选中文件夹', exact: true }).click()
    await expect.poll(async () => (await nodes()).map(n => n.path)).toEqual(['子素材.txt'])
    assert.equal((await nodes())[0].id, asset.id)
    assert.equal((await nodes())[0].availability, 'replaced')
    assert.equal(await page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].some(n => n.name === 'Child work')), true)
  }
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: resolve(output, `${evidence}.png`) })
  await writeFile(resolve(output, `${evidence}.json`), JSON.stringify({ status: 'passed', url: process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230', folder, child, replaceChild,
    checks: ['selected folder opens', 'parent work saved before navigation', 'child assets indexed', 'same child canvas reopens with work and asset identity'] }, null, 2))
  console.log('PASS: folder navigation preserves parent and child work')
} finally { await browser.close() }
