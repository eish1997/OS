import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, writeFile, readFile, readdir, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const evidence = resolve(root, process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c04')
const shortcutMode = process.env.OS_CANVAS_OUTPUT_SHORTCUT === '1'
const evidenceName = shortcutMode ? 'output-shortcut' : 'output-batch'
const base = process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14250'
const folder = await mkdtemp(join(tmpdir(), 'canvas-batch-ui-'))
await writeFile(join(folder, '批量-1.txt'), 'external content')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' })
const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
async function nodes() {
  return page.evaluate(() => {
    const s = window.openPencil.getStore()
    return s.graph.getChildren(s.state.currentPageId).map(n => ({ name: n.name, x: n.x, text: n.text,
      uuid: n.pluginData.find(p => p.key === 'os.canvas/nodeId')?.value,
      link: JSON.parse(n.pluginData.find(p => p.key === 'os.canvas/fileLink')?.value ?? 'null') }))
  })
}
try {
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
  await page.getByRole('textbox', { name: '本地目录路径' }).fill(folder)
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect.poll(async () => (await nodes()).length).toBe(1)
  const uuids = await page.evaluate(() => {
    const s = window.openPencil.getStore()
    const items = ['TEXT', 'TEXT', 'RECTANGLE', 'TEXT'].map((type, index) => s.graph.createNode(type, s.state.currentPageId, {
      name: `Batch ${index + 1}`, x: 400 + index * 180, y: 420, width: 160, height: 100,
      text: type === 'TEXT' ? `原始内容 ${index + 1}` : '', fontSize: 20,
      fills: [{ type: 'SOLID', color: { r: 0.8, g: 0.6, b: 0.3, a: 1 }, opacity: 1, visible: true }]
    }))
    s.select(items.map(n => n.id)); s.requestRender()
    return items.map(n => n.pluginData.find(p => p.key === 'os.canvas/nodeId')?.value)
  })
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  const preparedNames = new Map(), commits = []
  await page.route('**/os-workspace/outputs', async route => {
    const body = route.request().postDataJSON()
    preparedNames.set(body.operationId, body.name)
    await route.continue()
  })
  let dropped = false
  await page.route('**/os-workspace/outputs/*/commit', async route => {
    const id = /outputs\/([^/]+)\/commit/.exec(route.request().url())[1]
    commits.push({ id, name: preparedNames.get(id) })
    if (preparedNames.get(id) === '批量-2.txt' && !dropped) {
      dropped = true; await route.fetch(); await route.abort('failed')
    } else await route.continue()
  })
  await page.getByRole('textbox', { name: '成果文件名', exact: true }).fill('批量.txt')
  if (shortcutMode) {
    await page.keyboard.press('Control+Alt+e')
    await page.waitForTimeout(250)
    assert.equal(preparedNames.size, 0, 'typing in the filename field must not publish')
    await page.getByRole('button', { name: '成果快捷键 Ctrl+Alt+S', exact: true }).click()
    await expect(page.getByRole('button', { name: '成果快捷键 Ctrl+Alt+S', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('Control+Alt+e')
    await page.waitForTimeout(250)
    assert.equal(preparedNames.size, 0, 'old binding must be removed immediately')
    await page.keyboard.press('Control+,')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Control+Alt+s')
    await page.waitForTimeout(250)
    assert.equal(preparedNames.size, 0, 'open settings dialog must suppress output shortcut')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.evaluate(() => document.activeElement?.blur())
    await expect(page.getByRole('button', { name: '分别保存所选成果', exact: true })).toBeEnabled()
    await page.keyboard.press('Control+Alt+s')
  } else await page.getByRole('button', { name: '分别保存所选成果', exact: true }).click()
  await expect(page.locator('[data-slot="output-status"]')).toHaveText('批量处理结束：1 项已写入，3 项未完成', { timeout: 30000 })
  const report = page.getByLabel('批量保存结果')
  await expect(report.locator('[data-state="failed"]')).toHaveCount(3)
  await expect(report).toContainText('只有文字节点可以保存为 .txt。')
  assert.equal(dropped, true)
  assert.equal(await readFile(join(folder, '批量-1.txt'), 'utf8'), 'external content')
  assert.equal(await readFile(join(folder, '批量-2.txt'), 'utf8'), '原始内容 2')
  assert.equal(await readFile(join(folder, '批量-4.txt'), 'utf8'), '原始内容 4')
  assert.equal((await readdir(folder)).includes('批量-3.txt'), false)
  await page.evaluate(uuid => {
    const s = window.openPencil.getStore()
    const node = [...s.graph.nodes.values()].find(n => n.pluginData.some(p => p.key === 'os.canvas/nodeId' && p.value === uuid))
    s.graph.updateNode(node.id, { text: '后续编辑保留', x: 650 })
  }, uuids[1])
  await page.getByRole('button', { name: '重试 批量-2.txt', exact: true }).click()
  await expect(page.locator('[data-slot="output-status"]')).toHaveText('批量处理结束：2 项已写入，2 项未完成')
  const second = commits.filter(c => c.name === '批量-2.txt')
  assert.equal(second.length, 2); assert.equal(second[0].id, second[1].id)
  assert.equal(commits.filter(c => c.name === '批量-4.txt').length, 1)
  assert.equal(await readFile(join(folder, '批量-2.txt'), 'utf8'), '原始内容 2')
  await rename(join(folder, '批量-1.txt'), join(folder, 'external-kept.txt'))
  await page.getByRole('button', { name: '重试 批量-1.txt', exact: true }).click()
  await expect(page.locator('[data-slot="output-status"]')).toHaveText('批量处理结束：3 项已写入，1 项未完成')
  assert.equal(await readFile(join(folder, '批量-1.txt'), 'utf8'), '原始内容 1')
  assert.equal(await readFile(join(folder, 'external-kept.txt'), 'utf8'), 'external content')
  const before = await nodes()
  assert.equal(before.length, 5)
  assert.equal(before.find(n => n.uuid === uuids[1]).text, '后续编辑保留')
  assert.equal(before.find(n => n.uuid === uuids[1]).x, 650)
  for (const index of [0, 1, 3]) assert.equal(before.find(n => n.uuid === uuids[index]).link.path, `批量-${index + 1}.txt`)
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: resolve(evidence, `${evidenceName}.png`) })
  await page.reload()
  await page.getByRole('button', { name: '我的目录', exact: true }).click()
  await page.getByLabel('本地目录列表').getByRole('button', { name: folder, exact: true }).click()
  await expect.poll(nodes, { timeout: 30000 }).toEqual(before)
  const restored = await nodes()
  if (shortcutMode) {
    await expect(page.getByRole('button', { name: '成果快捷键 Ctrl+Alt+S', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('textbox', { name: '成果文件名', exact: true }).fill('单项快捷.txt')
    await page.evaluate(uuid => {
      const s = window.openPencil.getStore()
      const node = [...s.graph.nodes.values()].find(n => n.pluginData.some(p => p.key === 'os.canvas/nodeId' && p.value === uuid))
      s.select([node.id]); document.activeElement?.blur()
    }, uuids[0])
    await page.keyboard.press('Control+Alt+s')
    await expect(page.locator('[data-slot="output-status"]')).toHaveText('成果已写入目录，画布已保存', { timeout: 20000 })
    assert.equal(await readFile(join(folder, '单项快捷.txt'), 'utf8'), '原始内容 1')
    assert.equal((await nodes()).length, 5)
    await page.getByRole('button', { name: '成果快捷键 关闭', exact: true }).click()
    await page.evaluate(uuid => {
      const s = window.openPencil.getStore()
      const node = [...s.graph.nodes.values()].find(n => n.pluginData.some(p => p.key === 'os.canvas/nodeId' && p.value === uuid))
      s.select([node.id]); document.activeElement?.blur()
    }, uuids[0])
    const count = preparedNames.size
    await page.keyboard.press('Control+Alt+s')
    await page.waitForTimeout(250)
    assert.equal(preparedNames.size, count, 'disabled shortcut must not prepare an output')
    await page.reload()
    await expect(page.getByRole('button', { name: '成果快捷键 关闭', exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  await mkdir(evidence, { recursive: true })
  assert.deepEqual(pageErrors, [])
  await writeFile(resolve(evidence, `${evidenceName}.json`), JSON.stringify({ status: 'passed', url: base, folder,
    commits, before, restored, pageErrors, checks: ['mixed per-item results', 'conflict preserves external file',
      'failed item does not block later items', 'lost response retry keeps operation id', 'successful item not resubmitted',
      'retry uses original bytes and retains newer edit', 'no duplicate artwork cards', 'real save and reopen', ...(shortcutMode ? ['input focus and open dialog suppress shortcut', 'binding change removes old keys', 'configured shortcut publishes batch and single node', 'binding persists after reload', 'disabled shortcut does nothing and remains disabled after reload'] : [])] }, null, 2))
  console.log('PASS: batch mixed outcomes, exact retry, original snapshots and reopen')
} catch (error) {
  await mkdir(evidence, { recursive: true })
  await writeFile(resolve(evidence, `${evidenceName}-failure.json`), JSON.stringify({ message: error.message, pageErrors,
    nodes: await nodes(), body: await page.locator('body').innerText() }, null, 2))
  throw error
} finally { await browser.close() }
