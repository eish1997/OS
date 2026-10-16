import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))
const { chromium } = require('@playwright/test')
const manifest = JSON.parse(await readFile(resolve(root, 'apps/canvas/upstream.json'), 'utf8'))
const output = resolve(root, 'output/dev-evidence/canvas-c01/identity')
await mkdir(output, { recursive: true })
let browser
const errors = []
async function open() {
  browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://localhost:${manifest.appPort}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached', timeout: 30000 })
  return page
}
async function snapshot(page) {
  return page.evaluate(() => {
    const s = window.openPencil.getStore()
    return [...s.graph.nodes.values()].filter(n => n.name.startsWith('identity-')).map(n => ({
      id: n.id, name: n.name, type: n.type, x: n.x, y: n.y, width: n.width, height: n.height,
      parent: s.graph.getNode(n.parentId)?.name, pluginData: n.pluginData
    })).sort((a, b) => a.name.localeCompare(b.name))
  })
}
async function save(page, name) {
  await page.evaluate(() => { window.showSaveFilePicker = undefined })
  page.once('dialog', dialog => dialog.accept(name))
  const pending = page.waitForEvent('download')
  await page.evaluate(() => window.openPencil.getStore().saveFigFileAs())
  await (await pending).saveAs(resolve(output, name))
  return readFile(resolve(output, name))
}
try {
  let page = await open()
  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    const frame = s.graph.createNode('FRAME', s.state.currentPageId,
      { name: 'identity-frame', x: 400, y: 100, width: 300, height: 300 })
    const rect = s.graph.createNode('RECTANGLE', frame.id,
      { name: 'identity-child', x: 30, y: 40, width: 80, height: 90 })
    for (const n of [frame, rect]) s.graph.updateNode(n.id, { pluginData: [
      { pluginId: 'os.canvas', key: 'os.canvas/nodeId', value: crypto.randomUUID() },
      { pluginId: 'unknown.extension', key: 'unknown.extension/config', value: '{"version":97,"text":"未安装节点"}' }
    ] })
    s.requestRender()
  })
  const original = await snapshot(page)
  assert.equal(original.length, 2)
  // FIG adds upstream layout metadata. Compare our namespaces exactly while retaining
  // all imported metadata in the evidence, rather than treating that addition as loss.
  const stripId = nodes => nodes.map(({ id, pluginData, ...n }) => ({ ...n,
    pluginData: pluginData.filter(p => p.pluginId === 'os.canvas' || p.pluginId === 'unknown.extension') }))
  const rounds = []
  for (let i = 1; i <= 2; i++) {
    const bytes = await save(page, `round-${i}.fig`)
    await browser.close()
    page = await open()
    assert.equal((await snapshot(page)).length, 0)
    await page.evaluate(async data => {
      await window.openPencil.getStore().openFigFile(new File([new Uint8Array(data)], 'identity.fig'))
    }, [...bytes])
    const restored = await snapshot(page)
    assert.deepEqual(stripId(restored), stripId(original))
    rounds.push({ round: i, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), restored })
  }
  const duplicate = await page.evaluate(() => {
    const s = window.openPencil.getStore()
    const node = [...s.graph.nodes.values()].find(n => n.name === 'identity-child')
    s.select([node.id])
    s.duplicateSelected()
    return [...s.graph.nodes.values()].filter(n => n.pluginData?.some(p => p.pluginId === 'os.canvas'))
      .map(n => ({ id: n.id, stableId: n.pluginData.find(p => p.key === 'os.canvas/nodeId')?.value }))
  })
  const duplicateCollision = new Set(duplicate.map(n => n.stableId)).size < duplicate.length
  assert.equal(duplicate.length, 3)
  assert.deepEqual(errors, [])
  const result = { status: 'passed', date: new Date().toISOString(), upstream: manifest.commit,
    original, rounds, duplicate, duplicateCollision, errors,
    checks: ['two real FIG downloads and fresh browser restarts', 'nested geometry and parent preserved',
      'namespaced UUID metadata preserved', 'unknown extension metadata preserved'],
    limitations: ['metadata persistence probe only; production identity assignment and clone repair not implemented',
      'file associations, durable workspace storage and crash recovery are not tested here'] }
  await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ status: result.status, duplicateCollision, rounds: rounds.length }))
} catch (error) {
  await writeFile(resolve(output, 'failure.txt'), String(error.stack ?? error))
  throw error
} finally {
  await browser?.close()
}
