import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,fork} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {StorageCapacity} from '../server/storage.js';
import {PrivateFiles} from '../server/private-files.js';
import {withChatGPTLock} from '../server/chatgpt-lock.js';
import {processBirth,sameProcessBirth,parseLinuxProcessBirth,originalProcessGone} from '../server/process-birth.js';
import {AppError} from '../server/store.js';
const fixture=()=>{const root=mkdtempSync(join(tmpdir(),'授权锁 身份 ')),capacity=new StorageCapacity(root),files=new PrivateFiles(root,capacity);files.prepare();return {root,capacity,files,path:join(files.directory,'auth.lock')};};
async function storageHolder(root:string,ms:number){
 const child=fork(resolve('tests/helpers/capacity-lock.ts'),[root,String(ms)],{execPath:process.execPath,execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 const closed=once(child,'close');await once(child,'message');return {child,closed};
}

test('brief real writer contention at authorization release waits only for acquisition and never repeats callback',async()=>{
 const q=fixture();let callbacks=0;let held:Awaited<ReturnType<typeof storageHolder>>|undefined;
 try{
  const result=await withChatGPTLock(q.files,q.capacity,async()=>{callbacks++;q.files.save('fixture-result.json',{completed:true});held=await storageHolder(q.root,500);assert.throws(()=>q.capacity.exclusive(()=>assert.fail('Live writer must retain lock')),(e:unknown)=>e instanceof AppError&&e.status===423);return 'once';});
  assert.equal(result,'once');assert.equal(callbacks,1);assert.equal(q.files.read<{completed:boolean}>('fixture-result.json')?.completed,true);assert(!existsSync(q.path));
  await held!.closed;assert.equal(await withChatGPTLock(q.files,q.capacity,async()=> 'next'),'next');
 }finally{if(held)await held.closed;}
});

test('long real writer contention leaves recoverable local completion but cannot reclaim changed or unknown live ownership',async()=>{
 const q=fixture();let callbacks=0;let held:Awaited<ReturnType<typeof storageHolder>>|undefined;
 try{
  await assert.rejects(withChatGPTLock(q.files,q.capacity,async()=>{callbacks++;held=await storageHolder(q.root,2500);return 'completed';}),(e:unknown)=>e instanceof AppError&&e.status===423);
  assert.equal(callbacks,1);const original=readFileSync(q.path);assert.equal(JSON.parse(original.toString()).pid,process.pid);
  await held!.closed;
  const changed=JSON.stringify({...JSON.parse(original.toString()),id:'unknown-live-operation'});writeFileSync(q.path,changed);
  await assert.rejects(withChatGPTLock(q.files,q.capacity,async()=>assert.fail('Changed ownership cannot use local completion')),/另一项模型授权/);assert.equal(readFileSync(q.path,'utf8'),changed);
  // Restore only this test's exact synthetic record; no production lock is touched.
  writeFileSync(q.path,original);assert.equal(await withChatGPTLock(q.files,q.capacity,async()=> 'recovered'),'recovered');assert(!existsSync(q.path));assert.equal(callbacks,1);
 }finally{if(held)await held.closed;}
});

test('callback failure remains authoritative when release also hits long storage contention; next operation recovers after writer exits',async()=>{
 const q=fixture();let held:Awaited<ReturnType<typeof storageHolder>>|undefined;const originalError=new AppError(502,'受控授权网络失败');let callbacks=0;
 try{
  await assert.rejects(withChatGPTLock(q.files,q.capacity,async()=>{callbacks++;held=await storageHolder(q.root,2500);throw originalError;}),(e:unknown)=>e===originalError);
  assert.equal(callbacks,1);assert(existsSync(q.path));await held!.closed;
  assert.equal(await withChatGPTLock(q.files,q.capacity,async()=> 'next'),'next');assert(!existsSync(q.path));assert.equal(callbacks,1);
 }finally{if(held)await held.closed;}
});

test('live authorization lock preserves bytes and excludes refresh/transfer until the actual callback completes',async()=>{
 const q=fixture();let release!:()=>void;const gate=new Promise<void>(r=>release=r);let entered=false;
 const first=withChatGPTLock(q.files,q.capacity,async()=>{entered=true;await gate;return 'first';});assert(entered);
 const original=readFileSync(q.path),owner=JSON.parse(original.toString()),birth=processBirth(process.pid);assert(birth,'Local supported runtime must observe its actual process creation');assert(sameProcessBirth(owner.birth,birth));
 try{await assert.rejects(withChatGPTLock(q.files,q.capacity,async()=>assert.fail('Concurrent callback')),/另一项模型授权/);assert(readFileSync(q.path).equals(original));}
 finally{release();await first;}assert(!existsSync(q.path));
 assert.equal(await withChatGPTLock(q.files,q.capacity,async()=> 'second'),'second');
});

test('reused-PID state reclaims only a different recorded creation and preserves live legacy or foreign-platform owners',async()=>{
 const q=fixture(),birth=processBirth(process.pid);assert(birth);const stale={...birth,start:String(BigInt(birth.start)-1n)};
 writeFileSync(q.path,JSON.stringify({pid:process.pid,id:'old-process',birth:stale}));let entered=false;
 await withChatGPTLock(q.files,q.capacity,async()=>{entered=true;const current=JSON.parse(readFileSync(q.path,'utf8'));assert.notEqual(current.id,'old-process');assert(sameProcessBirth(current.birth,birth));});assert(entered);assert(!existsSync(q.path));
 for(const owner of [{pid:process.pid,id:'legacy'},{pid:process.pid,id:'foreign',birth:birth.platform==='win32'?{platform:'linux',start:'123',boot:'00000000-0000-0000-0000-000000000000'}:{platform:'win32',start:'123'}}]){
  writeFileSync(q.path,JSON.stringify(owner));const original=readFileSync(q.path);await assert.rejects(withChatGPTLock(q.files,q.capacity,async()=>assert.fail('Live/unknown owner')),/另一项模型授权/);assert(readFileSync(q.path).equals(original));
 }
});

test('actual owned process exit releases stale authorization ownership; live process is never signalled by recovery',async()=>{
 const q=fixture(),env=Object.fromEntries(['SystemRoot','PATH','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]!]));
 const child=spawn(process.execPath,['--eval',"process.stdout.write('READY');setInterval(()=>{},1000)"],{env,windowsHide:true,stdio:['ignore','pipe','ignore']});const closed=once(child,'close');
 try{
  await once(child.stdout!,'data');assert(child.pid);const birth=processBirth(child.pid);assert(birth);assert.equal(originalProcessGone(child.pid,birth),false);
  writeFileSync(q.path,JSON.stringify({pid:child.pid,id:'actual-child',birth}));const bytes=readFileSync(q.path);await assert.rejects(withChatGPTLock(q.files,q.capacity,async()=>assert.fail('Live child owner')),/另一项模型授权/);assert(readFileSync(q.path).equals(bytes));assert.equal(child.exitCode,null);
  assert(child.kill('SIGKILL'));await closed;assert.equal(originalProcessGone(child.pid,birth),true);assert.equal(await withChatGPTLock(q.files,q.capacity,async()=> 'recovered'),'recovered');assert(!existsSync(q.path));
  writeFileSync(q.path,JSON.stringify({pid:child.pid,id:'legacy-dead'}));assert.equal(await withChatGPTLock(q.files,q.capacity,async()=> 'legacy-recovered'),'legacy-recovered');
  const foreign=birth.platform==='win32'?{platform:'linux' as const,start:'123',boot:'00000000-0000-0000-0000-000000000000'}:{platform:'win32' as const,start:'123'};assert.equal(originalProcessGone(child.pid,foreign),false);writeFileSync(q.path,JSON.stringify({pid:child.pid,id:'foreign-dead-pid',birth:foreign}));const unknown=readFileSync(q.path);await assert.rejects(withChatGPTLock(q.files,q.capacity,async()=>assert.fail('Foreign host observation')),/另一项模型授权/);assert(readFileSync(q.path).equals(unknown));
 }finally{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await closed;}}
});

test('malformed or linked authorization lock is retained for diagnosis rather than reclaimed',async()=>{
 for(const value of ['{broken',JSON.stringify({pid:process.pid,id:'bad',birth:{platform:process.platform,start:'invalid'}}),'x'.repeat(1025)]){
  const q=fixture();writeFileSync(q.path,value);await assert.rejects(withChatGPTLock(q.files,q.capacity,async()=>assert.fail('Invalid lock')),/锁需要诊断/);assert.equal(readFileSync(q.path,'utf8'),value);
 }
 const q=fixture(),outside=mkdtempSync(join(q.root,'outside-')),marker=join(outside,'marker.json');writeFileSync(marker,JSON.stringify({id:'outside'}));symlinkSync(outside,q.path,process.platform==='win32'?'junction':'dir');await assert.rejects(withChatGPTLock(q.files,q.capacity,async()=>assert.fail('Linked lock')),/锁需要诊断/);assert(existsSync(q.path));assert.equal(JSON.parse(readFileSync(marker,'utf8')).id,'outside');
});

test('Linux proc identity parser handles spaces/parentheses and requires the correct PID, start field and boot ID',()=>{
 const fields=['S',...Array(18).fill('0'),'987654','0','0'],boot='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';const text='4321 (comm has ) spaces) '+fields.join(' ');
 assert.deepEqual(parseLinuxProcessBirth(text,boot,4321),{platform:'linux',start:'987654',boot});assert.equal(parseLinuxProcessBirth(text,boot,4322),undefined);assert.equal(parseLinuxProcessBirth(text,'bad',4321),undefined);assert.equal(parseLinuxProcessBirth('4321 (comm) S 0',boot,4321),undefined);
});
