import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createApp} from '../server/app.js';
import {AutomaticBackup,type AutomaticOffsiteOptions,type OffsiteConfirmation} from '../server/automatic-backup.js';
import type {Run} from '../shared/contracts.js';
const sha=(p:string)=>createHash('sha256').update(readFileSync(join(p,'manifest.json'))).digest('hex');
async function wait(predicate:()=>boolean){const end=Date.now()+15000;while(!predicate()){assert(Date.now()<end,'offsite did not settle');await new Promise(r=>setTimeout(r,10));}}
async function setup(transfer:AutomaticOffsiteOptions['transfer']){
 const root=mkdtempSync(join(tmpdir(),'offsite-schedule-')),source=join(root,'data'),backup=join(root,'backup');let clock=Date.now();
 const app=createApp({dataDir:source,password:'offsite-test-password',schedule:false});const p=app.service.createProject('Offsite test');app.assets.write(p.id,'original.md','text/markdown','immutable original');
 const options={root:backup,validateLocation:()=>true,intervalMs:10,retainCount:2,minFreeBytes:0,maxBytes:128*1024**2,pollMs:60000,now:()=>clock,offsite:{binary:join(root,'unused'),configFile:join(root,'unused.conf'),workRoot:join(root,'work'),transfer}};
 const automatic=new AutomaticBackup(app.store,app.scheduler,source,options);await automatic.start();
 return {app,p,source,backup,options,automatic,advance:()=>clock+=11,points:()=>readdirSync(join(backup,'automatic')).filter(n=>n.startsWith('snapshot-')),close:async()=>{await automatic.stop();await app.close();}};
}
test('failed transfer pins all recovery points beyond retention; restart preserves IDs and confirmation enables later rotation',async()=>{
 const attempts:string[]=[];const q=await setup(async(_source,id)=>{attempts.push(id);throw new Error('offline');});
 try{
  for(let i=0;i<3;i++){await q.automatic.tick();await wait(()=>!q.automatic.status().offsite.running);q.advance();}
  assert.equal(q.automatic.status().error,undefined);assert(q.automatic.status().lastSuccessAt);assert(q.automatic.status().offsite.error);assert.equal(q.points().length,3);assert.equal(q.automatic.status().pruned,0);assert.equal(q.automatic.status().offsite.pending,3);
  const before=q.points().map(n=>JSON.parse(readFileSync(join(q.backup,'automatic',n,'receipt.json'),'utf8')).offsite.id).sort();assert.equal(new Set(before).size,3);
  await q.automatic.stop();const confirmed:string[]=[];
  const restarted=new AutomaticBackup(q.app.store,q.app.scheduler,q.source,{...q.options,offsite:{...q.options.offsite,transfer:async(source,id)=>{confirmed.push(id);return {id,verified:true,manifestSha256:sha(source)};}}});
  try{
   await restarted.start();await wait(()=>!restarted.status().offsite.running);assert.equal(restarted.status().offsite.pending,0);assert.deepEqual(confirmed.sort(),before);assert(attempts.every(id=>before.includes(id)));
   assert(restarted.status().offsite.lastSuccessAt);await restarted.tick();await wait(()=>!restarted.status().offsite.running);assert.equal(restarted.status().retained,2);assert.equal(restarted.status().pruned,2);
  }finally{await restarted.stop();}
 }finally{await q.close();}
});
test('transfer uses independent lease: HTTP and execution continue; shutdown aborts transport and preserves pin',async()=>{
 let entered=false,aborted=false;const q=await setup(async(_source,_id,signal)=>{entered=true;return await new Promise<OffsiteConfirmation>((_r,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(new Error('stopped'));},{once:true});});});
 try{
  await q.automatic.tick();await wait(()=>entered);assert.equal(q.app.store.db.prepare("SELECT owner FROM locks WHERE name='scheduler'").get(),undefined);assert(q.app.store.db.prepare("SELECT owner FROM locks WHERE name='offsite-backup'").get());
  await new Promise<void>(r=>q.app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(q.app.server.address() as {port:number}).port;
  const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'offsite-test-password'})});const cookie=login.headers.get('set-cookie')!.split(';')[0];await login.json();const response=await fetch(base+'/api/snapshot',{headers:{Cookie:cookie}});assert.equal(response.status,200);await response.arrayBuffer();
  const policy={version:1,projectId:q.p.id,toolNames:['write_asset','create_draft'],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:10,timeoutMs:60000};
  const run=q.app.service.submit(q.p.id,'运行固定资料计算，保存报告、图表和文章草稿','during-offsite','fixture',policy).run;q.app.scheduler.tick();assert.equal(q.app.store.get<Run>('run',run.id).status,'running');
  await q.automatic.stop();assert(aborted);assert.equal(q.automatic.status().offsite.pending,1);assert.equal(q.app.store.db.prepare("SELECT owner FROM locks WHERE name='offsite-backup'").get(),undefined);assert.equal(q.points().length,1);
 }finally{await q.close();}
});
test('wrong confirmation and changed source ownership never release a pending pin',async()=>{
 let resolveTransfer!:(value:OffsiteConfirmation)=>void;let entered=false;
 const q=await setup(async()=>{entered=true;return await new Promise<OffsiteConfirmation>(r=>resolveTransfer=r);});
 try{
  await q.automatic.tick();await wait(()=>entered);const name=q.points()[0],path=join(q.backup,'automatic',name);const receipt=JSON.parse(readFileSync(join(path,'receipt.json'),'utf8'));
  resolveTransfer({id:receipt.offsite.id,verified:true,manifestSha256:'0'.repeat(64)});await wait(()=>!q.automatic.status().offsite.running);assert(q.automatic.status().offsite.error);assert.equal(JSON.parse(readFileSync(join(path,'receipt.json'),'utf8')).offsite.verifiedAt,undefined);
  entered=false;await q.automatic.tick();await wait(()=>entered);const marker=join(q.backup,'automatic','.automatic-owner.json'),original=readFileSync(marker);writeFileSync(marker,JSON.stringify({sourceRoot:'foreign',ownerId:'foreign'}));
  resolveTransfer({id:receipt.offsite.id,verified:true,manifestSha256:sha(path)});await wait(()=>!q.automatic.status().offsite.running);assert(q.automatic.status().offsite.error);assert.equal(q.automatic.status().offsite.pending,1);assert.equal(JSON.parse(readFileSync(join(path,'receipt.json'),'utf8')).offsite.verifiedAt,undefined);writeFileSync(marker,original);
 }finally{await q.close();}
});
