import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { resolve } from 'node:path'
const run = promisify(execFile), root = process.cwd()
const evidence = resolve(root, 'output/dev-evidence/canvas-c05/performance')
const fixture = JSON.parse(await readFile(resolve(evidence, 'canvas-scale.json'), 'utf8'))
const { chromium, expect } = createRequire(resolve(root, '.runtime/open-pencil-upstream/package.json'))('@playwright/test')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
const result = { status: 'running', canvasId: fixture.canvasId, durationMs: 300000, budgetBytes: 2 * 1024 ** 3,
  samples: [], scope: 'dedicated test Edge processes plus production Vite/Node listener process trees; Windows working sets include shared pages; not a native desktop measurement' }
async function sample(session, elapsedMs) {
  const info = await session.send('SystemInfo.getProcessInfo')
  const ids = info.processInfo.map(p => p.id)
  assert.ok(ids.length && ids.every(id => Number.isSafeInteger(id) && id > 0))
  const browserRoot = info.processInfo.find(p => p.type === 'browser')?.id
  assert.ok(browserRoot)
  const command = `$all = Get-CimInstance Win32_Process
$serviceRoots = @(Get-NetTCPConnection -State Listen -LocalPort 14290,14292 | Select-Object -ExpandProperty OwningProcess)
$ids = @(${ids.join(',')}) + $serviceRoots
do { $more = @($all | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids } | Select-Object -ExpandProperty ProcessId); $ids += $more } while ($more.Count -gt 0)
$live = @(Get-Process | Where-Object { $_.Id -in $ids } | Select-Object Id,ProcessName,WorkingSet64)
@{ processes = $live; serviceRoots = $serviceRoots; exitedDuringSample = @($ids | Where-Object { $_ -notin $live.Id }) } | ConvertTo-Json -Depth 4 -Compress`
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true, timeout: 15000 })
  const rows = JSON.parse(stdout)
  const processes = rows.processes
  for (const id of [browserRoot, ...rows.serviceRoots]) assert.ok(processes.some(p => p.Id === id), `Required process ${id} missing`)
  assert.ok(processes.some(p => p.ProcessName === 'node') && processes.some(p => p.ProcessName === 'msedge'))
  const workingSetBytes = processes.reduce((sum, p) => sum + p.WorkingSet64, 0)
  result.samples.push({ elapsedMs, workingSetBytes, processes, exitedDuringSample: rows.exitedDuringSample })
  await writeFile(resolve(evidence, 'memory-scale.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ elapsedMs, workingSetBytes, processes: processes.length }))
}
try {
  await page.goto('http://localhost:14290/?test&os-canvas&no-rulers')
  await page.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: '本机画布', exact: true }).click()
  await page.getByLabel('本机画布列表').getByRole('button', { name: new RegExp(`^${fixture.name} ·`) }).click()
  await expect.poll(() => page.evaluate(() => [...window.openPencil.getStore().graph.nodes.values()]
    .filter(n => n.type === 'RECTANGLE').length), { timeout: 60000 }).toBe(1000)
  await page.evaluate(() => { window.openPencil.getStore().state.autosaveEnabled = false })
  const session = await browser.newBrowserCDPSession(), start = performance.now()
  for (let index = 0; index <= 10; index++) {
    await delay(Math.max(0, start + index * 30000 - performance.now()))
    // Exercise the loaded view without changing the saved fixture.
    await page.evaluate(index => window.openPencil.getStore().pan(index % 2 ? -4 : 4, 0), index)
    await sample(session, performance.now() - start)
  }
  result.status = result.samples.at(-1).workingSetBytes <= result.budgetBytes ? 'browser-host-passed' : 'budget-exceeded'
} catch (error) { result.status = 'failed'; result.error = String(error); throw error }
finally { await writeFile(resolve(evidence, 'memory-scale.json'), JSON.stringify(result, null, 2)); await browser.close() }
