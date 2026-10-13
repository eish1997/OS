import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {StorageCapacity} from '../../server/storage.js';
import {PrivateFiles} from '../../server/private-files.js';
import {withChatGPTLock} from '../../server/chatgpt-lock.js';
import {AppError} from '../../server/store.js';
const phase=process.argv[2];assert(['before','after'].includes(phase));
const root=mkdtempSync(join(tmpdir(),'授权释放 真实竞争 '));const capacity=new StorageCapacity(root),files=new PrivateFiles(root,capacity);files.prepare();
const path=join(files.directory,'auth.lock');let callbacks=0;let callbackResult:unknown;let firstError:unknown;let childPid:number|undefined;let childExit:unknown;
try{
 callbackResult=await withChatGPTLock(files,capacity,async()=>{
  callbacks++;files.save('synthetic-result.json',{completed:true});
  const child=fork(resolve('tests/helpers/capacity-lock.ts'),[root,'250'],{execPath:process.execPath,execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});childPid=child.pid;const close=once(child,'close');
  await once(child,'message');void close.then(value=>{childExit=value;});
  return 'completed-once';
 });
}catch(error){firstError=error;}
const waitEnd=Date.now()+10000;while(childExit===undefined&&Date.now()<waitEnd)await new Promise(r=>setTimeout(r,10));assert(childExit!==undefined);
let recovered=false;let secondError:unknown;
try{recovered=await withChatGPTLock(files,capacity,async()=>true);}catch(error){secondError=error;}
const value={at:new Date().toISOString(),phase,root,status:phase==='before'?'reproduced':'passed',callbacks,callbackResult,callbackSideEffectPersisted:JSON.parse(readFileSync(join(files.directory,'synthetic-result.json'),'utf8')).completed,firstError:firstError instanceof AppError?{status:firstError.status,message:firstError.message}:undefined,secondError:secondError instanceof AppError?{status:secondError.status,message:secondError.message}:undefined,recovered,authLockRemaining:existsSync(path),childPid,childExit,modelRequests:0};
if(phase==='before'){assert(firstError instanceof AppError&&firstError.status===423);assert(secondError instanceof AppError&&secondError.status===423);assert(value.authLockRemaining);assert.equal(callbacks,1);}else{assert.equal(callbackResult,'completed-once');assert.equal(firstError,undefined);assert(recovered&&!value.authLockRemaining);assert.equal(callbacks,1);}
writeFileSync(`output/dev-evidence/auth-release-052-${phase}.json`,JSON.stringify(value,null,2)+'\n');console.log(JSON.stringify(value));
