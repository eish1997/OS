// Assemble native-host resources; this is not an installer or a release approval.
import { copyFile, mkdir, readFile, readdir, writeFile, lstat, mkdtemp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const validationId = process.env.OS_CANVAS_VALIDATION_ID
if (validationId && !/^local\.os\.canvas\.validation[a-f0-9]{32}$/.test(validationId)) {
  throw new Error('Validation identity must use local.os.canvas.validation followed by 32 lowercase hex digits')
}
const identifier = validationId ?? 'local.os.canvas'
const nodeRuntimeDirectory = process.env.OS_CANVAS_NODE_RUNTIME_DIR
if (nodeRuntimeDirectory && !validationId) throw new Error('Prototype node runtime requires an independent validation identity')
const runtimeVersion = 'v24.19.0'
if (process.platform !== 'win32' || process.arch !== 'x64' || process.version !== runtimeVersion) {
  throw new Error(`Staging currently requires Windows x64 Node ${runtimeVersion}`)
}
const source = resolve(root, '.runtime/canvas-desktop-service')
const upstream = JSON.parse(await readFile(resolve(root, 'apps/canvas/upstream.json'), 'utf8'))
const bundle = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
const service = bundle.outputs.find(row => row.name === 'desktop-service.mjs')
if (!service) throw new Error('Build the desktop service first')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const serviceBytes = await readFile(join(source, service.name))
if (hash(serviceBytes) !== service.sha256) throw new Error('Service bundle manifest mismatch')
const license = await readFile(join(source, 'LICENSE.node'), 'utf8')
if (!license.includes('Node.js') || !license.includes('Permission is hereby granted')) {
  throw new Error('Missing Node runtime license')
}
await readFile(resolve(root, upstream.checkout, 'dist/index.html'))
const parent = resolve(root, '.runtime/canvas-desktop-staging')
await mkdir(parent, { recursive: true })
const directory = await mkdtemp(join(parent, 'resources-'))
const files = []
async function copy(sourcePath, relativePath) {
  const stat = await lstat(sourcePath)
  if (stat.isSymbolicLink()) throw new Error(`Symlink cannot be staged: ${relativePath}`)
  const destination = join(directory, relativePath)
  if (stat.isDirectory()) {
    await mkdir(destination, { recursive: true })
    for (const entry of (await readdir(sourcePath)).sort()) await copy(join(sourcePath, entry), join(relativePath, entry))
  } else if (stat.isFile()) {
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(sourcePath, destination)
    const bytes = await readFile(destination)
    files.push({ path: relativePath.replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes) })
  } else throw new Error(`Unsupported resource: ${relativePath}`)
}
await copy(resolve(root, upstream.checkout, 'dist'), 'ui')
await copy(process.execPath, 'runtime/node.exe')
await copy(join(source, 'LICENSE.node'), 'licenses/LICENSE.node')
await copy(resolve(root, 'apps/canvas/LICENSE.open-pencil'), 'licenses/LICENSE.open-pencil')
await copy(resolve(root, upstream.checkout, 'packages/kiwi/NOTICE'), 'licenses/NOTICE.kiwi')
await copy(resolve(root, upstream.checkout, 'tests/fixtures/fonts/Inter-OFL.txt'), 'licenses/OFL.Inter.txt')
const packageNotices = resolve(root, '.runtime/canvas-third-party/distribution')
const noticeManifest = JSON.parse(await readFile(join(packageNotices, 'manifest.json'), 'utf8'))
if (noticeManifest.inventorySHA256 !== hash(await readFile(resolve(root, '.runtime/canvas-third-party/inventory.json')))
  || noticeManifest.mappingSHA256 !== hash(await readFile(resolve(root, 'output/dev-evidence/canvas-c05/desktop/bundled-notice-map.json')))
  || noticeManifest.noticesSHA256 !== hash(await readFile(join(packageNotices, 'THIRD-PARTY-NOTICES.txt')))) {
  throw new Error('Package notices are stale or corrupt; run package-notices.py')
}
await copy(join(packageNotices, 'THIRD-PARTY-NOTICES.txt'), 'licenses/THIRD-PARTY-NOTICES.txt')
await copy(join(packageNotices, 'manifest.json'), 'licenses/package-notices.json')
const sdkNotices = resolve(root, 'apps/canvas/third-party')
const sdkManifest = JSON.parse(await readFile(join(sdkNotices, 'WebView2-SDK.source.json'), 'utf8'))
for (const name of ['WebView2-SDK-LICENSE.txt', 'WebView2-SDK-NOTICE.txt']) {
  const record = sdkManifest.files.find(file => file.file === name)
  if (!record || hash(await readFile(join(sdkNotices, name))) !== record.sha256) {
    throw new Error(`WebView2 SDK notice mismatch: ${name}`)
  }
  await copy(join(sdkNotices, name), `licenses/${name}`)
}
const sourceNotices = resolve(root, '.runtime/canvas-third-party/source-distribution')
const sourceManifest = JSON.parse(await readFile(join(sourceNotices, 'sources.json'), 'utf8'))
if (sourceManifest.inventorySHA256 !== hash(await readFile(resolve(root, '.runtime/canvas-third-party/inventory.json')))
  || sourceManifest.cargoLockSHA256 !== hash(await readFile(resolve(root, upstream.checkout, 'desktop/Cargo.lock')))) {
  throw new Error('Source notice inventory is stale; run package-source-notices.py')
}
for (const record of sourceManifest.packages) {
  if (!/^[a-zA-Z0-9_.-]+\.crate$/.test(record.archive)
    || hash(await readFile(join(sourceNotices, record.archive))) !== record.sha256) {
    throw new Error('Source notice archive mismatch')
  }
  await copy(join(sourceNotices, record.archive), `licenses/sources/${record.archive}`)
}
await copy(join(sourceNotices, 'sources.json'), 'licenses/sources/sources.json')
await copy(join(sourceNotices, 'README.txt'), 'licenses/sources/README.txt')
await copy(join(source, service.name), 'service/desktop-service.mjs')
if (nodeRuntimeDirectory) {
  const runtimeRoot = resolve(nodeRuntimeDirectory)
  const runtime = JSON.parse(await readFile(join(runtimeRoot, 'runtime.json'), 'utf8'))
  if (runtime.formatVersion !== 1 || runtime.engine !== 'quickjs-emscripten' || runtime.version !== '0.32.0') {
    throw new Error('Unsupported prototype node runtime')
  }
  for (const file of runtime.files) {
    const target = resolve(runtimeRoot, file.path)
    if (!target.startsWith(runtimeRoot + '\\') || hash(await readFile(target)) !== file.sha256) {
      throw new Error('Node runtime resource mismatch')
    }
  }
  await copy(runtimeRoot, 'service/node-runtime')
}
const manifest = { formatVersion: 1, kind: 'desktop-resource-staging',
  platform: process.platform, arch: process.arch, node: process.version,
  upstreamCommit: upstream.commit, files,
  applicationIdentifier: identifier, validationOnly: Boolean(validationId), nodeRuntimePrototype: Boolean(nodeRuntimeDirectory),
  limitations: ['Resource staging only; native binary and installer built separately',
    'Notice scope is recorded in licenses/package-notices.json; installed-version acceptance is separate',
    'Offline text uses bundled and available system fonts; arbitrary missing fonts are not guaranteed'],
}
await writeFile(join(directory, 'resources.json'), JSON.stringify(manifest, null, 2) + '\n')
// Tauri merges this overlay with the pinned upstream config. Keep the custom
// application identity and disable upstream release/update/file registrations.
const config = {
  productName: validationId ? 'OS Canvas Validation' : 'OS Canvas', identifier,
  build: { beforeBuildCommand: '', beforeDevCommand: '',
    frontendDist: relative(resolve(root, upstream.checkout, 'desktop'), join(directory, 'ui')).replaceAll('\\', '/') },
  app: { windows: [{ label: 'main', title: 'OS Canvas', url: nodeRuntimeDirectory ? '?os-canvas&isolation-prototype' : '?os-canvas',
    width: 1440, height: 900, dragDropEnabled: false }] },
  bundle: { targets: ['nsis'], useLocalToolsDir: true, createUpdaterArtifacts: false, fileAssociations: [],
    resources: { [join(directory, 'runtime/')]: 'canvas/runtime/',
      [join(directory, 'service/')]: 'canvas/service/',
      [join(directory, 'licenses/')]: 'canvas/licenses/',
      [join(directory, 'resources.json')]: 'canvas/resources.json' } },
  plugins: { updater: { endpoints: [] }, 'deep-link': { desktop: { schemes: [] } } },
}
await writeFile(join(directory, 'tauri.os.generated.json'), JSON.stringify(config, null, 2) + '\n')
console.log(JSON.stringify({ directory, fileCount: files.length, bytes: files.reduce((sum, row) => sum + row.bytes, 0) }))
