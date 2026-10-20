import { pathToFileURL } from 'node:url'
import { startWorkspaceServer } from './server.mjs'
export { startWorkspaceServer } from './server.mjs'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.env.OS_CANVAS_DATA_DIR
  if (!directory) throw new Error('OS_CANVAS_DATA_DIR must specify an independent workspace directory')
  const service = await startWorkspaceServer({ directory, token: process.env.OS_CANVAS_TOKEN,
    port: Number(process.env.OS_CANVAS_PORT ?? 14222), origin: process.env.OS_CANVAS_ORIGIN ?? 'http://localhost:14220' })
  console.log(`OS canvas workspace listening at ${service.url}`)
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void service.close() })
}
