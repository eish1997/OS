import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { startWorkspaceServer } from './server.mjs'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { encodeCanvasPackage, decodeCanvasPackage } from './canvas-package.mjs'

test('binary package HTTP authenticates, persists preparation and restores after service restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'canvas-package-http-'))
  const token = randomBytes(32).toString('hex'), canvasId = randomUUID(), id = randomUUID()
  const scene = readFileSync(new URL('./fixtures/revision-1.fig', import.meta.url))
  const layout = { formatVersion: 1, panels: { layers: false, properties: true } }
  const bytes = encodeCanvasPackage({ canvasId, layout, references: { formatVersion: 1, mounts: [], files: [] },
    revisions: [{ canvasId, revision: 1, scene, sceneHash: createHash('sha256').update(scene).digest('hex'),
      metadata: { formatVersion: 1, name: 'Imported' }, createdAt: '2026-10-15T00:00:00.000Z' }] })
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }
  let service = await startWorkspaceServer({ directory, token, port: 0 })
  try {
    const upload = () => localFetch(`${service.url}/package-imports/${id}`, { method: 'POST', headers, body: bytes })
    assert.equal((await localFetch(`${service.url}/package-imports/${id}`, { method: 'POST', body: bytes })).status, 401)
    assert.equal((await localFetch(`${service.url}/package-imports/${id}`, { method: 'POST',
      headers: { ...headers, Origin: 'https://untrusted.example' }, body: bytes })).status, 403)
    assert.equal((await upload()).status, 200)
    assert.equal((await localFetch(`${service.url}/canvases/${canvasId}`, { headers })).status, 404)
    await service.close(); service = await startWorkspaceServer({ directory, token, port: 0 })
    const pending = await (await localFetch(`${service.url}/package-imports`, { headers })).json()
    assert.equal(pending[0].state, 'prepared')
    const resume = () => localFetch(`${service.url}/package-imports/${id}/resume`, { method: 'POST', headers })
    const restored = await resume()
    assert.equal(restored.status, 200)
    const result = await restored.json()
    assert.equal(result.layoutApplied, true)
    assert.equal((await upload()).status, 200)
    assert.deepEqual(await (await resume()).json(), result)
    const loaded = await localFetch(`${service.url}/canvases/${canvasId}/scene`, { headers })
    assert.deepEqual(Buffer.from(await loaded.arrayBuffer()), scene)
    assert.deepEqual((await (await localFetch(`${service.url}/layout`, { headers })).json()).layout, layout)
    assert.equal((await localFetch(`${service.url}/package-imports/${randomUUID()}`, { method: 'POST', headers, body: bytes })).status, 409)
    const exportOptions = { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 1 }) }
    const exported = await localFetch(`${service.url}/canvases/${canvasId}/package`, exportOptions)
    assert.equal(exported.status, 200)
    assert.equal(exported.headers.get('content-type'), 'application/octet-stream')
    assert.ok(exported.headers.get('content-disposition').includes(`${canvasId}.oscanvas`))
    const exportedBytes = Buffer.from(await exported.arrayBuffer())
    assert.equal(decodeCanvasPackage(exportedBytes).manifest.canvasId, canvasId)
    const fresh = await startWorkspaceServer({ directory: mkdtempSync(join(tmpdir(), 'canvas-package-http-fresh-')), token, port: 0 })
    try {
      const freshId = randomUUID()
      assert.equal((await localFetch(`${fresh.url}/package-imports/${freshId}`, { method: 'POST', headers, body: exportedBytes })).status, 200)
      assert.equal((await localFetch(`${fresh.url}/package-imports/${freshId}/resume`, { method: 'POST', headers })).status, 200)
      const restoredScene = await localFetch(`${fresh.url}/canvases/${canvasId}/scene`, { headers })
      assert.deepEqual(Buffer.from(await restoredScene.arrayBuffer()), scene)
    } finally { await fresh.close() }
  } finally { await service.close() }
})

// Port 0 may select a port on Fetch's browser blocklist. These tests exercise
// the trusted local HTTP protocol, so use Node HTTP on the allocated port.
function localFetch(url, { method = 'GET', headers, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('error', reject)
      response.on('end', () => resolve(new Response(
        response.statusCode === 204 ? null : Buffer.concat(chunks),
        { status: response.statusCode, headers: response.headers }
      )))
    })
    req.on('error', reject)
    req.end(body)
  })
}

