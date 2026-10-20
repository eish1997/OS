import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { startWorkspaceServer } from './server.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const manifest = JSON.parse(readFileSync(resolve(root, 'apps/canvas/upstream.json'), 'utf8'))
const preview = process.argv.includes('--preview')
if (preview && !existsSync(resolve(root, manifest.checkout, 'dist/index.html'))) {
  throw new Error('Production output is missing. Run scripts/canvas.ps1 build first.')
}
const appPort = Number(process.env.OS_CANVAS_APP_PORT ?? manifest.appPort)
const mcpPort = Number(process.env.OS_CANVAS_MCP_PORT ?? manifest.mcpPort)
const origin = `http://localhost:${appPort}`
const token = randomBytes(32).toString('hex')
const service = await startWorkspaceServer({
  directory: process.env.OS_CANVAS_DATA_DIR ?? resolve(root, '.runtime/canvas-data'),
  token, port: Number(process.env.OS_CANVAS_PORT ?? 14222), origin,
  nodeSandbox: process.env.OS_CANVAS_SANDBOX_ENGINE ? { engine: process.env.OS_CANVAS_SANDBOX_ENGINE } : undefined
})
const bun = resolve(root, '.runtime/canvas-toolchain/node_modules/bun/bin/bun.exe')
console.log(`Canvas at ${origin}/?os-canvas; local storage at ${service.url}`)
const child = spawn(bun, ['run', preview ? 'preview' : 'dev', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], {
  cwd: resolve(root, manifest.checkout), stdio: 'inherit', windowsHide: true,
  env: { ...process.env, PATH: `${dirname(bun)};${process.env.PATH}`,
    OS_CANVAS_TOKEN: token, OS_CANVAS_SERVICE_URL: service.url,
    OPENPENCIL_DEV_ORIGIN: origin, OPENPENCIL_DEV_MCP_PORT: String(mcpPort) }
})
child.once('error', async error => { console.error(error.message); await service.close(); process.exitCode = 1 })
child.once('exit', async code => { await service.close(); process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { child.kill(signal) })
