import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, writeFile, rename, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, basename } from 'node:path'
import { decodeCanvasPackage } from '../local/canvas-package.mjs'
const root = process.cwd()
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const evidence = resolve(root, process.env.OS_CANVAS_EVIDENCE_DIR ?? 'output/dev-evidence/canvas-c05/package-roundtrip')
await mkdir(evidence, { recursive: true })
const fixture = await mkdtemp(join(tmpdir(), 'canvas-package-ui-')), source = join(fixture, basename(fixture))
await mkdir(source); await writeFile(join(source, 'source.txt'), 'external original')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const errors = []
async function open(base) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  return page
}
const api = (page, path) => page.evaluate(async path => (await fetch(`/os-workspace${path}`, {
  headers: { 'X-OS-Workspace': '1' } })).json(), path)
async function artwork(page) {
  return page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()]
    .filter(n => n.name === 'Portable work')
    .map(n => ({ uuid: n.pluginData.find(p => p.key === 'os.canvas/nodeId')?.value,
      name: n.name, x: n.x, y: n.y, width: n.width, height: n.height, fills: n.fills.map(fill => ({ ...fill, blendMode: fill.blendMode ?? 'NORMAL',
        color: Object.fromEntries(Object.entries(fill.color).map(([key, value]) => [key, Math.fround(value)])) })) })))
}
async function extras(page) {
  return page.evaluate(async () => {
    const s = window.openPencil.getStore()
    const stable = n => n.pluginData.find(p => p.key === 'os.canvas/nodeId')?.value
    const image = [...s.graph.nodes.values()].find(n => n.name === 'Embedded image')
    const fill = image?.fills.find(f => f.type === 'IMAGE')
    const bytes = fill && s.graph.images.get(fill.imageHash)
    const digest = bytes ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('') : null
    const extension = [...s.graph.nodes.values()].find(n => n.name === 'Unknown extension')
    return { pages: s.graph.getPages().map(n => ({ id: stable(n), name: n.name })),
      image: { id: image && stable(image), digest }, extension: extension && { id: stable(extension),
        data: extension.pluginData.filter(p => p.pluginId === 'unknown.extension') } }
  })
}
let inspected
try {
  const origin = await open(process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14270')
  await origin.getByLabel('本地目录路径').fill(source)
  await origin.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect(origin.locator('[data-slot="directory-scan-status"]')).toContainText('已更新', { timeout: 30000 })
  await origin.evaluate(async () => {
    const s = window.openPencil.getStore()
    s.graph.createNode('RECTANGLE', s.state.currentPageId, { name: 'Portable work', x: 520, y: 360,
      width: 180, height: 130, fills: [{ type: 'SOLID', color: { r: 0.9, g: 0.3, b: 0.1, a: 1 }, opacity: 1, visible: true }] })
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#cc4488'; ctx.fillRect(0, 0, 64, 64)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    const hash = s.storeImage(new Uint8Array(await blob.arrayBuffer()))
    s.graph.createNode('RECTANGLE', s.state.currentPageId, { name: 'Embedded image', x: 780, y: 360, width: 140, height: 130,
      fills: [{ type: 'IMAGE', imageHash: hash, imageScaleMode: 'FILL', color: { r: 0, g: 0, b: 0, a: 1 }, visible: true, opacity: 1 }] })
    const second = s.graph.addPage('Portable second page')
    s.graph.createNode('RECTANGLE', second.id, { name: 'Unknown extension', x: 400, y: 250, width: 200, height: 100,
      pluginData: [{ pluginId: 'unknown.extension', key: 'payload', value: '{"formatVersion":97,"input":"保留未知数据"}' }] })
    s.requestRender()
  })
  await expect(origin.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 30000 })
  await origin.evaluate(() => {
    const s = window.openPencil.getStore(), node = [...s.graph.nodes.values()].find(n => n.name === 'Portable work')
    s.graph.updateNode(node.id, { x: 570 }); s.requestRender()
  })
  await origin.getByText('作品包', { exact: true }).click()
  const downloadPromise = origin.waitForEvent('download')
  await expect(origin.getByRole('button', { name: '导出作品包', exact: true })).toBeEnabled()
  await origin.getByRole('button', { name: '导出作品包', exact: true }).click()
  const download = await downloadPromise, path = resolve(evidence, 'roundtrip.oscanvas')
  await download.saveAs(path)
  const { manifest } = decodeCanvasPackage(await readFile(path))
  const expected = await artwork(origin), expectedExtras = await extras(origin)
  assert.ok(expectedExtras.image.digest)
  assert.equal(expectedExtras.pages.length, 2)
  assert.ok(expectedExtras.extension.id)
  assert.ok(expected[0].uuid)
  assert.ok(manifest.revisions.length >= 2)
  assert.equal(manifest.references.files.length, 1)
  await origin.close()
  await rename(source, join(fixture, 'offline-assets'))
  let target = await open(process.env.OS_CANVAS_TARGET_URL ?? 'http://localhost:14280')
  assert.equal((await api(target, '/canvases')).some(row => row.canvasId === manifest.canvasId), false)
  await target.getByText('作品包', { exact: true }).click()
  await target.route('**/os-workspace/package-imports/*/resume', route => route.abort('failed'))
  await target.getByLabel('选择作品包导入').setInputFiles(path)
  await expect(target.getByRole('button', { name: `重试导入 ${basename(path)}`, exact: true })).toBeEnabled()
  const pending = (await api(target, '/package-imports')).find(row => row.canvasId === manifest.canvasId)
  assert.equal(pending.state, 'prepared')
  await target.close()
  target = await open(process.env.OS_CANVAS_TARGET_URL ?? 'http://localhost:14280')
  await target.getByText('作品包', { exact: true }).click()
  await target.getByRole('button', { name: '导入记录', exact: true }).click()
  inspected = target
  const row = target.getByLabel('作品包导入记录').locator('div').filter({ hasText: manifest.canvasId })
  await row.getByRole('button', { name: '继续导入作品', exact: true }).click()
  await expect(target.locator('[data-slot="package-status"]')).toContainText('作品已导入', { timeout: 30000 })
  const history = await api(target, `/canvases/${manifest.canvasId}/revisions`)
  assert.equal(history.length, manifest.revisions.length)
  for (const revision of manifest.revisions) {
    const restored = history.find(row => row.revision === revision.revision)
    assert.equal(restored.sceneHash, revision.sceneHash)
    assert.deepEqual(restored.metadata, revision.metadata)
  }
  const mount = (await api(target, '/mounts')).find(row => row.canvasId === manifest.canvasId)
  assert.equal(mount.availability, 'offline')
  const files = await api(target, `/mounts/${mount.id}/files`)
  assert.equal(files.entries[0].id, manifest.references.files[0].id)
  assert.equal(files.entries[0].availability, 'missing')
  await target.getByLabel('本机画布列表').getByRole('button', { name: new RegExp(`^${basename(source)} ·`) }).click()
  await expect.poll(() => artwork(target), { timeout: 30000 }).toEqual(expected)
  await expect(target.locator('[data-slot="local-file-badge"]')).toContainText('缺失 1', { timeout: 15000 })
  assert.deepEqual(await artwork(target), expected)
  await target.evaluate(async () => {
    const s = window.openPencil.getStore(), pages = s.graph.getPages()
    await s.switchPage(pages[1].id); await s.switchPage(pages[0].id)
  })
  assert.deepEqual(await extras(target), expectedExtras)
  await target.screenshot({ path: resolve(evidence, 'restored.png') })
  await target.getByLabel('本地目录路径').fill(join(fixture, 'offline-assets'))
  await target.getByRole('button', { name: '恢复当前目录关联', exact: true }).click()
  await target.getByRole('button', { name: '确认目录关联', exact: true }).click()
  await expect.poll(async () => (await api(target, `/mounts/${mount.id}/files`)).entries[0].availability).toBe('replaced')
  await target.evaluate(() => {
    const s = window.openPencil.getStore(), node = [...s.graph.nodes.values()].find(n => n.name === 'source.txt' && n.type === 'FRAME')
    s.select([node.id])
  })
  await expect(target.getByRole('button', { name: '重新关联原件', exact: true })).toBeEnabled()
  await target.getByRole('button', { name: '重新关联原件', exact: true }).click()
  await target.getByRole('button', { name: '确认关联新原件', exact: true }).click()
  await expect(target.locator('[data-slot="local-file-badge"]')).not.toContainText('缺失')
  const recoveredFiles = await api(target, `/mounts/${mount.id}/files`)
  assert.equal(recoveredFiles.entries[0].id, manifest.references.files[0].id)
  assert.equal(recoveredFiles.entries[0].availability, 'available')
  assert.deepEqual(await artwork(target), expected)
  assert.deepEqual(await extras(target), expectedExtras)
  await target.screenshot({ path: resolve(evidence, 'relinked.png') })

  assert.deepEqual(errors, [])
  await writeFile(resolve(evidence, 'result.json'), JSON.stringify({ status: 'passed', canvasId: manifest.canvasId,
    historyCount: history.length, expected, expectedExtras, checks: ['separate store', 'browser restart resumes prepared import',
      'all history hashes and metadata', 'two page identities', 'embedded image byte hash', 'unknown extension payload', 'offline file identities retained', 'visible missing badge after directory refresh', 'real restored artwork UUID and geometry', 'explicit directory and file reassociation preserves identity and artwork'] }, null, 2))
} catch (error) {
  if (inspected) {
    await inspected.screenshot({ path: resolve(evidence, 'failure.png') })
    await writeFile(resolve(evidence, 'failure.json'), JSON.stringify({ error: String(error), errors,
      text: await inspected.locator('body').innerText(), state: await inspected.evaluate(() => {
        const s=window.openPencil.getStore(); return { name:s.state.documentName, dirty:s.hasUnsavedChanges(), nodes:[...s.graph.nodes.values()].map(n=>n.name) }
      }) }, null, 2))
  }
  throw error
} finally { await browser.close() }