test('output HTTP requires authentication and saved revision, survives restart and publishes once', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'canvas-output-http-'))
  const root = join(directory, 'assets'); mkdirSync(root)
  const token = randomBytes(32).toString('hex')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  let service = await startWorkspaceServer({ directory, token, port: 0 })
  const post = (path, body) => localFetch(`${service.url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  try {
    const mount = await (await post('/mounts', { path: root })).json()
    const body = { operationId: randomUUID(), canvasId: mount.canvasId, nodeId: randomUUID(), sourceRevision: 1,
      mountId: mount.id, name: '成果.txt', contentBase64: Buffer.from('saved output').toString('base64') }
    assert.equal((await localFetch(`${service.url}/outputs`, { method: 'POST', body: JSON.stringify(body) })).status, 401)
    assert.equal((await post('/outputs', body)).status, 404)
    const scene = readFileSync(new URL('./fixtures/revision-1.fig', import.meta.url))
    const saved = await post(`/canvases/${mount.canvasId}`, { operationId: randomUUID(), expectedRevision: 0,
      metadata: { formatVersion: 1, name: 'source', outputSourceNodeIds: [body.nodeId] }, sceneBase64: scene.toString('base64') })
    assert.equal(saved.status, 200)
    assert.equal((await post('/outputs', { ...body, nodeId: randomUUID() })).status, 409)
    assert.equal((await post('/outputs', { ...body, contentBase64: '!bad' })).status, 400)
    assert.equal((await post('/outputs', body)).status, 200)
    const commitURL = `/outputs/${body.operationId}/commit`
    assert.equal((await localFetch(`${service.url}${commitURL}`, { method: 'POST' })).status, 401)
    await service.close(); service = await startWorkspaceServer({ directory, token, port: 0 })
    const committed = await post(commitURL, {})
    assert.equal(committed.status, 200)
    const result = await committed.json()
    assert.equal(result.state, 'committed')
    assert.deepEqual(await (await post(commitURL, {})).json(), result)
    assert.equal(readFileSync(join(root, body.name), 'utf8'), 'saved output')
    const scanned = await (await post(`/mounts/${mount.id}/scan`, {})).json()
    assert.equal(scanned.entries.length, 1)
    assert.equal(scanned.entries[0].path, body.name)
    assert.deepEqual(scanned.entries[0].outputOrigin, { operationId: body.operationId, canvasId: body.canvasId,
      nodeId: body.nodeId, sourceRevision: body.sourceRevision,
      snapshotHash: createHash('sha256').update('saved output').digest('hex'), snapshotFormat: 'txt' })
    const journal = await localFetch(`${service.url}/canvases/${mount.canvasId}/outputs`, { headers })
    assert.deepEqual(await journal.json(), [result])
    const unsupported = { ...body, operationId: randomUUID(), name: 'unsupported.txt' }
    assert.equal((await post('/outputs', unsupported)).status, 200)
    const originalLink = fs.linkSync
    let rejected
    try {
      fs.linkSync = () => { throw Object.assign(new Error('injected unsupported filesystem'), { code: 'EXDEV' }) }
      syncBuiltinESMExports()
      rejected = await post(`/outputs/${unsupported.operationId}/commit`, {})
    } finally { fs.linkSync = originalLink; syncBuiltinESMExports() }
    assert.equal(rejected.status, 501)
    assert.equal((await post(`/outputs/${unsupported.operationId}/commit`, {})).status, 200)
    assert.equal(readFileSync(join(root, unsupported.name), 'utf8'), 'saved output')
    const cancelled = { ...body, operationId: randomUUID(), name: 'cancelled.txt' }
    assert.equal((await post('/outputs', cancelled)).status, 200)
    const cancelURL = `/outputs/${cancelled.operationId}/cancel`
    assert.equal((await localFetch(`${service.url}${cancelURL}`, { method: 'POST' })).status, 401)
    assert.equal((await post(cancelURL, {})).status, 200)
    assert.equal((await post(`/outputs/${cancelled.operationId}/commit`, {})).status, 409)
    const original = { ...body, operationId: randomUUID(), name: 'original.txt' }
    assert.equal((await post('/outputs', original)).status, 200)
    const replaceURL = `/outputs/${original.operationId}/replace`
    const replacement = { replacementId: randomUUID(), name: 'replacement.txt' }
    assert.equal((await localFetch(`${service.url}${replaceURL}`, { method: 'POST' })).status, 401)
    const renamed = await post(replaceURL, replacement)
    assert.equal(renamed.status, 200)
    assert.equal((await renamed.json()).operationId, replacement.replacementId)
    assert.equal((await post(`/outputs/${replacement.replacementId}/commit`, {})).status, 200)
    assert.equal((await post(`/outputs/${original.operationId}/commit`, {})).status, 409)
    assert.equal(readFileSync(join(root, replacement.name), 'utf8'), 'saved output')
  } finally { await service.close() }
})


test('mount HTTP registration requires authentication and reuses the reserved canvas after restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'os-canvas-mount-http-'))
  const source = join(directory, 'source'); mkdirSync(source)
  const token = randomBytes(32).toString('hex')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  let service = await startWorkspaceServer({ directory, token, port: 0 })
  try {
    assert.equal((await localFetch(`${service.url}/mounts`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: source }) })).status, 401)
    assert.deepEqual(await (await localFetch(`${service.url}/mounts`, { headers })).json(), [])
    const add = () => localFetch(`${service.url}/mounts`, { method: 'POST', headers, body: JSON.stringify({ path: source }) })
    const response = await add(); assert.equal(response.status, 200)
    const first = await response.json()
    assert.equal(first.availability, 'available')
    writeFileSync(join(source, 'asset.txt'), 'external file')
    assert.equal((await localFetch(`${service.url}/mounts/${first.id}/scan`, { method: 'POST' })).status, 401)
    const scanned = await localFetch(`${service.url}/mounts/${first.id}/scan`, { method: 'POST', headers })
    assert.equal(scanned.status, 200)
    const snapshot = await scanned.json()
    assert.equal(snapshot.scanStatus, 'complete')
    assert.equal(snapshot.entries[0].path, 'asset.txt')
    await service.close(); service = await startWorkspaceServer({ directory, token, port: 0 })
    assert.deepEqual(await (await add()).json(), first)
    assert.deepEqual(await (await localFetch(`${service.url}/mounts`, { headers })).json(), [first])
    assert.deepEqual((await (await localFetch(`${service.url}/mounts/${first.id}/files`, { headers })).json()).entries, snapshot.entries)
    mkdirSync(join(source, 'child'))
    const updated = await (await localFetch(`${service.url}/mounts/${first.id}/scan`, { method: 'POST', headers })).json()
    const child = updated.entries.find(entry => entry.path === 'child')
    const childURL = `${service.url}/mounts/${first.id}/files/${child.id}/open`
    assert.equal((await localFetch(childURL, { method: 'POST' })).status, 401)
    const opened = await localFetch(childURL, { method: 'POST', headers })
    assert.equal(opened.status, 200)
    const childMount = await opened.json()
    assert.equal(childMount.path, join(source, 'child'))
    assert.equal((await (await localFetch(childURL, { method: 'POST', headers })).json()).canvasId, childMount.canvasId)
    renameSync(join(source, 'asset.txt'), join(directory, 'original.txt'))
    writeFileSync(join(source, 'asset.txt'), 'replacement')
    const replacementURL = `${service.url}/mounts/${first.id}/files/${snapshot.entries[0].id}`
    assert.equal((await localFetch(`${replacementURL}/replacement-preview`, { method: 'POST' })).status, 401)
    const preview = await (await localFetch(`${replacementURL}/replacement-preview`, { method: 'POST', headers })).json()
    const confirmation = { method: 'POST', headers, body: JSON.stringify({ token: preview.token }) }
    assert.equal((await localFetch(`${replacementURL}/replacement-confirm`, { ...confirmation, headers: { 'Content-Type': 'application/json' } })).status, 401)
    const committed = await localFetch(`${replacementURL}/replacement-confirm`, confirmation)
    assert.equal(committed.status, 200)
    assert.equal((await committed.json()).availability, 'available')
    const targetInput = { method: 'POST', headers, body: JSON.stringify({ path: join(source, 'asset.txt') }) }
    assert.equal((await localFetch(`${service.url}/file-targets/preview`, { ...targetInput, headers: { 'Content-Type': 'application/json' } })).status, 401)
    const targetPreview = await (await localFetch(`${service.url}/file-targets/preview`, targetInput)).json()
    const targetConfirmation = { method: 'POST', headers, body: JSON.stringify({ token: targetPreview.token }) }
    assert.equal((await localFetch(`${service.url}/file-targets/confirm`, { ...targetConfirmation, headers: { 'Content-Type': 'application/json' } })).status, 401)
    const targetResult = await localFetch(`${service.url}/file-targets/confirm`, targetConfirmation)
    assert.equal(targetResult.status, 200)
    assert.equal((await targetResult.json()).id, snapshot.entries[0].id)
    const recovery = join(directory, 'recovery'); mkdirSync(recovery)
    const recoveryInput = { method: 'POST', headers, body: JSON.stringify({ path: recovery }) }
    const recoveryURL = `${service.url}/mounts/${first.id}`
    assert.equal((await localFetch(`${recoveryURL}/relink-preview`, { ...recoveryInput, headers: { 'Content-Type': 'application/json' } })).status, 401)
    const recoveryPreview = await (await localFetch(`${recoveryURL}/relink-preview`, recoveryInput)).json()
    assert.equal(recoveryPreview.canvasId, first.canvasId)
    const recoveryConfirmation = { method: 'POST', headers, body: JSON.stringify({ token: recoveryPreview.token }) }
    assert.equal((await localFetch(`${recoveryURL}/relink-confirm`, { ...recoveryConfirmation, headers: { 'Content-Type': 'application/json' } })).status, 401)
    const recovered = await localFetch(`${recoveryURL}/relink-confirm`, recoveryConfirmation)
    assert.equal(recovered.status, 200)
    assert.equal((await recovered.json()).canvasId, first.canvasId)
  } finally { await service.close() }
})

test('HTTP persistence confirms disk save, rejects foreign callers, and survives service restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'os-canvas-http-'))
  const token = randomBytes(32).toString('hex')
  const scene = readFileSync(new URL('./fixtures/revision-2.fig', import.meta.url))
  let service = await startWorkspaceServer({ directory, token, port: 0, bodyLimit: 1024 * 1024 })
  const headers = { Authorization: `Bearer ${token}`, Origin: 'http://localhost:14220', 'Content-Type': 'application/json' }
  const canvasId = randomUUID(), operationId = randomUUID()
  const input = { operationId, expectedRevision: 0, sceneBase64: scene.toString('base64'),
    metadata: { formatVersion: 1, name: 'HTTP test', viewport: { zoom: 1, panX: 0, panY: 0 } } }
  const call = (path, init = {}) => localFetch(`${service.url}${path}`, { headers, ...init })
  try {
    assert.equal((await call('/canvases', { headers: {} })).status, 401)
    assert.equal((await call('/canvases', { headers: { ...headers, Origin: 'http://foreign.invalid' } })).status, 403)
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const req = request(`${service.url}/canvases`, { headers: { ...headers, Host: 'foreign.invalid' } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode))
      })
      req.on('error', reject); req.end()
    })
    assert.equal(foreignHostStatus, 403)
    assert.equal((await call('/canvases', { headers: { ...headers, Origin: 'null' } })).status, 403)
    const post = body => call(`/canvases/${canvasId}`, { method: 'POST', body: JSON.stringify(body) })
    const saved = await post(input)
    assert.equal(saved.status, 200)
    assert.deepEqual(await saved.json(), { canvasId, revision: 1 })
    assert.deepEqual(await (await post(input)).json(), { canvasId, revision: 1 })
    assert.equal((await post({ ...input, operationId: randomUUID() })).status, 409)
    assert.equal((await post({ ...input, sceneBase64: 'not base64' })).status, 400)
    assert.equal((await post({ ...input, extra: 'x'.repeat(1024 * 1024) })).status, 413)
    assert.equal((await post(null)).status, 400)
    await service.close()
    service = await startWorkspaceServer({ directory, token, port: 0 })
    const metadata = await (await call(`/canvases/${canvasId}`)).json()
    assert.equal(metadata.revision, 1)
    assert.deepEqual(metadata.metadata, input.metadata)
    assert.deepEqual(Buffer.from(await (await call(`/canvases/${canvasId}/scene?revision=1`)).arrayBuffer()), scene)
    assert.deepEqual(await (await call(`/operations/${operationId}`)).json(), { canvasId, revision: 1 })
    assert.equal((await call(`/operations/${randomUUID()}`)).status, 404)
    assert.equal((await (await call('/canvases')).json()).length, 1)
  } finally { await service.close() }
})

test('unsupported layout database does not prevent canvas service or overwrite layout', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'os-canvas-future-layout-'))
  const file = join(directory, 'layout.sqlite')
  const db = new DatabaseSync(file)
  db.exec('PRAGMA user_version=99; CREATE TABLE future_layout (payload TEXT);')
  db.close()
  const before = readFileSync(file)
  const token = randomBytes(32).toString('hex')
  const service = await startWorkspaceServer({ directory, token, port: 0 })
  try {
    const headers = { Authorization: `Bearer ${token}` }
    assert.equal((await localFetch(`${service.url}/layout`, { headers })).status, 422)
    const canvases = await localFetch(`${service.url}/canvases`, { headers })
    assert.equal(canvases.status, 200)
    assert.deepEqual(await canvases.json(), [])
  } finally { await service.close() }
  assert.deepEqual(readFileSync(file), before)
})
