import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, lstatSync, statfsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Entity, WorkbenchEvent } from '../shared/contracts.js';
import type { StorageCapacity } from './storage.js';

import { AppError } from '../shared/app-error.ts';
export { AppError } from '../shared/app-error.ts';
export class Store {
  readonly db: DatabaseSync;
  private depth = 0;
  capacity?: StorageCapacity; private pendingBytes = 0;
  constructor(public path: string, options: {readOnly?:boolean} = {}) {
    if(options.readOnly){this.db=new DatabaseSync(path,{readOnly:true});this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');return;}
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT PRIMARY KEY,project_id TEXT,revision INTEGER NOT NULL,body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS entity_scope ON entities(kind,project_id);
      CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS run_stream_chunks ON events(json_extract(body,'$.runId'),json_extract(body,'$.data.messageId'),json_extract(body,'$.data.chunk')) WHERE json_extract(body,'$.type')='assistant.delta';
      CREATE INDEX IF NOT EXISTS run_tool_chunks ON events(json_extract(body,'$.runId'),json_extract(body,'$.data.messageId'),json_extract(body,'$.data.chunk')) WHERE json_extract(body,'$.type')='tool.delta';
      CREATE TABLE IF NOT EXISTS commands(key TEXT PRIMARY KEY,digest TEXT NOT NULL,result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS node_tokens(node_id TEXT PRIMARY KEY,hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS locks(name TEXT PRIMARY KEY,owner TEXT NOT NULL,until_ms INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT OR IGNORE INTO metadata VALUES('schema','1');`);
  }
  transaction<T>(fn: () => T): T {
    if (this.depth) return fn();
    const transaction = () => {
      this.reclaimWal();
      this.db.exec('BEGIN IMMEDIATE'); this.depth++; this.pendingBytes = 0;
      try { const result = fn(); this.db.exec('COMMIT'); return result; }
      catch (error) { try { this.db.exec('ROLLBACK'); } catch {} if (error instanceof Error && 'errcode' in error && Number(error.errcode) === 13) throw new AppError(507, '数据库容量已满，保留已有内容；请备份并调整容量'); throw error; }
      finally { this.depth--; this.pendingBytes = 0; }
    };
    return this.capacity ? this.capacity.exclusive(transaction) : transaction();
  }
  private reclaimWal() {
    if (!this.capacity) return;
    let wal;
    try { wal = lstatSync(`${this.path}-wal`); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
      throw new AppError(507, '无法读取数据库日志，暂停写入；请检查目录权限');
    }
    if (wal.isSymbolicLink() || !wal.isFile()) throw new AppError(507, '数据库日志路径异常，暂停写入；请检查数据目录');
    const threshold = Math.min(4 * 1024 ** 2, Math.max(32 * 1024, Math.floor(this.capacity.limits.databaseBytes / 4)));
    if (wal.size < threshold) return;
    // Checkpointing may extend the main file before truncating the WAL. Reserve
    // an upper bound for that copy without an extra full asset-directory walk.
    try {
      const disk = statfsSync(dirname(this.path));
      if (disk.bsize * disk.bavail < this.capacity.limits.minFreeBytes + wal.size + this.capacity.limits.controlReserveBytes) return;
    } catch { throw new AppError(507, '无法测量磁盘空间，暂停数据库写入'); }
    const timeout = Number(this.db.prepare('PRAGMA busy_timeout').get()!.timeout);
    try {
      // A pinned reader returns busy immediately. Never wait five seconds for
      // maintenance, delete WAL files, or run a checkpoint inside a transaction.
      this.db.exec('PRAGMA busy_timeout=0');
      this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    } catch (error) {
      const code = error instanceof Error && 'errcode' in error ? Number(error.errcode) & 255 : undefined;
      if (code !== 5 && code !== 6) throw new AppError(507, '数据库日志整理失败，暂停写入；请检查磁盘与权限');
    } finally { this.db.exec(`PRAGMA busy_timeout=${timeout}`); }
  }
  attachCapacity(capacity: StorageCapacity) {
    this.capacity = capacity;
    const pageSize = Number(this.db.prepare('PRAGMA page_size').get()!.page_size);
    // SQLite rejects file growth at this engine boundary, including raw SQL callers.
    this.db.exec(`PRAGMA max_page_count=${Math.max(1, Math.floor(capacity.limits.databaseBytes / pageSize))}; PRAGMA journal_size_limit=4194304;`);
  }
  guardDatabase<T>(bytes: number, fn: () => T, control = false): T {
    return this.transaction(() => {
      const estimate = bytes * 3 + 16 * 1024;
      this.capacity?.assert('database', this.pendingBytes + estimate, control);
      const result = fn(); this.pendingBytes += estimate; return result;
    });
  }
  create<T extends Entity>(kind: string, fields: Omit<T, keyof Entity> & Partial<Entity>): T {
    const now = new Date().toISOString();
    const value = { ...fields, id: fields.id ?? randomUUID(), revision: 1, createdAt: now, updatedAt: now } as T;
    this.guardDatabase(Buffer.byteLength(JSON.stringify(value)), () => this.db.prepare('INSERT INTO entities VALUES(?,?,?,?,?)').run(kind, value.id, value.projectId ?? null, 1, JSON.stringify(value)));
    return value;
  }
  get<T extends Entity>(kind: string, id: string): T {
    const row = this.db.prepare('SELECT body FROM entities WHERE kind=? AND id=?').get(kind, id);
    if (!row) throw new AppError(404, '对象不存在');
    return JSON.parse(String(row.body));
  }
  list<T extends Entity>(kind: string, projectId?: string): T[] {
    const rows = projectId === undefined ? this.db.prepare('SELECT body FROM entities WHERE kind=? ORDER BY rowid').all(kind) : this.db.prepare('SELECT body FROM entities WHERE kind=? AND project_id=? ORDER BY rowid').all(kind, projectId);
    return rows.map(row => JSON.parse(String(row.body)));
  }
  update<T extends Entity>(kind: string, id: string, revision: number, fields: Partial<T>): T {
    return this.transaction(() => {
      const current = this.get<T>(kind, id);
      if (current.revision !== revision) throw new AppError(409, '内容已被另一设备修改，请重新加载并合并');
      const next = { ...current, ...fields, id: current.id, projectId: current.projectId, revision: revision + 1, updatedAt: new Date().toISOString(), createdAt: current.createdAt };
      this.guardDatabase(Buffer.byteLength(JSON.stringify(next)), () => this.db.prepare('UPDATE entities SET revision=?,body=? WHERE id=? AND revision=?').run(next.revision, JSON.stringify(next), id, revision), ['run','task','operation','upload','node'].includes(kind) || (fields as { deleted?:boolean }).deleted === true || (fields as { active?:boolean }).active === false || (fields as { archived?:boolean }).archived === true || (fields as {revoked?:boolean}).revoked === true || (kind === 'asset' && (fields as { status?:string }).status === 'deleted'));
      return next;
    });
  }
  event(type: string, data: unknown, scope: { projectId?: string; runId?: string; revision?: number } = {}): WorkbenchEvent {
    const event = { eventId: randomUUID(), schemaVersion: 1, type, at: new Date().toISOString(), ...scope, data };
    const result = this.guardDatabase(Buffer.byteLength(JSON.stringify(event)), () => this.db.prepare('INSERT INTO events(id,body) VALUES(?,?)').run(event.eventId, JSON.stringify(event)), /^(run\.|budget\.|operation\.|memory\.(changed|revised)|asset\.deleted|project\.updated|node\.revoked)/.test(type));
    return { ...event, sequence: Number(result.lastInsertRowid) };
  }
  events(after: number, limit = 500): WorkbenchEvent[] {
    return this.db.prepare('SELECT sequence,body FROM events WHERE sequence>? ORDER BY sequence LIMIT ?').all(after, limit).map(row => ({ ...JSON.parse(String(row.body)), sequence: Number(row.sequence) }));
  }
  cursor() { return Number(this.db.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM events').get()!.n); }
  commandReceipt<T>(key: string, digest: string): { value: T } | undefined {
    const row = this.db.prepare('SELECT digest,result FROM commands WHERE key=?').get(key);
    if (!row) return undefined;
    if (row.digest !== digest) throw new AppError(409, '幂等键已经用于不同请求');
    return { value: JSON.parse(String(row.result)) as T };
  }
  command<T>(key: string, digest: string, fn: () => T): T {
    return this.transaction(() => {
      const row = this.db.prepare('SELECT digest,result FROM commands WHERE key=?').get(key);
      if (row) { if (row.digest !== digest) throw new AppError(409, '幂等键已经用于不同请求'); return JSON.parse(String(row.result)); }
      const value = fn(); this.guardDatabase(Buffer.byteLength(JSON.stringify(value)), () => this.db.prepare('INSERT INTO commands VALUES(?,?,?)').run(key, digest, JSON.stringify(value))); return value;
    });
  }
  lease(name: string, owner: string, duration: number) {
    return this.transaction(() => {
      const now = Date.now(); const row = this.db.prepare('SELECT * FROM locks WHERE name=?').get(name);
      if (row && row.owner !== owner && Number(row.until_ms) > now) return false;
      this.guardDatabase(256, () => this.db.prepare('INSERT INTO locks VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,until_ms=excluded.until_ms').run(name, owner, now + duration), true); return true;
    });
  }
  release(name: string, owner: string) { this.db.prepare('DELETE FROM locks WHERE name=? AND owner=?').run(name, owner); }
  close() { this.db.close(); }
}
