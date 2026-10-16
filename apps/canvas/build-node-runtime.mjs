// Copy a fixed, self-contained prototype runtime; no npm lookup at application startup.
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const version = '0.32.0'
const names = ['quickjs-emscripten', 'quickjs-emscripten-core', '@jitl/quickjs-ffi-types',
  ...['debug-asyncify', 'debug-sync', 'release-asyncify', 'release-sync'].map(suffix => `@jitl/quickjs-wasmfile-${suffix}`)]
const parent = resolve('.runtime/canvas-node-runtime')
await mkdir(parent, { recursive: true })
const directory = await mkdtemp(join(parent, 'runtime-'))
for (const name of names) {
  const source = resolve(root, '.runtime/open-pencil-upstream/node_modules/.bun', `${name.replace('/', '+')}@${version}`, 'node_modules', name)
  const metadata = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  if (metadata.name !== name || metadata.version !== version) throw new Error(`Version mismatch: ${name}`)
  for (const [dependency, requested] of Object.entries(metadata.dependencies ?? {})) {
    if (!names.includes(dependency) || requested !== version) throw new Error(`Unpinned runtime dependency: ${dependency}`)
  }
  await readFile(join(source, 'LICENSE'))
  await cp(source, join(directory, 'node_modules', name), { recursive: true, dereference: true })
}
await cp(resolve('apps/canvas/runtime/sandbox-worker.mjs'), join(directory, 'sandbox-worker.mjs'))
const files = []
async function inventory(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) await inventory(path)
    else {
      const bytes = await readFile(path)
      files.push({ path: relative(directory, path).replaceAll('\\', '/'), bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') })
    }
  }
}
await inventory(directory)
await writeFile(join(directory, 'runtime.json'), JSON.stringify({ formatVersion: 1, engine: 'quickjs-emscripten',
  version, packages: names, files, scope: 'Prototype execution runtime; native integration and C08 acceptance remain separate' }, null, 2))
console.log(JSON.stringify({ directory, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) }))
