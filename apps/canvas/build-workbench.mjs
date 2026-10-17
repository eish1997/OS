// Build an independently relocatable canvas resource bundle using the pinned Bun.
import { mkdir, readFile, readdir, writeFile, copyFile, lstat } from 'node:fs/promises'
import { resolve, dirname, join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const upstream = JSON.parse(await readFile(join(root, 'apps/canvas/upstream.json'), 'utf8'))
if (`bun@${Bun.version}` !== upstream.packageManager) throw new Error('Pinned Bun is required')
const checkout = resolve(root, upstream.checkout)
const output = resolve(process.argv[2] ?? join(root, '.runtime/canvas-workbench-package'))
// Never overwrite an existing candidate, user directory or previously verified build.
await mkdir(output)
const child = Bun.spawn([process.execPath, 'x', '--no-install', 'vite', 'build', '--outDir', join(output, 'ui')], {
  cwd: checkout, stdout: 'inherit', stderr: 'inherit',
  env: { ...process.env, OS_CANVAS_EMBEDDED_BUILD: '1', PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}` }
})
if (await child.exited !== 0) throw new Error('Embedded editor build failed; candidate is incomplete')
process.chdir(checkout)
const service = await Bun.build({ entrypoints: [join(root, 'apps/canvas/local/desktop-entry.mjs')],
  target: 'node', format: 'esm', packages: 'bundle', splitting: false })
if (!service.success || service.outputs.length !== 1) throw new AggregateError(service.logs, 'Canvas service bundling failed')
await mkdir(join(output, 'service'))
await writeFile(join(output, 'service/workspace.mjs'), new Uint8Array(await service.outputs[0].arrayBuffer()))
await mkdir(join(output, 'licenses'))
await copyFile(join(root, 'apps/canvas/LICENSE.open-pencil'), join(output, 'licenses/LICENSE.open-pencil'))
const files = []
async function inventory(directory, prefix = '') {
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name), stat = await lstat(path), relative = prefix + name
    if (stat.isSymbolicLink()) throw new Error('Bundle may not contain external links')
    if (stat.isDirectory()) await inventory(path, `${relative}/`)
    else if (stat.isFile()) {
      const bytes = await readFile(path)
      files.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
    } else throw new Error('Unsupported bundle resource')
  }
}
await inventory(output)
const patches = []
for (const name of (await readdir(join(root, 'apps/canvas/patches'))).filter(name => name.endsWith('.patch')).sort()) {
  patches.push({ name, sha256: createHash('sha256').update(await readFile(join(root, 'apps/canvas/patches', name))).digest('hex') })
}
await writeFile(join(output, 'manifest.json'), JSON.stringify({ formatVersion: 1, kind: 'workbench-canvas',
  upstreamCommit: upstream.commit, bun: Bun.version, runtime: 'node >=24', ui: 'ui', service: 'service/workspace.mjs',
  nodeRuntimeEnabled: false, patches, files, validationOnly: true }, null, 2) + '\n')
console.log(JSON.stringify({ output, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) }))
