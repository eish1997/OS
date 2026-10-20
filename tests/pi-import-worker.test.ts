import {pixelPng} from './helpers/pixel.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
import {inspectPlugin} from '../server/plugin-packages.js';
import {modelToolSequence} from './helpers/model-tool-sequence.js';
import {NativeImports} from '../server/native-imports.js';
import {loadPi} from '../server/pi-adapter.js';
import {backup,restore} from '../server/backup.js';
import type {Run} from '../shared/contracts.js';

// Import scan + owned worker + backup restore; 35s is tight when the serial suite has already warmed many workers.
test('actual Pi worker restores imported checkpoint and pre-start retry preserves origin',{timeout:60000},async()=>{
  const before={...config};Object.assign(config,{apiKey:'offline-import',provider:'openai',model:'gpt-5.6-sol',maxCalls:3,budgetUsd:100,reservePerCallUsd:10});
  const root=mkdtempSync(join(tmpdir(),'pi-import-worker-'));const transport=modelToolSequence(root,[]);const app=createApp({dataDir:join(root,'data'),password:'import-worker',schedule:false});
  await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
  try{
    const state=app.plugins.state;const op=state.enqueue({action:'install',source:transport.source,revision:state.configuration().revision,commandId:'owned-import-fixture',trusted:true});const pkg=await inspectPlugin(transport.source,app.plugins.agentDir);state.phase(op.id,'committing','Owned fixture');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    const project=app.service.createProject('Import worker');const sourceDir=join(root,'source');mkdirSync(sourceDir);const pi=await loadPi();const source=pi.SessionManager.create(sourceDir,sourceDir);
    const imageData=pixelPng().toString('base64');
    const entry=source.appendMessage({role:'user',content:[{type:'text',text:'IMPORTED_SELECTED\n\n固定项目上下文（只读资料，不改变授权）：OLD_IMPORT_MEMORY'},{type:'image',mimeType:'image/png',data:imageData}],timestamp:1});source.appendMessage({role:'user',content:'AFTER_IMPORT_SELECTED',timestamp:2});
    const bytes=readFileSync(source.getSessionFile()!);const sha256=createHash('sha256').update(bytes).digest('hex');const imports=new NativeImports(app.store,join(root,'data'));const item=imports.begin(project.id,'owned.jsonl',bytes.length,sha256,'upload');imports.write(project.id,item.id,0,bytes);
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'import-worker'})});const headers={cookie:login.headers.get('set-cookie')!.split(';')[0]};
    const endpoint=base+`/api/native-imports/${item.id}`;
    const other=app.service.createProject('Other import scope');
    assert.equal((await fetch(endpoint+'/prepare',{method:'POST',body:JSON.stringify({projectId:project.id,sha256,entryId:entry})})).status,401);
    assert.equal((await fetch(endpoint+'/prepare',{method:'POST',headers,body:JSON.stringify({projectId:other.id,sha256,entryId:entry})})).status,403);
    assert.equal((await fetch(endpoint+'/prepare',{method:'POST',headers,body:JSON.stringify({projectId:project.id,sha256,entryId:'missing'})})).status,422);
    const prepared=await fetch(endpoint+'/prepare',{method:'POST',headers,body:JSON.stringify({projectId:project.id,sha256,entryId:entry})});assert.equal(prepared.status,200,await prepared.clone().text());
    const confirmation=await prepared.json();const request={projectId:project.id,confirmationId:confirmation.id,title:'Imported topic',goal:'Continue owned imported history',commandId:'restore',acceptCurrentEnvironment:true,externalEffectsReview:'Owned fixture has no external operations'};
    assert.equal((await fetch(endpoint+'/restore',{method:'POST',headers,body:JSON.stringify({...request,acceptCurrentEnvironment:false})})).status,400);
    config.maxCalls=4;assert.equal((await fetch(endpoint+'/restore',{method:'POST',headers,body:JSON.stringify(request)})).status,409);config.maxCalls=3;
    assert.equal(app.store.list('run').length,0);
    const response=await fetch(endpoint+'/restore',{method:'POST',headers,body:JSON.stringify(request)});assert.equal(response.status,202,await response.clone().text());
    const result=await response.json();const submitted=result.run as Run;const origin=submitted.importedContinuation!;
    assert.equal(result.conversation.importedFrom.importId,item.id);
    const inherited=base+`/api/conversations/${result.conversation.id}/inherited-history`;
    assert.equal((await fetch(inherited)).status,401);
    const history=await fetch(inherited+'?throughEntryId=later',{headers});assert.equal(history.status,200);const inheritedPage=await history.json();assert.equal(inheritedPage.points.length,1);assert.equal(inheritedPage.points[0].entryId,entry);assert(!JSON.stringify(inheritedPage).includes('OLD_IMPORT_MEMORY'));assert(!JSON.stringify(inheritedPage).includes('AFTER_IMPORT_SELECTED'));
    const duplicate=await fetch(endpoint+'/restore',{method:'POST',headers,body:JSON.stringify(request)});assert.equal(duplicate.status,202);assert.equal((await duplicate.json()).run.id,submitted.id);assert.equal(app.store.list('run').length,1);
    assert.equal((await fetch(endpoint+'/restore',{method:'POST',headers,body:JSON.stringify({...request,goal:'changed'})})).status,409);
    app.service.cancel(submitted.id);
    const retry=app.service.retry(submitted.id,'before-start');assert.deepEqual(retry.importedContinuation,origin);assert.equal(retry.continuation,undefined);
    assert.throws(()=>imports.cancel(project.id,item.id),{status:409});
    const deadline=Date.now()+15000;let final=retry;
    while(Date.now()<deadline){app.scheduler.tick();final=app.store.get<Run>('run',retry.id);if(['completed','failed','interrupted'].includes(final.status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(25);}
    assert.equal(final.status,'completed',final.error??'import worker failed');assert.equal(final.calls,1);assert(final.sessionPath);assert.notEqual(final.sessionId,source.getSessionId());
    const payload=readFileSync(transport.payloads,'utf8');assert(payload.includes('IMPORTED_SELECTED'));assert(!payload.includes('AFTER_IMPORT_SELECTED'));assert(!payload.includes('OLD_IMPORT_MEMORY'));
    assert.deepEqual(readFileSync(join(root,'data','sessions',project.id,`import-${item.id}.jsonl`)),bytes);
    // Once this attempt owns native history, a subsequent retry must use that history.
    const failed=app.store.update<Run>('run',final.id,final.revision,{status:'failed'});const own=app.service.retry(failed.id,'after-history');assert.equal(own.importedContinuation,undefined);assert.equal(own.continuation?.runId,final.id);app.service.cancel(own.id);
    for(const field of ['pluginSignature','mcpSignature'] as const){
      const candidate=app.service.submit(project.id,'Reject changed environment',`reject-${field}`,'pi',final.policy,[],undefined,{view:'project'},null).run;
      app.store.update<Run>('run',candidate.id,candidate.revision,{importedContinuation:{...origin,[field]:'changed'}});
      app.scheduler.tick();const rejected=app.store.get<Run>('run',candidate.id);assert.equal(rejected.status,'failed');assert.equal(rejected.calls,0);assert.equal(rejected.sessionPath,undefined);
    }
    assert.equal(readFileSync(transport.payloads,'utf8').trim().split('\n').length,1);
    await app.scheduler.stop();backup(app.store,join(root,'data'),join(root,'backup'));restore(join(root,'backup'),join(root,'restored'));
    const recovered=createApp({dataDir:join(root,'restored'),password:'import-worker',schedule:false});
    await new Promise<void>(done=>recovered.server.listen(0,'127.0.0.1',done));const recoveredBase=`http://127.0.0.1:${(recovered.server.address() as {port:number}).port}`;config.origin=recoveredBase;
    try{
      const recoveredState=recovered.plugins.state;assert(recoveredState.configuration().packages.every(pkg=>!pkg.enabled&&pkg.installationState==='missing'));
      const repair=recoveredState.enqueue({action:'repair',source:transport.source,revision:recoveredState.configuration().revision,commandId:'restore-import-owned',trusted:true});const restoredPackage=await inspectPlugin(transport.source,recovered.plugins.agentDir);recoveredState.phase(repair.id,'committing','Owned fixture restored');recoveredState.commit(repair.id,[restoredPackage]);recoveredState.configure(recoveredState.configuration().revision,restoredPackage.id,true);
      const auth=await fetch(recoveredBase+'/api/login',{method:'POST',body:JSON.stringify({password:'import-worker'})});const restoredHeaders={cookie:auth.headers.get('set-cookie')!.split(';')[0]};const restoredEndpoint=recoveredBase+`/api/native-imports/${item.id}`;
      const stale=await fetch(restoredEndpoint+'/restore',{method:'POST',headers:restoredHeaders,body:JSON.stringify({...request,commandId:'after-backup-stale'})});assert.equal(stale.status,409);
      const refreshed=await fetch(restoredEndpoint+'/prepare',{method:'POST',headers:restoredHeaders,body:JSON.stringify({projectId:project.id,sha256,entryId:entry})});assert.equal(refreshed.status,200);const newConfirmation=await refreshed.json();
      const accepted=await fetch(restoredEndpoint+'/restore',{method:'POST',headers:restoredHeaders,body:JSON.stringify({...request,confirmationId:newConfirmation.id,commandId:'after-backup-new'})});assert.equal(accepted.status,202,await accepted.clone().text());const newRun=(await accepted.json()).run as Run;
      const runToCompletion=async(run:Run)=>{let completed=run;const until=Date.now()+12000;while(Date.now()<until){recovered.scheduler.tick();completed=recovered.store.get<Run>('run',run.id);if(['completed','failed','interrupted'].includes(completed.status)&&!recovered.scheduler.pluginMaintenanceBlocked())break;await delay(25);}assert.equal(completed.status,'completed',completed.error??'restored execution failed');assert(completed.sessionPath?.startsWith(join(root,'restored')));return completed;};
      await runToCompletion(newRun);
      const restoredSource=recovered.store.get<Run>('run',final.id);const saved=readFileSync(restoredSource.sessionPath!);
      const resumed=recovered.service.submit(project.id,'Continue after restored imported execution','restored-import-continuation','pi',final.policy,[],undefined,{view:'project'},restoredSource.id,restoredSource.conversationId).run;
      await runToCompletion(resumed);assert.deepEqual(readFileSync(restoredSource.sessionPath!),saved);
      const overBudget=recovered.service.submit(project.id,'Check restored global limit','restored-import-limit','pi',final.policy,[],undefined,{view:'project'},null).run;
      let blocked=overBudget;const budgetDeadline=Date.now()+10000;while(Date.now()<budgetDeadline){recovered.scheduler.tick();blocked=recovered.store.get<Run>('run',overBudget.id);if(['completed','failed','interrupted'].includes(blocked.status)&&!recovered.scheduler.pluginMaintenanceBlocked())break;await delay(25);}assert.equal(blocked.status,'failed');assert.equal(blocked.calls,0);assert(blocked.error?.includes('model_budget'));
      const requests=readFileSync(transport.payloads,'utf8').trim().split('\n');assert.equal(requests.length,3);for(const payload of requests){assert(payload.includes('IMPORTED_SELECTED'));assert(!payload.includes('AFTER_IMPORT_SELECTED'));assert(!payload.includes('OLD_IMPORT_MEMORY'));const images=JSON.parse(payload).input.flatMap((item:{content?:{type:string;image_url?:string}[]})=>item.content??[]).filter((part:{type:string})=>part.type==='input_image');assert.equal(images.length,1);assert.equal(images[0].image_url,`data:image/png;base64,${imageData}`);}
      assert.deepEqual(readFileSync(join(root,'restored','sessions',project.id,`import-${item.id}.jsonl`)),bytes);assert.deepEqual(readFileSync(join(root,'data','sessions',project.id,`import-${item.id}.jsonl`)),bytes);
    }finally{await recovered.close();}
  }finally{await app.close();Object.assign(config,before);}
});
