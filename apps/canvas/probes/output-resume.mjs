import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, writeFile, readFile, readdir, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const evidence = resolve(root, process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c04')
const base = process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14250'
const unsupported = process.env.OS_CANVAS_UNSUPPORTED_OUTPUT === '1'
const action = process.env.OS_CANVAS_RECOVERY_ACTION ?? 'resume'
const conflict = process.env.OS_CANVAS_RESUME_CONFLICT === '1' || action === 'rename'
const resultName = action === 'rename' ? '更名成果.txt' : '恢复成果.txt'
const evidenceName = unsupported ? 'output-unsupported' : action !== 'resume' ? `output-${action}` : conflict ? 'output-resume-conflict' : 'output-resume'
const folder = await mkdtemp(join(tmpdir(), 'canvas-resume-ui-'))
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
async function nodes() {
  return page.evaluate(() => {
    const editor = window.openPencil.getStore()
    return editor.graph.getChildren(editor.state.currentPageId).map(node => ({ name: node.name, text: node.text, x: node.x,
      uuid: node.pluginData.find(p => p.key === 'os.canvas/nodeId')?.value,
      link: JSON.parse(node.pluginData.find(p => p.key === 'os.canvas/fileLink')?.value ?? 'null') }))
  })
}
async function reopen() {
  await page.reload()
  await page.getByRole('button', { name: '我的目录', exact: true }).click()
  await page.getByLabel('本地目录列表').getByRole('button', { name: folder, exact: true }).click()
  await expect.poll(async () => (await nodes()).length, { timeout: 30000 }).toBeGreaterThan(0)
}
try {
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
  await page.getByRole('textbox', { name: '本地目录路径' }).fill(folder)
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect(page.locator('[data-slot="directory-scan-status"]')).toHaveText('目录与关联文件已更新')
  const uuid = await page.evaluate(() => {
    const editor = window.openPencil.getStore()
    const node = editor.graph.createNode('TEXT', editor.state.currentPageId, { name: 'Working note', text: '原始内容',
      x: 440, y: 360, width: 240, height: 80, fontSize: 24,
      fills: [{ type: 'SOLID', color: { r: 0.9, g: 0.8, b: 0.6, a: 1 }, opacity: 1, visible: true }] })
    editor.select([node.id]); editor.requestRender()
    return node.pluginData.find(p => p.key === 'os.canvas/nodeId')?.value
  })
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await page.getByRole('textbox', { name: '成果文件名', exact: true }).fill('恢复成果.txt')
  await page.route('**/os-workspace/outputs/*/commit', route => unsupported
    ? route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ error: 'unsupported-filesystem' }) })
    : route.abort('failed'))
  await page.getByRole('button', { name: '保存选中成果到目录', exact: true }).click()
  await expect(page.locator('[data-slot="output-status"]')).toHaveText('成果保存未完成')
  if (unsupported) await expect(page.getByText('当前目录不支持安全提交文件。原快照已保留，可在未完成的成果中取消本次保存。', { exact: true })).toBeVisible()
  assert.deepEqual(await readdir(folder), [])
  await page.unroute('**/os-workspace/outputs/*/commit')
  await reopen()
  const resume = page.getByRole('button', { name: /^继续保存 恢复成果.txt/ })
  await expect(resume).toBeVisible()
  await page.evaluate(uuid => {
    const editor = window.openPencil.getStore()
    const node = [...editor.graph.nodes.values()].find(node => node.pluginData.some(p => p.key === 'os.canvas/nodeId' && p.value === uuid))
    editor.graph.updateNode(node.id, { text: '后来修改的内容', x: 480 }); editor.select([node.id]); editor.requestRender()
  }, uuid)
  if (action === 'cancel') {
    await page.route('**/os-workspace/outputs/*/cancel', async route => {
      const response = await route.fetch()
      // Keep cancellation busy across the one-second autosave timer, then verify
      // the completion callback schedules the skipped save without another edit.
      await page.waitForTimeout(1600)
      await route.fulfill({ response })
    })
    await page.getByRole('button', { name: '取消保存 恢复成果.txt', exact: true }).click()
    await expect(page.locator('[data-slot="output-status"]')).toHaveText('已取消后续提交，画布内容和现有文件保留')
    await expect(resume).toHaveCount(0)
    assert.deepEqual(await readdir(folder), [])
    await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  } else {
  if (conflict) {
    await writeFile(join(folder, '恢复成果.txt'), '外部文件，不可覆盖')
    await resume.click()
    await expect(page.locator('[data-slot="output-status"]')).toHaveText('原成果仍待恢复，可重试')
    assert.equal(await readFile(join(folder, '恢复成果.txt'), 'utf8'), '外部文件，不可覆盖')
    await expect(resume).toBeVisible()
    await expect.poll(async () => (await nodes()).some(n => n.link?.path === '恢复成果.txt')).toBe(true)
    if (action !== 'rename') {
      await rename(join(folder, '恢复成果.txt'), join(folder, '保留外部文件.txt'))
      await expect.poll(async () => (await nodes()).some(n => n.link?.path === '保留外部文件.txt')).toBe(true)
    }
  }
  if (action === 'rename') {
    await page.getByRole('textbox', { name: '成果文件名', exact: true }).fill(resultName)
    await page.getByRole('button', { name: '按上方新文件名保存原快照', exact: true }).click()
  } else await resume.click()
  await expect(page.locator('[data-slot="output-status"]')).toHaveText('成果已写入目录，画布已保存', { timeout: 20000 })
  assert.equal(await readFile(join(folder, resultName), 'utf8'), '原始内容')
  if (action === 'rename') {
    assert.equal(await readFile(join(folder, '恢复成果.txt'), 'utf8'), '外部文件，不可覆盖')
    assert.deepEqual((await readdir(folder)).sort(), ['恢复成果.txt', resultName].sort(), 'renaming cleans the cancelled temporary')
  }
  }
  assert.equal((await nodes()).length, conflict ? 2 : 1)
  const after = (await nodes()).find(n => n.uuid === uuid)
  assert.equal(after.text, '后来修改的内容'); assert.equal(after.x, 480); assert.equal(after.uuid, uuid)
  if (action === 'cancel') assert.equal(after.link, null)
  else assert.equal(after.link.path, resultName)
  await expect(resume).toHaveCount(0)
  await reopen()
  await expect.poll(async () => (await nodes()).find(n => n.uuid === uuid)?.text).toBe('后来修改的内容')
  await expect(resume).toHaveCount(0)
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: resolve(evidence, `${evidenceName}.png`) })
  await writeFile(resolve(evidence, `${evidenceName}.json`), JSON.stringify({ status: 'passed', url: base, conflict, action, after,
    checks: [...(unsupported ? ['UI injected 501 explains unsupported publication; actual server preparation retained'] : []), 'pending operation recovered after reload', action === 'cancel' ? 'cancel produces no file' : 'original bytes published',
      'newer edit retained', 'original node identity retained', 'finished operation removed from recovery list', 'second reload retains edits',
      ...(action === 'rename' ? ['conflicting external file retained', 'new filename uses original snapshot'] : [])] }, null, 2))
  console.log(`PASS: output ${action} after reload preserves newer edits`)
} catch (error) {
  await mkdir(evidence, { recursive: true })
  await writeFile(resolve(evidence, `${evidenceName}-failure.json`), JSON.stringify({ error: error.message, nodes: await nodes(), body: await page.locator('body').innerText() }, null, 2))
  throw error
} finally { await browser.close() }
