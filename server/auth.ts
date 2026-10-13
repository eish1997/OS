import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { AppError, Store } from './store.js';
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export class Auth {
  private passwordRecord?: { salt: string; hash: string };
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(private store: Store, dataDir: string, password: string) {
    const path = join(dataDir, 'credentials.json');
    if (existsSync(path)) this.passwordRecord = JSON.parse(readFileSync(path, 'utf8'));
    else if (password) { const salt = randomBytes(16).toString('hex'); this.passwordRecord = { salt, hash: scryptSync(password, salt, 64).toString('hex') }; const save = () => writeFileSync(path, JSON.stringify(this.passwordRecord), { mode: 0o600 }); if (store.capacity) store.capacity.write('database', 512, save, true); else save(); }
  }
  configured() { return Boolean(this.passwordRecord); }
  login(password: string, address: string) {
    const failed = this.attempts.get(address);
    if (failed && failed.until > Date.now() && failed.count >= 8) throw new AppError(429, '尝试过多，请稍后再试');
    if (!this.passwordRecord) throw new AppError(503, '请先在 .env 设置 WORKBENCH_PASSWORD 并重启服务');
    const input = scryptSync(password, this.passwordRecord.salt, 64);
    if (!timingSafeEqual(input, Buffer.from(this.passwordRecord.hash, 'hex'))) {
      this.attempts.set(address, { count: failed && failed.until > Date.now() ? failed.count + 1 : 1, until: Date.now() + 60_000 });
      throw new AppError(401, '密码不正确');
    }
    this.attempts.delete(address); const token = randomBytes(32).toString('hex');
    if (Number(this.store.db.prepare('SELECT COUNT(*) n FROM sessions WHERE expires>?').get(Date.now())!.n) >= 32) throw new AppError(429, '登录设备会话达到32个，请在已登录设备撤销不用的会话');
    this.store.guardDatabase(256, () => this.store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hashToken(token), Date.now() + 7 * 86400_000, Date.now()), true);
    return token;
  }
  token(req: IncomingMessage) { return (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('wb_session='))?.slice(11); }
  require(req: IncomingMessage) {
    const token = this.token(req);
    const row = token && this.store.db.prepare('SELECT expires FROM sessions WHERE hash=?').get(hashToken(token));
    if (!row || Number(row.expires) <= Date.now()) throw new AppError(401, '请登录工作台'); return hashToken(token!);
  }
  valid(hash: string) { const row = this.store.db.prepare('SELECT expires FROM sessions WHERE hash=?').get(hash); return Boolean(row && Number(row.expires) > Date.now()); }
  revoke(hash: string) { this.store.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash); }
}
