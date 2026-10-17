import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, lstatSync } from 'node:fs';
import { join, relative, resolve, dirname, win32, posix } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Store, AppError } from './store.js';
import type { Asset, Run } from '../shared/contracts.js';
function safePath(path:string){for(let p=resolve(path);;p=dirname(p)){if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw new AppError(400,'备份路径包含链接');if(dirname(p)===p)break;}}
function files(root: string, path = root): string[] { safePath(path);return readdirSync(path).flatMap(name => { const child = join(path, name);safePath(child); if (statSync(child).isDirectory()) return files(root, child); return [relative(root, child).replaceAll('\\', '/')]; }); }
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const canvasSqlite=new Set(['workspace.sqlite','mounts.sqlite','files.sqlite','outputs.sqlite','package-imports.sqlite','layout.sqlite']);
function allowedBackupPath(path:string,schema:number){
  if(path==='workbench.sqlite'||/^assets\/[a-zA-Z0-9-]+$/.test(path)||/^sessions\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.jsonl$/.test(path))return true;
  if(schema<2)return false;
  return /^canvas\/(?:workspace|mounts|files|outputs|package-imports|layout)\.sqlite$/.test(path)||/^canvas\/scenes\/[a-f0-9]{64}\.fig$/.test(path);
}
/** Snapshot managed canvas DBs with VACUUM INTO; skip runtime locks and WAL siblings. */
function backupCanvas(dataDir:string,target:string){
  const source=join(dataDir,'canvas');
  if(!existsSync(source))return false;
  safePath(source);
  const out=join(target,'canvas');
  mkdirSync(out,{recursive:true});
  for(const name of readdirSync(source)){
    if(name==='service-owner.sqlite'||name.endsWith('-wal')||name.endsWith('-shm')||!canvasSqlite.has(name))continue;
    const from=join(source,name),to=join(out,name);safePath(from);
    try{
      const db=new DatabaseSync(from,{readOnly:true});
      try{db.exec(`VACUUM INTO '${to.replaceAll("'", "''")}'`);}finally{db.close();}
    }catch{throw new AppError(409,'画板数据库正在写入，请稍后备份');}
  }
  const scenes=join(source,'scenes');
  if(existsSync(scenes)){
    mkdirSync(join(out,'scenes'),{recursive:true});
    for(const name of readdirSync(scenes)){
      if(!/^[a-f0-9]{64}\.fig$/.test(name))continue;
      const from=join(scenes,name);safePath(from);cpSync(from,join(out,'scenes',name));
    }
  }
  return true;
}
// Interpret saved addresses using the source OS, never the restoring host's
// path rules. Return a portable relative address only after containment checks.
export function backupRelativePath(sourceRoot: string, value?: string): string | undefined {
  if(typeof value!=='string'||value.includes('\0')||sourceRoot.includes('\0'))return;
  const windows=/^[a-z]:[\\/]|^\\\\/i.test(sourceRoot),paths=windows?win32:posix;
  if(!paths.isAbsolute(sourceRoot)||!paths.isAbsolute(value))return;
  if(windows&&!/^[a-z]:[\\/]|^\\\\/i.test(value))return;
  const child=paths.relative(sourceRoot,value);
  if(paths.isAbsolute(child)||child==='..'||child.startsWith('..'+paths.sep)||(!windows&&child.includes('\\')))return;
  return windows?child.replaceAll('\\','/'):child;
}
export function backup(store: Store, dataDir: string, destination: string, leaseOwner?: string) {
  const target = resolve(destination); if (existsSync(target)) throw new AppError(409, '备份目录必须是新目录');
  safePath(dataDir);safePath(target);
  if (target === resolve(dataDir) || target.startsWith(resolve(dataDir) + (process.platform === 'win32' ? '\\' : '/'))) throw new AppError(400, '备份不能放在数据目录中');
  const owner = leaseOwner ?? `backup-${randomUUID()}`;
  if(leaseOwner){const current=store.db.prepare("SELECT owner,until_ms FROM locks WHERE name='scheduler'").get();if(current?.owner!==leaseOwner||Number(current.until_ms)<=Date.now())throw new AppError(409,'调用方的备份租约已失效');}
  else if (!store.lease('scheduler', owner, 120_000)) throw new AppError(409, '调度正在运行；停止服务后执行离线备份');
  try {
    if (store.list<Run>('run').some(r => r.status === 'running')) throw new AppError(409, '在途任务需先停止或完成');
    mkdirSync(target, { recursive: true });
    const dbPath = join(target, 'workbench.sqlite'); store.db.exec(`VACUUM INTO '${dbPath.replaceAll("'", "''")}'`);
    const copy = new Store(dbPath); let assetList:Asset[]; let hasCanvas=false;
    try {copy.db.exec('DELETE FROM sessions; DELETE FROM node_tokens; DELETE FROM locks;');
    assetList = copy.list<Asset>('asset').filter(a => !a.contentRemoved); mkdirSync(join(target, 'assets'));
    for (const asset of assetList) { if(!/^[a-zA-Z0-9-]+$/.test(asset.locator))throw new AppError(400,'资产备份路径无效');const from = join(dataDir, 'assets', asset.locator);safePath(from); if (hash(from) !== asset.hash) throw new AppError(422, '备份资产校验失败'); cpSync(from, join(target, 'assets', asset.locator)); }
    // No credentials/auth.json, workspaces, caches or uncontrolled files.
    if (existsSync(join(dataDir, 'sessions'))) {files(join(dataDir,'sessions'));cpSync(join(dataDir, 'sessions'), join(target, 'sessions'), { recursive: true, filter: source => statSync(source).isDirectory() || source.endsWith('.jsonl') });}
    hasCanvas=backupCanvas(dataDir,target);
    }finally{copy.close();}
    const schema=hasCanvas?2:1;
    const manifest = { schema, createdAt: new Date().toISOString(), sourceRoot: resolve(dataDir), node: process.version, includesSecrets: false, files: files(target).filter(p => !p.endsWith('-wal') && !p.endsWith('-shm')).map(path => ({ path, sha256: hash(join(target, path)) })), assetCount: assetList.length, hasCanvas };
    writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2)); return manifest;
  } finally { if(!leaseOwner)store.release('scheduler', owner); }
}
export function verifyBackup(source:string){
  safePath(source);safePath(join(source,'manifest.json'));if(lstatSync(join(source,'manifest.json')).size>2*1024*1024)throw new AppError(400,'备份清单过大');
  const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8')) as { schema: number; sourceRoot: string; files: { path: string; sha256: string }[] };
  if (![1,2].includes(manifest.schema)||typeof manifest.sourceRoot!=='string'||!Array.isArray(manifest.files)||manifest.files.length>100000) throw new AppError(400, '备份版本或清单无效');
  const paths=new Set<string>();
  for (const file of manifest.files) {
    if(typeof file.path!=='string'||typeof file.sha256!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256)||file.path.includes('..')||paths.has(file.path)||!allowedBackupPath(file.path,manifest.schema))throw new AppError(400,'备份路径或哈希无效');
    paths.add(file.path);safePath(join(source,file.path));
    if (hash(join(source, file.path)) !== file.sha256) throw new AppError(422, '备份文件校验失败');
  }
  if(!paths.has('workbench.sqlite'))throw new AppError(400,'备份缺少业务数据库');return manifest;
}
export function restore(source: string, destination: string, protectDestination?: (path:string)=>void) {
  const target = resolve(destination); if (existsSync(target)) throw new AppError(409, '恢复目标必须是新目录');safePath(target);
  const manifest=verifyBackup(source);
  mkdirSync(target, { recursive: true, mode:0o700 }); protectDestination?.(target); for (const file of manifest.files) { const to = join(target, file.path); mkdirSync(resolve(to, '..'), { recursive: true }); cpSync(join(source, file.path), to); }
  const store = new Store(join(target, 'workbench.sqlite'));
  const remap = (path?: string) => { const child=backupRelativePath(manifest.sourceRoot,path);return child===undefined?undefined:join(target,...child.split('/')); };
  store.db.exec('DELETE FROM sessions; DELETE FROM node_tokens; DELETE FROM locks;');
  for (const run of store.list<Run>('run')) {
    const sessionPath = remap(run.sessionPath);
    store.update<Run>('run', run.id, run.revision, { sessionPath, workerPid: undefined, leaseOwner: undefined, leaseUntil: undefined });
  }
  for (const asset of store.list<Asset>('asset').filter(a => !a.contentRemoved)) if (hash(join(target, 'assets', asset.locator)) !== asset.hash) throw new AppError(422, '恢复资产引用无效');
  for (const binding of store.list('session_binding')) {
    const value = binding as typeof binding & { cwd?: string; sessionPath?: string };
    store.update('session_binding', value.id, value.revision, { ...({ cwd: remap(value.cwd), sessionPath: remap(value.sessionPath), pid: undefined, worker: undefined } as object) });
  }
  // Plugin code/dependencies are not in this backup. Never keep live source-root pointers enabled.
  for (const pluginConfig of store.list<import('../shared/plugins.js').PluginConfiguration>('plugin_config')) {
    store.update<import('../shared/plugins.js').PluginConfiguration>('plugin_config', pluginConfig.id, pluginConfig.revision, {
      health: 'ready', error: undefined, environmentRevision: pluginConfig.environmentRevision + 1,
      packages: pluginConfig.packages.map(p => ({ ...p, enabled: false, installationState: 'missing', lastLoad: undefined,
        root: p.kind === 'local' ? p.root : remap(p.root) ?? '', resources: p.resources.map(r => ({ ...r, path: p.kind === 'local' ? r.path : remap(r.path) ?? '' })) }))
    });
  }
  for (const op of store.list<import('../shared/plugins.js').PluginOperation>('plugin_operation')) {
    store.update<import('../shared/plugins.js').PluginOperation>('plugin_operation', op.id, op.revision, { workerPid: undefined, workerBirth: undefined,
      ...(!['completed', 'failed', 'reconcile_required'].includes(op.phase) ? { phase: 'failed' as const, progress: '从备份恢复；原操作未重放', error: '请检查来源后重新安装' } : {}) });
  }
  for (const node of store.list('node')) store.update('node', node.id, node.revision, { ...({ revoked: true, lastSeen: 0 } as object) });
  store.close(); return { restored: true, dataDir: target, credentialsMustBeConfigured: true };
}
