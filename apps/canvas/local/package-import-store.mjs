import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { decodeCanvasPackage } from './canvas-package.mjs'
import { WorkspaceError } from './workspace-store.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const requireId = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new WorkspaceError('invalid', 'Invalid package import identifier')
  }
}

// Each participant commits its own idempotent operation. This journal retains the
// exact input before any participant runs, so process death can resume forward.
// It deliberately does not claim a cross-database atomic transaction.
export class PackageImportStore {
  constructor(directory, { workspace, mounts, files, layout }) {
    Object.assign(this, { workspace, mounts, files, layout })
    this.db = new DatabaseSync(join(directory, 'package-imports.sqlite'))
    const version = this.db.prepare('PRAGMA user_version').get().user_version
    if (version !== 0 && version !== 1) {
      this.db.close(); throw new WorkspaceError('unsupported-version', 'Unsupported package import database')
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY, canvas_id TEXT NOT NULL, package_hash TEXT NOT NULL,
        payload BLOB NOT NULL, state TEXT NOT NULL, result TEXT, created_at TEXT NOT NULL);
      PRAGMA user_version=1;`)
  }
  close() { this.db.close() }
  list() {
    return this.db.prepare('SELECT id, canvas_id, state, result, created_at FROM imports ORDER BY created_at').all()
      .map(row => ({ operationId: row.id, canvasId: row.canvas_id, state: row.state,
        result: row.result ? JSON.parse(row.result) : null, createdAt: row.created_at }))
  }
  preflight(manifest) {
    if (this.workspace.revisions(manifest.canvasId).length) throw new WorkspaceError('conflict', 'Canvas already exists')
    if (this.db.prepare("SELECT 1 FROM imports WHERE canvas_id=? AND state='prepared'").get(manifest.canvasId)) {
      throw new WorkspaceError('conflict', 'Resume the existing import for this canvas')
    }
    for (const mount of manifest.references.mounts) {
      if (this.mounts.db.prepare('SELECT 1 FROM mounts WHERE id=? OR canvas_id=? OR canonical=?')
        .get(mount.id, mount.canvasId, mount.path)) throw new WorkspaceError('conflict', 'Directory reference already exists')
    }
    for (const file of manifest.references.files) {
      if (this.files.db.prepare('SELECT 1 FROM files WHERE id=? OR (mount_id=? AND path=?)')
        .get(file.id, file.mountId, file.path)) throw new WorkspaceError('conflict', 'File reference already exists')
    }
  }
  prepare(operationId, bytes) {
    requireId(operationId)
    const { manifest } = decodeCanvasPackage(bytes), hash = digest(bytes)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.db.prepare('SELECT package_hash FROM imports WHERE id=?').get(operationId)
      if (previous) {
        if (previous.package_hash !== hash) throw new WorkspaceError('operation-conflict', 'Package import input changed')
      } else {
        this.preflight(manifest)
        this.db.prepare('INSERT INTO imports VALUES (?, ?, ?, ?, ?, NULL, ?)')
          .run(operationId, manifest.canvasId, hash, bytes, 'prepared', new Date().toISOString())
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return { operationId, canvasId: manifest.canvasId }
  }
  resume(operationId) {
    requireId(operationId)
    const row = this.db.prepare('SELECT * FROM imports WHERE id=?').get(operationId)
    if (!row) throw new WorkspaceError('not-found', 'Package import not found')
    if (row.state === 'complete') return JSON.parse(row.result)
    if (digest(row.payload) !== row.package_hash) throw new WorkspaceError('corrupt', 'Stored package checksum mismatch')
    const { manifest, scenes } = decodeCanvasPackage(row.payload)
    this.mounts.importReferences(operationId, manifest.references)
    this.files.importReferences(operationId, manifest.references)
    const saved = this.workspace.importHistory({ operationId, canvasId: manifest.canvasId,
      revisions: manifest.revisions.map(revision => ({ ...revision, scene: scenes.get(revision.sceneHash) })) })
    const preset = this.layout.importPreset(operationId, manifest.layout)
    const result = { operationId, ...saved, layoutApplied: preset.applied, layout: preset.layout,
      externalFiles: manifest.externalFiles }
    this.db.prepare("UPDATE imports SET state='complete', result=? WHERE id=?").run(JSON.stringify(result), operationId)
    return result
  }
}
