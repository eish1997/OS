import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { openInstalledCanvas, resizeInstalledCanvas } from './native-host.mjs'

const { chromium, expect } = createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const hostRecord = process.env.OS_CANVAS_ISOLATION_HOST_RECORD
  ? JSON.parse(await readFile(process.env.OS_CANVAS_ISOLATION_HOST_RECORD, 'utf8')) : null
if (hostRecord) assert.equal(createHash('sha256').update(await readFile(hostRecord.executable)).digest('hex'), hostRecord.sha256)
const evidence = resolve('output/dev-evidence/canvas-c01/isolation', hostRecord ? 'native-canvas' : 'canvas')
await mkdir(evidence, { recursive: true })
const host = hostRecord ? await openInstalledCanvas({ executablePath: hostRecord.executable, keepInitialNavigation: true,
  initialURL: 'http://tauri.localhost/?os-canvas&isolation-prototype',
  onStartupFailure: async ({ error }) => {
    await writeFile(resolve(evidence, 'startup-failure.json'), JSON.stringify({ error: String(error) }))
  } }) : null
const browser = host?.browser ?? await chromium.launch({ headless: true })
const page = host?.page ?? await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  if (host) await resizeInstalledCanvas(host)
  await page.goto(host ? 'http://tauri.localhost/?test&os-canvas&isolation-prototype'
    : 'http://localhost:14350/?test&os-canvas&isolation-prototype')
  await expect(page.locator('[data-test-id="canvas-element"][data-ready="1"]')).toBeVisible({ timeout: 60000 })
  const card = page.locator('[data-slot="isolation-draft"]')
  const code = page.getByLabel('节点代码')
  const status = page.locator('[data-slot="isolation-status"]')
  const output = page.locator('[data-slot="isolation-result"]')
  await expect(card).toBeVisible()
  const id = await card.getAttribute('data-node-id')
  assert.ok(await page.evaluate(id => window.openPencil.getStore().graph.getNode(id)?.name === '隔离节点原型', id))
  await page.getByRole('button', { name: '运行节点', exact: true }).click()
  await expect(output).toHaveText('节点已运行')
  await code.fill('while (true) {}')
  await page.getByRole('button', { name: '运行节点', exact: true }).click()
  await expect(status).toHaveText('运行中')
  // Dispatch trusted drawing input while the guest is busy in its worker.
  await page.keyboard.press('Escape')
  await page.locator('[data-test-id="canvas-element"]').focus()
  await page.keyboard.press('r')
  await page.mouse.move(780, 620)
  await page.mouse.down()
  await page.mouse.move(910, 710)
  await page.mouse.up()
  await page.getByRole('button', { name: '取消节点', exact: true }).click()
  await expect(status).toHaveText('已取消')
  assert.ok(await page.evaluate(id => {
    const s = window.openPencil.getStore()
    return s.graph.getChildren(s.state.currentPageId).some(n => n.id !== id && n.type === 'RECTANGLE')
  }, id))
  await code.fill("throw new Error('node failure')")
  await page.getByRole('button', { name: '运行节点', exact: true }).click()
  await expect(status).toHaveText('guest-error')
  await expect(output).toContainText('node failure')
  await code.fill("return JSON.parse(capability('process.spawn', 'anything'))")
  await page.getByRole('button', { name: '运行节点', exact: true }).click()
  await expect(output).toContainText('CAPABILITY_DENIED')
  await code.fill("return { type: 'text', text: '<script>not HTML</script>' }")
  await page.getByRole('button', { name: '运行节点', exact: true }).click()
  await expect(output).toHaveText('<script>not HTML</script>')
  assert.equal(await output.locator('script').count(), 0)
  const before = await card.boundingBox()
  await page.evaluate(() => window.openPencil.getStore().pan(30, 20))
  await expect.poll(async () => (await card.boundingBox()).x).toBeCloseTo(before.x + 30, 1)
  await expect(code).toHaveValue(/return/)
  assert.deepEqual(errors, [])
  assert.deepEqual(host?.errors ?? [], [])
  await page.screenshot({ path: resolve(evidence, 'canvas.png') })
  await writeFile(resolve(evidence, 'result.json'), JSON.stringify({ status: 'passed', nodeId: id, hostRecord,
    checks: ['real graph node with interactive draft', 'executed text output', 'canvas draws while guest runs',
      'cancel and error recovery', 'denied process capability', 'text output cannot inject HTML', 'overlay follows pan'],
    scope: host ? 'Actual Tauri release and private service bridge using a validation identity; not an installer or full C08 acceptance.'
      : 'Browser development host and authenticated local service; not installed Tauri runtime or full C08 acceptance.' }, null, 2))
} catch (error) {
  await page.screenshot({ path: resolve(evidence, 'failure.png') }).catch(() => {})
  await writeFile(resolve(evidence, 'failure.json'), JSON.stringify({ error: error.stack, errors }, null, 2))
  throw error
} finally { if (host) await host.close(); else await browser.close() }
