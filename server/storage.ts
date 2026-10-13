import { existsSync, lstatSync, readdirSync, statfsSync, mkdirSync, openSync, closeSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { AppError } from './store.js';
export type StorageGroup = 'database' | 'assets' | 'uploads' | 'sessions' | 'workspaces' | 'logs';
// Independent bounds for one prospective write phase, not separate writes.
export interface StorageCheck { group?:StorageGroup; growth:number; totalGrowth?:number; control?:boolean }
export interface StorageLimits {
  totalBytes: number; databaseBytes: number; assetsBytes: number; uploadsBytes: number; sessionsBytes: number; workspacesBytes: number; logsBytes: number; minFreeBytes: number; controlReserveBytes: number;
}
export const defaultStorageLimits: StorageLimits = { totalBytes: 2 * 1024 ** 3, databaseBytes: 768 * 1024 ** 2, assetsBytes: 500 * 1024 ** 2, uploadsBytes: 20 * 1024 ** 2, sessionsBytes: 128 * 1024 ** 2, workspacesBytes: 64 * 1024 ** 2, logsBytes: 4 * 1024 ** 2, minFreeBytes: 64 * 1024 ** 2, controlReserveBytes: 4 * 1024 ** 2 };

// Read-only measurement; skip links rather than walking outside the data root.
export function storageUsage(dataDir: string, assetQuotaBytes: number) {
  const issues: string[] = [];
  const empty=()=>({bytes:0,files:0});
  const groups={database:empty(),assets:empty(),uploads:empty(),sessions:empty(),workspaces:empty(),logs:empty()};
  const groupFor=(name:string):StorageGroup|undefined=>{
    const key=process.platform==='win32'?name.toLowerCase():name;
    if(['workbench.sqlite','workbench.sqlite-wal','workbench.sqlite-shm'].includes(key))return 'database';
    return ['assets','uploads','sessions','workspaces','logs'].includes(key)?key as StorageGroup:undefined;
  };
  const measure = (path: string, label: string, group?:StorageGroup,root=false): { bytes: number; files: number } => {
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) { issues.push(`${label}: link skipped`); return { bytes: 0, files: 0 }; }
      if (stat.isFile()){if(group){groups[group].bytes+=stat.size;groups[group].files++;}return {bytes:stat.size,files:1};}
      if (!stat.isDirectory()) return { bytes: 0, files: 0 };
      return readdirSync(path).reduce((sum,name)=>{const selected=root?groupFor(name):group;const child=measure(join(path,name),selected??label,selected);return {bytes:sum.bytes+child.bytes,files:sum.files+child.files};},empty());
    } catch(error) { if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))issues.push(`${label}: unavailable`);return {bytes:0,files:0}; }
  };
  // Derive every group and the whole-root total in the same fresh walk. No
  // cached counter can overlook another process or an unclassified root file.
  const total = measure(dataDir, 'data',undefined,true);
  let disk: { totalBytes: number; availableBytes: number } | null = null;
  try { const stat = statfsSync(dataDir); disk = { totalBytes: stat.bsize * stat.blocks, availableBytes: stat.bsize * stat.bavail }; } catch { issues.push('disk: unavailable'); }
  return { at: new Date().toISOString(), groups, measuredBytes: total.bytes, assetQuotaBytes, assetQuotaUsedBytes: groups.assets.bytes, disk, issues: [...new Set(issues)], scope: 'whole data directory; external backups/runtime launcher logs excluded; credentials measured by size only', automaticCleanup: false };
}

