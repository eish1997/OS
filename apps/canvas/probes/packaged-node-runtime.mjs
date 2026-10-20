import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createHash, randomBytes } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, toNamespacedPath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const source = resolve(process.env.OS_CANVAS_NODE_RUNTIME)
const manifest = JSON.parse(await readFile(join(source, 'runtime.json'), 'utf8'))
for (const file of manifest.files) {
  const path = resolve(source, file.path)
  assert.ok(path.startsWith(source + '\\'))
  assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), file.sha256)
}
const folder = await mkdtemp(join(tmpdir(), 'canvas-packaged-node-'))
await cp(resolve('.runtime/canvas-desktop-service/desktop-service.mjs'), join(folder, 'desktop-service.mjs'))
await cp(source, join(folder, 'node-runtime'), { recursive: true })
const token = randomBytes(32).toString('hex')
const child = spawn(process.execPath, ['--input-type=module', '--eval', 'import(process.argv[1])',
  pathToFileURL(toNamespacedPath(join(folder, 'desktop-service.mjs'))).href], {
  cwd: folder, windowsHide: true, env: { SystemRoot: process.env.SystemRoot }, stdio: ['pipe', 'pipe', 'pipe']
})
const exit = once(child, 'exit')
let stderr = '', stdout = ''
child.stderr.on('data', data => { stderr += data })
child.stdout.on('data', data => { stdout += data })
const ready = once(child.stdout, 'data')
const timeout = setTimeout(() => child.kill(), 15000)
const evidence = resolve('output/dev-evidence/canvas-c01/isolation/packaged')
await mkdir(evidence, { recursive: true })
try {
  child.stdin.write(JSON.stringify({ directory: join(folder, 'data'), token,
    origin: 'http://tauri.localhost', enableNodeRuntime: true }) + '\n')
  const url = JSON.parse((await ready)[0].toString()).url
  const request = (path, body) => fetch(url + path, { headers: { Authorization: `Bearer ${token}`,
    Origin: 'http://tauri.localhost', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) })
  let job = await (await request('/node-runs', { source: "return { type: 'text', text: 'packaged worker' }" })).json()
  for (let i = 0; i < 100 && job.status === 'running'; i++) {
    await delay(25); job = await (await request(`/node-runs/${job.id}`)).json()
  }
  assert.equal(job.status, 'completed', JSON.stringify(job.result))
  assert.equal(job.result.value.text, 'packaged worker')
  const loop = await (await request('/node-runs', { source: 'while (true) {}' })).json()
  assert.equal(loop.status, 'running')
  assert.equal((await request('/health')).status, 200)
  const canceled = await (await request(`/node-runs/${loop.id}/cancel`, {})).json()
  assert.equal(canceled.status, 'canceled')
  await request('/node-runs', { source: 'while (true) {}' })
  child.stdin.end()
  assert.equal((await exit)[0], 0, stderr)
  assert.ok(!stdout.includes(token) && !stderr.includes(token))
  await assert.rejects(fetch(url + '/health', { signal: AbortSignal.timeout(500) }))
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ status: 'passed', folder,
    runtimeFiles: manifest.files.length, checks: ['standalone temporary directory without NODE_PATH',
      'Windows namespaced file URL', 'fixed QuickJS assets load', 'service remains responsive during guest loop',
      'cancel guest', 'private pipe close terminates active guest and service', 'no token in stdout/stderr'],
    scope: 'Actual bundled Node service with private bootstrap protocol; not Tauri window or installer acceptance.' }, null, 2))
} catch (error) {
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ error: error.stack }, null, 2))
  throw error
} finally {
  clearTimeout(timeout)
  if (child.exitCode === null) {
    child.stdin.end()
    const force = setTimeout(() => child.kill(), 1000)
    await exit
    clearTimeout(force)
  }
}
