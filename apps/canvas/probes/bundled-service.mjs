import assert from 'node:assert/strict'
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { randomUUID, randomBytes } from 'node:crypto'
import { WorkspaceStore } from '../local/workspace-store.mjs'
import { decodeCanvasPackage } from '../local/canvas-package.mjs'

const isolated = mkdtempSync(join(tmpdir(), 'canvas-bundled-service-'))
const data = join(isolated, 'data')
const scene = readFileSync(new URL('../local/fixtures/revision-1.fig', import.meta.url))
const id = randomUUID(), token = randomBytes(32).toString('hex')
const origin = 'http://tauri.localhost'
const store = new WorkspaceStore(data)
store.save({ canvasId: id, operationId: randomUUID(), expectedRevision: 0,
  scene, metadata: { formatVersion: 1 } })
store.close()
copyFileSync(new URL('../../../.runtime/canvas-desktop-service/workspace-service.mjs', import.meta.url), join(isolated, 'workspace-service.mjs'))
writeFileSync(join(isolated, 'launch.mjs'), `
import { startWorkspaceServer } from './workspace-service.mjs';
const server = await startWorkspaceServer({ directory: process.env.TEST_DATA,
  token: process.env.TEST_TOKEN, origin: process.env.TEST_ORIGIN, port: 0 });
process.send({ url: server.url });
process.on('message', async () => { await server.close(); process.disconnect(); });
`)
const child = fork(join(isolated, 'launch.mjs'), [], {
  cwd: isolated, windowsHide: true, silent: true,
  env: { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
    TEST_DATA: data, TEST_TOKEN: token, TEST_ORIGIN: origin },
})
let stderr = ''
child.stderr.on('data', chunk => { stderr += chunk })
const exited = once(child, 'exit')
const deadline = setTimeout(() => child.kill(), 30000)
try {
  const ready = await Promise.race([
    once(child, 'message').then(([message]) => message),
    exited.then(([code]) => { throw new Error(`Bundled service exited ${code}: ${stderr}`) }),
  ])
  const headers = { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json' }
  const request = (path, options = {}) => fetch(ready.url + path,
    { headers, ...options, signal: AbortSignal.timeout(10000) })
  assert.equal((await request(`/canvases/${id}`, { headers: { Origin: origin } })).status, 401)
  assert.equal((await request(`/canvases/${id}`, { headers: { ...headers, Origin: 'https://untrusted.invalid' } })).status, 403)
  const loaded = await request(`/canvases/${id}/scene`)
  assert.equal(loaded.status, 200)
  assert.deepEqual(Buffer.from(await loaded.arrayBuffer()), scene)
  const nextScene = readFileSync(new URL('../local/fixtures/revision-2.fig', import.meta.url))
  const saved = await request(`/canvases/${id}`, { method: 'POST', body: JSON.stringify({
    operationId: randomUUID(), expectedRevision: 1, sceneBase64: nextScene.toString('base64'),
    metadata: { formatVersion: 1, name: 'Saved outside repository' },
  }) })
  assert.equal(saved.status, 200)
  const exported = await request(`/canvases/${id}/package`, { method: 'POST', body: JSON.stringify({ expectedRevision: 2 }) })
  assert.equal(exported.status, 200, await exported.clone().text())
  const pack = decodeCanvasPackage(Buffer.from(await exported.arrayBuffer()))
  assert.equal(pack.manifest.canvasId, id)
  assert.equal(pack.manifest.revisions.length, 2)
  assert.deepEqual(pack.scenes.get(pack.manifest.revisions[0].sceneHash), scene)
  assert.deepEqual(pack.scenes.get(pack.manifest.revisions[1].sceneHash), nextScene)
  child.send('close')
  const [code] = await exited
  assert.equal(code, 0, stderr)
  const reopened = new WorkspaceStore(data)
  try {
    assert.equal(reopened.read(id).revision, 2)
    assert.deepEqual(reopened.read(id).scene, nextScene)
  } finally { reopened.close() }
  const evidence = new URL('../../../output/dev-evidence/canvas-c05/desktop/', import.meta.url)
  mkdirSync(evidence, { recursive: true })
  writeFileSync(new URL('bundled-service.json', evidence), JSON.stringify({
    status: 'passed', runtime: process.version,
    checks: ['isolated child process outside repository', 'Node builtins and bundled parser only',
      'missing token and wrong origin rejected', 'stored FIG bytes recovered',
      'new revision persisted and verified after service exit',
      'real FIG parsed and both exported revisions preserved', 'graceful shutdown'],
    scope: 'Service bundle only; not a Tauri window or installer validation',
  }, null, 2))
  console.log('Bundled service passed outside repository')
} finally {
  clearTimeout(deadline)
  if (child.exitCode === null) child.kill()
}
