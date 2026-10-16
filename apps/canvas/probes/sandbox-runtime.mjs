import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runSandbox } from '../runtime/sandbox.mjs'

const packageRoot = resolve('.runtime/open-pencil-upstream/node_modules/.bun/quickjs-emscripten@0.32.0/node_modules/quickjs-emscripten')
const require = createRequire(join(packageRoot, 'package.json'))
const engine = require.resolve(packageRoot)
const evidence = resolve('output/dev-evidence/canvas-c01/isolation')
await mkdir(evidence, { recursive: true })
const folder = await mkdtemp(join(tmpdir(), 'canvas-isolation-'))
await writeFile(join(folder, 'allowed.txt'), 'approved asset')
await writeFile(join(folder, 'outside.txt'), 'TEST-ONLY-NOT-A-CREDENTIAL')
const assets = { approved: await readFile(join(folder, 'allowed.txt'), 'utf8') }
const results = {}
results.allowed = await runSandbox({ engine, assets, source: `return JSON.parse(capability('asset.readText', 'approved'))` })
assert.deepEqual(results.allowed.value, { ok: true, value: 'approved asset' })
results.denied = await runSandbox({ engine, assets, source: `return ['../outside.txt', 'outside', 'constructor', '__proto__'].map(id => JSON.parse(capability('asset.readText', id)))` })
assert.ok(results.denied.value.every(value => value.error === 'CAPABILITY_DENIED'))
results.globals = await runSandbox({ engine, source: `return ['process','require','fetch','WebSocket','XMLHttpRequest','window','document','__TAURI_INTERNALS__'].map(key => [key, typeof globalThis[key]])` })
assert.ok(results.globals.value.every(([, value]) => value === 'undefined'))
results.escape = await runSandbox({ engine, source: `return capability.constructor('return typeof process')()` })
assert.equal(results.escape.value, 'undefined')
results.throw = await runSandbox({ engine, source: `throw new Error('draft failure')` })
assert.equal(results.throw.status, 'guest-error')
results.loop = await runSandbox({ engine, source: `while (true) {}`, cpuMs: 40 })
assert.equal(results.loop.status, 'guest-error')
assert.match(results.loop.error.message, /interrupted/)
const controller = new AbortController()
let initialized = false
const canceled = runSandbox({ engine, source: `while (true) {}`, cpuMs: 1000, signal: controller.signal,
  onStarted() { initialized = true; setTimeout(() => controller.abort(), 25) } })
results.cancel = await canceled
assert.ok(initialized)
assert.equal(results.cancel.status, 'canceled')
results.recovered = await runSandbox({ engine, source: `return { type: 'text', text: 'still responsive' }` })
assert.equal(results.recovered.value.text, 'still responsive')
assert.equal(await readFile(join(folder, 'outside.txt'), 'utf8'), 'TEST-ONLY-NOT-A-CREDENTIAL')
assert.deepEqual((await readdir(folder)).sort(), ['allowed.txt', 'outside.txt'])
await writeFile(join(evidence, 'runtime.json'), JSON.stringify({ status: 'prototype-passed', engineVersion: '0.32.0', results,
  scope: 'Actual QuickJS WASM in separate Node workers; allowlisted read-only asset text is preloaded by trusted host. No canvas/native bridge integration yet; no arbitrary HTML/DOM, async tasks, filesystem API or full C08 security acceptance.' }, null, 2))
console.log('QuickJS runtime prototype passed')