// Serializes controlled synchronous writes across the host and native Pi session writer.
// It is an admission boundary, not a substitute for a deployment filesystem quota.
export class StorageCapacity {
  readonly limits: StorageLimits; private depth = 0; private lockPath: string;
  constructor(public readonly dataDir: string, overrides: Partial<StorageLimits> = {}, private readonly lockWaitMs = 0) {
    if(!Number.isSafeInteger(lockWaitMs)||lockWaitMs<0||lockWaitMs>1000)throw new AppError(400,'存储锁等待须为0至1000毫秒');
    this.limits = { ...defaultStorageLimits, ...overrides };
    for (const [key, value] of Object.entries(this.limits)) if (!Number.isSafeInteger(value) || value < 0 || (key !== 'minFreeBytes' && key !== 'controlReserveBytes' && value === 0)) throw new AppError(400, '存储上限须为有效字节数');
    if (this.limits.controlReserveBytes >= Math.min(this.limits.totalBytes, this.limits.databaseBytes)) throw new AppError(400, '恢复预留须小于整体及数据库上限');
    mkdirSync(dataDir, { recursive: true }); this.lockPath = join(dataDir, '.storage-write.lock');
  }
  usage() {
    const usage = storageUsage(this.dataDir, this.limits.assetsBytes);
    return { ...usage, limits: this.limits, overLimits: (Object.keys(usage.groups) as StorageGroup[]).filter(group => usage.groups[group].bytes >= this.limits[`${group}Bytes`]), totalOverLimit: usage.measuredBytes >= this.limits.totalBytes, enforcement: 'controlled-write admission and SQLite main-file page limit; external filesystem changes require deployment quota' };
  }
  assert(group: StorageGroup | undefined, growth: number, control = false, totalGrowth = growth) {
    this.assertAll([{group,growth,control,totalGrowth}]);
  }
  assertAll(checks:readonly StorageCheck[]) {
    if(!Array.isArray(checks)||!checks.length)throw new AppError(400,'写入大小无效');
    for(const check of checks as readonly StorageCheck[]){const totalGrowth=check.totalGrowth??check.growth;if(!Number.isSafeInteger(check.growth)||check.growth<0||!Number.isSafeInteger(totalGrowth)||totalGrowth<check.growth)throw new AppError(400,'写入大小无效');}
    // One new real measurement for simultaneous pre-write constraints. Never
    // retained across writes, staged files, SQL changes, or transactions.
    const usage = this.usage();
    if (usage.issues.length || !usage.disk) throw new AppError(507, '无法完整测量存储，暂停新增写入；检查目录与磁盘权限');
    for(const {group,growth,control=false,totalGrowth=growth} of checks as readonly StorageCheck[]){
      const reserve = control ? 0 : this.limits.controlReserveBytes;
      if (usage.measuredBytes + totalGrowth > this.limits.totalBytes - reserve || (group && usage.groups[group].bytes + growth > this.limits[`${group}Bytes`] - (group === 'database' ? reserve : 0))) throw new AppError(507, `存储已达${group === 'database' ? '数据库' : group ?? '整体'}写入上限；导出/归档后按保留规则清理或调整配额`);
      if (usage.disk.availableBytes < this.limits.minFreeBytes + totalGrowth + reserve) throw new AppError(507, '磁盘可用空间不足，暂停新增写入；请释放空间');
    }
    return usage;
  }
  exclusive<T>(fn: () => T, lockWaitMs=this.lockWaitMs): T {
    if(!Number.isSafeInteger(lockWaitMs)||lockWaitMs<0||lockWaitMs>1000)throw new AppError(400,'存储锁等待须为0至1000毫秒');
    const deadline=Date.now()+lockWaitMs;
    const wait=new Int32Array(new SharedArrayBuffer(4));
    while(true) {
      let entered=false;
      try{return this.withLock(()=>{entered=true;return fn();});}
      catch(error) {
        // Retry lock acquisition only: never repeat a callback or reclaim a live writer.
        if(entered || !(error instanceof AppError) || error.status!==423 || error.message!=='其他进程正在写入，稍后重试' || Date.now()>=deadline)throw error;
        Atomics.wait(wait,0,0,Math.min(10,deadline-Date.now()));
      }
    }
  }
  async exclusiveAsync<T>(fn: () => T, lockWaitMs=this.lockWaitMs): Promise<T> {
    if(!Number.isSafeInteger(lockWaitMs)||lockWaitMs<0||lockWaitMs>1000)throw new AppError(400,'存储锁等待须为0至1000毫秒');
    const deadline=Date.now()+lockWaitMs;
    while(true) {
      let entered=false;
      // The callback is synchronous. Yield only while acquiring the gate, so
      // reads and scheduler heartbeats remain responsive during contention.
      try{return this.withLock(()=>{entered=true;return fn();});}
      catch(error) {
        if(entered || !(error instanceof AppError) || error.status!==423 || error.message!=='其他进程正在写入，稍后重试' || Date.now()>=deadline)throw error;
        await delay(Math.min(10,deadline-Date.now()));
      }
    }
  }
  private withLock<T>(fn: () => T): T {
    if (this.depth) return fn();
    if (lstatSync(this.dataDir).isSymbolicLink()) throw new AppError(507, '数据根目录不能为符号链接');
    if (lstatSafe(this.lockPath)?.isSymbolicLink()) throw new AppError(507, '存储锁路径异常，需要人工检查');
    if (existsSync(this.lockPath)) {
      let owner: { pid: number; instance: string };
      try { owner = JSON.parse(readFileSync(this.lockPath, 'utf8')); if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.instance !== 'string') throw new Error(); }
      catch(error) {
        // The previous writer may release between existsSync and readFileSync.
        // Retry acquisition within the caller's bound; never reclaim malformed locks.
        if(error instanceof Error&&'code' in error&&error.code==='ENOENT')throw new AppError(423,'其他进程正在写入，稍后重试');
        throw new AppError(423, '存储写入锁不完整，先核对原进程后处理');
      }
      try { process.kill(owner.pid, 0); throw new AppError(423, '其他进程正在写入，稍后重试'); }
      catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
        // A second exclusive recovery gate prevents two reclaimers deleting a new writer's lock.
        const recovery = join(this.dataDir, '.storage-recovery.lock'); let recoveryFd: number;
        try { recoveryFd = openSync(recovery, 'wx', 0o600); } catch { throw new AppError(423, '存储锁正在恢复；若持续存在请核对恢复进程'); }
        try {
          writeFileSync(recoveryFd, JSON.stringify({ pid: process.pid }));
          if (existsSync(this.lockPath)) {
            const fresh = readFileSync(this.lockPath, 'utf8');
            if (fresh !== JSON.stringify(owner)) throw new AppError(423, '存储锁归属已改变，稍后重试');
            try { process.kill(owner.pid, 0); throw new AppError(423, '原写入进程仍存在，需要核对'); }
            catch (check) { if (!(check instanceof Error && 'code' in check && check.code === 'ESRCH')) throw check; unlinkSync(this.lockPath); }
          }
        } finally { closeSync(recoveryFd); unlinkSync(recovery); }
      }
    }
    let fd: number;
    try { fd = openSync(this.lockPath, 'wx', 0o600); } catch { throw new AppError(423, '其他进程正在写入，稍后重试'); }
    const instance = randomUUID();
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid, instance })); this.depth++; return fn(); }
    finally { this.depth = 0; closeSync(fd); /* Only the file exclusively created by this writer. */ unlinkSync(this.lockPath); }
  }
  write<T>(group: StorageGroup | undefined, growth: number, fn: () => T, control = false): T { return this.exclusive(() => { this.assert(group, growth, control); return fn(); }); }
}
function lstatSafe(path: string) { try { return lstatSync(path); } catch { return undefined; } }
