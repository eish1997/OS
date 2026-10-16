// Produce a separate production build with the actual emitted chunk/module map.
import { createRequire } from 'node:module'
import { resolve, relative, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const root = process.cwd(), upstream = resolve('.runtime/open-pencil-upstream')
const output = process.env.OS_CANVAS_AUDIT_DIST === '1' ? join(upstream, 'dist') : resolve('.runtime/canvas-audit-ui')
const evidence = resolve('output/dev-evidence/canvas-c05/desktop')
const require = createRequire(join(upstream, 'package.json'))
const { build } = await import(pathToFileURL(require.resolve('vite')).href)
const slash = path => path.replaceAll('\\', '/')
const modules = new Set(), artifacts = []
await mkdir(evidence, { recursive: true })
process.chdir(upstream)
await build({ root: upstream, configFile: join(upstream, 'vite.config.ts'),
  build: { outDir: output, emptyOutDir: process.env.OS_CANVAS_AUDIT_DIST === '1' },
  plugins: [{ name: 'os-canvas-dependency-evidence',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') for (const id of Object.keys(item.modules)) modules.add(slash(relative(root, id)))
        const bytes = item.type === 'chunk' ? Buffer.from(item.code) : Buffer.from(item.source)
        artifacts.push({ file: item.fileName, type: item.type, bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex') })
      }
    }
  }] })
// Later Vite plugins can rewrite emitted content after generateBundle.
// Keep that intermediate digest, but identify the actual on-disk delivery bytes.
for (const artifact of artifacts) {
  artifact.generateBundleSHA256 = artifact.sha256
  const bytes = await readFile(join(output, artifact.file))
  artifact.bytes = bytes.length
  artifact.sha256 = createHash('sha256').update(bytes).digest('hex')
}
await writeFile(join(evidence, 'ui-build-inputs.json'), JSON.stringify({
  formatVersion: 1, scope: 'Emitted Vite/Rolldown chunk modules; copied public resources and generated icon assets require separate source mapping',
  output: slash(relative(root, output)), modules: [...modules].sort(), artifacts,
}, null, 2))
console.log(JSON.stringify({ modules: modules.size, artifacts: artifacts.length, output }))
