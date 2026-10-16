import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { WorkspaceError } from './workspace-store.mjs'

const defaultLayout = () => ({ formatVersion: 1, panels: { layers: true, properties: true } })
function validate(layout) {
  if (layout?.formatVersion !== 1) throw new WorkspaceError('unsupported-version', 'Unsupported layout format')
  if (!layout.panels || typeof layout.panels.layers !== 'boolean' || typeof layout.panels.properties !== 'boolean') {
    throw new WorkspaceError('invalid', 'Invalid layout panels')
  }
}

export class LayoutStore {
  constructor(directory) {
    this.db = new DatabaseSync(join(directory, 'layout.sqlite'))
    const version = this.db.prepare('PRAGMA user_version').get().user_version
    if (version !== 0 && version !== 1) {
      this.db.close(); throw new WorkspaceError('unsupported-version', 'Unsupported layout database')
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS current_layout (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS layout_operations (id TEXT PRIMARY KEY, request TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS imported_layouts (id TEXT PRIMARY KEY, payload TEXT NOT NULL, applied INTEGER NOT NULL);
      PRAGMA user_version=1;`)
  }
  close() { this.db.close() }
  importPreset(operationId, layout) {
    if (typeof operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
      throw new WorkspaceError('invalid', 'Invalid layout import operation')
    }
    validate(layout)
    const payload = JSON.stringify(layout)
    if (Buffer.byteLength(payload) > 64 * 1024) throw new WorkspaceError('too-large', 'Layout too large')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.db.prepare('SELECT * FROM imported_layouts WHERE id=?').get(operationId)
      if (previous && previous.payload !== payload) throw new WorkspaceError('operation-conflict', 'Imported layout input changed')
      const applied = previous ? Boolean(previous.applied) : this.read().revision === 0
      if (!previous) {
        if (applied) this.db.prepare('INSERT INTO current_layout VALUES (1, 1, ?)').run(payload)
        this.db.prepare('INSERT INTO imported_layouts VALUES (?, ?, ?)').run(operationId, payload, Number(applied))
      }
      this.db.exec('COMMIT')
      return { applied, layout }
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  read() {
    const row = this.db.prepare('SELECT revision, payload FROM current_layout WHERE id=1').get()
    if (!row) return { revision: 0, layout: defaultLayout() }
    let layout
    try { layout = JSON.parse(row.payload) } catch { throw new WorkspaceError('corrupt', 'Layout data is corrupt') }
    validate(layout)
    return { revision: row.revision, layout }
  }
  save(input) {
    if (!input || typeof input.operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.operationId) ||
        !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new WorkspaceError('invalid', 'Invalid layout operation')
    }
    validate(input.layout)
    const request = JSON.stringify(input)
    if (Buffer.byteLength(request) > 64 * 1024) throw new WorkspaceError('too-large', 'Layout too large')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.db.prepare('SELECT * FROM layout_operations WHERE id=?').get(input.operationId)
      if (previous) {
        if (previous.request !== request) throw new WorkspaceError('operation-conflict', 'Layout operation input changed')
        this.db.exec('COMMIT'); return { revision: previous.revision }
      }
      const current = this.read()
      if (current.revision !== input.expectedRevision) throw new WorkspaceError('conflict', 'Layout changed in another window')
      const revision = current.revision + 1
      this.db.prepare('INSERT INTO current_layout VALUES(1, ?, ?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload')
        .run(revision, JSON.stringify(input.layout))
      this.db.prepare('INSERT INTO layout_operations VALUES(?, ?, ?)').run(input.operationId, request, revision)
      this.db.exec('COMMIT'); return { revision }
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
}
