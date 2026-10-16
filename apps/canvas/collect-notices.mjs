// Conservative dependency inventory; records missing declarations instead of inventing notices.
import { readFile, writeFile, mkdir, readdir, realpath, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { dirname, resolve, join, relative, isAbsolute } from 'node:path'

const root = process.cwd(), upstream = resolve('.runtime/open-pencil-upstream')
const output = resolve('.runtime/canvas-third-party')
const supplementRoot = resolve('apps/canvas/third-party')
const canonicalSupplementRoot = await realpath(supplementRoot)
const supplements = JSON.parse(await readFile(join(supplementRoot, 'supplements.json'), 'utf8'))
await mkdir(join(output, 'texts'), { recursive: true })
const records = [], missing = [], visited = new Set()
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function exists(path) { try { await access(path); return true } catch { return false } }
async function declarationFiles(directory, depth = 0) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && /(^|[._-])(licen[cs]e|notice|copying|copyright|ofl)([._-]|$)/i.test(entry.name)) files.push(join(directory, entry.name))
    if (entry.isDirectory() && depth < 2 && /^(licenses?|notices?|legal|third.party)$/i.test(entry.name)) {
      files.push(...await declarationFiles(join(directory, entry.name), depth + 1))
    }
  }
  return files
}
async function collect(kind, pkg, directory, extraFiles = []) {
  const key = `${kind}:${pkg.name}@${pkg.version}`
  const supplement = supplements[key]
  for (const entry of supplement?.files ?? []) {
    const path = await realpath(resolve(supplementRoot, entry.file))
    const subpath = relative(canonicalSupplementRoot, path)
    if (!subpath || subpath.startsWith('..') || isAbsolute(subpath)
      || digest(await readFile(path)) !== entry.sha256) throw new Error(`Invalid notice supplement: ${key}`)
    extraFiles.push(path)
  }
  if (supplement?.localEvidence) {
    const entry = supplement.localEvidence
    if (digest(await readFile(join(directory, entry.file))) !== entry.sha256) throw new Error(`Changed license evidence: ${key}`)
  }
  const files = [...new Set([...await declarationFiles(directory), ...extraFiles])]
  const texts = []
  for (const path of files) {
    if (!await exists(path)) { missing.push({ key, reason: 'declared-file-missing', file: relative(directory, path) }); continue }
    const bytes = await readFile(path), hash = digest(bytes)
    await writeFile(join(output, 'texts', `${hash}.txt`), bytes)
    texts.push({ original: relative(directory, path).replaceAll('\\', '/'), sha256: hash, file: `texts/${hash}.txt` })
  }
  const license = pkg.license ?? pkg.licenses ?? supplement?.licenseFromText ?? null
  if (!license) missing.push({ key, reason: 'no-license-declaration' })
  if (!texts.length) missing.push({ key, reason: 'no-notice-text-found' })
  records.push({ kind, name: pkg.name, version: pkg.version, license, repository: pkg.repository ?? null, texts,
    ...(supplement ? { supplement } : {}) })
}
const queue = [{ directory: upstream, own: true }]
while (queue.length) {
  const { directory, own = false } = queue.shift()
  const actual = await realpath(directory)
  if (visited.has(actual)) continue
  visited.add(actual)
  const manifest = join(actual, 'package.json'), pkg = JSON.parse(await readFile(manifest, 'utf8'))
  const localWorkspace = relative(join(upstream, 'packages'), actual)
  const inherited = !localWorkspace.startsWith('..') && !localWorkspace.includes(':')
    ? [join(upstream, 'LICENSE')] : []
  if (!own) await collect('npm', pkg, actual, inherited)
  const dependencies = { ...pkg.dependencies, ...pkg.optionalDependencies }
  // Build-time asset inputs that can become shipped SVG/CSS/JS, separately from runtime dependencies.
  if (own) for (const name of ['@iconify-json/lucide', '@lobehub/icons-static-svg', '@agentclientprotocol/sdk', 'react', 'react-dom', 'tw-animate-css', 'workbox-window']) {
    if (pkg.devDependencies?.[name]) dependencies[name] = pkg.devDependencies[name]
  }
  for (const name of Object.keys(dependencies)) {
    let found
    // Append a subpath so names like buffer/events resolve as installed npm
    // packages rather than Node builtins (whose resolve.paths result is null).
    for (const search of createRequire(manifest).resolve.paths(`${name}/package.json`) ?? []) {
      const candidate = join(search, name)
      if (await exists(join(candidate, 'package.json'))) { found = candidate; break }
    }
    if (found) queue.push({ directory: found })
    else missing.push({ key: `npm:${pkg.name}@${pkg.version}`, dependency: name,
      reason: pkg.optionalDependencies?.[name] ? 'optional-not-installed' : 'dependency-not-resolved' })
  }
}
const cargo = JSON.parse((await readFile('output/dev-evidence/canvas-c05/desktop/cargo-metadata.json', 'utf8')).replace(/^\uFEFF/, ''))
const reachable = new Set(cargo.resolve.nodes.map(node => node.id))
for (const pkg of cargo.packages) {
  if (!reachable.has(pkg.id) || pkg.id === cargo.resolve.root) continue
  const directory = dirname(pkg.manifest_path)
  const licenseFile = pkg.license_file ? resolve(directory, pkg.license_file) : null
  await collect('cargo', pkg, directory, licenseFile ? [licenseFile] : [])
}
records.sort((a, b) => `${a.kind}:${a.name}:${a.version}`.localeCompare(`${b.kind}:${b.name}:${b.version}`))
const report = { formatVersion: 1, status: 'inventory-review-required',
  scope: 'Resolved production npm dependency closure plus explicit build asset inputs; Windows Cargo metadata includes build/proc-macro dependencies. Conservative superset, not proof every package is linked. Embedded vendor notices and remaining missing entries need review.',
  inputs: { bunLock: digest(await readFile(join(upstream, 'bun.lock'))), cargoLock: digest(await readFile(join(upstream, 'desktop/Cargo.lock'))) },
  records, missing }
await writeFile(join(output, 'inventory.json'), JSON.stringify(report, null, 2))
const notice = ['THIRD-PARTY DEPENDENCY INVENTORY', report.scope, 'Status: review required; see inventory.json for unresolved declarations.', '']
for (const record of records) {
  notice.push(`${record.kind}: ${record.name}@${record.version}`, `Declared license: ${JSON.stringify(record.license)}`)
  for (const item of record.texts) notice.push(`--- ${item.original} ---`, await readFile(join(output, item.file), 'utf8'))
  notice.push('')
}
await writeFile(join(output, 'THIRD-PARTY-NOTICES.txt'), notice.join('\n'))
console.log(JSON.stringify({ output, packages: records.length, npm: records.filter(r => r.kind === 'npm').length,
  cargo: records.filter(r => r.kind === 'cargo').length, unresolved: missing.length }))
