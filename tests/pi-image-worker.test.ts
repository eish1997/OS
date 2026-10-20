import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {crc32,deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
import {inspectPlugin} from '../server/plugin-packages.js';
import {imageAttachments} from '../server/image-attachments.js';
import {modelToolSequence} from './helpers/model-tool-sequence.js';
import {backup,restore} from '../server/backup.js';
import {Store} from '../server/store.js';
import {loadPi} from '../server/pi-adapter.js';
import type {Run} from '../shared/contracts.js';
import type {Task} from '../shared/contracts.js';

test('image asset reaches actual Pi request and native history with its source',{timeout:45000},async()=>{
  const before={...config};Object.assign(config,{apiKey:'offline-image',provider:'openai',model:'gpt-5.6-sol',maxCalls:5,budgetUsd:100,reservePerCallUsd:10});
  const root=mkdtempSync(join(tmpdir(),'pi-image-worker-'));const transport=modelToolSequence(root,[]);
  const control=join(root,'response-mode.txt');writeFileSync(control,'fail');
  const transportPath=join(transport.source,'transport.mjs');
  writeFileSync(transportPath,readFileSync(transportPath,'utf8').replace("import {appendFileSync}","import {appendFileSync,readFileSync}").replace('const step=steps[calls++];',`if(readFileSync(${JSON.stringify(control)},'utf8')==='fail')return new Response(JSON.stringify({error:{message:'Owned permanent failure',type:'invalid_request_error'}}),{status:400,headers:{'Content-Type':'application/json'}});const step=steps[calls++];`));
  writeFileSync(join(transport.source,'command.mjs'),"export default pi=>pi.registerCommand('rememberimage',{description:'Owned image command',handler:async(args)=>{if(args!=='')throw new Error('Image metadata changed command arguments');}});");
  writeFileSync(join(transport.source,'package.json'),JSON.stringify({name:'owned-model-sequence',pi:{extensions:['transport.mjs','command.mjs']}}));
  const app=createApp({dataDir:join(root,'data'),password:'image-test-password',schedule:false});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
  try{
    const state=app.plugins.state;const op=state.enqueue({action:'install',source:transport.source,revision:state.configuration().revision,commandId:'transport',trusted:true});const pkg=await inspectPlugin(transport.source,app.plugins.agentDir);state.phase(op.id,'committing','Fixture');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    const project=app.service.createProject('Image fixture');
    const chunk=(type:string,data:Buffer)=>{const body=Buffer.concat([Buffer.from(type),data]);const size=Buffer.alloc(4);size.writeUInt32BE(data.length);const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(body));return Buffer.concat([size,body,checksum]);};
    const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=2;
    const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0]))),chunk('IEND',Buffer.alloc(0))]);
    const asset=app.assets.commit(app.assets.begin(project.id,'pixel.png','image/png').id,bytes);
    const repeated=await imageAttachments(app.store,app.assets,project.id,[asset.id,asset.id],true);assert.equal(repeated.images.length,1);
    const five=[asset,...Array.from({length:4},(_,i)=>app.assets.commit(app.assets.begin(project.id,`pixel-${i}.png`,'image/png').id,bytes))];
    await assert.rejects(imageAttachments(app.store,app.assets,project.id,five.map(item=>item.id),true),/最多附加4张/);
    await assert.rejects(imageAttachments(app.store,app.assets,project.id,[asset.id],false),/不支持图片/);
    const other=app.service.createProject('Other');await assert.rejects(imageAttachments(app.store,app.assets,other.id,[asset.id],true),/不属于当前项目/);
    const fake=app.assets.commit(app.assets.begin(project.id,'fake.png','image/png').id,Buffer.from('not an image'));
    await assert.rejects(imageAttachments(app.store,app.assets,project.id,[fake.id],true),/格式不支持/);
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({password:'image-test-password'})});
    const headers={'content-type':'application/json',origin:base,cookie:login.headers.get('set-cookie')!.split(';')[0]};
    const invalid=await fetch(base+'/api/tasks',{method:'POST',headers,body:JSON.stringify({projectId:project.id,goal:'Inspect image',commandId:'invalid-image',assetIds:[fake.id]})});assert.equal(invalid.status,400);assert.equal(app.store.list<Run>('run').length,0);
    const response=await fetch(base+'/api/tasks',{method:'POST',headers,body:JSON.stringify({projectId:project.id,goal:'Inspect attached pixel',commandId:'image-fixture',assetIds:[asset.id]})});assert.equal(response.status,202,await response.clone().text());
    let {run}=await response.json() as {run:Run};
    // Alter the owned fixture after successful HTTP preflight but before dispatch.
    // The worker must revalidate the frozen source, never send these replacement bytes.
    writeFileSync(join(app.assets.dir,asset.locator),Buffer.from('replaced after submission'));
    const rejectedDeadline=Date.now()+10000;let rejected=run;
    while(Date.now()<rejectedDeadline){app.scheduler.tick();rejected=app.store.get<Run>('run',run.id);if(['completed','failed','interrupted'].includes(rejected.status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
    assert.equal(rejected.status,'failed');assert.equal(rejected.calls,0,'corrupt image never reaches a model request');
    writeFileSync(join(app.assets.dir,asset.locator),bytes);
    run=app.service.retry(rejected.id,'retry-original-image');
    assert.equal(run.taskId,rejected.taskId);assert.equal(run.parentRunId,rejected.id);
    assert.deepEqual(app.store.get<Task>('task',run.taskId).context.assetIds,[asset.id]);
    const modelFailureDeadline=Date.now()+10000;let modelFailure=run;
    while(Date.now()<modelFailureDeadline){app.scheduler.tick();modelFailure=app.store.get<Run>('run',run.id);if(['completed','failed','interrupted'].includes(modelFailure.status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
    assert.equal(modelFailure.status,'failed');assert.equal(modelFailure.calls,1);
    const failedHistory=readFileSync(modelFailure.sessionPath!,'utf8');assert(failedHistory.includes(bytes.toString('base64')));
    writeFileSync(control,'ok');run=app.service.retry(modelFailure.id,'retry-image-model-failure');
    const deadline=Date.now()+12000;let final=run;
    while(Date.now()<deadline){app.scheduler.tick();final=app.store.get<Run>('run',run.id);if(['completed','failed','interrupted'].includes(final.status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
    assert.equal(final.status,'completed',final.error??'image task failed');assert.equal(final.calls,1);
    assert.equal(readFileSync(modelFailure.sessionPath!,'utf8'),failedHistory,'retry preserves failed native history');
    const initialRequests=readFileSync(transport.payloads,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(initialRequests.length,2);
    const request=initialRequests[1];
    const content=request.input.flatMap((item:{content?:unknown[]})=>item.content??[]);
    assert.equal(content.filter((item:{type:string})=>item.type==='input_image').length,1,'retry must not duplicate its image already present in effective history');
    assert(content.some((item:{type:string;image_url?:string})=>item.type==='input_image'&&item.image_url===`data:image/png;base64,${bytes.toString('base64')}`));
    const editPi=await loadPi();const editable=editPi.SessionManager.open(final.sessionPath!);
    const originalUser=editable.getEntries().find(entry=>entry.type==='message'&&entry.message.role==='user'&&Array.isArray(entry.message.content)&&entry.message.content.some(part=>part.type==='image'));
    assert(originalUser?.type==='message'&&originalUser.message.role==='user'&&Array.isArray(originalUser.message.content));
    editable.appendContextEdit(originalUser.id,{content:[{type:'text',text:'EDITED_IMAGE_USER\n\n固定项目上下文（只读资料，不改变授权）：DELETED_CONTEXT_EDIT_SECRET'},...originalUser.message.content.filter(part=>part.type==='image')]});
    const history=readFileSync(final.sessionPath!,'utf8');assert(history.includes(bytes.toString('base64')));assert(history.includes(asset.hash));assert(history.includes(asset.id));
    assert.deepEqual(app.assets.read(asset),bytes,'original image is unchanged');
    const next=app.service.submit(project.id,'Recall the earlier image without a new attachment','image-continuation','pi',final.policy,[],undefined,{view:'project'},final.id).run;
    const nextDeadline=Date.now()+12000;let continued=next;
    while(Date.now()<nextDeadline){app.scheduler.tick();continued=app.store.get<Run>('run',next.id);if(['completed','failed','interrupted'].includes(continued.status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
    assert.equal(continued.status,'completed',continued.error??'image continuation failed');assert.equal(continued.calls,1);
    const requests=readFileSync(transport.payloads,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(requests.length,3);
    assert(JSON.stringify(requests[2]).includes('EDITED_IMAGE_USER'));assert(!JSON.stringify(requests[2]).includes('DELETED_CONTEXT_EDIT_SECRET'));
    const nextImages=requests[2].input.flatMap((item:{content?:unknown[]})=>item.content??[]).filter((item:{type:string})=>item.type==='input_image');
    assert.equal(nextImages.length,1,'historical image is present once without being reattached');assert.equal(nextImages[0].image_url,`data:image/png;base64,${bytes.toString('base64')}`);
    assert.equal(readFileSync(final.sessionPath!,'utf8'),history,'continuation does not mutate original history');
    const command=app.service.submit(project.id,'/rememberimage','image-command','pi',final.policy,[asset.id],undefined,{view:'project'},null).run;
    const commandDeadline=Date.now()+10000;let commandFinal=command;
    while(Date.now()<commandDeadline){app.scheduler.tick();commandFinal=app.store.get<Run>('run',command.id);if(['completed','failed','interrupted'].includes(commandFinal.status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
    assert.equal(commandFinal.status,'completed',commandFinal.error??'image command failed');assert.equal(commandFinal.calls,0,'command interception does not cause a model request');
    const commandHistory=readFileSync(commandFinal.sessionPath!,'utf8');assert(commandHistory.includes(bytes.toString('base64')));assert(commandHistory.includes(asset.hash));
    const sourceBytes=readFileSync(continued.sessionPath!);const native=await loadPi();
    const branchEntry=native.SessionManager.open(continued.sessionPath!).getEntries().find(entry=>entry.type==='message'&&entry.message.role==='user'&&Array.isArray(entry.message.content)&&entry.message.content.some(part=>part.type==='image'))!;
    const branchBody={projectId:project.id,entryId:branchEntry.id,sourceHash:createHash('sha256').update(sourceBytes).digest('hex'),title:'Image branch',goal:'Branch from the first image',commandId:'http-image-branch'};
    const branchUrl=base+`/api/runs/${continued.id}/branch`;
    assert.equal((await fetch(branchUrl,{method:'POST',body:JSON.stringify(branchBody)})).status,401);
    assert.equal((await fetch(branchUrl,{method:'POST',headers:{...headers,origin:'https://foreign.invalid'},body:JSON.stringify(branchBody)})).status,403);
    const branchResponse=await fetch(branchUrl,{method:'POST',headers,body:JSON.stringify(branchBody)});assert.equal(branchResponse.status,202,await branchResponse.clone().text());
    const branch=await branchResponse.json() as {run:Run;conversation:{id:string;branch:{sourceRunId:string;sourceEntryId:string}}};
    assert.equal(branch.conversation.branch.sourceRunId,continued.id);assert.equal(branch.conversation.branch.sourceEntryId,branchEntry.id);
    const branchReplay=await fetch(branchUrl,{method:'POST',headers,body:JSON.stringify(branchBody)});assert.equal((await branchReplay.json()).run.id,branch.run.id);
    app.service.cancel(branch.run.id);const branchRetry=app.service.retry(branch.run.id,'branch-prestart-retry');
    assert.equal(branchRetry.continuation?.entryId,branchEntry.id);
    let branchFinal=branchRetry;const branchDeadline=Date.now()+12000;
    while(Date.now()<branchDeadline){app.scheduler.tick();branchFinal=app.store.get<Run>('run',branchRetry.id);if(['completed','failed','interrupted'].includes(branchFinal.status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
    assert.equal(branchFinal.status,'completed',branchFinal.error??'branch worker failed');
    const branchRequests=readFileSync(transport.payloads,'utf8').trim().split('\n');assert.equal(branchRequests.length,4);
    assert(branchRequests[3].includes('Branch from the first image'));assert(!branchRequests[3].includes('Recall the earlier image without a new attachment'),'unselected later user message must not enter branch request');
    const branchImages=JSON.parse(branchRequests[3]).input.flatMap((item:{content?:unknown[]})=>item.content??[]).filter((item:{type:string})=>item.type==='input_image');assert.equal(branchImages.length,1);
    assert.deepEqual(readFileSync(continued.sessionPath!),sourceBytes);assert.notEqual(branchFinal.conversationId,continued.conversationId);
    await app.scheduler.stop();backup(app.store,join(root,'data'),join(root,'backup'));restore(join(root,'backup'),join(root,'restored'));
    const restored=new Store(join(root,'restored','workbench.sqlite'));
    try{
      const recovered=restored.get<Run>('run',continued.id);assert(recovered.sessionPath?.startsWith(join(root,'restored')));
      assert.equal(readFileSync(recovered.sessionPath!,'utf8'),readFileSync(continued.sessionPath!,'utf8'));
      assert.deepEqual(readFileSync(join(root,'restored','assets',asset.locator)),bytes);
      assert.equal(readFileSync(restored.get<Run>('run',commandFinal.id).sessionPath!,'utf8'),commandHistory,'command-intercepted image history also survives restore');
      const pi=await loadPi();const entries=pi.SessionManager.open(recovered.sessionPath!).getEntries();
      assert(entries.some(entry=>entry.type==='message'&&entry.message.role==='user'&&Array.isArray(entry.message.content)&&entry.message.content.some(part=>part.type==='image'&&part.data===bytes.toString('base64'))),'restored Pi history decodes the original image message');
    }finally{restored.close();}
    const recoveredApp=createApp({dataDir:join(root,'restored'),password:'image-test-password',schedule:false});
    try{
      const recoveredState=recoveredApp.plugins.state;
      assert(recoveredState.configuration().packages.every(item=>!item.enabled&&item.installationState==='missing'),'restore must not silently enable executable plugin sources');
      // Explicitly re-inspect only this owned local fixture; no downloaded package or credential restoration.
      const restoredOp=recoveredState.enqueue({action:'repair',source:transport.source,revision:recoveredState.configuration().revision,commandId:'restore-owned-transport',trusted:true});
      const restoredPackage=await inspectPlugin(transport.source,recoveredApp.plugins.agentDir);
      recoveredState.phase(restoredOp.id,'committing','Owned fixture restored');recoveredState.commit(restoredOp.id,[restoredPackage]);recoveredState.configure(recoveredState.configuration().revision,restoredPackage.id,true);
      assert.equal(recoveredState.manifest().signature,continued.pluginManifest!.signature,'same inspected local fixture restores the original environment signature');
      const recoveredSource=recoveredApp.store.get<Run>('run',continued.id);
      const recoveredBytes=readFileSync(recoveredSource.sessionPath!);
      const recoveredRun=recoveredApp.service.submit(project.id,'Continue after backup restore using the historical image','image-restored-worker','pi',continued.policy,[],undefined,{view:'project'},continued.id).run;
      let recoveredFinal=recoveredRun;const restoredDeadline=Date.now()+12000;
      while(Date.now()<restoredDeadline){recoveredApp.scheduler.tick();recoveredFinal=recoveredApp.store.get<Run>('run',recoveredRun.id);if(['completed','failed','interrupted'].includes(recoveredFinal.status)&&!recoveredApp.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
      assert.equal(recoveredFinal.status,'completed',recoveredFinal.error??'restored worker failed');assert.equal(recoveredFinal.calls,1);
      const allRequests=readFileSync(transport.payloads,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(allRequests.length,5);
      const restoredImages=allRequests[4].input.flatMap((item:{content?:unknown[]})=>item.content??[]).filter((item:{type:string})=>item.type==='input_image');
      assert.equal(restoredImages.length,1);assert.equal(restoredImages[0].image_url,`data:image/png;base64,${bytes.toString('base64')}`);
      assert.deepEqual(readFileSync(recoveredSource.sessionPath!),recoveredBytes,'restored continuation leaves its source untouched');
      assert.equal(readFileSync(final.sessionPath!,'utf8'),history,'restored worker does not mutate original deployment history');
      assert(recoveredFinal.sessionPath!.startsWith(join(root,'restored')));
    }finally{await recoveredApp.close();}
  }finally{await app.close();Object.assign(config,before);}
});
