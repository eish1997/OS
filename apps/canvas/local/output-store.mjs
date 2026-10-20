import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { openSync, closeSync, writeFileSync, fsyncSync, fstatSync, lstatSync, readFileSync, unlinkSync } from 'node:fs'
import { join, extname } from 'node:path'
import { WorkspaceError } from './workspace-store.mjs'
import { publishFileNoReplace } from './publish-file.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const identity = info => `${info.dev}:${info.ino}:${info.birthtimeNs}`
function inspect(path) {
  try { return lstatSync(path, { bigint: true }) }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}

// Durable intent precedes the filesystem side effect. A same-directory hard link
// publishes the flushed file without replacing an existing destination. The ready
// inode identifies a successful publication even if the journal update is interrupted.
export class OutputStore {
  constructor(directory, mounts) {
    this.mounts = mounts
    this.db = new DatabaseSync(join(directory, 'outputs.sqlite'))
    const version = this.db.prepare('PRAGMA user_version').get().user_version
    if (![0, 1, 2, 3].includes(version)) {
      this.db.close(); throw new WorkspaceError('unsupported-version', 'Unsupported output journal')
    }
    // Version 2 adds a terminal cancelled state. Version 1 readers must reject it,
    // rather than interpreting a cancelled ready file as another commit attempt.
    if (version > 0 && version < 3) this.db.prepare('VACUUM INTO ?').run(join(directory, `outputs-schema${version}-backup-${randomUUID()}.sqlite`))
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS outputs (
        id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, canvas_id TEXT NOT NULL,
        node_id TEXT NOT NULL, source_revision INTEGER NOT NULL, mount_id TEXT NOT NULL,
        mount_identity TEXT NOT NULL, directory TEXT NOT NULL, name TEXT NOT NULL,
        content_hash TEXT NOT NULL, content BLOB NOT NULL, state TEXT NOT NULL,
        temporary TEXT, file_identity TEXT);
      CREATE TABLE IF NOT EXISTS output_temporaries (
        name TEXT PRIMARY KEY, mount_id TEXT NOT NULL, directory TEXT NOT NULL, mount_identity TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS output_replacements (
        previous_id TEXT PRIMARY KEY, replacement_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL);
      `)
    // Add ownership before writing any bytes. Legacy orphan paths have no reliable
    // owner and remain untouched; only ready records can backfill their identity.
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const columns = this.db.prepare('PRAGMA table_info(output_temporaries)').all().map(row => row.name)
      if (!columns.includes('operation_id')) this.db.exec('ALTER TABLE output_temporaries ADD COLUMN operation_id TEXT')
      if (!columns.includes('file_identity')) this.db.exec('ALTER TABLE output_temporaries ADD COLUMN file_identity TEXT')
      this.db.exec(`UPDATE output_temporaries SET
        operation_id=(SELECT id FROM outputs WHERE temporary=output_temporaries.name
          AND directory=output_temporaries.directory AND mount_identity=output_temporaries.mount_identity),
        file_identity=(SELECT file_identity FROM outputs WHERE temporary=output_temporaries.name
          AND directory=output_temporaries.directory AND mount_identity=output_temporaries.mount_identity)
        WHERE operation_id IS NULL;
        PRAGMA user_version=3; COMMIT;`)
    } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error }
  }
  close() { this.db.close() }
  row(id) { return this.db.prepare('SELECT * FROM outputs WHERE id=?').get(id) }
  get(operationId) {
    const row = this.row(operationId)
    if (!row) throw new WorkspaceError('not-found', 'Output operation is not registered')
    return this.describe(row)
  }
  describe(row) {
    return { operationId: row.id, canvasId: row.canvas_id, nodeId: row.node_id,
      sourceRevision: row.source_revision, mountId: row.mount_id, path: row.name,
      contentHash: row.content_hash, state: row.state, fileIdentity: row.file_identity }
  }
  pending(canvasId) {
    return this.db.prepare("SELECT * FROM outputs WHERE canvas_id=? AND state<>'cancelled' ORDER BY rowid").all(canvasId)
      .map(row => this.describe(row))
  }
  requireUnpublished(row) {
    if (!row) throw new WorkspaceError('not-found', 'Output operation is not registered')
    if (row.state === 'committed' || row.state === 'cancelled') throw new WorkspaceError('conflict', 'Output operation has already finished')
    if (row.state === 'ready') {
      this.requireDirectory(row)
      const info = inspect(join(row.directory, row.name))
      if (info && identity(info) === row.file_identity) {
        throw new WorkspaceError('conflict', 'Output file already exists; finish its recovery instead of cancelling or renaming')
      }
    }
  }
  cancel(operationId) {
    const row = this.row(operationId)
    if (row?.state === 'cancelled') { this.cleanupFinished(row); return this.describe(row) }
    this.requireUnpublished(row)
    this.db.prepare("UPDATE outputs SET state='cancelled' WHERE id=?").run(operationId)
    this.cleanupFinished(this.row(operationId))
    return this.describe(this.row(operationId))
  }
  replacePending(operationId, { replacementId, name } = {}) {
    if (typeof replacementId !== 'string' || !uuid.test(replacementId) || typeof name !== 'string') {
      throw new WorkspaceError('invalid', 'Replacement operation and filename are required')
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const prior = this.db.prepare('SELECT * FROM output_replacements WHERE previous_id=?').get(operationId)
      if (prior) {
        if (prior.replacement_id !== replacementId || prior.name !== name) throw new WorkspaceError('conflict', 'Output already has a different replacement')
      } else {
        const row = this.row(operationId)
        this.requireUnpublished(row)
        this.requireDirectory(row)
        if (name === row.name || extname(name).toLowerCase() !== extname(row.name).toLowerCase()) {
          throw new WorkspaceError('invalid', 'Choose a different filename with the same extension')
        }
        if (this.row(replacementId)) throw new WorkspaceError('conflict', 'Replacement operation already exists')
        this.prepare({ operationId: replacementId, canvasId: row.canvas_id, nodeId: row.node_id,
          sourceRevision: row.source_revision, mountId: row.mount_id, name, content: row.content })
        this.db.prepare("UPDATE outputs SET state='cancelled' WHERE id=?").run(operationId)
        this.db.prepare('INSERT INTO output_replacements VALUES (?,?,?)').run(operationId, replacementId, name)
      }
      this.db.exec('COMMIT')
      this.cleanupFinished(this.row(operationId))
      return this.describe(this.row(replacementId))
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  temporaryNames(mountId) {
    const mount = this.mounts.get(mountId)
    const finished = this.db.prepare(`SELECT DISTINCT outputs.id FROM outputs JOIN output_temporaries
      ON outputs.id=output_temporaries.operation_id WHERE outputs.mount_id=? AND outputs.state IN ('committed','cancelled')`).all(mountId)
    for (const { id } of finished) this.cleanupFinished(this.row(id))
    return new Set(this.db.prepare('SELECT name FROM output_temporaries WHERE mount_id=? AND directory=? AND mount_identity=?')
      .all(mountId, mount.path, this.mounts.identity(mountId)).map(row => row.name))
  }
  origins(mountId, indexedFiles) {
    const mount = this.mounts.get(mountId)
    const rows = this.db.prepare(`SELECT * FROM outputs WHERE mount_id=? AND directory=?
      AND mount_identity=? AND state IN ('ready','committed') ORDER BY rowid`)
      .all(mountId, mount.path, this.mounts.identity(mountId))
    const counts = new Map()
    for (const file of indexedFiles) {
      if (file.availability === 'available') counts.set(file.identity, (counts.get(file.identity) ?? 0) + 1)
    }
    const result = new Map()
    for (const row of rows) {
      for (const file of indexedFiles) {
        if (file.kind !== 'file' || file.availability !== 'available' || file.identity !== row.file_identity) continue
        // An unambiguous rename retains the origin. Hard-link aliases do not all
        // acquire ownership of the same source node merely by sharing an inode.
        if (counts.get(file.identity) !== 1 && file.path !== row.name) continue
        result.set(file.id, { operationId: row.id, canvasId: row.canvas_id,
          nodeId: row.node_id, sourceRevision: row.source_revision,
          snapshotHash: row.content_hash,
          snapshotFormat: /\.(png|txt)$/i.exec(row.name)?.[1].toLowerCase() ?? 'unknown' })
      }
    }
    return result
  }
  prepare({ operationId, canvasId, nodeId, sourceRevision, mountId, name, content }) {
    if (![operationId, canvasId, nodeId, mountId].every(value => typeof value === 'string' && uuid.test(value)) ||
        !Number.isSafeInteger(sourceRevision) || sourceRevision < 1 ||
        typeof name !== 'string' || !name || name.length > 200 || /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
        /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ||
        name.startsWith('.os-canvas-output-') || !(content instanceof Uint8Array) || content.length > 256 * 1024 * 1024) {
      throw new WorkspaceError('invalid', 'Invalid output request')
    }
    const contentHash = hash(content)
    const requestHash = hash(JSON.stringify([canvasId, nodeId, sourceRevision, mountId, name, contentHash]))
    const previous = this.row(operationId)
    if (previous) {
      if (previous.request_hash !== requestHash) throw new WorkspaceError('conflict', 'Output operation was used for different content')
      return this.describe(previous)
    }
    const mount = this.mounts.get(mountId)
    if (mount.availability !== 'available') throw new WorkspaceError('conflict', 'Output directory is unavailable')
    if (inspect(join(mount.path, name))) throw new WorkspaceError('conflict', 'Output name already exists')
    this.db.prepare(`INSERT INTO outputs
      (id,request_hash,canvas_id,node_id,source_revision,mount_id,mount_identity,directory,name,content_hash,content,state)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'prepared')`).run(operationId, requestHash, canvasId, nodeId, sourceRevision,
      mountId, this.mounts.identity(mountId), mount.path, name, contentHash, content)
    return this.describe(this.row(operationId))
  }
  requireDirectory(row) {
    const mount = this.mounts.get(row.mount_id)
    if (mount.availability !== 'available' || mount.path !== row.directory || this.mounts.identity(row.mount_id) !== row.mount_identity) {
      throw new WorkspaceError('conflict', 'Output directory changed; original intent is retained')
    }
  }
  writeTemporary(row) {
    const temporary = `.os-canvas-output-${randomUUID()}.tmp`
    // An interruption before ready may leave an orphan temporary file. Never adopt
    // or truncate a file merely because its name matches an interrupted attempt.
    const path = join(row.directory, temporary)
    this.db.prepare('INSERT INTO output_temporaries (name,mount_id,directory,mount_identity,operation_id) VALUES (?,?,?,?,?)')
      .run(temporary, row.mount_id, row.directory, row.mount_identity, row.id)
    const fd = openSync(path, 'wx')
    try {
      const owned = fstatSync(fd, { bigint: true })
      if (owned.ino === 0n) throw new WorkspaceError('conflict', 'Temporary file has no reliable identity')
      this.db.prepare('UPDATE output_temporaries SET file_identity=? WHERE name=?')
        .run(identity(owned), temporary)
      writeFileSync(fd, row.content); fsyncSync(fd)
    } finally { closeSync(fd) }
    const info = inspect(path)
    if (!info?.isFile() || info.isSymbolicLink() || info.ino === 0n || hash(readFileSync(path)) !== row.content_hash) {
      throw new WorkspaceError('conflict', 'Output temporary file failed verification')
    }
    this.db.prepare("UPDATE outputs SET temporary=?, file_identity=?, state='ready' WHERE id=?")
      .run(temporary, identity(info), row.id)
    return this.row(row.id)
  }
  matches(path, row) {
    const info = inspect(path)
    return info?.isFile() && !info.isSymbolicLink() && identity(info) === row.file_identity && hash(readFileSync(path)) === row.content_hash
  }
  cleanupFinished(row) {
    // Never clean an active write. Cleanup failure does not change its terminal
    // result; directory scans and exact retries can attempt it again later.
    let records
    try {
      if (!['committed', 'cancelled'].includes(this.row(row.id)?.state)) return
      records = this.db.prepare('SELECT * FROM output_temporaries WHERE operation_id=?').all(row.id)
    } catch { return }
    for (const record of records) {
      try {
        this.requireDirectory(row)
        if (record.directory !== row.directory || record.mount_identity !== row.mount_identity) continue
        const path = join(record.directory, record.name), info = inspect(path)
        if (info && !record.file_identity) continue
        if (info?.isFile() && !info.isSymbolicLink() && identity(info) === record.file_identity && info.size <= BigInt(row.content.length)) {
          const bytes = readFileSync(path)
          // An interrupted write is a prefix of the saved snapshot. External
          // edits and same-name replacements are retained and made visible.
          const complete = row.temporary === record.name && row.file_identity === record.file_identity
          const unchanged = complete ? hash(bytes) === row.content_hash
            : bytes.equals(Buffer.from(row.content).subarray(0, bytes.length))
          if (unchanged) unlinkSync(path)
        }
        this.db.prepare('DELETE FROM output_temporaries WHERE name=? AND operation_id=?').run(record.name, row.id)
      } catch { /* keep the ownership record for a later scan or retry */ }
    }
  }
  commit(operationId) {
    let row = this.row(operationId)
    if (!row) throw new WorkspaceError('not-found', 'Output operation is not registered')
    if (row.state === 'committed') {
      this.cleanupFinished(row)
      return this.describe(row)
    }
    if (row.state === 'cancelled') throw new WorkspaceError('conflict', 'Output was cancelled; no file will be created')
    this.requireDirectory(row)
    if (row.state === 'prepared') row = this.writeTemporary(row)
    const target = join(row.directory, row.name), temporary = join(row.directory, row.temporary)
    if (inspect(target)) {
      if (!this.matches(target, row)) throw new WorkspaceError('conflict', 'Output name is occupied by another file or changed content')
    } else {
      if (!this.matches(temporary, row)) throw new WorkspaceError('conflict', 'Output temporary file changed or disappeared')
      this.requireDirectory(row)
      try { publishFileNoReplace(temporary, target) }
      catch (error) {
        if (error.code === 'EEXIST') throw new WorkspaceError('conflict', 'Output name was taken before publication')
        if (['ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'].includes(error.code)) {
          throw new WorkspaceError('unsupported-filesystem', 'Directory does not support safe publication; original snapshot is retained')
        }
        throw error
      }
    }
    this.requireDirectory(row)
    if (!this.matches(target, row)) throw new WorkspaceError('conflict', 'Published output changed before confirmation')
    this.db.prepare("UPDATE outputs SET state='committed' WHERE id=?").run(operationId)
    // Cleanup cannot turn a confirmed publication into an apparent failed operation.
    this.cleanupFinished(row)
    return this.describe(this.row(operationId))
  }
}
