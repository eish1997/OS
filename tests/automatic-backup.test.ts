import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,existsSync,symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Scheduler } from '../server/scheduler.js';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.js';
import { AutomaticBackup } from '../server/automatic-backup.js';
import { backup,restore, verifyBackup } from '../server/backup.js';
import type { Run,SessionBinding } from '../shared/contracts.js';
import { Store } from '../server/store.js';
import { continuationFor } from '../server/native-session.js';

async function setup(){
  const folder=mkdtempSync(join(tmpdir(),'automatic backup '));const source=join(folder,'source');const root=join(folder,'backup');let clock=Date.now();
  const app=createApp({dataDir:source,password:'backup-test-password',schedule:false});
  const options={root,intervalMs:10,retainCount:2,minFreeBytes:0,maxBytes:128*1024*1024,validateLocation:()=>true,now:()=>clock};
  const automatic=new AutomaticBackup(app.store,app.scheduler,source,options);await automatic.start();await automatic.stop();
  const p=app.service.createProject('Backup test');const asset=app.assets.write(p.id,'source.md','text/markdown','test body');
  return {app,source,root,automatic,options,asset,advance:()=>{clock+=11;},close:async()=>{await automatic.stop();await app.close();}};
}
test('due backup restores data, preserves source login and prunes only its own verified snapshots; schedule survives restart',async()=>{
  const q=await setup();try{
    q.app.auth.login('backup-test-password','local');mkdirSync(join(q.root,'manual-backup'));writeFileSync(join(q.root,'manual-backup','keep'),'manual');
    const unknown=join(q.root,'automatic','snapshot-2026-01-01T00-00-00.000Z-11111111-1111-1111-1111-111111111111');mkdirSync(unknown);writeFileSync(join(unknown,'keep'),'unowned');
    await q.automatic.tick();const first=q.automatic.status().lastSuccessAt;assert(first);await q.automatic.tick();assert.equal(q.automatic.status().retained,1);
    q.advance();await q.automatic.tick();q.advance();await q.automatic.tick();const final=q.automatic.status();assert.equal(final.retained,2);assert.equal(final.pruned,1);assert.equal(final.error,undefined);
    assert(existsSync(join(unknown,'keep')));assert(existsSync(join(q.root,'manual-backup','keep')));assert.equal(q.app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n,1);
    const points=readdirSync(join(q.root,'automatic')).filter(n=>n.startsWith('snapshot-')&&existsSync(join(q.root,'automatic',n,'receipt.json')));assert.equal(points.length,2);const checked=join(q.root,'check-http');restore(join(q.root,'automatic',points[0]),checked);assert.equal(readFileSync(join(checked,'assets',q.asset.locator),'utf8'),'test body');
    await q.automatic.stop();const restarted=new AutomaticBackup(q.app.store,q.app.scheduler,q.source,q.options);try{await restarted.start();assert.equal(restarted.status().lastSuccessAt,final.lastSuccessAt);await restarted.tick();assert.equal(restarted.status().retained,2);}finally{await restarted.stop();}
  }finally{await q.close();}
});
test('queued work, running worker and unknown operations postpone maintenance without cancelling work',async()=>{
  const q=await setup();try{
    const policy={version:1,projectId:q.asset.projectId,toolNames:['write_asset','create_draft'],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:10,timeoutMs:60000};
    const run=q.app.service.submit(q.asset.projectId,'运行固定资料计算，保存报告、图表和文章草稿','waiting-backup','fixture',policy).run;await q.automatic.tick();assert.equal(q.automatic.status().waitingForIdle,true);assert.equal(q.automatic.status().lastSuccessAt,undefined);assert.equal(q.app.store.get<Run>('run',run.id).status,'queued');
    q.app.scheduler.tick();const running=q.app.store.get<Run>('run',run.id);assert.equal(running.status,'running');process.kill(running.workerPid!,0);await q.automatic.tick();assert.equal(q.automatic.status().lastSuccessAt,undefined);assert.equal(q.app.store.get<Run>('run',run.id).cancelRequested,false);
    for(let i=0;i<150&&q.app.store.get<Run>('run',run.id).status==='running';i++){await new Promise(resolve=>setTimeout(resolve,20));q.app.scheduler.tick();}
    assert.equal(q.app.store.get<Run>('run',run.id).status,'completed');await new Promise(resolve=>setTimeout(resolve,100));
    const op=q.app.store.create('operation',{projectId:run.projectId,...({runId:run.id,name:'external',state:'unknown'} as object)});await q.automatic.tick();assert.equal(q.automatic.status().lastSuccessAt,undefined);q.app.store.update('operation',op.id,op.revision,{...({state:'completed'} as object)});await q.automatic.tick();assert(q.automatic.status().lastSuccessAt);
  }finally{await q.close();}
});
test('failed new snapshot, insufficient capacity and foreign owner preserve existing recovery points',async()=>{
  const q=await setup();try{
    await q.automatic.tick();const before=q.automatic.status().lastSuccessAt;q.advance();writeFileSync(join(q.source,'assets',q.asset.locator),'tampered');await q.automatic.tick();assert(q.automatic.status().error);assert.equal(q.automatic.status().lastSuccessAt,before);assert.equal(q.automatic.status().retained,1);assert(!readdirSync(join(q.root,'automatic')).some(n=>n.startsWith('pending-')||n.startsWith('restore-')));
    writeFileSync(join(q.source,'assets',q.asset.locator),'test body');await q.automatic.stop();const small=new AutomaticBackup(q.app.store,q.app.scheduler,q.source,{...q.options,maxBytes:1});try{await small.start();await small.tick();assert(small.status().error);assert.equal(small.status().retained,1);}finally{await small.stop();}
    const marker=join(q.root,'automatic','.automatic-owner.json');const original=readFileSync(marker);writeFileSync(marker,JSON.stringify({schema:1,sourceRoot:'foreign',ownerId:'foreign'}));await q.automatic.tick();assert(q.automatic.status().error);assert.equal(q.automatic.status().retained,1);writeFileSync(marker,original);
  }finally{await q.close();}
});
test('restore rejects credential injection, duplicate paths and links before writing a destination',async()=>{
  const q=await setup();try{
    await q.automatic.tick();const name=readdirSync(join(q.root,'automatic')).find(n=>n.startsWith('snapshot-'))!;const point=join(q.root,'automatic',name);const manifestPath=join(point,'manifest.json');const original=readFileSync(manifestPath);const manifest=JSON.parse(original.toString());
    for(const path of ['credentials.json','../outside','\\outside','private-model/chatgpt.json']){writeFileSync(manifestPath,JSON.stringify({...manifest,files:[...manifest.files,{path,sha256:'0'.repeat(64)}]}));const target=join(q.root,'bad-'+Math.random());assert.throws(()=>restore(point,target));assert(!existsSync(target));}
    writeFileSync(manifestPath,JSON.stringify({...manifest,files:[...manifest.files,manifest.files[0]]}));assert.throws(()=>verifyBackup(point));writeFileSync(manifestPath,original);
    const junction=join(q.root,'linked');symlinkSync(point,junction,process.platform==='win32'?'junction':'dir');assert.throws(()=>restore(junction,join(q.root,'link-output')));assert(!existsSync(join(q.root,'link-output')));
  }finally{await q.close();}
});

