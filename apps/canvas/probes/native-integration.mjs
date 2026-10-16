import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, readFile, readdir, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { openInstalledCanvas } from './native-host.mjs'
import { decodeCanvasPackage, encodeCanvasPackage } from '../local/canvas-package.mjs'

const hostRecordPath = process.env.OS_CANVAS_INTEGRATION_HOST_RECORD
const hostRecord = hostRecordPath ? JSON.parse(await readFile(hostRecordPath, 'utf8')) : null
if (hostRecord) assert.equal(createHash('sha256').update(await readFile(hostRecord.executable)).digest('hex'), hostRecord.sha256)
const evidence = resolve(process.env.OS_CANVAS_INTEGRATION_EVIDENCE ?? resolve('output/dev-evidence/canvas-c05/desktop', hostRecord ? 'startup-fixed-integration' : 'installed-integration'))
const hostOptions = { executablePath: hostRecord?.executable }
await mkdir(evidence, { recursive: true })
const folder = await mkdtemp(join(tmpdir(), 'canvas-native-assets-'))
await writeFile(join(folder, 'original.txt'), 'Original file must remain unchanged')
let host, page
async function nodes() {
  return page.evaluate(() => {
    const s = window.openPencil.getStore()
    return s.graph.getChildren(s.state.currentPageId).map(n => ({ name: n.name, x: n.x, y: n.y,
      uuid: n.pluginData.find(p => p.key === 'os.canvas/nodeId')?.value,
      link: JSON.parse(n.pluginData.find(p => p.key === 'os.canvas/fileLink')?.value ?? 'null') }))
  })
}
try {
  host = await openInstalledCanvas(hostOptions); page = host.page
  const { expect } = host
  await page.getByLabel('本地目录路径').fill(folder)
  await page.getByRole('button', { name: '加入目录', exact: true }).click()
  await expect.poll(async () => (await nodes()).length).toBe(1)
  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    const node = s.graph.createNode('RECTANGLE', s.state.currentPageId, { name: 'Native output',
      x: 420, y: 320, width: 180, height: 110,
      fills: [{ type: 'SOLID', color: { r: 0.8, g: 0.3, b: 0.1, a: 1 }, opacity: 1, visible: true }] })
    s.select([node.id]); s.requestRender()
  })
  await page.getByLabel('成果文件名', { exact: true }).fill('native-output.png')
  await page.getByRole('button', { name: '保存选中成果到目录', exact: true }).click()
  await expect(page.locator('[data-slot="output-status"]')).toHaveText('成果已写入目录，画布已保存', { timeout: 30000 })
  const png = await readFile(join(folder, 'native-output.png'))
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(await readFile(join(folder, 'original.txt'), 'utf8'), 'Original file must remain unchanged')
  const original = await nodes()
  assert.equal(original.length, 2)
  assert.equal(original.find(n => n.name === 'Native output').link.path, 'native-output.png')
  await page.getByRole('button', { name: '刷新目录', exact: true }).click()
  await expect(page.locator('[data-slot="directory-scan-status"]')).toContainText('已更新')
  assert.equal((await nodes()).length, 2, 'Exported file must not create a duplicate node')
  const session = await host.browser.newBrowserCDPSession()
  const downloadDirectory = await mkdtemp(join(evidence, 'download-'))
  await session.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloadDirectory, eventsEnabled: true })
  await page.getByText('作品包', { exact: true }).click()
  const downloaded = new Promise((resolveDownload, reject) => {
    let guid
    const timer = setTimeout(() => { cleanup(); reject(new Error('Native download timed out')) }, 30000)
    function cleanup() {
      clearTimeout(timer)
      session.off('Browser.downloadWillBegin', begin)
      session.off('Browser.downloadProgress', progress)
    }
    function begin(event) { guid = event.guid }
    function progress(event) {
      if (event.guid !== guid || event.state === 'inProgress') return
      cleanup()
      if (event.state === 'completed') resolveDownload(join(downloadDirectory, guid))
      else reject(new Error(`Native download ${event.state}`))
    }
    session.on('Browser.downloadWillBegin', begin)
    session.on('Browser.downloadProgress', progress)
  })
  await page.getByRole('button', { name: '导出作品包', exact: true }).click()
  const download = await downloaded
  const output = join(evidence, 'native-export.oscanvas')
  await copyFile(download, output)
  const exported = decodeCanvasPackage(await readFile(output))
  assert.equal(exported.manifest.references.files.length, 2)
  assert.ok(exported.manifest.revisions.length >= 2)
  const plain = decodeCanvasPackage(await readFile('output/dev-evidence/canvas-c05/production/packages/exported.oscanvas'))
  assert.equal(plain.manifest.references.files.length, 0)
  const canvasId = randomUUID(), name = `Native import ${canvasId}`
  const bytes = encodeCanvasPackage({ canvasId, references: plain.manifest.references, layout: plain.manifest.layout,
    revisions: plain.manifest.revisions.map(r => ({ ...r, canvasId, metadata: { ...r.metadata, name }, scene: plain.scenes.get(r.sceneHash) })) })
  await page.getByLabel('选择作品包导入').setInputFiles({ name: 'native-import.oscanvas', mimeType: 'application/octet-stream', buffer: bytes })
  await expect(page.locator('[data-slot="package-status"]')).toContainText('作品已导入', { timeout: 30000 })
  assert.deepEqual(await nodes(), original, 'Import must preserve current canvas')
  await expect(page.getByLabel('本机画布列表')).toContainText(name)
  await page.screenshot({ path: join(evidence, 'exported-imported.png') })
  assert.deepEqual(host.errors, [])
  await host.close(); host = await openInstalledCanvas(hostOptions); page = host.page
  await page.getByRole('button', { name: '我的目录', exact: true }).click()
  await page.getByRole('button', { name: folder, exact: true }).click()
  await host.expect.poll(nodes, { timeout: 30000 }).toEqual(original)
  assert.deepEqual(await readFile(join(folder, 'native-output.png')), png)
  assert.deepEqual((await readdir(folder)).sort(), ['native-output.png', 'original.txt'])
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByLabel('本机画布列表').getByRole('button', { name: new RegExp(name) }).click()
  await host.expect.poll(async () => (await nodes()).length).toBe(1)
  await page.screenshot({ path: join(evidence, 'imported-reopened.png') })
  assert.deepEqual(host.errors, [])
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ status: 'passed', folder, canvasId, hostRecord,
    checks: ['native directory mounting', 'PNG output and original preservation',
      'scan deduplicates output', 'native binary package download and historical file references',
      'native package upload preserves current work', 'process restart restores directory identities and imported canvas'],
    scope: `${hostRecord ? 'Explicit release artifact (see hostRecord)' : 'Installed release'} integration using the test URL for graph assertions; source package import is a new identity in existing independent application storage. Production default startup is validated separately.` }, null, 2))
} catch (error) {
  await page?.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {})
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ error: error.stack, errors: host?.errors }, null, 2))
  throw error
} finally { await host?.close() }
