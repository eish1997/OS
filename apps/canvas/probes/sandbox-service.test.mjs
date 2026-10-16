import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { startWorkspaceServer } from '../local/server.mjs'

test('authenticated node runs reject client grants, recover from failure and cancel live work', async () => {
  const token = 'sandbox-service-test-token-0000000000'
  const server = await startWorkspaceServer({ directory: await mkdtemp(join(tmpdir(), 'canvas-node-service-')),
    token, port: 0, nodeSandbox: { engine: resolve('.runtime/open-pencil-upstream/node_modules/.bun/quickjs-emscripten@0.32.0/node_modules/quickjs-emscripten/dist/index.js'),
      assets: { approved: 'host-approved-content' } } })
  const request = (path, body) => fetch(server.url + path, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) })
  try {
    assert.equal((await fetch(server.url + '/node-runs', { method: 'POST' })).status, 401)
    for (const body of [null, [], { source: 'return 1', assets: { stolen: 'bad' } }, { source: 'return 1', engine: 'anything' }]) {
      assert.equal((await request('/node-runs', body)).status, 400)
    }
    const started = await request('/node-runs', { source: "return JSON.parse(capability('asset.readText', 'approved'))" })
    assert.equal(started.status, 202)
    let job = await started.json()
    for (let i = 0; i < 100 && job.status === 'running'; i++) {
      await delay(25); job = await (await request(`/node-runs/${job.id}`)).json()
    }
    assert.equal(job.status, 'completed')
    assert.equal(job.result.value.value, 'host-approved-content')
    const loops = await Promise.all([0, 1].map(async () => (await request('/node-runs', { source: 'while (true) {}' })).json()))
    assert.equal((await request('/node-runs', { source: 'return 1' })).status, 400)
    for (const loop of loops) {
      const canceled = await (await request(`/node-runs/${loop.id}/cancel`, {})).json()
      assert.equal(canceled.status, 'canceled')
    }
    assert.equal((await request('/node-runs', { source: 'return 42' })).status, 202)
  } finally { await server.close() }
})

test('runtime stays disabled unless trusted host explicitly enables it', async () => {
  const token = 'sandbox-disabled-test-token-00000000'
  const server = await startWorkspaceServer({ directory: await mkdtemp(join(tmpdir(), 'canvas-node-disabled-')), token, port: 0 })
  try {
    assert.equal((await fetch(server.url + '/node-runs', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status, 503)
  } finally { await server.close() }
})
