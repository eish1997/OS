import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, 'output/dev-evidence/canvas-c04')
const name = `Output-origin-${Date.now()}`
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
const base = process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'
async function snapshot() {
  return page.evaluate(() => {
    const editor = window.openPencil.getStore()
    return editor.graph.getChildren(editor.state.currentPageId).map(node => ({
      uuid: node.pluginData.find(item => item.key === 'os.canvas/nodeId')?.value,
      name: node.name, type: node.type, x: node.x, y: node.y, width: node.width, height: node.height,
      link: JSON.parse(node.pluginData.find(item => item.key === 'os.canvas/fileLink')?.value ?? 'null')
    }))
  })
}
try {
  await page.goto(`${base}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
  const checks = await page.evaluate(async name => {
    // Adapter integration probe: supplied scan entries, real editor and persistence.
    // This intentionally does not claim to test the export UI or real file publication.
    const { attachOutputOrigins, reconcileFileNodes, fileLink } = await import('/src/app/document/local-file-nodes.ts')
    const editor = window.openPencil.getStore()
    editor.state.documentName = name
    const node = editor.graph.createNode('RECTANGLE', editor.state.currentPageId, {
      name: 'Original artwork', x: 400, y: 240, width: 180, height: 110,
      fills: [{ type: 'SOLID', color: { r: 0.7, g: 0.6, b: 0.4, a: 1 }, opacity: 1, visible: true }]
    })
    editor.select([node.id])
    const nodeId = node.pluginData.find(item => item.key === 'os.canvas/nodeId')?.value
    if (!nodeId) throw new Error('Stable node identity missing')
    const canvasId = crypto.randomUUID()
    const entry = { id: crypto.randomUUID(), mountId: crypto.randomUUID(), path: 'artwork.png', kind: 'file',
      size: '100', revision: 1, availability: 'available',
      outputOrigin: { operationId: crypto.randomUUID(), canvasId, nodeId, sourceRevision: 1 } }
    attachOutputOrigins(editor, [entry], crypto.randomUUID())
    const foreignIgnored = !fileLink(node)
    attachOutputOrigins(editor, [entry], canvasId)
    const first = reconcileFileNodes(editor, [entry], [], 'available')
    const renamed = { ...entry, path: 'renamed.png', revision: 2 }
    reconcileFileNodes(editor, [renamed], first.knownFileAssets, 'available')
    attachOutputOrigins(editor, [{ ...entry, id: crypto.randomUUID() }], canvasId)
    editor.requestRender()
    return { foreignIgnored, explicitAssociationKept: fileLink(node)?.id === entry.id,
      selected: [...editor.state.selectedIds].includes(node.id), known: first.knownFileAssets }
  }, name)
  assert.equal(checks.foreignIgnored, true)
  assert.equal(checks.explicitAssociationKept, true)
  assert.equal(checks.selected, true)
  const before = await snapshot()
  assert.equal(before.length, 1, 'origin attachment must not produce a second file card')
  assert.equal(before[0].name, 'Original artwork')
  assert.equal(before[0].type, 'RECTANGLE')
  assert.equal(before[0].x, 400); assert.equal(before[0].width, 180)
  assert.equal(before[0].link.path, 'renamed.png')
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机')
  await page.reload()
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`^${name} ·`) }).click()
  await expect.poll(snapshot).toEqual(before)
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: resolve(output, 'output-origin.png') })
  await writeFile(resolve(output, 'output-origin.json'), JSON.stringify({ status: 'passed',
    scope: 'adapter with supplied scan entries; actual editor and save/reopen', checks, before, restored: await snapshot() }, null, 2))
  console.log('PASS: output origin adapter preserves original node and persists without duplicate card')
} finally { await browser.close() }
