import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { Service } from '../server/service.js';
import { Assets } from '../server/assets.js';
import { backup, restore } from '../server/backup.js';
import type { Policy } from '../shared/contracts.js';
import { WorkbenchConfigurations } from '../server/workbench-config.js';
import { addWindow, createWindow, defaultLayout } from '../shared/workbench-layout.js';
test('same-project conversations isolate histories, queue predecessors and retries; legacy cannot inherit them',async()=>{
  const root=mkdtempSync(join(tmpdir(),'wb-conversation-'));const store=new Store(join(root,'workbench.sqlite'));const assets=new Assets(store,root);const service=new Service(store,assets);
  try{
    const project=service.createProject('P'),other=service.createProject('Q');const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:true,maxCalls:2,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:200,timeoutMs:10000};
    const a=service.createConversation(project.id,'A','create-a'),b=service.createConversation(project.id,'B','create-b');
    assert.equal(service.createConversation(project.id,'A','create-a').id,a.id);
    const send=(id:string,goal:string,source?:string|null)=>service.submit(project.id,goal,goal,'pi',policy,[],undefined,{view:'project'},source,id).run;
    const a1=send(a.id,'A1'),b1=send(b.id,'B1'),a2=send(a.id,'A2'),b2=send(b.id,'B2');
    assert.equal(a1.continueAfterRunId,undefined);assert.equal(b1.continueAfterRunId,undefined);assert.equal(a2.continueAfterRunId,a1.id);assert.equal(b2.continueAfterRunId,b1.id);
    assert.equal(send(a.id,'A2').id,a2.id);
    const followUp=()=>service.conversation(project.id,undefined,50,a.id).messages.find(m=>m.text==='A2')?.followUp;
    assert.equal(followUp()?.state,'queued');assert.equal(followUp()?.sourceRunId,a1.id);
    service.transition(a2.id,'running');assert.equal(followUp()?.state,'running');
    service.transition(a2.id,'failed',{error:'原会话不可接续'});assert.equal(followUp()?.reason,'原会话不可接续');
    const followUpRetry=service.retry(a2.id,'retry-a2');assert.equal(followUpRetry.continueAfterRunId,a1.id);assert.equal(followUp()?.runId,followUpRetry.id);assert.equal(followUp()?.state,'queued');
    assert.throws(()=>send(a.id,'cross',b1.id),/其他对话/);
    assert.throws(()=>service.submit(other.id,'bad','bad','pi',{...policy,projectId:other.id},[],undefined,{view:'project'},null,a.id),/范围/);
    store.event('assistant.text',{text:'answer-A'},{projectId:project.id,runId:a1.id});store.event('assistant.text',{text:'answer-B'},{projectId:project.id,runId:b1.id});
    assert.deepEqual(service.conversation(project.id,undefined,50,a.id).messages.map(m=>m.text),['A1','A2','answer-A']);
    assert.deepEqual(service.conversation(project.id,undefined,50,b.id).messages.map(m=>m.text),['B1','B2','answer-B']);
    const image=assets.write(project.id,'history.png','image/png','owned metadata fixture');
    service.submit(project.id,'A image','image-in-a','pi',policy,[image.id],undefined,{view:'project'},undefined,a.id);
    assert.deepEqual(service.conversation(project.id,undefined,50,a.id).messages.find(m=>m.text==='A image')?.images,[{assetId:image.id,name:image.name,hash:image.hash,url:`/api/assets/${image.id}`}]);
    assert(service.conversation(project.id,undefined,50,b.id).messages.every(m=>!m.images),'another conversation must not inherit image attachments');
    const legacy=service.submit(project.id,'legacy','legacy','pi',policy).run;assert.equal(legacy.continueAfterRunId,undefined);
    service.cancel(a1.id);const retry=service.retry(a1.id,'retry-a');assert.equal(retry.conversationId,a.id);assert.equal(send(a.id,'after-retry').continueAfterRunId,retry.id);
    const win=createWindow('chat','A',project.id);win.binding.conversationId=a.id;new WorkbenchConfigurations(store).save(0,addWindow(defaultLayout(),win));
    const out=mkdtempSync(join(tmpdir(),'wb-restore-'));backup(store,root,join(out,'backup'));restore(join(out,'backup'),join(out,'restored'));const restored=new Store(join(out,'restored','workbench.sqlite'));
    try{assert.equal(restored.list('conversation').length,2);assert.equal(new WorkbenchConfigurations(restored).read().layout.windows[win.id].binding.conversationId,a.id);}finally{restored.close();}
  }finally{await assets.searchIndex.close();store.close();}
});
