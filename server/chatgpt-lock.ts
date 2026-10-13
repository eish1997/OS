import {existsSync,lstatSync,readFileSync,unlinkSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AppError} from './store.js';
import type {PrivateFiles} from './private-files.js';
import type {StorageCapacity} from './storage.js';
import {originalProcessGone,processBirth,validProcessBirth,type ProcessBirth} from './process-birth.js';

// Only exact records created by this process whose callback has ended may be
// recovered while their PID remains alive. Active/foreign/unknown locks retain
// the process-identity rule; a restart deliberately loses this local evidence.
const completedLocks=new Map<string,string>();
function lockOwner(path:string):{owner:{pid:number;id:string;birth?:ProcessBirth};content:string}{
 try{
  const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024)throw new Error();
  const content=readFileSync(path,'utf8'),owner=JSON.parse(content);
  if(!Number.isSafeInteger(owner.pid)||owner.pid<=0||typeof owner.id!=='string'||(owner.birth!==undefined&&!validProcessBirth(owner.birth)))throw new Error();
  return {owner,content};
 }catch{throw new AppError(423,'模型授权锁需要诊断');}
}

// The same lock covers refresh, sign-in and session transfer on each host.
export async function withChatGPTLock<T>(files:PrivateFiles,capacity:StorageCapacity,fn:()=>Promise<T>):Promise<T>{
 files.prepare();const path=join(files.directory,'auth.lock'),id=randomUUID();
 const key=process.platform==='win32'?resolve(path).toLowerCase():resolve(path);let content='';
 capacity.exclusive(()=>{
  if(existsSync(path)){
   const record=lockOwner(path),owner=record.owner;
   const locallyCompleted=owner.pid===process.pid&&completedLocks.get(key)===record.content;
   if(!locallyCompleted&&!originalProcessGone(owner.pid,owner.birth))throw new AppError(423,'另一项模型授权操作正在处理');
   unlinkSync(path);
  }
  completedLocks.delete(key);
  content=JSON.stringify({pid:process.pid,id,birth:processBirth(process.pid)});capacity.assert(undefined,Buffer.byteLength(content),true);writeFileSync(path,content,{flag:'wx',mode:0o600});
 });
 let callbackFailed=false;
 try{return await fn();}catch(error){callbackFailed=true;throw error;}
 finally{
  completedLocks.set(key,content);
  try{
   capacity.exclusive(()=>{
    if(existsSync(path)){const record=lockOwner(path);if(record.owner.pid===process.pid&&record.content===content)unlinkSync(path);}
    completedLocks.delete(key);
   },1000); // Retry acquisition only, never the refresh/sign-in/transfer callback.
  }catch(error){if(!callbackFailed)throw error;}
 }
}
