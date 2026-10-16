import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, existsSync, readFileSync, openSync, writeFileSync, fsyncSync,
  closeSync, renameSync, unlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'

const digest = data => createHash('sha256').update(data).digest('hex')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export class WorkspaceError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
function requireId(value) {
  if (typeof value !== 'string' || !uuid.test(value)) throw new WorkspaceError('invalid', 'Invalid identifier')
}

// Immutable scene files are flushed before the SQLite head is committed. An interrupted
// write may leave an unreferenced file, but never a head pointing at a partial write.
export class WorkspaceStore {
  constructor(directory) {
    this.directory = resolve(directory)
    this.blobs = join(this.directory, 'scenes')
    mkdirSync(this.blobs, { recursive: true })
    this.db = new DatabaseSync(join(this.directory, 'workspace.sqlite'))
    const version = this.db.prepare('PRAGMA user_version').get().user_version
    if (version !== 0 && version !== 1) {
      this.db.close()
      throw new WorkspaceError('unsupported-version', `Unsupported workspace version ${version}`)
    }
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS revisions (
        canvas_id TEXT NOT NULL, revision INTEGER NOT NULL, scene_hash TEXT NOT NULL,
        metadata TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY (canvas_id, revision));
      CREATE TABLE IF NOT EXISTS heads (
        canvas_id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
        FOREIGN KEY (canvas_id, revision) REFERENCES revisions(canvas_id, revision));
      CREATE TABLE IF NOT EXISTS operations (
        operation_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
        canvas_id TEXT NOT NULL, revision INTEGER NOT NULL,
        FOREIGN KEY (canvas_id, revision) REFERENCES revisions(canvas_id, revision));
      PRAGMA user_version=1;
    `)
  }
  close() { this.db.close() }
  list() {
    return this.db.prepare(`SELECT r.* FROM heads h JOIN revisions r
      ON r.canvas_id=h.canvas_id AND r.revision=h.revision ORDER BY r.created_at DESC`).all()
      .map(row => this.describe(row))
  }
  describe(row) {
    return { canvasId: row.canvas_id, revision: row.revision, sceneHash: row.scene_hash,
      metadata: JSON.parse(row.metadata), createdAt: row.created_at }
  }
  revisions(canvasId) {
    requireId(canvasId)
    return this.db.prepare('SELECT * FROM revisions WHERE canvas_id=? ORDER BY revision DESC').all(canvasId)
      .map(row => this.describe(row))
  }
  read(canvasId, revision) {
    requireId(canvasId)
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1)) {
      throw new WorkspaceError('invalid', 'Invalid revision')
    }
    const row = revision === undefined
      ? this.db.prepare(`SELECT r.* FROM heads h JOIN revisions r
          ON r.canvas_id=h.canvas_id AND r.revision=h.revision WHERE h.canvas_id=?`).get(canvasId)
      : this.db.prepare('SELECT * FROM revisions WHERE canvas_id=? AND revision=?').get(canvasId, revision)
    if (!row) throw new WorkspaceError('not-found', 'Canvas revision not found')
    const scene = readFileSync(join(this.blobs, `${row.scene_hash}.fig`))
    if (digest(scene) !== row.scene_hash) throw new WorkspaceError('corrupt', 'Scene checksum mismatch')
    return { ...this.describe(row), scene }
  }
  operation(operationId) {
    requireId(operationId)
    const row = this.db.prepare('SELECT canvas_id, revision FROM operations WHERE operation_id=?').get(operationId)
    return row ? { canvasId: row.canvas_id, revision: row.revision } : null
  }
  writeScene(scene, sceneHash) {
    const destination = join(this.blobs, `${sceneHash}.fig`)
    if (existsSync(destination)) {
      if (digest(readFileSync(destination)) !== sceneHash) throw new WorkspaceError('corrupt', 'Existing scene checksum mismatch')
    } else {
      const temporary = join(this.blobs, `${randomUUID()}.pending`)
      let fd
      try {
        fd = openSync(temporary, 'wx')
        writeFileSync(fd, scene); fsyncSync(fd); closeSync(fd); fd = undefined
        renameSync(temporary, destination)
      } finally {
        if (fd !== undefined) closeSync(fd)
        if (existsSync(temporary)) unlinkSync(temporary)
      }
    }
  }
  importHistory({ operationId, canvasId, revisions }) {
    requireId(operationId); requireId(canvasId)
    if (!Array.isArray(revisions) || !revisions.length) throw new WorkspaceError('invalid', 'Saved revisions are required')
    const rows = revisions.map((row, index) => {
      if (!row || row.revision !== index + 1 || !(row.scene instanceof Uint8Array) ||
          !row.scene.length || row.scene.length > 256 * 1024 * 1024 ||
          !row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata) || row.metadata.formatVersion !== 1 ||
          typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) {
        throw new WorkspaceError('invalid', 'Invalid imported revision')
      }
      const metadata = JSON.stringify(row.metadata), sceneHash = digest(row.scene)
      if (Buffer.byteLength(metadata) > 1024 * 1024) throw new WorkspaceError('invalid', 'Metadata too large')
      if (sceneHash !== row.sceneHash) throw new WorkspaceError('corrupt', 'Imported scene checksum mismatch')
      return { ...row, metadata, sceneHash }
    })
    const requestHash = digest(JSON.stringify(['import-history', canvasId,
      rows.map(row => [row.revision, row.sceneHash, row.metadata, row.createdAt])]))
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.db.prepare('SELECT * FROM operations WHERE operation_id=?').get(operationId)
      if (previous) {
        if (previous.request_hash !== requestHash) throw new WorkspaceError('operation-conflict', 'Import operation input changed')
        this.db.exec('COMMIT')
        return { canvasId: previous.canvas_id, revision: previous.revision }
      }
      if (this.db.prepare('SELECT 1 FROM revisions WHERE canvas_id=? LIMIT 1').get(canvasId)) {
        throw new WorkspaceError('conflict', 'Canvas already exists; importing never overwrites it')
      }
      for (const row of rows) {
        this.writeScene(row.scene, row.sceneHash)
        this.db.prepare('INSERT INTO revisions VALUES (?, ?, ?, ?, ?)')
          .run(canvasId, row.revision, row.sceneHash, row.metadata, row.createdAt)
      }
      const revision = rows.length
      this.db.prepare('INSERT INTO heads VALUES (?, ?)').run(canvasId, revision)
      this.db.prepare('INSERT INTO operations VALUES (?, ?, ?, ?)').run(operationId, requestHash, canvasId, revision)
      this.db.exec('COMMIT')
      return { canvasId, revision }
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  save({ canvasId, operationId, expectedRevision, scene, metadata }) {
    requireId(canvasId); requireId(operationId)
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
        !(scene instanceof Uint8Array) || scene.length === 0 || scene.length > 256 * 1024 * 1024 ||
        !metadata || typeof metadata !== 'object' || Array.isArray(metadata) || metadata.formatVersion !== 1) {
      throw new WorkspaceError('invalid', 'Invalid canvas snapshot')
    }
    const metadataText = JSON.stringify(metadata)
    if (Buffer.byteLength(metadataText) > 1024 * 1024) throw new WorkspaceError('invalid', 'Metadata too large')
    const sceneHash = digest(scene)
    const requestHash = digest(JSON.stringify([canvasId, expectedRevision, sceneHash, metadataText]))
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.db.prepare('SELECT * FROM operations WHERE operation_id=?').get(operationId)
      if (previous) {
        if (previous.request_hash !== requestHash) throw new WorkspaceError('operation-conflict', 'Operation ID reused with different input')
        this.db.exec('COMMIT')
        return { canvasId: previous.canvas_id, revision: previous.revision }
      }
      const head = this.db.prepare('SELECT revision FROM heads WHERE canvas_id=?').get(canvasId)
      if ((head?.revision ?? 0) !== expectedRevision) throw new WorkspaceError('conflict', 'Canvas changed since it was loaded')
      this.writeScene(scene, sceneHash)
      const revision = expectedRevision + 1
      this.db.prepare('INSERT INTO revisions VALUES (?, ?, ?, ?, ?)')
        .run(canvasId, revision, sceneHash, metadataText, new Date().toISOString())
      this.db.prepare('INSERT INTO heads VALUES (?, ?) ON CONFLICT(canvas_id) DO UPDATE SET revision=excluded.revision')
        .run(canvasId, revision)
      this.db.prepare('INSERT INTO operations VALUES (?, ?, ?, ?)').run(operationId, requestHash, canvasId, revision)
      this.db.exec('COMMIT')
      return { canvasId, revision }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
