import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, 'output/dev-evidence/canvas-c03')
const fixture = await mkdtemp(join(tmpdir(), 'canvas-replacement-ui-')), folder = join(fixture, 'assets')
await mkdir(folder); await writeFile(join(folder, '原件.txt'), 'original')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
async function card() {
  return page.evaluate(() => {
    const graph = window.openPencil.getStore().graph
    const node = [...graph.nodes.values()].find(n => n.pluginData.some(p => p.key === 'os.canvas/fileLink'))
    if (!node) return null
    return { nodeId: node.id, x: node.x, y: node.y, ...JSON.parse(node.pluginData.find(p => p.key === 'os.canvas/fileLink').value) }
  })
}
try {
  await page.goto(`${process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.getByRole('textbox', { name: '本地目录路径' }).fill(folder)
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect.poll(async () => (await card())?.availability).toBe('available')
  const initial = await card()
  await rename(join(folder, '原件.txt'), join(fixture, 'retained-original.txt'))
  await writeFile(join(folder, '原件.txt'), 'explicit replacement')
  await expect.poll(async () => (await card())?.availability, { timeout: 20000 }).toBe('replaced')
  await page.evaluate(id => window.openPencil.getStore().select([id]), initial.nodeId)
  await page.getByRole('button', { name: '重新关联原件', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认关联新原件', exact: true })).toBeVisible()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: resolve(output, 'replacement-preview.png') })
  await page.getByRole('button', { name: '取消关联', exact: true }).click()
  assert.equal((await card()).availability, 'replaced')
  await page.getByRole('button', { name: '重新关联原件', exact: true }).click()
  let committedRevision
  await page.route('**/replacement-confirm', async route => {
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    committedRevision = (await response.json()).revision
    await route.abort('failed')
  }, { times: 1 })
  await page.getByRole('button', { name: '确认关联新原件', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认关联新原件', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '确认关联新原件', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认关联新原件', exact: true })).toHaveCount(0)
  await expect.poll(async () => (await card())?.availability).toBe('available')
  const restored = await card()
  assert.equal(restored.id, initial.id)
  assert.equal(restored.x, initial.x); assert.equal(restored.y, initial.y)
  assert.equal(restored.revision, committedRevision)
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await page.screenshot({ path: resolve(output, 'replacement-confirmed.png') })
  await writeFile(resolve(output, 'replacement.json'), JSON.stringify({ status: 'passed', initial, restored,
    checks: ['preview and cancel retain old association', 'explicit confirmation', 'lost response exact retry', 'stable identity and geometry', 'save after replacement'] }, null, 2))
  console.log('PASS: replacement preview, cancellation, confirmation and lost-response retry')
} finally { await browser.close() }
