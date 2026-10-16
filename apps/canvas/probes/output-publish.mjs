import assert from 'node:assert/strict'
import { verifyFileBadges } from './file-badges.mjs'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, writeFile, readFile, readdir, rename, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const evidence = resolve(root, process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c04')
const base = process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14250'
const undoMode = process.env.OS_CANVAS_OUTPUT_UNDO === '1'
const snapshotMode = process.env.OS_CANVAS_OUTPUT_SNAPSHOT === '1'
const badges = process.env.OS_CANVAS_BADGES === '1'
const multiple = process.env.OS_CANVAS_MULTIPLE_OUTPUT === '1'
const textMode = process.env.OS_CANVAS_TEXT_OUTPUT === '1'
const occupiedName = textMode ? 'occupied.txt' : 'occupied.png'
const resultName = textMode ? '成果.txt' : '成果.png'
const evidenceName = snapshotMode ? `output-snapshot-${textMode ? 'txt' : 'png'}` : undoMode ? 'output-undo' : badges ? 'output-badges' : multiple ? 'output-multiple' : (textMode ? 'output-text' : 'output-publish')
const folder = await mkdtemp(join(tmpdir(), 'canvas-publish-ui-'))
await writeFile(join(folder, occupiedName), 'keep existing')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
async function nodes() {
  return page.evaluate(() => {
    const s = window.openPencil.getStore()
    return s.graph.getChildren(s.state.currentPageId).map(n => ({ name: n.name, x: n.x, y: n.y,
      width: n.width, height: n.height, uuid: n.pluginData.find(p => p.key === 'os.canvas/nodeId')?.value,
      outputs: JSON.parse(n.pluginData.find(p => p.key === 'os.canvas/outputLinks')?.value ?? '[]'),
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
  const uuid = await page.evaluate(({ textMode, snapshotMode }) => {
    const s = window.openPencil.getStore()
    const n = s.graph.createNode(textMode ? 'TEXT' : snapshotMode ? 'FRAME' : 'RECTANGLE', s.state.currentPageId, { name: 'My artwork', x: 420, y: 420,
      width: 180, height: 110, text: textMode ? '文字成果\n第二行' : '', fontSize: 22, fills: [{ type: 'SOLID', color: { r: 0.8, g: 0.6, b: 0.3, a: 1 }, opacity: 1, visible: true }] })
    s.select([n.id]); s.requestRender()
    return n.pluginData.find(p => p.key === 'os.canvas/nodeId')?.value
  }, { textMode, snapshotMode })
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  if (undoMode) {
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => (await nodes()).find(n => n.uuid === uuid)?.x).toBe(421)
  }
  await page.getByRole('textbox', { name: '成果文件名', exact: true }).fill(occupiedName)
  await page.getByRole('button', { name: '保存选中成果到目录', exact: true }).click()
  await expect(page.getByText('文件名已存在或目录、文件发生变化。原文件未被覆盖，请检查后重试。', { exact: true })).toBeVisible()
  assert.equal(await readFile(join(folder, occupiedName), 'utf8'), 'keep existing')
  await page.getByRole('textbox', { name: '成果文件名', exact: true }).fill(resultName)
  let dropped = false
  await page.route('**/os-workspace/outputs/*/commit', async route => {
    if (dropped) { await route.continue(); return }
    dropped = true
    await route.fetch(); await route.abort('failed')
  })
  await page.getByRole('button', { name: '保存选中成果到目录', exact: true }).click()
  await expect.poll(() => dropped).toBe(true)
  await expect(page.locator('[data-slot="output-status"]')).toHaveText('成果保存未完成')
  await page.getByRole('button', { name: '保存选中成果到目录', exact: true }).click()
  await expect(page.locator('[data-slot="output-status"]')).toHaveText('成果已写入目录，画布已保存', { timeout: 20000 })
  assert.equal(dropped, true)
  const png = await readFile(join(folder, resultName))
  if (textMode) assert.equal(png.toString('utf8'), '文字成果\n第二行')
  else assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.deepEqual((await readdir(folder)).sort(), [occupiedName, resultName].sort())
  if (multiple) {
    const secondName = textMode ? '第二份成果.txt' : '第二份成果.png'
    await page.getByRole('textbox', { name: '成果文件名', exact: true }).fill(secondName)
    await page.getByRole('button', { name: '保存选中成果到目录', exact: true }).click()
    await expect.poll(async () => (await nodes()).find(n => n.uuid === uuid)?.outputs?.length).toBe(1)
    await expect(page.locator('[data-slot="output-status"]')).toHaveText('成果已写入目录，画布已保存', { timeout: 20000 })
    assert.deepEqual(await readFile(join(folder, secondName)), png)
    await expect(page.locator('[data-slot="selected-file-status"]')).toContainText(secondName)
    assert.deepEqual((await readdir(folder)).sort(), [occupiedName, resultName, secondName].sort())
  }
  if (undoMode) {
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await nodes()).find(n => n.uuid === uuid)?.x).toBe(420)
    assert.deepEqual(await readFile(join(folder, resultName)), png)
    await page.keyboard.press('Control+Shift+z')
    await expect.poll(async () => (await nodes()).find(n => n.uuid === uuid)?.x).toBe(421)
    await page.keyboard.press('Delete')
    await expect.poll(async () => (await nodes()).some(n => n.uuid === uuid)).toBe(false)
    await page.getByRole('button', { name: '刷新目录', exact: true }).click()
    await expect(page.locator('[data-slot="directory-scan-status"]')).toHaveText('目录与关联文件已更新')
    assert.equal((await nodes()).length, 1, 'removed artwork is not recreated by its exported file')
    assert.deepEqual(await readFile(join(folder, resultName)), png)
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await nodes()).find(n => n.uuid === uuid)?.link?.path).toBe(resultName)
    await page.getByRole('button', { name: '保存到本机', exact: true }).click()
    await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  }
  const before = await nodes()
  assert.equal(before.length, 2)
  const original = before.find(n => n.uuid === uuid)
  assert.equal(original.name, 'My artwork'); assert.equal(original.x, undoMode ? 421 : 420); assert.equal(original.width, 180)
  assert.equal(original.link.path, resultName)
  await expect(page.locator('[data-slot="selected-file-status"]')).toContainText(resultName)
  await page.reload()
  await page.getByRole('button', { name: '我的目录', exact: true }).click()
  await page.getByLabel('本地目录列表').getByRole('button', { name: folder, exact: true }).click()
  await expect.poll(async () => (await nodes()).length, { timeout: 30000 }).toBeGreaterThan(0)
  await expect.poll(async () => (await nodes()).find(n => n.uuid === uuid)?.link?.path).toBe(resultName)
  assert.equal((await nodes()).length, 2)
  if (multiple) {
    assert.deepEqual((await nodes()).find(n => n.uuid === uuid)?.outputs, original.outputs)
    const oldName = original.outputs[0].path
    const renamed = textMode ? '外部更名.txt' : '外部更名.png'
    await rename(join(folder, oldName), join(folder, renamed))
    await expect.poll(async () => (await nodes()).find(n => n.uuid === uuid)?.outputs[0]?.path, { timeout: 20000 }).toBe(renamed)
    await unlink(join(folder, renamed))
    await expect.poll(async () => (await nodes()).find(n => n.uuid === uuid)?.outputs[0]?.availability, { timeout: 20000 }).toBe('missing')
    assert.equal((await nodes()).length, 2)
    assert.equal((await nodes()).find(n => n.uuid === uuid)?.link.path, resultName)
    await page.evaluate(uuid => {
      const s = window.openPencil.getStore()
      const node = [...s.graph.nodes.values()].find(n => n.pluginData.some(p => p.key === 'os.canvas/nodeId' && p.value === uuid))
      s.select([node.id])
    }, uuid)
    await expect(page.locator('[data-slot="selected-file-status"]')).toContainText(`原件缺失 · ${renamed}`)
    await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  }
  if (badges) await verifyFileBadges(page, expect, uuid)
  if (snapshotMode) {
    const selectArtwork = () => page.evaluate(uuid => {
      const s = window.openPencil.getStore()
      const node = [...s.graph.nodes.values()].find(n => n.pluginData.some(p => p.key === 'os.canvas/nodeId' && p.value === uuid))
      s.select([node.id])
    }, uuid)
    await selectArtwork()
    const status = page.locator('[data-slot="selected-file-status"]')
    await expect(status).toContainText('与导出快照一致', { timeout: 20000 })
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('ArrowRight')
    await expect(status).toContainText('与导出快照一致')
    // Keyboard nudges coalesce before committing their undo entry.
    await page.waitForTimeout(600)
    await page.evaluate(textMode => {
      const s = window.openPencil.getStore(), id = [...s.state.selectedIds][0]
      const finish = s.captureDocumentChange()
      s.graph.updateNode(id, textMode ? { text: '新文字内容' } : { width: 230 })
      const change = finish()
      s.pushUndoStep({ label: '修改成果', inverse: () => s.restoreDocumentChange(change, 'before'),
        forward: () => s.restoreDocumentChange(change, 'after') })
      s.requestRender()
    }, textMode)
    await expect(status).toContainText('内容已修改，尚未重新导出')
    await page.keyboard.press('Control+z')
    await selectArtwork()
    await expect(status).toContainText('与导出快照一致')
    await page.keyboard.press('Control+Shift+z')
    await selectArtwork()
    await expect(status).toContainText('内容已修改，尚未重新导出')
    assert.deepEqual(await readFile(join(folder, resultName)), png)
    await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
    await page.reload()
    await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
    await page.getByRole('button', { name: '我的目录', exact: true }).click()
    await page.getByLabel('本地目录列表').getByRole('button', { name: folder, exact: true }).click()
    await expect.poll(async () => (await nodes()).some(n => n.uuid === uuid), { timeout: 30000 }).toBe(true)
    await selectArtwork()
    await expect(status).toContainText('内容已修改，尚未重新导出', { timeout: 20000 })
    if (!textMode) {
      await page.evaluate(() => {
        const s = window.openPencil.getStore()
        s.graph.updateNode([...s.state.selectedIds][0], { width: 180 }); s.requestRender()
      })
      await expect(status).toContainText('与导出快照一致')
      const childId = await page.evaluate(() => {
        const s = window.openPencil.getStore()
        const child = s.graph.createNode('RECTANGLE', [...s.state.selectedIds][0], { x: 10, y: 10, width: 60, height: 40,
          fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }] })
        s.requestRender(); return child.id
      })
      await expect(status).toContainText('内容已修改，尚未重新导出')
      await page.evaluate(id => {
        const s = window.openPencil.getStore(); s.graph.deleteNode(id); s.requestRender()
      }, childId)
      await expect(status).toContainText('与导出快照一致')
    }
  }
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: resolve(evidence, `${evidenceName}.png`) })
  await writeFile(resolve(evidence, `${evidenceName}.json`), JSON.stringify({ status: 'passed', url: base, format: textMode ? 'txt' : 'png', folder, bytes: png.length,
    before, restored: await nodes(), checks: ['real file content', 'name conflict preserves file', 'lost response retry',
      'original node linked without duplicate', 'geometry and name retained', 'reload persistence', ...(snapshotMode ? ['snapshot metadata survives reopen', 'movement retains snapshot equality', 'content change differs from snapshot', 'undo restores equality and redo restores changed state', 'exported bytes unchanged', 'changed content status survives save and reopen'] : []), ...(undoMode ? ['export does not replace previous undo step', 'undo and redo retain exported bytes', 'delete and refresh preserve file without recreating card', 'undo deletion restores node identity and association'] : []), ...(badges ? ['unselected badge visible', 'missing count', 'pointer passes through', 'zoom and movement coordinates', 'hidden node removes badge', 'panel layout does not move badge or add nodes'] : []), ...(multiple ? ['two exports on original node', 'both file contents verified', 'additional associations survive reopen', 'additional file rename and deletion synchronize', 'missing file retains artwork and primary link'] : [])] }, null, 2))
  console.log(`PASS: actual ${textMode ? 'TXT' : 'PNG'} publication, collision, lost response, original-node association and reload`)
} catch (error) {
  await mkdir(evidence, { recursive: true })
  await writeFile(resolve(evidence, `${evidenceName}-failure.json`), JSON.stringify({ message: error.message,
    nodes: await nodes(), body: await page.locator('body').innerText() }, null, 2))
  throw error
} finally { await browser.close() }
