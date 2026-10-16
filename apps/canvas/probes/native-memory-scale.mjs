import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { openInstalledCanvas, resizeInstalledCanvas } from './native-host.mjs'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { resolve } from 'node:path'
const run = promisify(execFile), root = process.cwd()
const evidence = resolve(root, 'output/dev-evidence/canvas-c05/performance/native')
const fixture = JSON.parse(await readFile(resolve(evidence, 'scale.json'), 'utf8'))
const record = process.env.OS_CANVAS_MEMORY_HOST_RECORD ? JSON.parse(await readFile(process.env.OS_CANVAS_MEMORY_HOST_RECORD, 'utf8')) : null
if (record) assert.equal(createHash('sha256').update(await readFile(record.executable)).digest('hex'), record.sha256)
const outputName = process.env.OS_CANVAS_MEMORY_FILE ?? 'memory-scale.json'
const host = await openInstalledCanvas({ executablePath: record?.executable })
const { page, browser, expect } = host
const result = { status: 'running', hostRecord: record, canvasId: fixture.canvasId, durationMs: 300000, budgetBytes: 2 * 1024 ** 3,
  samples: [], scope: 'Explicit Windows release process tree rooted at owned OpenPencil PID, including Node and WebView2; working sets include shared pages; excludes test driver and unrelated browser services' }
async function sample(session, elapsedMs) {
  const info = await session.send('SystemInfo.getProcessInfo')
  const ids = info.processInfo.map(p => p.id)
  assert.ok(ids.length && ids.every(id => Number.isSafeInteger(id) && id > 0))
  const browserRoot = info.processInfo.find(p => p.type === 'browser')?.id
  assert.ok(browserRoot)
  const command = `$all = Get-CimInstance Win32_Process
$ids = @(${host.child.pid})
do { $more = @($all | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids } | Select-Object -ExpandProperty ProcessId); $ids += $more } while ($more.Count -gt 0)
$live = @(Get-Process | Where-Object { $_.Id -in $ids } | Select-Object Id,ProcessName,WorkingSet64)
@{ processes = $live; exitedDuringSample = @($ids | Where-Object { $_ -notin $live.Id }) } | ConvertTo-Json -Depth 4 -Compress`
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true, timeout: 15000 })
  const rows = JSON.parse(stdout)
  const processes = rows.processes
  for (const id of [host.child.pid, browserRoot]) assert.ok(processes.some(p => p.Id === id), `Required process ${id} missing`)
  assert.ok(processes.some(p => p.ProcessName === 'node') && processes.some(p => p.ProcessName === 'msedgewebview2'))
  const workingSetBytes = processes.reduce((sum, p) => sum + p.WorkingSet64, 0)
  result.samples.push({ elapsedMs, workingSetBytes, processes, exitedDuringSample: rows.exitedDuringSample })
  await writeFile(resolve(evidence, outputName), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ elapsedMs, workingSetBytes, processes: processes.length }))
}
try {
  await resizeInstalledCanvas(host)
  await page.evaluate(() => { window.openPencil.getStore().state.autosaveEnabled = false })
  await page.getByRole('button', { name: '保存到本机', exact: true }).click()
  await expect(page.locator('[data-slot="local-save-status"]')).toHaveText('已保存到本机', { timeout: 30000 })
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByLabel('本机画布列表').getByRole('button', { name: new RegExp(`^${fixture.name} ·`) }).click()
  await expect.poll(() => page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()]
    .filter(n => n.type === 'RECTANGLE').length), { timeout: 60000 }).toBe(1000)
  await page.evaluate(() => { window.openPencil.getStore().state.autosaveEnabled = false })
  assert.equal(await page.evaluate(() => {
    const s = window.openPencil.getStore()
    return new Set(s.graph.getChildren(s.state.currentPageId).flatMap(n => n.fills.filter(f => f.type === 'IMAGE').map(f => f.imageHash))).size
  }), 200)
  await page.evaluate(() => {
    const s = window.openPencil.getStore()
    s.state.autosaveEnabled = false
    s.setZoomAroundPoint(1, 0, 0)
    s.pan(-s.state.panX, -s.state.panY)
    s.requestRepaint()
  })
  const session = await browser.newBrowserCDPSession(), start = performance.now()
  for (let index = 0; index <= 10; index++) {
    await delay(Math.max(0, start + index * 30000 - performance.now()))
    // Exercise the loaded view without changing the saved fixture.
    await page.evaluate(index => window.openPencil.getStore().pan(index % 2 ? -4 : 4, 0), index)
    const visibleImages = await page.evaluate(() => {
      const s = window.openPencil.getStore(), canvas = document.querySelector('[data-test-id="scene-canvas-element"]')
      return s.graph.getChildren(s.state.currentPageId).filter(n => n.fills.some(f => f.type === 'IMAGE') &&
        n.x * s.state.zoom + s.state.panX >= 0 && n.y * s.state.zoom + s.state.panY >= 0 &&
        (n.x + n.width) * s.state.zoom + s.state.panX <= canvas.clientWidth &&
        (n.y + n.height) * s.state.zoom + s.state.panY <= canvas.clientHeight).length
    })
    assert.equal(visibleImages, 8)
    await sample(session, performance.now() - start)
    result.samples.at(-1).visibleImages = visibleImages
    if (index === 0 || index === 10) {
      // Capture the actual owned native window; restore it before reading pixels.
      const captured = await run('powershell.exe', ['-NoProfile', '-Command',
        `orca computer get-app-state --app pid:${host.child.pid} --restore-window --json`],
        { windowsHide: true, timeout: 20000 })
      const state = JSON.parse(captured.stdout)
      assert.equal(state.ok, true)
      assert.ok(state.result.screenshot.path)
      const stem = outputName.replace(/\.json$/, '') + `-${index}`
      await writeFile(resolve(evidence, stem + '-window.json'), JSON.stringify(state, null, 2))
      await copyFile(state.result.screenshot.path, resolve(evidence, stem + '.png'))
    }
  }
  result.pageErrors = [...host.errors]
  assert.deepEqual(host.errors, [])
  result.status = result.samples.every(sample => sample.workingSetBytes <= result.budgetBytes) ? 'native-host-passed' : 'budget-exceeded'
} catch (error) { result.status = 'failed'; result.error = String(error); throw error }
finally { result.pageErrors = [...host.errors]; await writeFile(resolve(evidence, outputName), JSON.stringify(result, null, 2)); await host.close() }
