// Private pipe protocol for the native host. No credentials in argv or stdout.
import { startWorkspaceServer } from './server.mjs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

let service, closing = false, configured = false, size = 0
let pending = Buffer.alloc(0)
async function close() {
  if (closing) return
  closing = true
  await service?.close()
}
process.stdin.on('end', () => { void close() })
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void close(); process.stdin.destroy() })
process.stdin.on('data', async chunk => {
  if (configured) return // Keep the pipe open solely as the host lifetime lease.
  size += chunk.length
  if (size > 8192) { process.stderr.write('Invalid desktop service configuration\n'); process.exit(1) }
  pending = Buffer.concat([pending, chunk])
  const end = pending.indexOf(10)
  if (end < 0) return
  configured = true
  try {
    const config = JSON.parse(pending.subarray(0, end).toString('utf8'))
    pending = Buffer.alloc(0)
    if (!config || typeof config.directory !== 'string' || !config.directory ||
        typeof config.origin !== 'string' || !['http:', 'https:', 'tauri:'].includes(new URL(config.origin).protocol)) {
      throw new Error('Invalid configuration')
    }
    let nodeSandbox
    if (config.enableNodeRuntime === true) {
      const runtimeURL = new URL('./node-runtime/', import.meta.url)
      const runtime = JSON.parse(await readFile(new URL('runtime.json', runtimeURL), 'utf8'))
      if (runtime.formatVersion !== 1 || runtime.engine !== 'quickjs-emscripten' || runtime.version !== '0.32.0') {
        throw new Error('Unsupported node runtime')
      }
      nodeSandbox = { engine: fileURLToPath(new URL('node_modules/quickjs-emscripten/dist/index.js', runtimeURL)),
        workerURL: new URL('sandbox-worker.mjs', runtimeURL) }
    }
    service = await startWorkspaceServer({ directory: config.directory, origin: config.origin,
      token: config.token, port: 0, nodeSandbox })
    if (closing) { await service.close(); return }
    process.stdout.write(JSON.stringify({ type: 'ready', protocolVersion: 1, url: service.url }) + '\n')
  } catch {
    process.stderr.write('Desktop workspace service failed to start\n')
    process.exitCode = 1
    process.stdin.destroy()
    await close()
  }
})
