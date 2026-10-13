import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, readdirSync, realpathSync, renameSync, rmSync, statfsSync, chmodSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { Store, AppError } from './store.js';
import type { Scheduler } from './scheduler.js';
import { backup, restore, verifyBackup } from './backup.js';
import { storageUsage } from './storage.js';
import { continuationFor } from './native-session.js';
import type { Run } from '../shared/contracts.js';
import type { OffsiteOptions } from './offsite-backup.js';

export interface OffsitePoint {name:string;id:string;manifestHash:string}
export interface OffsiteConfirmation {id:string;verified:true;manifestSha256:string}
export interface AutomaticOffsiteOptions extends Pick<OffsiteOptions,'binary'|'configFile'|'workRoot'> {
  /** Trusted embedding transport only. Never accepted through HTTP. */
  transfer?:(source:string,id:string,signal:AbortSignal)=>Promise<OffsiteConfirmation>;
  onWorkerExit?:(event:{pid?:number;code:number|null;transport?:unknown})=>void;
}
export interface OffsiteStatus {enabled:boolean;pending:number;running:boolean;lastSuccessAt?:string;error?:string}

export interface BackupStatus {
  enabled: boolean; waitingForIdle: boolean; intervalHours: number; retainCount: number;
  lastSuccessAt?: string; nextDueAt?: string; restoreCheckedAt?: string;
  retained: number; pruned: number; checking?: boolean; running?: boolean; error?: string;
  offsite:OffsiteStatus;
}
export interface BackupOptions {
  root?: string; intervalMs?: number; retainCount?: number; maxBytes?: number; minFreeBytes?: number; pollMs?: number;
  /** Trusted embedding can validate an independent mounted volume; never supplied by HTTP. */
  validateLocation?: (source: string, target: string) => boolean;
  now?: () => number;
  offsite?:AutomaticOffsiteOptions;
}
type Receipt = {schema:1;ownerId:string;sourceRoot:string;createdAt:string;manifestHash:string;restored:true;offsite?:{id:string;verifiedAt?:string}};
const sha=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const read=(file:string)=>{const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)throw new AppError(503,'备份记录不可读');return JSON.parse(readFileSync(file,'utf8'));};
function noLinks(path:string){let cursor=resolve(path);for(;;){if(existsSync(cursor)&&lstatSync(cursor).isSymbolicLink())throw new AppError(503,'备份路径包含链接');const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}}
function measure(path:string):number{const stat=lstatSync(path);if(stat.isSymbolicLink())throw new AppError(503,'备份内容包含链接');return stat.isDirectory()?readdirSync(path).reduce((n,name)=>n+measure(join(path,name)),0):stat.size;}
function protect(path:string){
  if(process.platform!=='win32'){chmodSync(path,0o700);return;}
  const script="$ErrorActionPreference='Stop'; $p=$env:WB_BACKUP_PATH; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $info=[System.IO.DirectoryInfo]::new($p); if($info.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Owner).GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'Unexpected backup owner'}; $acl=$info.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access); $acl.SetAccessRuleProtection($true,$false); foreach($entry in @($acl.GetAccessRules($true,$false,[System.Security.Principal.SecurityIdentifier]))){$acl.RemoveAccessRuleSpecific($entry)}; $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule); $info.SetAccessControl($acl)";
  const result=spawnSync(join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore',timeout:15000,env:{SystemRoot:process.env.SystemRoot,WB_BACKUP_PATH:path}});
  if(result.status!==0)throw new AppError(503,'无法保护备份目录');
}
export {protect as protectBackupDirectory};
function independent(source:string,target:string){
  if(process.platform==='win32'){
    if(!/^[A-Z]:\\/i.test(source)||!/^[A-Z]:\\/i.test(target)||source[0].toUpperCase()===target[0].toUpperCase())return false;
    const result=spawnSync(join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command','Get-Partition -DriveLetter $env:WB_SOURCE_DRIVE,$env:WB_TARGET_DRIVE | Select-Object DiskNumber,DriveLetter | ConvertTo-Json -Compress'],{windowsHide:true,encoding:'utf8',timeout:10000,env:{SystemRoot:process.env.SystemRoot,WB_SOURCE_DRIVE:source[0],WB_TARGET_DRIVE:target[0]}});
    if(result.status!==0)return false;const rows=JSON.parse(result.stdout) as {DriveLetter:string;DiskNumber:number}[];if(!Array.isArray(rows))return false;const a=rows.find(r=>r.DriveLetter.toUpperCase()===source[0].toUpperCase());const b=rows.find(r=>r.DriveLetter.toUpperCase()===target[0].toUpperCase());return Boolean(a&&b&&a.DiskNumber!==b.DiskNumber);
  }
  let parent=target;while(!existsSync(parent)){const next=dirname(parent);if(next===parent)return false;parent=next;}
  return lstatSync(source).dev!==lstatSync(parent).dev;
}

export class AutomaticBackup {
  private timer?: ReturnType<typeof setInterval>; private initial?: ReturnType<typeof setTimeout>;
  private state: BackupStatus; private root?:string; private folder?:string; private ownerId?:string; private busy=false; private active?:Promise<void>;
  private preparation?:Promise<void>; private stopped=false;
  private offsiteActive?:Promise<void>;private offsiteAbort?:AbortController;private pending:OffsitePoint[]=[];
  private readonly now:()=>number; private readonly interval:number; private readonly keep:number; private readonly maximum:number; private readonly reserve:number;
  constructor(private store:Store,private scheduler:Scheduler,private source:string,private options:BackupOptions={}){
    this.source=resolve(source);this.now=options.now??Date.now;this.interval=options.intervalMs??86400000;this.keep=options.retainCount??7;this.maximum=options.maxBytes??8*1024**3;this.reserve=options.minFreeBytes??12*1024**3;
    if(!Number.isSafeInteger(this.interval)||this.interval<1||!Number.isSafeInteger(this.keep)||this.keep<2||this.keep>100||!Number.isSafeInteger(this.maximum)||this.maximum<1||!Number.isSafeInteger(this.reserve)||this.reserve<0)throw new AppError(400,'备份保护参数无效');
    this.state={enabled:false,waitingForIdle:false,intervalHours:this.interval/3600000,retainCount:this.keep,retained:0,pruned:0,offsite:{enabled:Boolean(options.offsite),pending:0,running:false}};
    const record=store.db.prepare("SELECT value FROM metadata WHERE key='automatic_backup'").get();
    if(record)try{const value=JSON.parse(String(record.value));if(typeof value.lastSuccessAt==='string'&&Number.isFinite(Date.parse(value.lastSuccessAt))){this.state.lastSuccessAt=value.lastSuccessAt;this.state.restoreCheckedAt=value.restoreCheckedAt;this.state.pruned=Number.isSafeInteger(value.pruned)?value.pruned:0;}}catch{this.state.error='备份状态记录损坏，等待检查';}
  }
  status():BackupStatus{return {...this.state,offsite:{...this.state.offsite}};}
  start(){
    if(this.preparation)return this.preparation;
    this.stopped=false;this.state.enabled=false;this.preparation=this.prepareAndSchedule();return this.preparation;
  }
  private async prepareAndSchedule(){
    try{
      if(!this.prepare())return;
      this.state.checking=true;
      const points=await this.scanRecoveryPoints();
      if(points.latest&&(!this.state.lastSuccessAt||Date.parse(points.latest)>Date.parse(this.state.lastSuccessAt))){this.state.lastSuccessAt=points.latest;this.state.restoreCheckedAt=points.latest;}
      this.state.enabled=true;this.state.retained=points.retained;this.state.nextDueAt=new Date(this.state.lastSuccessAt?Date.parse(this.state.lastSuccessAt)+this.interval:this.now()).toISOString();
      this.receivePoints(points);
    }catch{this.state.enabled=false;this.state.error='备份位置或访问权限需要检查，已有内容保留';}
    finally{this.state.checking=false;}
    if(!this.state.enabled||this.stopped)return;
    this.startOffsite();
    this.initial=setTimeout(()=>this.tick(),1500);this.initial.unref();this.timer=setInterval(()=>this.tick(),this.options.pollMs??60000);this.timer.unref();
  }
  async stop(){this.stopped=true;if(this.initial)clearTimeout(this.initial);if(this.timer)clearInterval(this.timer);this.offsiteAbort?.abort();await this.preparation;await this.active;await this.offsiteActive;this.preparation=undefined;}
  private prepare(){
    const target=this.options.root??(process.platform==='win32'&&process.env.USERPROFILE?join(process.env.USERPROFILE,'AI-OS-Backups'):undefined);
    if(!target)return;this.root=resolve(target);noLinks(this.source);noLinks(this.root);
    const marker=join(this.root,'.workbench-owner.json');
    // Discovery does not claim or change an existing unmarked directory.
    if(existsSync(this.root)&&!existsSync(marker))return;
    if(existsSync(marker)){const owner=read(marker);if(owner.schema!==1||resolve(owner.sourceRoot||'')!==this.source)return;}
    if(!(this.options.validateLocation??independent)(this.source,this.root))throw new AppError(503,'备份位置不是独立存储');
    if(!existsSync(this.root)){if(!this.options.root)return;mkdirSync(this.root,{recursive:true,mode:0o700});protect(this.root);writeFileSync(marker,JSON.stringify({schema:1,sourceRoot:this.source,workspace:resolve('.')}),{flag:'wx',mode:0o600});}
    this.folder=join(this.root,'automatic');
    const own=join(this.folder,'.automatic-owner.json');
    if(existsSync(this.folder)&&!existsSync(own))throw new AppError(503,'自动备份目录没有所有者记录');
    if(!existsSync(this.folder)){mkdirSync(this.folder,{mode:0o700});protect(this.folder);this.ownerId=randomUUID();writeFileSync(own,JSON.stringify({schema:1,sourceRoot:this.source,ownerId:this.ownerId}),{flag:'wx',mode:0o600});}
    else{noLinks(this.folder);const owner=read(own);if(owner.schema!==1||owner.sourceRoot!==this.source||!/^[-a-f0-9]{36}$/.test(owner.ownerId||''))throw new AppError(503,'自动备份归属不符');this.ownerId=owner.ownerId;protect(this.folder);}
    return true;
  }
  private scanRecoveryPoints():Promise<RecoveryScanResult>{
    const job:RecoveryScanJob={type:'scan',source:this.source,folder:this.folder!,ownerId:this.ownerId!};
    return new Promise((done,reject)=>{
      const env=Object.fromEntries(['SystemRoot','USERPROFILE','TEMP','TMP','PATH','APPDATA','LOCALAPPDATA','HOME','LANG','TZ'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]!]));
      const child=fork(fileURLToPath(new URL('./backup-worker.ts',import.meta.url)),[],{execArgv:['--import','tsx'],env,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
      let receipt:RecoveryScanResult|undefined;let failed=false;
      const timer=setTimeout(()=>{failed=true;child.kill();},180000);timer.unref();
      child.on('message',(message:{type?:string;result?:RecoveryScanResult})=>{if(message.type==='completed')receipt=message.result;else failed=true;});
      child.once('error',()=>{clearTimeout(timer);reject(new Error('Recovery scanner unavailable'));});
      child.once('exit',code=>{clearTimeout(timer);if(code===0&&!failed&&receipt&&Number.isSafeInteger(receipt.retained)&&receipt.retained>=0&&(!receipt.latest||Number.isFinite(Date.parse(receipt.latest))))done(receipt);else reject(new Error('Recovery scanner did not complete'));});
      child.send(job,error=>{if(error){failed=true;child.kill();}});
    });
  }
  tick():Promise<void>{
    this.startOffsite();
    if(this.busy)return this.active!;
    if(!this.state.enabled||this.state.error==='备份状态记录损坏，等待检查')return Promise.resolve();
    if(this.state.lastSuccessAt&&this.now()<Date.parse(this.state.lastSuccessAt)+this.interval)return Promise.resolve();
    this.busy=true;
    this.active=this.perform();return this.active;
  }
  private async perform(){
    try{const ran=await this.scheduler.withIdleMaintenance(async(owner,signal)=>{this.state.running=true;this.state.waitingForIdle=false;await this.create(owner,signal);});this.state.waitingForIdle=!ran;}
    catch{this.state.error='自动备份未完成，已有副本保留；请检查备份空间或目录';}
    finally{this.busy=false;this.state.running=false;this.startOffsite();}
  }
  private async create(owner:string,signal:AbortSignal){
    const job:BackupJob={source:this.source,root:this.root!,folder:this.folder!,ownerId:this.ownerId!,leaseOwner:owner,at:new Date(this.now()).toISOString(),keep:this.keep,maximum:this.maximum,reserve:this.reserve,pinOffsite:Boolean(this.options.offsite)};
    const result=await new Promise<BackupResult>((done,reject)=>{
      const env=Object.fromEntries(['SystemRoot','USERPROFILE','TEMP','TMP','PATH','APPDATA','LOCALAPPDATA','HOME','LANG','TZ'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]!]));
      const child=fork(fileURLToPath(new URL('./backup-worker.ts',import.meta.url)),[],{execArgv:['--import','tsx'],env,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
      let receipt:BackupResult|undefined;let failed=false;
      const abort=()=>{failed=true;child.kill();};
      const timer=setTimeout(abort,180000);timer.unref();signal.addEventListener('abort',abort,{once:true});
      const clean=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
      child.on('message',(message:{type?:string;result?:BackupResult})=>{if(message.type==='completed')receipt=message.result;else failed=true;});
      child.once('error',()=>{clean();reject(new Error('Backup worker unavailable'));});
      child.once('exit',status=>{clean();if(status===0&&!failed&&receipt)done(receipt);else reject(new Error('Backup worker did not complete'));});
      if(signal.aborted)abort();else child.send(job,error=>{if(error)abort();});
    });
    if(result.at!==job.at||!Number.isSafeInteger(result.retained)||result.retained<1||!Number.isSafeInteger(result.pruned)||result.pruned<0)throw new AppError(503,'备份回执无效');
    this.state.lastSuccessAt=result.at;this.state.restoreCheckedAt=result.at;this.state.nextDueAt=new Date(Date.parse(result.at)+this.interval).toISOString();this.state.retained=result.retained;this.state.pruned+=result.pruned;this.state.error=undefined;
    this.receivePoints(result);
    this.store.guardDatabase(1024,()=>this.store.db.prepare("INSERT INTO metadata VALUES('automatic_backup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(this.state)),true);
  }
  private receivePoints(points:RecoveryScanResult){
    this.pending=(points.pending??[]).filter(p=>!validateOffsitePoint(this.folder!,this.source,this.ownerId!,p).offsite?.verifiedAt);
    this.state.offsite.pending=this.pending.length;
    if(points.offsiteLatest&&(!this.state.offsite.lastSuccessAt||points.offsiteLatest>this.state.offsite.lastSuccessAt))this.state.offsite.lastSuccessAt=points.offsiteLatest;
  }
  private startOffsite(){
    if(this.stopped||this.busy||!this.state.enabled||!this.options.offsite||this.offsiteActive||!this.pending.length)return;
    const owner=randomUUID();if(!this.store.lease('offsite-backup',owner,120000))return;
    const controller=new AbortController();this.offsiteAbort=controller;this.state.offsite.running=true;
    const renewal=setInterval(()=>{try{if(!this.store.lease('offsite-backup',owner,120000))controller.abort();}catch{controller.abort();}},20000);renewal.unref();
    this.offsiteActive=(async()=>{
      try{
        for(const point of [...this.pending]){
          if(controller.signal.aborted)break;
          const source=join(this.folder!,point.name);validateOffsitePoint(this.folder!,this.source,this.ownerId!,point);
          const result=this.options.offsite!.transfer?await this.options.offsite!.transfer(source,point.id,controller.signal):await transferOffsiteWorker(this.options.offsite!,source,point.id,this.source,owner,controller.signal);
          if(controller.signal.aborted||!this.store.lease('offsite-backup',owner,120000))throw new AppError(409,'转存租约已失效');
          if(result.id!==point.id||result.verified!==true||result.manifestSha256!==point.manifestHash)throw new AppError(422,'转存确认不匹配');
          const at=new Date(this.now()).toISOString();acknowledgeOffsite(this.folder!,this.source,this.ownerId!,point,at);
          this.pending=this.pending.filter(p=>p.id!==point.id);this.state.offsite.pending=this.pending.length;this.state.offsite.lastSuccessAt=at;this.state.offsite.error=undefined;
        }
      }catch{this.state.offsite.error='加密转存尚未确认，来源副本保留；稍后重试';}
      finally{clearInterval(renewal);this.store.release('offsite-backup',owner);this.state.offsite.running=false;this.offsiteAbort=undefined;}
    })().finally(()=>{this.offsiteActive=undefined;});
  }
}

export interface BackupJob {source:string;root:string;folder:string;ownerId:string;leaseOwner:string;at:string;keep:number;maximum:number;reserve:number;pinOffsite?:boolean}
export interface BackupResult extends RecoveryScanResult {at:string;pruned:number}
export interface RecoveryScanJob {type:'scan';source:string;folder:string;ownerId:string}
export interface RecoveryScanResult {retained:number;latest?:string;pending?:OffsitePoint[];offsiteLatest?:string}
function summarizePoints(points:{path:string;receipt:Receipt}[]):RecoveryScanResult{
  return {retained:points.length,latest:points[0]?.receipt.createdAt,pending:points.filter(p=>p.receipt.offsite&&!p.receipt.offsite.verifiedAt).reverse().map(p=>({name:basename(p.path),id:p.receipt.offsite!.id,manifestHash:p.receipt.manifestHash})),offsiteLatest:points.map(p=>p.receipt.offsite?.verifiedAt).filter((p):p is string=>Boolean(p)).sort().at(-1)};
}
function validateOffsitePoint(folder:string,source:string,ownerId:string,point:OffsitePoint):Receipt{
  if(!/^snapshot-[0-9TZ.-]+-[-a-f0-9]{36}$/.test(point.name)||!/^[-a-f0-9]{36}$/.test(point.id)||!/^[a-f0-9]{64}$/.test(point.manifestHash))throw new AppError(400,'转存来源记录无效');
  const path=join(folder,point.name);noLinks(path);const own=read(join(folder,'.automatic-owner.json')),root=read(join(dirname(folder),'.workbench-owner.json'));
  const receipt=read(join(path,'receipt.json')) as Receipt;
  if(folder!==join(dirname(folder),'automatic')||own.schema!==1||own.sourceRoot!==source||own.ownerId!==ownerId||root.schema!==1||root.sourceRoot!==source||receipt.schema!==1||receipt.ownerId!==ownerId||receipt.sourceRoot!==source||receipt.restored!==true||receipt.offsite?.id!==point.id||receipt.manifestHash!==point.manifestHash||sha(join(path,'manifest.json'))!==point.manifestHash)throw new AppError(409,'转存来源归属或清单改变');
  return receipt;
}
function acknowledgeOffsite(folder:string,source:string,ownerId:string,point:OffsitePoint,at:string){
  const receipt=validateOffsitePoint(folder,source,ownerId,point);const path=join(folder,point.name),pending=join(path,'.offsite-ack-'+randomUUID());
  writeFileSync(pending,JSON.stringify({...receipt,offsite:{id:point.id,verifiedAt:at}}),{flag:'wx',mode:0o600});
  // Replace only our own validated receipt; interruption leaves a pending pin.
  validateOffsitePoint(folder,source,ownerId,point);renameSync(pending,join(path,'receipt.json'));
}
export interface OffsiteWorkerJob {options:Pick<AutomaticOffsiteOptions,'binary'|'configFile'|'workRoot'>;snapshot:string;id:string;dataRoot:string;leaseOwner:string}
function transferOffsiteWorker(options:AutomaticOffsiteOptions,snapshot:string,id:string,dataRoot:string,leaseOwner:string,signal:AbortSignal):Promise<OffsiteConfirmation>{
  return new Promise((done,reject)=>{
    const env=Object.fromEntries(['SystemRoot','USERPROFILE','TEMP','TMP','PATH','APPDATA','LOCALAPPDATA','HOME','LANG','TZ'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]!]));
    const child=fork(fileURLToPath(new URL('./offsite-worker.ts',import.meta.url)),[],{execArgv:['--import','tsx'],env,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
    let receipt:(OffsiteConfirmation&{transport?:unknown})|undefined;let failed=false;const abort=()=>{failed=true;if(child.connected)child.send({type:'cancel'},()=>{});};
    const timer=setTimeout(abort,1200000);timer.unref();signal.addEventListener('abort',abort,{once:true});const clean=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
    child.on('message',(m:{type:string;result?:OffsiteConfirmation})=>{if(m.type==='completed')receipt=m.result;else failed=true;});
    child.once('error',()=>{clean();reject(new Error('Offsite worker unavailable'));});child.once('exit',code=>{clean();options.onWorkerExit?.({pid:child.pid,code,transport:receipt?.transport});if(code===0&&!failed&&receipt)done(receipt);else reject(new Error('Offsite worker did not complete'));});
    const job:OffsiteWorkerJob={options:{binary:options.binary,configFile:options.configFile,workRoot:options.workRoot},snapshot,id,dataRoot,leaseOwner};
    child.send(job,error=>{if(error)abort();});if(signal.aborted)abort();
  });
}
export function scanRecoveryPoints(job:RecoveryScanJob):RecoveryScanResult {
  if(!job||job.type!=='scan'||resolve(job.source)!==job.source||resolve(job.folder)!==job.folder||!/^[-a-f0-9]{36}$/.test(job.ownerId))throw new AppError(400,'恢复点检查参数无效');
  noLinks(job.source);noLinks(job.folder);const owner=read(join(job.folder,'.automatic-owner.json'));const root=read(join(dirname(job.folder),'.workbench-owner.json'));
  if(owner.schema!==1||owner.ownerId!==job.ownerId||owner.sourceRoot!==job.source||root.schema!==1||resolve(root.sourceRoot||'')!==job.source||job.folder!==join(dirname(job.folder),'automatic'))throw new AppError(503,'恢复点检查归属不符');
  return summarizePoints(recoveryPoints(job.folder,job.source,job.ownerId));
}
function recoveryPoints(folder:string,source:string,ownerId:string):{path:string;receipt:Receipt}[]{
  return readdirSync(folder).flatMap(name=>{
    if(!/^snapshot-[0-9TZ.-]+-[-a-f0-9]{36}$/.test(name))return [];
    const path=join(folder,name);try{
      noLinks(path);const receipt=read(join(path,'receipt.json')) as Receipt;
      if(receipt.schema!==1||receipt.ownerId!==ownerId||receipt.sourceRoot!==source||receipt.restored!==true||!Number.isFinite(Date.parse(receipt.createdAt))||sha(join(path,'manifest.json'))!==receipt.manifestHash)return [];
      if(receipt.offsite&&(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(receipt.offsite.id)||('verifiedAt' in receipt.offsite&&!Number.isFinite(Date.parse(receipt.offsite.verifiedAt!)))))return [];
      verifyBackup(path);return [{path,receipt}];
    }catch{return [];}
  }).sort((a,b)=>Date.parse(b.receipt.createdAt)-Date.parse(a.receipt.createdAt)||b.path.localeCompare(a.path));
}
function removeOwned(folder:string,path:string){
  const absolute=resolve(path);const root=resolve(folder);
  if(dirname(absolute)!==root||absolute===root||realpathSync(absolute)!==absolute)throw new AppError(503,'拒绝清理非自动备份目录');
  noLinks(absolute);measure(absolute);rmSync(absolute,{recursive:true});
}
export function runBackupJob(job:BackupJob):BackupResult {
  if(!job||resolve(job.source)!==job.source||resolve(job.root)!==job.root||job.folder!==join(job.root,'automatic')||!/^[-a-f0-9]{36}$/.test(job.ownerId)||!/^[-a-f0-9]{36}$/.test(job.leaseOwner)||!Number.isFinite(Date.parse(job.at))||!Number.isSafeInteger(job.keep)||job.keep<2||job.keep>100||!Number.isSafeInteger(job.maximum)||job.maximum<1||!Number.isSafeInteger(job.reserve)||job.reserve<0)throw new AppError(400,'备份任务无效');
  noLinks(job.source);noLinks(job.root);noLinks(job.folder);
  const owned=()=>{const marker=read(join(job.folder,'.automatic-owner.json'));if(marker.ownerId!==job.ownerId||marker.sourceRoot!==job.source)throw new AppError(503,'自动备份所有者改变');};owned();
  const source=storageUsage(job.source,0);if(source.issues.length||!source.disk)throw new AppError(503,'源存储无法完整检查');
  const needed=source.measuredBytes*2+16*1024*1024;const disk=statfsSync(job.root);if(measure(job.root)+needed>job.maximum||disk.bsize*disk.bavail-needed<job.reserve)throw new AppError(507,'备份空间不足');
  const store=new Store(join(job.source,'workbench.sqlite'),{readOnly:true});
  const lease=()=>{const current=store.db.prepare("SELECT owner,until_ms FROM locks WHERE name='scheduler'").get();if(current?.owner!==job.leaseOwner||Number(current.until_ms)<=Date.now())throw new AppError(409,'备份调度租约已失效');};
  const id=randomUUID();const pending=join(job.folder,'pending-'+id);const checked=join(job.folder,'restore-'+id);let committed=false;
  try {
    lease();backup(store,job.source,pending,job.leaseOwner);
    // Compare restoration with the captured database, not the live database:
    // browser edits are allowed to continue after VACUUM's atomic snapshot.
    const frozen=new DatabaseSync(join(pending,'workbench.sqlite'),{readOnly:true});let entities:number;
    try{entities=Number(frozen.prepare('SELECT COUNT(*) AS n FROM entities').get()!.n);}finally{frozen.close();}
    restore(pending,checked);const recovered=new Store(join(checked,'workbench.sqlite'));
    try {
      assertRestore(recovered,entities,checked);
      for(const run of recovered.list<Run>('run').filter(r=>r.mode==='pi'&&r.status==='completed'&&r.sessionId&&r.sessionPath)){
        if(!continuationFor(recovered,run.projectId,run.policy,run.id,'archive'))throw new AppError(422,'恢复会话绑定无效');
        const manager=SessionManager.open(run.sessionPath!,join(checked,'sessions',run.projectId),join(checked,'workspaces',run.projectId));if(manager.getSessionId()!==run.sessionId||!manager.buildSessionContext().messages.length)throw new AppError(422,'恢复原生会话不可用');
      }
    }finally{recovered.close();}
    lease();owned();
    const receipt:Receipt={schema:1,ownerId:job.ownerId,sourceRoot:job.source,createdAt:job.at,manifestHash:sha(join(pending,'manifest.json')),restored:true,...(job.pinOffsite?{offsite:{id:randomUUID()}}:{})};
    writeFileSync(join(pending,'receipt.json'),JSON.stringify(receipt),{flag:'wx',mode:0o600});const finished=join(job.folder,'snapshot-'+job.at.replace(/[:]/g,'-')+'-'+id);renameSync(pending,finished);committed=true;
    const points=recoveryPoints(job.folder,job.source,job.ownerId);let pruned=0;
    for(const old of points.slice(job.keep)){if(old.receipt.offsite&&!old.receipt.offsite.verifiedAt)continue;lease();owned();removeOwned(job.folder,old.path);pruned++;}
    return {at:job.at,...summarizePoints(recoveryPoints(job.folder,job.source,job.ownerId)),pruned};
  } finally {
    try{if(existsSync(checked))removeOwned(job.folder,checked);if(!committed&&existsSync(pending))removeOwned(job.folder,pending);}finally{store.close();}
  }
}
function assertRestore(recovered:Store,entities:number,path:string){
  if(recovered.db.prepare('PRAGMA quick_check').get()!.quick_check!=='ok'||Number(recovered.db.prepare('SELECT COUNT(*) AS n FROM entities').get()!.n)!==entities)throw new AppError(422,'恢复数据库校验失败');
  for(const table of ['sessions','node_tokens'])if(recovered.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n!==0)throw new AppError(422,'恢复包含旧认证会话');
  if(existsSync(join(path,'credentials.json'))||existsSync(join(path,'private-model')))throw new AppError(422,'普通备份不应包含凭据');
}
