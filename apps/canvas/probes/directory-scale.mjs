import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir, cpus, totalmem, platform, release } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { WorkspaceStore } from '../local/workspace-store.mjs'
import { MountStore } from '../local/mount-store.mjs'
import { FileIndex } from '../local/file-index.mjs'

const directory = await mkdtemp(join(tmpdir(), 'canvas-scale-10000-'))
const root = join(directory, 'assets'), data = join(directory, 'data')
await mkdir(root)
for (let start = 0; start < 10000; start += 64) {
  await Promise.all(Array.from({ length: Math.min(64, 10000 - start) }, (_, index) =>
    writeFile(join(root, `asset-${String(start + index).padStart(5, '0')}.txt`), `fixture ${start + index}\n`)))
}
const workspace = new WorkspaceStore(data), mounts = new MountStore(data), files = new FileIndex(data, mounts)
try {
  const mount = mounts.add(root)
  const started = performance.now(), initial = await files.scan(mount.id), initialMs = performance.now() - started
  assert.equal(initial.scanStatus, 'complete'); assert.equal(initial.entries.length, 10000)
  const warmStarted = performance.now(), repeated = await files.scan(mount.id), warmMs = performance.now() - warmStarted
  assert.deepEqual(repeated.entries, initial.entries)
  const result = { status: initialMs <= 10000 ? 'passed' : 'failed', budgetMs: 10000, initialMs, warmMs,
    count: initial.entries.length, fixtureDirectory: directory,
    environment: { cpu: cpus()[0]?.model, memoryBytes: totalmem(), platform: platform(), release: release(), node: process.version },
    scope: 'real first index and unchanged repeat; fixture creation warms filesystem cache; excludes UI card creation and application cold start' }
  const output = resolve('output/dev-evidence/canvas-c05/performance')
  await mkdir(output, { recursive: true }); await writeFile(join(output, 'directory-10000.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  if (result.status !== 'passed') process.exitCode = 1
} finally { await files.close(); mounts.close(); workspace.close() }
