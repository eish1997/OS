import {existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,renameSync,readdirSync,rmSync,realpathSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {protectBackupDirectory} from './automatic-backup.js';
import {AppError} from './store.js';
type Owner={schema:1;id:string;root:string;configHash:string};
type Attempt={schema:1;ownerId:string;name:string;nonce:string;configHash:string;pid:number;disposable:boolean;operation:'upload'|'recover';id:string;phase:'idle'|'launching'|'running';childPid?:number};
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);
const pid=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>0&&Number(v)<=2147483647;
function noLinks(path:string){for(let p=resolve(path);;p=dirname(p)){if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw new AppError(409,'转存工作路径包含链接');if(p===dirname(p))break;}}
function read(path:string){noLinks(path);const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.size>4096)throw new AppError(409,'转存工作记录无效');return JSON.parse(readFileSync(path,'utf8'));}
function gone(value:number){try{process.kill(value,0);return false;}catch(error){return error instanceof Error&&'code' in error&&error.code==='ESRCH';}}
export class OffsiteWork {
 private owner:Owner;
 constructor(readonly root:string,readonly configHash:string){
  if(resolve(root)!==root||!/^[a-f0-9]{64}$/.test(configHash))throw new AppError(400,'转存工作归属无效');noLinks(root);
  const marker=join(root,'.offsite-work-owner.json');
  if(!existsSync(marker)){
   if(existsSync(root)&&readdirSync(root).length)throw new AppError(409,'转存工作目录已有未标记内容，等待核对');
   mkdirSync(root,{recursive:true,mode:0o700});protectBackupDirectory(root);this.owner={schema:1,id:randomUUID(),root,configHash};writeFileSync(marker,JSON.stringify(this.owner),{flag:'wx',mode:0o600});
  }else{this.owner=read(marker);this.checkOwner();protectBackupDirectory(root);}
 }
 private checkOwner(){noLinks(this.root);const o=read(join(this.root,'.offsite-work-owner.json'));if(o.schema!==1||!uuid(o.id)||o.id!==this.owner.id||o.root!==this.root||o.configHash!==this.configHash)throw new AppError(409,'转存工作归属或配置改变');}
 create(id:string,operation:'upload'|'recover',disposable:boolean){
  this.checkOwner();if(!uuid(id))throw new AppError(400,'转存工作编号无效');const path=mkdtempSync(join(this.root,'pending-'));protectBackupDirectory(path);
  const attempt:Attempt={schema:1,ownerId:this.owner.id,name:basename(path),nonce:randomUUID(),configHash:this.configHash,pid:process.pid,disposable:operation==='upload'&&disposable,operation,id,phase:'idle'};writeFileSync(join(path,'.offsite-attempt.json'),JSON.stringify(attempt),{flag:'wx',mode:0o600});return path;
 }
 private attempt(path:string):Attempt{
  this.checkOwner();if(dirname(resolve(path))!==this.root||!/^pending-[a-zA-Z0-9]+$/.test(basename(path))||realpathSync(path)!==resolve(path))throw new AppError(409,'转存暂存位置不符');noLinks(path);const a=read(join(path,'.offsite-attempt.json')) as Attempt;
  if(a.schema!==1||a.ownerId!==this.owner.id||a.name!==basename(path)||a.configHash!==this.configHash||!uuid(a.nonce)||!uuid(a.id)||!pid(a.pid)||typeof a.disposable!=='boolean'||!['upload','recover'].includes(a.operation)||!['idle','launching','running'].includes(a.phase)||(a.phase==='running'?!pid(a.childPid):a.childPid!==undefined))throw new AppError(409,'转存暂存归属无效');return a;
 }
 private change(path:string,phase:Attempt['phase'],childPid?:number){
  const a=this.attempt(path);if(a.pid!==process.pid)throw new AppError(409,'拒绝更改其他进程暂存记录');const target=join(path,'.offsite-attempt.json'),temp=join(path,'.attempt-write-'+randomUUID());const next={...a,phase,...(childPid?{childPid}:{})};if(!childPid)delete next.childPid;writeFileSync(temp,JSON.stringify(next),{flag:'wx',mode:0o600});this.attempt(path);renameSync(temp,target);
 }
 launching(path:string){this.change(path,'launching');}
 transportStarted(path:string,childPid:number){if(!pid(childPid))throw new AppError(409,'传输进程记录无效');this.change(path,'running',childPid);}
 transportFinished(path:string){this.change(path,'idle');}
 private remove(path:string){
  this.attempt(path);const check=(p:string)=>{const s=lstatSync(p);if(s.isSymbolicLink())throw new AppError(409,'转存暂存包含链接，保留内容');if(s.isDirectory())for(const n of readdirSync(p))check(join(p,n));};check(path);this.attempt(path);rmSync(path,{recursive:true});
 }
 dispose(path:string){const a=this.attempt(path);if(a.pid!==process.pid||a.phase!=='idle'||!a.disposable)throw new AppError(409,'暂存仍可能被使用，保留内容');this.remove(path);}
 cleanup(){
  this.checkOwner();let removed=0,preserved=0,uncertain=0;
  for(const name of readdirSync(this.root).filter(n=>n.startsWith('pending-'))){
   const path=join(this.root,name);try{const a=this.attempt(path);if(!a.disposable||a.operation!=='upload'||!gone(a.pid)){preserved++;continue;}if(a.phase==='launching'||(a.childPid&&!gone(a.childPid))){uncertain++;continue;}this.remove(path);removed++;}catch{uncertain++;}
  }
  return {removed,preserved,uncertain};
 }
}
