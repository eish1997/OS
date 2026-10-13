import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,cpSync,renameSync,readdirSync,statfsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {verifyBackup,restore} from './backup.js';
import {protectBackupDirectory} from './automatic-backup.js';
import {AppError} from './store.js';
import {OffsiteWork} from './offsite-work.js';

export type OffsiteOptions={binary:string;configFile:string;workRoot:string;discardWork?:boolean;signal?:AbortSignal;onExit?:(event:{pid:number|undefined;code:number|null;signal:NodeJS.Signals|null})=>void};
type Commit={schema:1;id:string;manifestSha256:string;files:number};
class TransportError extends AppError {constructor(readonly exitCode:number|null){super(503,'转存步骤未完成，保留已有备份');}}
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
function noLinks(path:string){for(let p=resolve(path);;p=dirname(p)){if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw new AppError(400,'转存路径包含链接');if(p===dirname(p))break;}}
function privateConfig(path:string){
 noLinks(path);const stat=lstatSync(path);if(!stat.isFile()||stat.size>1024*1024)throw new AppError(400,'转存配置无效');
 if(process.platform!=='win32'){if((stat.mode&0o077)!==0||stat.uid!==process.getuid?.())throw new AppError(403,'转存配置必须由运行账号独占');return;}
 const script="$ErrorActionPreference='Stop'; $f=[System.IO.FileInfo]::new($env:WB_BACKUP_PATH); $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=$f.GetAccessControl(); if($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){exit 2}; foreach($r in $acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])){if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -ne $sid.Value){exit 3}}";
 const result=spawnSync(join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env:{SystemRoot:process.env.SystemRoot,WB_BACKUP_PATH:path},windowsHide:true,stdio:'ignore',timeout:15000});if(result.status!==0)throw new AppError(403,'转存配置必须由运行账号独占');
}
export function validateCryptConfig(text:string){
 if([...text.matchAll(/^\[workbench-offsite\]\s*$/gm)].length!==1)throw new AppError(400,'专用转存配置不得重复');
 const block=text.match(/^\[workbench-offsite\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];if(!block)throw new AppError(400,'需要专用加密转存配置');
 const fields=new Map<string,string>();for(const line of block.split(/\r?\n/)){if(!line.trim()||/^\s*[#;]/.test(line))continue;const match=line.match(/^\s*([a-z0-9_]+)\s*=\s*(.*?)\s*$/i);if(!match||fields.has(match[1].toLowerCase()))throw new AppError(400,'转存配置有重复或无效字段');fields.set(match[1].toLowerCase(),match[2]);}
 if(fields.get('type')!=='crypt'||fields.get('filename_encryption')!=='standard'||fields.get('directory_name_encryption')!=='true'||!fields.get('password')||!fields.get('password2')||!fields.get('remote'))throw new AppError(400,'转存必须加密文件与目录并保留独立恢复密钥');
 if(fields.has('no_data_encryption')&&fields.get('no_data_encryption')!=='false')throw new AppError(400,'禁止明文转存');
}

export class OffsiteBackup {
 private ready=false;private configHash='';private work?:OffsiteWork;private activeStage?:string;
 constructor(private options:OffsiteOptions){for(const path of [options.binary,options.configFile,options.workRoot])if(resolve(path)!==path)throw new AppError(400,'转存工具路径必须绝对');}
 private prepare(){
  if(process.arch!=='x64'||!['win32','linux'].includes(process.platform))throw new AppError(400,'转存固定运行时仅支持x64 Windows/Linux');
  noLinks(this.options.binary);const lock=JSON.parse(readFileSync(new URL('../deployment/rclone-lock.json',import.meta.url),'utf8'));
  if(hash(this.options.binary)!==lock[process.platform==='win32'?'windows':'linux'].binarySha256)throw new AppError(400,'转存工具校验失败');
  noLinks(this.options.configFile);if(this.ready){if(hash(this.options.configFile)!==this.configHash)throw new AppError(409,'转存配置在运行中改变；停止后重新核对');return;}
  privateConfig(this.options.configFile);validateCryptConfig(readFileSync(this.options.configFile,'utf8'));
  this.configHash=hash(this.options.configFile);this.work=new OffsiteWork(this.options.workRoot,this.configHash);this.ready=true;
 }
 private run(args:string[]):Promise<void>{
  if(this.options.signal?.aborted)return Promise.reject(new AppError(503,'转存已停止，来源副本保留'));
  this.prepare();
  const env=Object.fromEntries(['SystemRoot','USERPROFILE','HOME','TEMP','TMP','PATH','LANG','TZ'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]!]));
  return new Promise((done,reject)=>{
   const stage=this.activeStage!;this.work!.launching(stage);
   const child=spawn(this.options.binary,[...args,'--config',this.options.configFile,'--ask-password=false','--log-level','ERROR','--retries','1','--low-level-retries','1','--timeout','30s','--contimeout','10s','--transfers','2','--checkers','2','--max-transfer','4Gi','--max-duration','5m','--cutoff-mode','HARD'],{windowsHide:true,stdio:'ignore',env});
   let expired=false,spawnFailed=false,journalFailed=false;const abort=()=>{expired=true;child.kill();};const timer=setTimeout(abort,300000);timer.unref();this.options.signal?.addEventListener('abort',abort,{once:true});const clean=()=>{clearTimeout(timer);this.options.signal?.removeEventListener('abort',abort);};
   child.once('spawn',()=>{try{this.work!.transportStarted(stage,child.pid!);}catch{journalFailed=true;abort();}});child.once('error',()=>{spawnFailed=true;});
   child.once('close',(code,signal)=>{clean();try{this.options.onExit?.({pid:child.pid,code,signal});this.work!.transportFinished(stage);}catch{journalFailed=true;}if(spawnFailed)reject(new AppError(503,'转存工具无法启动'));else if(journalFailed)reject(new AppError(409,'转存工作记录需要核对，来源副本保留'));else code===0&&!expired?done():reject(new TransportError(expired?null:code));});if(this.options.signal?.aborted)abort();
  });
 }
 private stage(needed:number,id:string,operation:'upload'|'recover'){
  if(this.activeStage)throw new AppError(409,'该转存实例已有进行中的操作');
  this.prepare();const measure=(p:string):number=>{const stat=lstatSync(p);if(stat.isSymbolicLink())throw new AppError(400,'转存工作目录包含链接');return stat.isDirectory()?readdirSync(p).reduce((n,name)=>n+measure(join(p,name)),0):stat.size;};
  const disk=statfsSync(this.options.workRoot);if(measure(this.options.workRoot)+needed>8*1024**3||disk.bsize*disk.bavail-needed<12*1024**3)throw new AppError(507,'转存工作空间不足，保留已有内容');
  this.activeStage=this.work!.create(id,operation,Boolean(this.options.discardWork));return this.activeStage;
 }
 private readCommit(path:string,id:string):Commit{
  const stat=lstatSync(path);if(!stat.isFile()||stat.size>4096)throw new AppError(422,'转存签收记录无效');const c=JSON.parse(readFileSync(path,'utf8')) as Commit;
  if(c.schema!==1||c.id!==id||!/^[a-f0-9]{64}$/.test(c.manifestSha256)||!Number.isSafeInteger(c.files)||c.files<1)throw new AppError(422,'转存签收记录无效');return c;
 }
 async upload(source:string,id:string=randomUUID()){
  if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id))throw new AppError(400,'转存编号无效');
  this.prepare();if(this.options.discardWork)this.work!.cleanup();
  const manifest=verifyBackup(source),needed=manifest.files.reduce((n,f)=>n+lstatSync(join(source,f.path)).size,0)*2+16*1024*1024,stage=this.stage(needed,id,'upload'),pack=join(stage,'pack'),check=join(stage,'check');mkdirSync(pack);mkdirSync(check);
  try{
  // Only verified manifest members are ever sent; credentials, extra files and
  // automatic-backup receipts outside the manifest never enter the transport.
  cpSync(join(source,'manifest.json'),join(pack,'manifest.json'));for(const file of manifest.files){const to=join(pack,file.path);mkdirSync(dirname(to),{recursive:true});cpSync(join(source,file.path),to);}
  verifyBackup(pack);const commit:Commit={schema:1,id,manifestSha256:hash(join(pack,'manifest.json')),files:manifest.files.length};
  const remote='workbench-offsite:snapshots/'+id;
  const existing=join(stage,'existing.json');let committed=false;
  try{await this.run(['copyto',remote+'/offsite-commit.json',existing]);committed=true;}catch(error){if(!(error instanceof TransportError)||![3,4].includes(error.exitCode!))throw error;}
  if(committed&&JSON.stringify(this.readCommit(existing,id))!==JSON.stringify(commit))throw new AppError(409,'转存编号已对应另一份内容，来源副本保留');
  // A stable ID reconciles a lost receipt. Size-only prevents changed staging
  // mtimes from rewriting existing crypt objects; every byte is verified below.
  if(!committed)await this.run(['copy',pack,remote,'--immutable','--size-only']);
  await this.run(['copy',remote,check]);const downloaded=verifyBackup(check);if(hash(join(check,'manifest.json'))!==commit.manifestSha256||downloaded.files.length!==commit.files)throw new AppError(422,'转存读回校验失败');
  // Verify all decrypted bytes before publishing the encrypted commit marker.
  const record=join(stage,'offsite-commit.json');writeFileSync(record,JSON.stringify(commit),{flag:'wx',mode:0o600});if(!committed)await this.run(['copyto',record,remote+'/offsite-commit.json','--immutable','--size-only']);
  const receipt=join(stage,'confirmed.json');await this.run(['copyto',remote+'/offsite-commit.json',receipt]);if(JSON.stringify(this.readCommit(receipt,id))!==JSON.stringify(commit))throw new AppError(422,'转存签收核对失败');
  // Keep CLI evidence. Automatic callers can remove only this unique owned
  // attempt after receiving confirmation; retries never replace earlier evidence.
  const evidence=join(this.options.workRoot,'verified-'+id+(existsSync(join(this.options.workRoot,'verified-'+id))?'-'+randomUUID():''));if(!this.options.discardWork)renameSync(stage,evidence);return {id,verified:true,files:commit.files,manifestSha256:commit.manifestSha256,evidence:this.options.discardWork?undefined:evidence};
  }finally{
   try{if(this.options.discardWork&&existsSync(stage))this.work!.dispose(stage);}finally{this.activeStage=undefined;}
  }
 }
 async recover(id:string,destination:string){
  if(!/^[a-f0-9-]{36}$/.test(id))throw new AppError(400,'转存恢复点无效');if(existsSync(destination))throw new AppError(409,'恢复目标必须是新目录');
  const stage=this.stage(4*1024**3,id,'recover'),pack=join(stage,'download');mkdirSync(pack);try{await this.run(['copy','workbench-offsite:snapshots/'+id,pack]);
  const commit=this.readCommit(join(pack,'offsite-commit.json'),id),manifest=verifyBackup(pack);if(hash(join(pack,'manifest.json'))!==commit.manifestSha256||manifest.files.length!==commit.files)throw new AppError(422,'恢复点清单不匹配');
  const result=restore(pack,destination,protectBackupDirectory);renameSync(stage,join(this.options.workRoot,'recovered-'+randomUUID()));return {...result,id,files:commit.files};}finally{this.activeStage=undefined;}
 }
}
