import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { chromium } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const output = resolve(root, 'output/dev-evidence/canvas-c03')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
  const downloads = []
  page.on('response', response => {
    if (/fontsource|jsdelivr/.test(response.url())) downloads.push({ url: response.url(), status: response.status() })
  })
  await page.goto(`${process.env.OS_CANVAS_TEST_URL ?? 'http://localhost:14230'}/?test&os-canvas&no-rulers`)
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.locator('#loader').waitFor({ state: 'detached' })
  const result = await page.evaluate(async () => {
    const store = window.openPencil.getStore()
    store.state.autosaveEnabled = false
    const { fontManager } = await import('/packages/core/src/text/fonts.ts')
    const { nodeFontReadiness, buildParagraph } = await import('/packages/core/src/canvas/text/index.ts')
    const { ensureGraphFonts } = await import('/src/app/editor/fonts/index.ts')
    const text = '[本地文件] 已关联本地 中文素材.txt'
    const node = store.graph.createNode('TEXT', store.state.currentPageId, {
      text, x: 350, y: 200, width: 650, height: 60, fontFamily: 'Inter', fontSize: 24,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true }]
    })
    await ensureGraphFonts(store.graph, [node.id], store.renderer)
    const inspect = () => {
      const paragraph = buildParagraph(store.renderer, node)
      paragraph.layout(node.width)
      const glyphs = paragraph.getShapedLines().flatMap(line => line.runs.flatMap(run => Array.from(run.glyphs)))
      paragraph.delete()
      return { readiness: nodeFontReadiness(store.renderer, node), glyphs, missing: glyphs.filter(glyph => glyph === 0).length }
    }
    const before = inspect()
    // Isolate the downloaded Chinese shard under its own face to distinguish
    // missing bytes from CanvasKit choosing a different shard of the same face.
    const response = await fetch('https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-400-normal.ttf')
    if (!response.ok) throw new Error(`Diagnostic font: ${response.status}`)
    fontManager.markLoaded('Diagnostic CJK', 'Regular', await response.arrayBuffer())
    store.graph.updateNode(node.id, { fontFamily: 'Diagnostic CJK' })
    const after = inspect()
    store.runLayoutForNode(node.id)
    store.renderer.invalidateAllPictures()
    store.requestRender()
    return { text, before, after, fallbackFamilies: fontManager.getCJKFallbackFamilies() }
  })
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: resolve(output, 'font-subsets.png') })
  await writeFile(resolve(output, 'font-subsets.json'), JSON.stringify({ date: new Date().toISOString(), ...result, downloads }, null, 2))
  console.log(JSON.stringify(result))
} finally {
  await browser.close()
}
