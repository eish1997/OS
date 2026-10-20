// Run with the pinned Bun. The output must run under Node 24 outside this repo.
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// Bun includes cwd-relative source labels; keep output stable across entrypoints.
process.chdir(resolve(root, '.runtime/open-pencil-upstream'))
const outdir = resolve(root, '.runtime/canvas-desktop-service')
const inputPaths = new Set()
const inputAudit = { name: 'canvas-service-input-audit', setup(build) {
  build.onLoad({ filter: /.*/ }, args => { inputPaths.add(args.path) })
} }
const result = await Bun.build({
  entrypoints: [resolve(root, 'apps/canvas/local/service-cli.mjs')],
  target: 'node', format: 'esm', splitting: false,
  packages: 'bundle', naming: 'workspace-service.mjs',
  plugins: [inputAudit],
})
if (!result.success) throw new AggregateError(result.logs, 'Cannot bundle workspace service')
await mkdir(outdir, { recursive: true })
const outputs = []
const desktop = await Bun.build({
  entrypoints: [resolve(root, 'apps/canvas/local/desktop-entry.mjs')],
  target: 'node', format: 'esm', splitting: false,
  packages: 'bundle', naming: 'desktop-service.mjs',
  plugins: [inputAudit],
})
if (!desktop.success) throw new AggregateError(desktop.logs, 'Cannot bundle desktop service')
for (const artifact of [...result.outputs, ...desktop.outputs]) {
  const bytes = new Uint8Array(await artifact.arrayBuffer())
  const name = artifact.path.split(/[\\/]/).pop()
  await writeFile(resolve(outdir, name), bytes)
  outputs.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
}
await writeFile(resolve(outdir, 'manifest.json'), JSON.stringify({
  formatVersion: 1, runtime: 'node >=24', bun: Bun.version, outputs,
}, null, 2) + '\n')
console.log(JSON.stringify({ outdir, outputs }, null, 2))
await writeFile(resolve(outdir, 'inputs.json'), JSON.stringify({ formatVersion: 1,
  scope: 'Files loaded by both Bun service bundle builds; may include subsequently eliminated code',
  inputs: [...inputPaths].sort(), outputs }, null, 2) + '\n')
