import { encodeCanvasPackage } from './canvas-package.mjs'
import { WorkspaceError } from './workspace-store.mjs'

// Resolve the already pinned and built upstream dependency. Desktop packaging
// must carry this module with its dependencies; no network dependency at runtime.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function referencedFiles(records) {
  const links = []
  const pending = [...records]
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object') continue
    if (value.pluginID === 'os.canvas' && ['os.canvas/fileLink', 'os.canvas/outputLinks'].includes(value.key)) {
      let decoded
      try { decoded = JSON.parse(value.value) }
      catch { throw new WorkspaceError('corrupt', 'A saved file reference cannot be read') }
      const entries = value.key === 'os.canvas/fileLink' ? [decoded] : decoded
      if (!Array.isArray(entries)) throw new WorkspaceError('corrupt', 'Invalid saved file references')
      for (const entry of entries) {
        if (!entry || typeof entry.id !== 'string' || !uuid.test(entry.id) ||
            typeof entry.mountId !== 'string' || !uuid.test(entry.mountId)) {
          throw new WorkspaceError('corrupt', 'Invalid saved file reference identity')
        }
        links.push({ id: entry.id, mountId: entry.mountId })
      }
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object' && !ArrayBuffer.isView(child)) pending.push(child)
    }
  }
  return links
}

export async function exportCanvasPackage({ workspace, mounts, files, layout, canvasId, expectedRevision }) {
  const { parseFigBuffer } = await import('../../../.runtime/open-pencil-upstream/packages/fig/dist/index.js')
  // After dependency loading, capture everything synchronously so another HTTP
  // save cannot interleave the revision list and package assembly in this host.
  const head = workspace.read(canvasId)
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new WorkspaceError('invalid', 'A saved revision is required before export')
  }
  if (head.revision !== expectedRevision) throw new WorkspaceError('conflict', 'Canvas changed before package export')
  const revisions = workspace.revisions(canvasId).map(row => workspace.read(canvasId, row.revision))
  const mountIds = new Set(), fileIds = new Map(), scanned = new Set()
  for (const revision of revisions) {
    if (revision.metadata.mountId) mountIds.add(revision.metadata.mountId)
    if (scanned.has(revision.sceneHash)) continue
    scanned.add(revision.sceneHash)
    let parsed
    try {
      const bytes = revision.scene
      parsed = parseFigBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    } catch { throw new WorkspaceError('corrupt', 'A saved FIG revision cannot be read for export') }
    for (const link of referencedFiles(parsed.nodeChanges)) {
      if (fileIds.has(link.id) && fileIds.get(link.id) !== link.mountId) {
        throw new WorkspaceError('corrupt', 'Saved revisions disagree about a file identity')
      }
      mountIds.add(link.mountId); fileIds.set(link.id, link.mountId)
    }
  }
  const references = { formatVersion: 1, mounts: [], files: [] }
  for (const id of mountIds) {
    references.mounts.push(mounts.get(id))
    for (const entry of files.list(id).entries) {
      if (fileIds.get(entry.id) === id) { references.files.push(entry); fileIds.delete(entry.id) }
    }
  }
  if (fileIds.size) throw new WorkspaceError('not-found', 'A historical file reference is absent from the local index')
  return encodeCanvasPackage({ canvasId, revisions, references, layout: layout.read().layout })
}
