import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { WorkspaceError } from './workspace-store.mjs'
import { validateReferences } from './canvas-package.mjs'

function inspect(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) {
    throw new WorkspaceError('invalid', 'An absolute directory path is required')
  }
  const canonical = realpathSync.native(path)
  const info = statSync(canonical, { bigint: true })
  if (!info.isDirectory()) throw new WorkspaceError('invalid', 'Path is not a directory')
  if (info.ino === 0n) throw new WorkspaceError('invalid', 'Directory identity is unavailable')
  return { canonical, identity: `${info.dev}:${info.ino}`, birthtime: String(info.birthtimeNs) }
}

// Directory registration reserves one canvas ID. The editor will persist its initial
// scene under that ID; retries/restarts reuse it instead of creating another canvas.
export class MountStore {
  constructor(directory) {
    this.relinks = new Map()
    this.db = new DatabaseSync(join(directory, 'mounts.sqlite'))
    const version = this.db.prepare('PRAGMA user_version').get().user_version
    if (version !== 0 && version !== 1) {
      this.db.close(); throw new WorkspaceError('unsupported-version', 'Unsupported mount database')
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS mounts (
        id TEXT PRIMARY KEY, canvas_id TEXT UNIQUE NOT NULL,
        canonical TEXT UNIQUE NOT NULL, identity TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS mount_imports (operation_id TEXT PRIMARY KEY, request TEXT NOT NULL);
      PRAGMA user_version=1;`)
  }
  close() { this.db.close() }
  importReferences(operationId, references) {
    if (typeof operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
      throw new WorkspaceError('invalid', 'Invalid import operation')
    }
    validateReferences(references)
    const request = JSON.stringify(references.mounts)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.db.prepare('SELECT request FROM mount_imports WHERE operation_id=?').get(operationId)
      if (previous) {
        if (previous.request !== request) throw new WorkspaceError('operation-conflict', 'Imported directory input changed')
      } else {
        for (const mount of references.mounts) {
          if (this.db.prepare('SELECT 1 FROM mounts WHERE id=? OR canvas_id=? OR canonical=?')
            .get(mount.id, mount.canvasId, mount.path)) {
            throw new WorkspaceError('conflict', 'Imported directory conflicts with an existing registration')
          }
          // Imported paths are untrusted references, not proof of the original identity.
          // Existing relink preview/confirmation explicitly adopts a real directory.
          this.db.prepare('INSERT INTO mounts VALUES (?, ?, ?, ?)')
            .run(mount.id, mount.canvasId, mount.path, `import-pending:${mount.id}`)
        }
        this.db.prepare('INSERT INTO mount_imports VALUES (?, ?)').run(operationId, request)
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return references.mounts.map(mount => this.get(mount.id))
  }
  describe(row) {
    let availability = 'available'
    try {
      if (inspect(row.canonical).identity !== row.identity) availability = 'replaced'
    } catch (error) {
      availability = error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'offline' : 'unavailable'
    }
    return { id: row.id, canvasId: row.canvas_id, path: row.canonical, availability }
  }
  list() { return this.db.prepare('SELECT * FROM mounts ORDER BY rowid').all().map(row => this.describe(row)) }
  get(id) {
    const row = this.db.prepare('SELECT * FROM mounts WHERE id=?').get(id)
    if (!row) throw new WorkspaceError('not-found', 'Directory is not registered')
    return this.describe(row)
  }
  identity(id) {
    const row = this.db.prepare('SELECT identity FROM mounts WHERE id=?').get(id)
    if (!row) throw new WorkspaceError('not-found', 'Directory is not registered')
    return row.identity
  }
  findByIdentity(identity) {
    const row = this.db.prepare('SELECT * FROM mounts WHERE identity=?').get(identity)
    return row ? this.describe(row) : undefined
  }
  requireUnclaimed(directory, id) {
    const occupied = this.db.prepare('SELECT id FROM mounts WHERE (canonical=? OR identity=?) AND id<>?')
      .get(directory.canonical, directory.identity, id)
    if (occupied) throw new WorkspaceError('conflict', 'Target directory already belongs to another canvas; canvases are not merged')
  }
  previewRelink(id, path) {
    const row = this.db.prepare('SELECT * FROM mounts WHERE id=?').get(id)
    if (!row) throw new WorkspaceError('not-found', 'Directory is not registered')
    let target
    try { target = inspect(path) }
    catch { throw new WorkspaceError('invalid', 'Target directory is missing or inaccessible') }
    this.requireUnclaimed(target, id)
    const now = Date.now()
    for (const [key, value] of this.relinks) if (value.expires <= now) this.relinks.delete(key)
    if (this.relinks.size >= 256) this.relinks.delete(this.relinks.keys().next().value)
    const token = randomUUID()
    this.relinks.set(token, { row, target, expires: now + 300000, committed: false })
    return { token, mountId: id, canvasId: row.canvas_id, previousPath: row.canonical, path: target.canonical }
  }
  confirmRelink(id, token) {
    const expected = this.relinks.get(token)
    if (!expected || expected.row.id !== id || expected.expires <= Date.now()) {
      throw new WorkspaceError('conflict', 'Directory preview expired; inspect it again')
    }
    let target
    try { target = inspect(expected.target.canonical) }
    catch { throw new WorkspaceError('conflict', 'Target directory is no longer available') }
    if (target.identity !== expected.target.identity || target.birthtime !== expected.target.birthtime) {
      throw new WorkspaceError('conflict', 'Target directory changed after preview')
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.requireUnclaimed(target, id)
      const row = this.db.prepare('SELECT * FROM mounts WHERE id=?').get(id)
      if (!row) throw new WorkspaceError('not-found', 'Directory registration was removed')
      const already = row.canonical === target.canonical && row.identity === target.identity
      if (!already) {
        if (expected.committed || row.canonical !== expected.row.canonical || row.identity !== expected.row.identity) {
          throw new WorkspaceError('conflict', 'Directory association changed after preview')
        }
        this.db.prepare('UPDATE mounts SET canonical=?, identity=? WHERE id=?').run(target.canonical, target.identity, id)
      }
      this.db.exec('COMMIT')
      expected.committed = true
      return this.get(id)
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  add(path) {
    let directory
    try { directory = inspect(path) }
    catch (error) {
      if (error instanceof WorkspaceError) throw error
      throw new WorkspaceError('invalid', 'Directory is missing or inaccessible')
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const atPath = this.db.prepare('SELECT * FROM mounts WHERE canonical=?').get(directory.canonical)
      if (atPath && atPath.identity !== directory.identity) {
        throw new WorkspaceError('conflict', 'This path now points to another directory; retain the original association')
      }
      let row = this.db.prepare('SELECT * FROM mounts WHERE identity=?').get(directory.identity)
      if (row) {
        if (row.canonical !== directory.canonical) throw new WorkspaceError('conflict', 'Directory already belongs to another canvas; canvases are not merged')
      } else {
        row = { id: randomUUID(), canvas_id: randomUUID(), canonical: directory.canonical, identity: directory.identity }
        this.db.prepare('INSERT INTO mounts VALUES (?, ?, ?, ?)').run(row.id, row.canvas_id, row.canonical, row.identity)
      }
      this.db.exec('COMMIT')
      return this.describe(row)
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  /** Relocate an existing canvas only when the caller names that canvas. A new
   * identity is created only when no canvas is expected. Mismatches do not write. */
  adopt(path, expectedCanvasId) {
    let directory
    try { directory = inspect(path) }
    catch (error) {
      if (error instanceof WorkspaceError) throw error
      throw new WorkspaceError('invalid', 'Directory is missing or inaccessible')
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const atPath = this.db.prepare('SELECT * FROM mounts WHERE canonical=?').get(directory.canonical)
      if (atPath && atPath.identity !== directory.identity) {
        throw new WorkspaceError('conflict', 'This path now points to another directory; retain the original association')
      }
      let row = this.db.prepare('SELECT * FROM mounts WHERE identity=?').get(directory.identity)
      if (row) {
        if (row.canvas_id !== expectedCanvasId) throw new WorkspaceError('conflict', 'Directory already belongs to another canvas; canvases are not merged')
        if (row.canonical !== directory.canonical) {
          this.db.prepare('UPDATE mounts SET canonical=? WHERE id=?').run(directory.canonical, row.id)
          row = { ...row, canonical: directory.canonical }
        }
      } else if (expectedCanvasId) {
        throw new WorkspaceError('conflict', 'Folder registration changed before opening')
      } else {
        row = { id: randomUUID(), canvas_id: randomUUID(), canonical: directory.canonical, identity: directory.identity }
        this.db.prepare('INSERT INTO mounts VALUES (?, ?, ?, ?)').run(row.id, row.canvas_id, row.canonical, row.identity)
      }
      this.db.exec('COMMIT')
      return this.describe(row)
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
}
