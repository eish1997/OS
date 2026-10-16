import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { WorkspaceStore, WorkspaceError } from './workspace-store.mjs'
import { LayoutStore } from './layout-store.mjs'
import { MountStore } from './mount-store.mjs'
import { FileIndex } from './file-index.mjs'
import { DirectoryObserver } from './directory-observer.mjs'
import { FileTargets } from './file-targets.mjs'
import { OutputStore } from './output-store.mjs'
import { PackageImportStore } from './package-import-store.mjs'
import { exportCanvasPackage } from './package-export.mjs'
import { createNodeRuns } from '../runtime/node-runs.mjs'

const DEFAULT_LIMIT = 350 * 1024 * 1024
const statusFor = { invalid: 400, 'not-found': 404, conflict: 409,
  'operation-conflict': 409, corrupt: 422, 'unsupported-version': 422, 'too-large': 413, 'unsupported-filesystem': 501 }

async function readJSON(request, limit) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw new WorkspaceError('invalid', 'Expected application/json')
  }
  const bytes = await readBytes(request, limit)
  try { return JSON.parse(bytes.toString('utf8')) }
  catch { throw new WorkspaceError('invalid', 'Invalid JSON') }
}

async function readBytes(request, limit) {
  if (Number(request.headers['content-length']) > limit) throw new WorkspaceError('too-large', 'Request too large')
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new WorkspaceError('too-large', 'Request too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function startWorkspaceServer({ directory, token, port = 14222,
  origin = 'http://localhost:14220', bodyLimit = DEFAULT_LIMIT, nodeSandbox }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('A session token of at least 32 characters is required')
  const secret = Buffer.from(`Bearer ${token}`)
  const nodeRuns = nodeSandbox ? createNodeRuns(nodeSandbox) : null
  const store = new WorkspaceStore(directory)
  let layout
  let layoutFailure
  try { layout = new LayoutStore(directory) } catch (error) { layoutFailure = error }
  let mounts
  let mountFailure
  try { mounts = new MountStore(directory) } catch (error) { mountFailure = error }
  let outputs
  let outputFailure = mountFailure
  if (mounts) try { outputs = new OutputStore(directory, mounts) } catch (error) { outputFailure = error }
  let files
  let fileFailure = mountFailure
  if (mounts) try {
    files = new FileIndex(directory, mounts, { ignoredNames: id => {
      if (outputFailure) throw outputFailure
      return outputs.temporaryNames(id)
    }, outputOrigins: (id, rows) => {
      if (outputFailure) throw outputFailure
      return outputs.origins(id, rows)
    } })
  } catch (error) { fileFailure = error }
  const observer = files ? new DirectoryObserver(files, mounts) : undefined
  const targets = files ? new FileTargets(files, mounts) : undefined
  let imports
  let importFailure = fileFailure ?? layoutFailure
  if (!importFailure) try {
    imports = new PackageImportStore(directory, { workspace: store, mounts, files, layout })
  } catch (error) { importFailure = error }
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(body))
    }
    try {
      const address = server.address()
      if (!address || request.headers.host !== `127.0.0.1:${address.port}` ||
          (request.headers.origin !== undefined && request.headers.origin !== origin)) {
        send(403, { error: 'forbidden', message: 'Origin or host rejected' }); return
      }
      if (request.headers.origin === origin) {
        response.setHeader('Access-Control-Allow-Origin', origin)
        response.setHeader('Vary', 'Origin')
      }
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type' })
        response.end(); return
      }
      const supplied = Buffer.from(request.headers.authorization ?? '')
      if (supplied.length !== secret.length || !timingSafeEqual(supplied, secret)) {
        send(401, { error: 'unauthorized', message: 'Session token required' }); return
      }
      const url = new URL(request.url, `http://127.0.0.1:${address.port}`)
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts[0] === 'node-runs') {
        if (!nodeRuns) { send(503, { error: 'unavailable', message: 'Node runtime is not enabled' }); return }
        if (parts.length === 1 && request.method === 'POST') {
          const body = await readJSON(request, 132 * 1024)
          if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'source')) {
            send(400, { error: 'invalid', message: 'Only draft source is accepted' }); return
          }
          try { send(202, nodeRuns.start(body.source)) }
          catch (error) { send(400, { error: 'invalid', message: error.message }) }
          return
        }
        const job = parts.length === 2 && request.method === 'GET' ? nodeRuns.get(parts[1])
          : parts.length === 3 && parts[2] === 'cancel' && request.method === 'POST' ? await nodeRuns.cancel(parts[1]) : null
        send(job ? 200 : 404, job ?? { error: 'not-found' }); return
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        send(200, { service: 'os-canvas-workspace', protocolVersion: 1 }); return
      }
      if (request.method === 'GET' && url.pathname === '/canvases') {
        send(200, store.list()); return
      }
      if (parts[0] === 'package-imports') {
        if (importFailure) throw importFailure
        if (parts.length === 1 && request.method === 'GET') {
          send(200, imports.list()); return
        }
        if (parts.length === 2 && request.method === 'POST') {
          if (request.headers['content-type']?.split(';')[0] !== 'application/octet-stream') {
            throw new WorkspaceError('invalid', 'Expected a binary canvas package')
          }
          const bytes = await readBytes(request, bodyLimit)
          send(200, imports.prepare(parts[1], bytes)); return
        }
        if (parts.length === 3 && parts[2] === 'resume' && request.method === 'POST') {
          send(200, imports.resume(parts[1])); return
        }
      }
      if (parts[0] === 'canvases' && parts.length === 3 && parts[2] === 'outputs' && request.method === 'GET') {
        if (outputFailure) throw outputFailure
        store.read(parts[1])
        send(200, outputs.pending(parts[1])); return
      }
      if (url.pathname === '/outputs' && request.method === 'POST') {
        if (outputFailure) throw outputFailure
        const body = await readJSON(request, bodyLimit)
        if (!body || typeof body.contentBase64 !== 'string') throw new WorkspaceError('invalid', 'Expected output content')
        const content = Buffer.from(body.contentBase64, 'base64')
        if (content.toString('base64') !== body.contentBase64) throw new WorkspaceError('invalid', 'Invalid output encoding')
        if (!Number.isSafeInteger(body.sourceRevision) || body.sourceRevision < 1) throw new WorkspaceError('invalid', 'Saved source revision required')
        const source = store.read(body.canvasId, body.sourceRevision)
        if (!Array.isArray(source.metadata.outputSourceNodeIds) || !source.metadata.outputSourceNodeIds.includes(body.nodeId)) {
          throw new WorkspaceError('conflict', 'Output source node is not present in the saved identity manifest')
        }
        send(200, outputs.prepare({ ...body, content })); return
      }
      if (parts[0] === 'outputs' && parts.length === 3 && parts[2] === 'commit' && request.method === 'POST') {
        if (outputFailure) throw outputFailure
        send(200, outputs.commit(parts[1])); return
      }
      if (parts[0] === 'outputs' && parts.length === 3 && parts[2] === 'cancel' && request.method === 'POST') {
        if (outputFailure) throw outputFailure
        send(200, outputs.cancel(parts[1])); return
      }
      if (parts[0] === 'outputs' && parts.length === 3 && parts[2] === 'replace' && request.method === 'POST') {
        if (outputFailure) throw outputFailure
        send(200, outputs.replacePending(parts[1], await readJSON(request, 64 * 1024))); return
      }
      if (url.pathname === '/mounts' && request.method === 'GET') {
        if (mountFailure) throw mountFailure
        send(200, mounts.list()); return
      }
      if (url.pathname === '/mounts' && request.method === 'POST') {
        if (mountFailure) throw mountFailure
        const body = await readJSON(request, 64 * 1024)
        send(200, mounts.add(body?.path)); return
      }
      if (parts[0] === 'file-targets' && parts.length === 2 && request.method === 'POST' && ['preview', 'confirm'].includes(parts[1])) {
        if (fileFailure) throw fileFailure
        const body = await readJSON(request, 64 * 1024)
        send(200, parts[1] === 'preview' ? await targets.preview(body?.path) : await targets.confirm(body?.token)); return
      }
      if (parts[0] === 'mounts' && parts.length === 3 && request.method === 'POST' && ['relink-preview', 'relink-confirm'].includes(parts[2])) {
        if (mountFailure) throw mountFailure
        const body = await readJSON(request, 64 * 1024)
        send(200, parts[2] === 'relink-preview' ? mounts.previewRelink(parts[1], body?.path) : mounts.confirmRelink(parts[1], body?.token)); return
      }
      if (parts[0] === 'mounts' && parts.length === 3 &&
          ((parts[2] === 'files' && request.method === 'GET') || (parts[2] === 'scan' && request.method === 'POST'))) {
        if (fileFailure) throw fileFailure
        send(200, parts[2] === 'scan' ? await files.scan(parts[1]) : files.list(parts[1])); return
      }
      if (parts[0] === 'mounts' && parts.length === 3 && parts[2] === 'poll' && request.method === 'POST') {
        if (fileFailure) throw fileFailure
        send(200, await observer.poll(parts[1])); return
      }
      if (parts[0] === 'mounts' && parts.length === 5 && parts[2] === 'files' && parts[4] === 'open' && request.method === 'POST') {
        if (fileFailure) throw fileFailure
        send(200, await files.openChild(parts[1], parts[3])); return
      }
      if (parts[0] === 'mounts' && parts.length === 5 && parts[2] === 'files' && request.method === 'POST' &&
          ['replacement-preview', 'replacement-confirm'].includes(parts[4])) {
        if (fileFailure) throw fileFailure
        if (parts[4] === 'replacement-preview') {
          send(200, await files.prepareReplacement(parts[1], parts[3])); return
        }
        const body = await readJSON(request, 64 * 1024)
        send(200, await files.confirmReplacement(parts[1], parts[3], body?.token)); return
      }
      if (url.pathname === '/layout' && request.method === 'GET') {
        if (layoutFailure) throw layoutFailure
        send(200, layout.read()); return
      }
      if (url.pathname === '/layout' && request.method === 'POST') {
        if (layoutFailure) throw layoutFailure
        send(200, layout.save(await readJSON(request, 64 * 1024))); return
      }
      if (request.method === 'GET' && parts.length === 2 && parts[0] === 'operations') {
        const operation = store.operation(parts[1])
        send(operation ? 200 : 404, operation ?? { error: 'not-found', message: 'Operation not committed' }); return
      }
      if (request.method === 'GET' && parts.length === 3 && parts[0] === 'canvases' && parts[2] === 'revisions') {
        send(200, store.revisions(parts[1])); return
      }
      if (request.method === 'POST' && parts.length === 3 && parts[0] === 'canvases' && parts[2] === 'package') {
        if (fileFailure) throw fileFailure
        if (layoutFailure) throw layoutFailure
        const body = await readJSON(request, 64 * 1024)
        const bytes = await exportCanvasPackage({ workspace: store, mounts, files, layout,
          canvasId: parts[1], expectedRevision: body?.expectedRevision })
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length,
          'Content-Disposition': `attachment; filename="${parts[1]}.oscanvas"` })
        response.end(bytes); return
      }
      if (parts[0] === 'canvases' && parts.length === 2 && request.method === 'POST') {
        const body = await readJSON(request, bodyLimit)
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            typeof body.sceneBase64 !== 'string' || body.sceneBase64.length === 0) {
          throw new WorkspaceError('invalid', 'Invalid scene encoding')
        }
        const scene = Buffer.from(body.sceneBase64, 'base64')
        if (scene.toString('base64') !== body.sceneBase64) throw new WorkspaceError('invalid', 'Invalid scene encoding')
        const result = store.save({ canvasId: parts[1], operationId: body.operationId,
          expectedRevision: body.expectedRevision, metadata: body.metadata, scene })
        send(200, result); return
      }
      if (parts[0] === 'canvases' && request.method === 'GET' &&
          (parts.length === 2 || (parts.length === 3 && parts[2] === 'scene'))) {
        const revision = url.searchParams.has('revision') ? Number(url.searchParams.get('revision')) : undefined
        const { scene, ...metadata } = store.read(parts[1], revision)
        if (parts.length === 2) { send(200, metadata); return }
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': scene.length })
        response.end(scene); return
      }
      send(404, { error: 'not-found', message: 'Route not found' })
    } catch (error) {
      if (response.destroyed || response.headersSent) return
      if (error instanceof WorkspaceError) send(statusFor[error.code] ?? 500, { error: error.code, message: error.message })
      else send(500, { error: 'storage-failure', message: 'Workspace operation failed; saved revisions are retained' })
    }
  })
  server.requestTimeout = 30000
  server.headersTimeout = 10000
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
  } catch (error) { observer?.close(); imports?.close(); store.close(); layout?.close(); await files?.close(); outputs?.close(); mounts?.close(); throw error }
  return { url: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      await nodeRuns?.close()
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      observer?.close()
      imports?.close()
      store.close()
      layout?.close()
      await files?.close()
      outputs?.close()
      mounts?.close()
    } }
}