async function captured(q:Awaited<ReturnType<typeof setup>>){
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){const name=readdirSync(join(q.root,'automatic')).find(n=>n.startsWith('pending-')&&existsSync(join(q.root,'automatic',n,'workbench.sqlite')));if(name)return name;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.fail('Background database snapshot was not observed');
}
function addVolume(q:Awaited<ReturnType<typeof setup>>){
  const bytes=Buffer.alloc(4*1024**2,0x61);
  for(let index=0;index<8;index++){bytes.writeUInt32LE(index,0);const upload=q.app.assets.begin(q.asset.projectId,`fixed-${index}.bin`,'application/octet-stream');q.app.assets.commit(upload.id,bytes);}
}
test('background maintenance serves HTTP, permits edits and queues execution; snapshot restoration stays consistent',async()=>{
  const q=await setup();try{
    addVolume(q);const draft=q.app.service.draft(q.asset.projectId,'Fixed before copying','before',[q.asset.id]);
    await new Promise<void>(resolve=>q.app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(q.app.server.address() as {port:number}).port}`;
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'backup-test-password'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
    const active=q.automatic.tick();assert(q.automatic.status().running);await captured(q);
    const start=performance.now();const page=await fetch(base+'/api/snapshot',{headers:{Cookie:cookie,Connection:'close'}});assert.equal(page.status,200);await page.arrayBuffer();assert(performance.now()-start<1000,'HTTP blocked by file maintenance');
    const changed=await fetch(base+`/api/drafts/${draft.id}`,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({revision:draft.revision,title:draft.title,body:'edited during copying'})});assert.equal(changed.status,200);
    const policy={version:1,projectId:q.asset.projectId,toolNames:['write_asset','create_draft'],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:10,timeoutMs:60000};
    const run=q.app.service.submit(q.asset.projectId,'运行固定资料计算，保存报告、图表和文章草稿','queued-during-maintenance','fixture',policy).run;
    q.app.scheduler.tick();const competing=new Scheduler(q.app.service);competing.tick();assert.equal(q.app.store.get<Run>('run',run.id).status,'queued');
    await active;assert.equal(q.automatic.status().error,undefined);assert.equal(q.automatic.status().running,false);
    const name=readdirSync(join(q.root,'automatic')).find(n=>n.startsWith('snapshot-'))!;const target=join(q.root,'concurrent-restore');restore(join(q.root,'automatic',name),target);
    const db=new DatabaseSync(join(target,'workbench.sqlite'),{readOnly:true});try{assert.equal(JSON.parse(String(db.prepare('SELECT body FROM entities WHERE id=?').get(draft.id)!.body)).body,'before');assert.equal(db.prepare('SELECT body FROM entities WHERE id=?').get(run.id),undefined);}finally{db.close();}
    q.app.scheduler.tick();assert.equal(q.app.store.get<Run>('run',run.id).status,'running');
    for(let index=0;index<150&&q.app.store.get<Run>('run',run.id).status==='running';index++){await new Promise(resolve=>setTimeout(resolve,20));q.app.scheduler.tick();}assert.equal(q.app.store.get<Run>('run',run.id).status,'completed');
  }finally{await q.close();}
});
test('lost lease rejects background commit and preserves existing recovery points and foreign lease',async()=>{
  const q=await setup();try{
    await q.automatic.tick();const success=q.automatic.status().lastSuccessAt;addVolume(q);q.advance();const active=q.automatic.tick();await captured(q);
    q.app.store.db.prepare("UPDATE locks SET owner='foreign-maintenance',until_ms=? WHERE name='scheduler'").run(Date.now()+60000);
    await active;assert(q.automatic.status().error);assert.equal(q.automatic.status().lastSuccessAt,success);assert.equal(q.automatic.status().retained,1);assert.equal(q.app.store.db.prepare("SELECT owner FROM locks WHERE name='scheduler'").get()!.owner,'foreign-maintenance');
    assert(!readdirSync(join(q.root,'automatic')).some(n=>n.startsWith('pending-')||n.startsWith('restore-')));
  }finally{await q.close();}
});
test('graceful stop awaits its active backup and releases scheduler ownership after a verified commit',async()=>{
  const q=await setup();try{
    const active=q.automatic.tick();assert(q.automatic.status().running);await q.automatic.stop();await active;
    assert(q.automatic.status().lastSuccessAt);assert.equal(q.automatic.status().running,false);assert.equal(q.app.store.db.prepare("SELECT owner FROM locks WHERE name='scheduler'").get(),undefined);
  }finally{await q.close();}
});
test('isolated backup worker reopens completed native sessions and remaps their scoped bindings',async()=>{
  const q=await setup();try{
    const {loadPi}=await import('../server/pi-adapter.js');const pi=await loadPi();const projectId=q.asset.projectId;const cwd=join(q.source,'workspaces',projectId);mkdirSync(cwd,{recursive:true});
    const manager=pi.SessionManager.create(cwd,join(q.source,'sessions',projectId));manager.appendMessage({role:'user',content:'fixed native session in background backup',timestamp:Date.now()});
    const policy={version:1,projectId,toolNames:['write_asset'],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:10,timeoutMs:60000};
    let run=q.app.service.submit(projectId,'native backup','fixed-native-backup','pi',policy).run;q.app.service.transition(run.id,'running');run=q.app.store.get<Run>('run',run.id);q.app.store.update<Run>('run',run.id,run.revision,{sessionId:manager.getSessionId(),sessionPath:manager.getSessionFile()!});q.app.service.transition(run.id,'completed');
    q.app.store.create<SessionBinding>('session_binding',{id:'session:'+run.id,projectId,runId:run.id,taskId:run.taskId,sessionId:manager.getSessionId(),sessionPath:manager.getSessionFile()!,cwd,piVersion:'1.0.3',policyVersion:1,model:'',authKind:'api'});
    const original=readFileSync(manager.getSessionFile()!);await q.automatic.tick();assert.equal(q.automatic.status().error,undefined);assert(q.automatic.status().restoreCheckedAt);assert.deepEqual(readFileSync(manager.getSessionFile()!),original);
    const name=readdirSync(join(q.root,'automatic')).find(n=>n.startsWith('snapshot-'))!;const target=join(q.root,'native-worker-restore');restore(join(q.root,'automatic',name),target);const restored=new Store(join(target,'workbench.sqlite'));
    try{const binding=restored.get<SessionBinding>('session_binding','session:'+run.id);assert(binding.sessionPath.startsWith(target));assert(binding.cwd.startsWith(target));const opened=pi.SessionManager.open(binding.sessionPath,undefined,binding.cwd);assert.equal(opened.getSessionId(),manager.getSessionId());assert.equal(opened.buildSessionContext().messages.length,1);}finally{restored.close();}
  }finally{await q.close();}
});
test('delegated backup uses read-only source and leaves lease ownership and renewal to the host',async()=>{
  const q=await setup();try{
    const owner=q.app.scheduler.owner;assert(q.app.store.lease('scheduler',owner,120000));const lease=q.app.store.db.prepare("SELECT owner,until_ms FROM locks WHERE name='scheduler'").get();const reader=new Store(join(q.source,'workbench.sqlite'),{readOnly:true});
    try{assert.throws(()=>reader.db.exec("INSERT INTO metadata VALUES('illegal-writer','1')"));backup(reader,q.source,join(q.root,'delegated-readonly'),owner);}finally{reader.close();}
    assert.deepEqual(q.app.store.db.prepare("SELECT owner,until_ms FROM locks WHERE name='scheduler'").get(),lease);q.app.store.release('scheduler',owner);
  }finally{await q.close();}
});

test('accepted native history over foreground limit is archived and SDK-reopened; interactive guard and corruption protection remain',async()=>{
  const q=await setup();try{
    const {loadPi}=await import('../server/pi-adapter.js');const pi=await loadPi();const projectId=q.asset.projectId;const cwd=join(q.source,'workspaces',projectId);mkdirSync(cwd,{recursive:true});
    const manager=pi.SessionManager.create(cwd,join(q.source,'sessions',projectId));for(let i=0;i<3;i++)manager.appendMessage({role:'user',content:'Accepted archive '+i+' '+('x'.repeat(1024*1024)),timestamp:Date.now()});
    const policy={version:1,projectId,toolNames:['write_asset'],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:10,timeoutMs:60000};
    let run=q.app.service.submit(projectId,'large native archive','large-native-archive','pi',policy).run;q.app.service.transition(run.id,'running');run=q.app.store.get<Run>('run',run.id);q.app.store.update<Run>('run',run.id,run.revision,{sessionId:manager.getSessionId(),sessionPath:manager.getSessionFile()!});q.app.service.transition(run.id,'completed');
    q.app.store.create<SessionBinding>('session_binding',{id:'session:'+run.id,projectId,runId:run.id,taskId:run.taskId,sessionId:manager.getSessionId(),sessionPath:manager.getSessionFile()!,cwd,piVersion:'1.0.3',policyVersion:1,model:'',authKind:'api'});
    assert.throws(()=>continuationFor(q.app.store,projectId,policy,run.id),e=>e instanceof Error&&'status'in e&&e.status===413);
    const original=readFileSync(manager.getSessionFile()!);await q.automatic.tick();assert.equal(q.automatic.status().error,undefined);assert(q.automatic.status().restoreCheckedAt);assert.deepEqual(readFileSync(manager.getSessionFile()!),original);
    const point=readdirSync(join(q.root,'automatic')).find(n=>n.startsWith('snapshot-'))!;const target=join(q.root,'large-native-restore');restore(join(q.root,'automatic',point),target);const recovered=new Store(join(target,'workbench.sqlite'));
    try{const binding=recovered.get<SessionBinding>('session_binding','session:'+run.id);assert.equal(continuationFor(recovered,projectId,policy,run.id,'archive')!.sessionId,manager.getSessionId());assert.throws(()=>continuationFor(recovered,projectId,policy,run.id),e=>e instanceof Error&&'status'in e&&e.status===413);assert.deepEqual(readFileSync(binding.sessionPath),original);assert.equal(pi.SessionManager.open(binding.sessionPath,undefined,binding.cwd).buildSessionContext().messages.length,3);}finally{recovered.close();}
    const success=q.automatic.status().lastSuccessAt;q.advance();const rows=original.toString().trim().split('\n');const header=JSON.parse(rows[0]);rows[0]=JSON.stringify({...header,id:'foreign-session'});writeFileSync(manager.getSessionFile()!,rows.join('\n')+'\n');await q.automatic.tick();assert(q.automatic.status().error);assert.equal(q.automatic.status().lastSuccessAt,success);assert.equal(q.automatic.status().retained,1);assert(!readdirSync(join(q.root,'automatic')).some(n=>n.startsWith('pending-')||n.startsWith('restore-')));
  }finally{await q.close();}
});

test('startup recovery scan serves data, verifies each point and drains its own process on stop',async()=>{
  const q=await setup();try{
    addVolume(q);await q.automatic.tick();q.advance();await q.automatic.tick();await q.automatic.stop();
    const points=readdirSync(join(q.root,'automatic')).filter(n=>n.startsWith('snapshot-'));assert.equal(points.length,2);
    writeFileSync(join(q.root,'automatic',points[0],'assets',q.asset.locator),'corrupted recovery point');
    await new Promise<void>(resolve=>q.app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(q.app.server.address() as {port:number}).port}`;
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'backup-test-password'})});const cookie=login.headers.get('set-cookie')!.split(';')[0];await login.json();
    const restarted=new AutomaticBackup(q.app.store,q.app.scheduler,q.source,q.options);
    try{
      const preparing=restarted.start();assert.equal(restarted.status().checking,true);assert.equal(restarted.status().enabled,false);
      await restarted.tick();assert.equal(restarted.status().running,undefined);
      const at=performance.now();const response=await fetch(base+'/api/snapshot',{headers:{Cookie:cookie,Connection:'close'}});assert.equal(response.status,200);await response.arrayBuffer();assert(performance.now()-at<1000,'Data access blocked by startup recovery scan');
      await restarted.stop();await preparing;assert.equal(restarted.status().checking,false);assert.equal(restarted.status().enabled,true);assert.equal(restarted.status().retained,1);assert.equal(restarted.status().error,undefined);
      assert.equal(readdirSync(join(q.root,'automatic')).filter(n=>n.startsWith('snapshot-')).length,2,'Startup scan must not delete invalid or valid points');
      const marker=join(q.root,'automatic','.automatic-owner.json');const original=readFileSync(marker);const next=restarted.start();writeFileSync(marker,JSON.stringify({schema:1,sourceRoot:'foreign',ownerId:'foreign'}));await next;await restarted.stop();assert.equal(restarted.status().enabled,false);assert(restarted.status().error);writeFileSync(marker,original);
    }finally{await restarted.stop();}
  }finally{await q.close();}
});
