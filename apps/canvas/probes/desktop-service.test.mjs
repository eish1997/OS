import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, toNamespacedPath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'

function launch(t, nativeURL = false) {
  const directory = mkdtempSync(join(tmpdir(), 'canvas-desktop-pipe-'))
  const file = join(directory, 'desktop-service.mjs')
  const staged = process.env.OS_CANVAS_STAGED_DIR
  copyFileSync(staged ? join(staged, 'service/desktop-service.mjs') :
    new URL('../../../.runtime/canvas-desktop-service/desktop-service.mjs', import.meta.url), file)
  const runtime = staged ? join(staged, 'runtime/node.exe') : process.execPath
  const args = nativeURL ? ['--input-type=module', '--eval', 'import(process.argv[1])', pathToFileURL(toNamespacedPath(file)).href] : [file]
  const child = spawn(runtime, args, { cwd: directory, windowsHide: true,
    env: { SystemRoot: process.env.SystemRoot }, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = '', errors = ''
  child.stdout.on('data', value => { output += value })
  child.stderr.on('data', value => { errors += value })
  const exit = once(child, 'exit')
  t.after(() => { if (child.exitCode === null) child.kill() })
  return { child, directory, exit, output: () => output, errors: () => errors }
}

test('private pipe starts service without exposing token; pipe closure releases listener', { timeout: 15000 }, async t => {
  const run = launch(t), token = randomBytes(32).toString('hex')
  const first = once(run.child.stdout, 'data')
  run.child.stdin.write(JSON.stringify({ directory: join(run.directory, 'data'), token, origin: 'http://tauri.localhost' }) + '\n')
  const [line] = await first
  const ready = JSON.parse(line.toString())
  assert.equal(ready.type, 'ready')
  const response = await fetch(ready.url + '/health', {
    headers: { Authorization: `Bearer ${token}`, Origin: 'http://tauri.localhost' },
  })
  assert.equal(response.status, 200)
  await response.arrayBuffer()
  run.child.stdin.end()
  assert.equal((await run.exit)[0], 0, run.errors())
  assert.ok(!run.output().includes(token) && !run.errors().includes(token))
  await assert.rejects(fetch(ready.url + '/health', { signal: AbortSignal.timeout(1000) }))
})

test('host disappearance during startup does not orphan service', { timeout: 15000 }, async t => {
  const run = launch(t)
  run.child.stdin.end(JSON.stringify({ directory: join(run.directory, 'data'),
    token: randomBytes(32).toString('hex'), origin: 'http://tauri.localhost' }) + '\n')
  assert.equal((await run.exit)[0], 0, run.errors())
})

test('native module URL boots service from a Windows namespaced resource path', { timeout: 15000 }, async t => {
  const run = launch(t, true)
  const ready = once(run.child.stdout, 'data')
  run.child.stdin.write(JSON.stringify({ directory: join(run.directory, 'data'),
    token: randomBytes(32).toString('hex'), origin: 'http://tauri.localhost' }) + '\n')
  assert.equal(JSON.parse((await ready)[0].toString()).type, 'ready')
  run.child.stdin.end()
  assert.equal((await run.exit)[0], 0, run.errors())
})

test('invalid or oversized private configuration is rejected without echoing secrets', { timeout: 15000 }, async t => {
  for (const value of ['{"token":"sentinel-private-value"}\n', 'x'.repeat(8193)]) {
    const run = launch(t)
    run.child.stdin.write(value)
    assert.equal((await run.exit)[0], 1)
    assert.ok(!run.errors().includes('sentinel-private-value'))
    assert.equal(run.output(), '')
  }
})
