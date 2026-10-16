import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, 'output/dev-evidence/canvas-c03')
const fixture = await mkdtemp(join(tmpdir(), 'canvas-mount-relink-ui-')), folder = join(fixture, '目录'), retained = join(fixture, 'retained')
await mkdir(folder); await writeFile(join(folder, '素材.txt'), 'original')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
async function state() {
  return page.evaluate(() => {
    const graph = window.openPencil.getStore().graph
    const node = [...graph.nodes.values()].find(n => n.pluginData.some(item => item.key === 'os.canvas/fileLink'))
    return { card: node ? { ...JSON.parse(node.pluginData.find(item => item.key === 'os.canvas/fileLink').value),
      nodeId: node.id, x: node.x, y: node.y, labels: graph.getChildren(node.id).map(child => child.text) } : null,
      work: [...graph.nodes.values()].some(n => n.name === '保留工作内容') }
  })
}
try {
  await page.goto(`${process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.getByRole('textbox', { name: '本地目录路径' }).fill(folder)
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect.poll(async () => (await state()).card?.availability).toBe('available')
  const initial = (await state()).card
  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    s.graph.createNode('RECTANGLE', s.state.currentPageId, { name: '保留工作内容', x: 400, y: 400, width: 120, height: 80 })
  })
  await rename(folder, retained); await mkdir(folder); await writeFile(join(folder, '素材.txt'), 'new directory file')
  await expect.poll(async () => (await state()).card?.labels.join(' '), { timeout: 20000 }).toContain('目录需要重新关联')
  await page.getByRole('button', { name: '恢复当前目录关联', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认目录关联', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '取消目录关联', exact: true }).click()
  assert.ok((await state()).card.labels.join(' ').includes('目录需要重新关联'))
  await page.getByRole('button', { name: '恢复当前目录关联', exact: true }).click()
  await page.route('**/relink-confirm', async route => {
    const response = await route.fetch(); assert.equal(response.status(), 200)
    await route.abort('failed')
  }, { times: 1 })
  await page.getByRole('button', { name: '确认目录关联', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认目录关联', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '确认目录关联', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认目录关联', exact: true })).toHaveCount(0)
  await expect.poll(async () => (await state()).card?.availability).toBe('replaced')
  const restored = await state()
  assert.equal(restored.card.id, initial.id); assert.equal(restored.card.x, initial.x); assert.equal(restored.work, true)
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await page.reload()
  await page.getByRole('button', { name: '我的目录', exact: true }).click()
  await page.getByLabel('本地目录列表').getByRole('button', { name: folder, exact: true }).click()
  await expect.poll(async () => (await state()).work).toBe(true)
  assert.equal((await state()).card.id, initial.id)
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: resolve(output, 'mount-relink.png') })
  await writeFile(resolve(output, 'mount-relink.json'), JSON.stringify({ status: 'passed', initial, restored: await state(),
    checks: ['preview cancellation', 'same-path directory replacement', 'lost response retry', 'file replacements remain explicit', 'work and layout retained', 'reload'] }, null, 2))
  console.log('PASS: directory recovery preserves canvas work and requires file confirmation')
} finally { await browser.close() }
