import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { readdir, lstat } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { lstatSync } from 'node:fs'
import { WorkspaceError } from './workspace-store.mjs'
import { validateReferences } from './canvas-package.mjs'

const countByIdentity = items => {
  const result = new Map()
  for (const item of items) if (item.identity) result.set(item.identity, (result.get(item.identity) ?? 0) + 1)
  return result
}

export class FileIndex {
  constructor(directory, mounts, { ignoredNames = () => new Set(), outputOrigins = () => new Map() } = {}) {
    this.mounts = mounts
    this.ignoredNames = ignoredNames
    this.outputOrigins = outputOrigins
    this.running = new Map()
    this.replacements = new Map()
    this.db = new DatabaseSync(join(directory, 'files.sqlite'))
    const version = this.db.prepare('PRAGMA user_version').get().user_version
    if (version !== 0 && version !== 1) {
      this.db.close(); throw new WorkspaceError('unsupported-version', 'Unsupported file index database')
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY, mount_id TEXT NOT NULL, path TEXT NOT NULL, kind TEXT NOT NULL,
        identity TEXT, signature TEXT NOT NULL, size TEXT NOT NULL, revision INTEGER NOT NULL,
        availability TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS files_mount ON files(mount_id);
      CREATE TABLE IF NOT EXISTS file_imports (operation_id TEXT PRIMARY KEY, request TEXT NOT NULL);
      PRAGMA user_version=1;`)
  }
  async close() { await Promise.allSettled(this.running.values()); this.db.close() }
  importReferences(operationId, references) {
    if (typeof operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
      throw new WorkspaceError('invalid', 'Invalid import operation')
    }
    validateReferences(references)
    const request = JSON.stringify(references.files)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.db.prepare('SELECT request FROM file_imports WHERE operation_id=?').get(operationId)
      if (previous) {
        if (previous.request !== request) throw new WorkspaceError('operation-conflict', 'Imported file input changed')
      } else {
        for (const file of references.files) {
          this.mounts.get(file.mountId)
          if (this.db.prepare('SELECT 1 FROM files WHERE id=? OR (mount_id=? AND path=?)').get(file.id, file.mountId, file.path)) {
            throw new WorkspaceError('conflict', 'Imported file conflicts with an existing reference')
          }
          // No portable file-system identity: scanning may report a replacement,
          // but only explicit confirmation can adopt it under the preserved ID.
          this.db.prepare('INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(file.id, file.mountId, file.path, file.kind, null, '', file.size, file.revision, 'missing')
        }
        this.db.prepare('INSERT INTO file_imports VALUES (?, ?)').run(operationId, request)
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  list(mountId) {
    const mount = this.mounts.get(mountId)
    const rows = this.db.prepare('SELECT * FROM files WHERE mount_id=? ORDER BY path,id').all(mountId)
    const origins = this.outputOrigins(mountId, rows)
    const entries = rows.map(row => ({ id: row.id, mountId: row.mount_id, path: row.path, kind: row.kind,
      size: row.size, revision: row.revision, availability: row.availability,
      ...(origins.has(row.id) ? { outputOrigin: origins.get(row.id) } : {}) }))
    return { mount, entries }
  }
  scan(mountId) {
    const active = this.running.get(mountId)
    if (active) return active
    const task = this.scanOnce(mountId).finally(() => this.running.delete(mountId))
    this.running.set(mountId, task)
    return task
  }
  async openChild(mountId, assetId) {
    await this.scan(mountId)
    const mount = this.mounts.get(mountId)
    const row = this.db.prepare('SELECT * FROM files WHERE id=? AND mount_id=?').get(assetId, mountId)
    if (!row) throw new WorkspaceError('not-found', 'Directory asset is not indexed in this canvas')
    if (mount.availability !== 'available' || row.availability !== 'available' || row.kind !== 'directory') {
      throw new WorkspaceError('conflict', 'Folder is unavailable or changed; refresh its association first')
    }
    if (!row.identity || basename(row.path) !== row.path || row.path === '.' || row.path === '..') {
      throw new WorkspaceError('invalid', 'A direct child directory with stable identity is required')
    }
    const path = join(mount.path, row.path)
    let info
    try { info = lstatSync(path, { bigint: true }) }
    catch { throw new WorkspaceError('conflict', 'Folder disappeared before opening') }
    if (info.isSymbolicLink() || !info.isDirectory() || `${info.dev}:${info.ino}:${info.birthtimeNs}` !== row.identity) {
      throw new WorkspaceError('conflict', 'Folder changed before opening')
    }
    return this.mounts.add(path)
  }
  replacementTarget(mountId, assetId) {
    const mount = this.mounts.get(mountId)
    const row = this.db.prepare('SELECT * FROM files WHERE id=? AND mount_id=?').get(assetId, mountId)
    if (!row) throw new WorkspaceError('not-found', 'Asset is not indexed in this canvas')
    if (mount.availability !== 'available' || basename(row.path) !== row.path || row.path === '.' || row.path === '..') {
      throw new WorkspaceError('conflict', 'Original directory is unavailable')
    }
    let info
    try { info = lstatSync(join(mount.path, row.path), { bigint: true }) }
    catch { throw new WorkspaceError('conflict', 'Replacement is missing or inaccessible') }
    const kind = info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other'
    if (info.isSymbolicLink() || info.ino === 0n || kind !== row.kind || kind === 'other') {
      throw new WorkspaceError('conflict', 'Replacement requires a file or directory of the same kind with reliable identity')
    }
    return { mount, row, identity: `${info.dev}:${info.ino}:${info.birthtimeNs}`,
      signature: `${info.size}:${info.mtimeNs}:${info.ctimeNs}`, size: String(info.size) }
  }
  async prepareReplacement(mountId, assetId) {
    await this.scan(mountId)
    const candidate = this.replacementTarget(mountId, assetId)
    if (candidate.row.availability !== 'replaced') throw new WorkspaceError('conflict', 'Asset does not require replacement confirmation')
    const now = Date.now()
    for (const [token, value] of this.replacements) if (value.expires <= now) this.replacements.delete(token)
    if (this.replacements.size >= 256) this.replacements.delete(this.replacements.keys().next().value)
    const token = randomUUID()
    let childRelink
    if (candidate.row.kind === 'directory' && candidate.row.identity) {
      const original = this.mounts.findByIdentity(candidate.row.identity.split(':').slice(0, 2).join(':'))
      if (original) childRelink = this.mounts.previewRelink(original.id, join(candidate.mount.path, candidate.row.path))
    }
    this.replacements.set(token, { ...candidate, childRelink, expires: now + 300000 })
    return { token, mountId, assetId, path: join(candidate.mount.path, candidate.row.path),
      kind: candidate.row.kind, size: candidate.size, revision: candidate.row.revision }
  }
  async confirmReplacement(mountId, assetId, token) {
    const expected = this.replacements.get(token)
    if (!expected || expected.expires <= Date.now() || expected.mount.id !== mountId || expected.row.id !== assetId) {
      throw new WorkspaceError('conflict', 'Confirmation expired; inspect the replacement again')
    }
    await this.scan(mountId)
    const current = this.replacementTarget(mountId, assetId)
    if (current.mount.path !== expected.mount.path || current.row.path !== expected.row.path ||
        current.identity !== expected.identity || current.signature !== expected.signature) {
      throw new WorkspaceError('conflict', 'Replacement changed after preview; inspect it again')
    }
    // Exact retries after a lost response return the committed observation.
    const alreadyCommitted = current.row.identity === expected.identity &&
      current.row.revision === expected.row.revision + 1 && current.row.availability === 'available'
    if (!alreadyCommitted) {
      if (current.row.revision !== expected.row.revision || current.row.availability !== 'replaced') {
        throw new WorkspaceError('conflict', 'Asset changed after preview; inspect it again')
      }
      // Preserve an existing child canvas before publishing the parent link.
      // If the second write fails, the parent stays 'replaced'; retry or a fresh
      // preview can finish without creating another child canvas.
      if (expected.childRelink) this.mounts.confirmRelink(expected.childRelink.mountId, expected.childRelink.token)
      this.db.prepare(`UPDATE files SET identity=?, signature=?, size=?, revision=revision+1,
        availability='available' WHERE id=? AND mount_id=?`).run(current.identity, current.signature, current.size, assetId, mountId)
    }
    return this.list(mountId).entries.find(entry => entry.id === assetId)
  }
  async scanOnce(mountId) {
    const mount = this.mounts.get(mountId)
    const mountIdentity = this.mounts.identity(mountId)
    if (mount.availability !== 'available') return { ...this.list(mountId), scanStatus: mount.availability }
    const observed = []
    try {
      const discovered = await readdir(mount.path)
      const ignored = this.ignoredNames(mountId)
      const names = discovered.filter(name => !ignored.has(name))
      // Enumerate only immediate children. Never recurse into directories or follow links.
      for (let offset = 0; offset < names.length; offset += 64) {
        const batch = await Promise.all(names.slice(offset, offset + 64).map(async path => {
          const info = await lstat(join(mount.path, path), { bigint: true })
          const kind = info.isSymbolicLink() ? 'link' : info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other'
          return { path, kind, identity: info.ino === 0n ? null : `${info.dev}:${info.ino}:${info.birthtimeNs}`,
            signature: `${info.size}:${info.mtimeNs}:${info.ctimeNs}`, size: String(info.size) }
        }))
        observed.push(...batch)
      }
    } catch {
      // A partial enumeration must never manufacture removals.
      return { ...this.list(mountId), scanStatus: 'incomplete' }
    }
    const after = this.mounts.get(mountId)
    if (after.availability !== 'available' || after.path !== mount.path || this.mounts.identity(mountId) !== mountIdentity) {
      return { ...this.list(mountId), scanStatus: 'changed' }
    }
    const previous = this.db.prepare('SELECT * FROM files WHERE mount_id=?').all(mountId)
    const oldCounts = countByIdentity(previous), newCounts = countByIdentity(observed)
    const used = new Set(), assigned = new Map()
    const byPath = new Map(previous.map(row => [row.path, row]))
    const byIdentity = new Map(previous.filter(row => row.identity).map(row => [row.identity, row]))
    for (const item of observed) {
      const row = byPath.get(item.path)
      if (row && row.identity && row.identity === item.identity && row.kind === item.kind) {
        assigned.set(item, row); used.add(row.id)
      }
    }
    for (const item of observed) {
      if (assigned.has(item) || !item.identity || oldCounts.get(item.identity) !== 1 || newCounts.get(item.identity) !== 1) continue
      const row = byIdentity.get(item.identity)
      if (row && !used.has(row.id) && row.kind === item.kind) { assigned.set(item, row); used.add(row.id) }
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const item of observed) {
        const row = assigned.get(item)
        if (!row) {
          const atPath = byPath.get(item.path)
          if (atPath && !used.has(atPath.id)) {
            used.add(atPath.id)
            if (atPath.availability !== 'replaced') this.db.prepare('UPDATE files SET availability=?, revision=revision+1 WHERE id=?').run('replaced', atPath.id)
            continue
          }
        }
        const changed = row && (row.path !== item.path || row.signature !== item.signature || row.availability !== 'available')
        const id = row?.id ?? randomUUID()
        used.add(id)
        this.db.prepare(`INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET path=excluded.path, signature=excluded.signature,
            size=excluded.size, revision=excluded.revision, availability=excluded.availability`)
          .run(id, mountId, item.path, item.kind, item.identity, item.signature, item.size,
            row ? row.revision + Number(Boolean(changed)) : 1, 'available')
      }
      for (const row of previous) if (!used.has(row.id) && row.availability !== 'missing') {
        this.db.prepare('UPDATE files SET availability=?, revision=revision+1 WHERE id=?').run('missing', row.id)
      }
      this.db.exec('COMMIT')
      return { ...this.list(mountId), scanStatus: 'complete' }
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
}
