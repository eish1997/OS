import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, rename, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, 'output/dev-evidence/canvas-c03')
const fixture = await mkdtemp(join(tmpdir(), 'canvas-relink-ui-')), folder = join(fixture, 'source'), target = join(fixture, 'target')
await mkdir(folder); await mkdir(target)
await writeFile(join(folder, '旧位置.txt'), 'original')
await writeFile(join(target, 'unrelated.txt'), 'must not appear')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
async function cards() {
  return page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()].flatMap(node => {
    const raw = node.pluginData.find(item => item.key === 'os.canvas/fileLink')
    return raw ? [{ nodeId: node.id, uuid: node.pluginData.find(item => item.key === 'os.canvas/nodeId')?.value,
      x: node.x, y: node.y, ...JSON.parse(raw.value) }] : []
  }))
}
try {
  await page.goto(`${process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.getByRole('textbox', { name: '本地目录路径' }).fill(folder)
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect.poll(async () => (await cards()).length).toBe(1)
  const before = (await cards())[0]
  const targetFile = join(target, '新位置.txt')
  await rename(join(folder, '旧位置.txt'), targetFile)
  await expect.poll(async () => (await cards())[0]?.availability, { timeout: 20000 }).toBe('missing')
  await page.evaluate(id => window.openPencil.getStore().select([id]), before.nodeId)
  await page.getByRole('textbox', { name: '重新关联目标文件路径' }).fill(targetFile)
  await page.getByRole('button', { name: '预览其他位置的原件', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认更改节点引用', exact: true })).toBeVisible()
  assert.equal((await cards())[0].id, before.id)
  await page.getByRole('button', { name: '确认更改节点引用', exact: true }).click()
  await expect.poll(async () => (await cards())[0]?.path).toBe('新位置.txt')
  const linked = (await cards())[0]
  assert.equal(linked.nodeId, before.nodeId); assert.equal(linked.x, before.x); assert.equal(linked.y, before.y)
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await cards())[0]?.id).toBe(before.id)
  await page.keyboard.press('Control+Shift+z')
  await expect.poll(async () => (await cards())[0]?.id).toBe(linked.id)
  await appendFile(targetFile, ' externally modified')
  await expect.poll(async () => (await cards())[0]?.revision, { timeout: 20000 }).toBeGreaterThan(linked.revision)
  assert.equal((await cards()).length, 1)
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await page.reload()
  await page.getByRole('button', { name: '我的目录', exact: true }).click()
  await page.getByLabel('本地目录列表').getByRole('button', { name: folder, exact: true }).click()
  await expect.poll(async () => (await cards())[0]?.path).toBe('新位置.txt')
  assert.equal((await cards()).length, 1)
  assert.equal((await cards())[0].uuid, before.uuid)
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: resolve(output, 'relink.png') })
  await writeFile(resolve(output, 'relink.json'), JSON.stringify({ status: 'passed', before, linked, restored: await cards(),
    checks: ['cross-directory relink', 'node identity and geometry retained', 'undo redo', 'external target updates', 'unrelated files excluded', 'reload persistence'] }, null, 2))
  console.log('PASS: cross-directory relink, undo/redo, external refresh and reload')
} finally { await browser.close() }
