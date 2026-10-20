import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, AppError } from '../server/store.js';
import { Service, fingerprint } from '../server/service.js';
import { Assets } from '../server/assets.js';
import { backup, restore } from '../server/backup.js';
import type { Draft, Run, Operation, Task, Policy } from '../shared/contracts.js';
const errorStatus=(status:number)=>(e:unknown)=>e instanceof AppError && e.status===status;
function setup(body='  原稿\r\n正文与来源。  \r\n') {
  const dir=mkdtempSync(join(tmpdir(),'草稿 Agent '));const store=new Store(join(dir,'workbench.sqlite'));
  const assets=new Assets(store,dir);const service=new Service(store,assets);const project=service.createProject('文章项目');
  const source=assets.write(project.id,'原始来源.md','text/markdown','事实资料');
  const draft=service.draft(project.id,'原稿标题',body,[source.id]);
  const policy:Policy={version:6,projectId:project.id,allowModel:false,toolNames:['read_draft','update_draft','read_asset'],maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
  const context={view:'drafts',selectedDraftId:draft.id,selectedDraftRevision:draft.revision};
  const submit=(commandId='first')=>service.submit(project.id,'修改这篇文章',commandId,'fixture',policy,[],undefined,context);
  const start=()=>{const result=submit();service.transition(result.run.id,'running');return result;};
  return {dir,store,service,assets,project,source,draft,policy,context,submit,start};
}
test('selected draft is frozen by host, stale/scope submissions fail and successful command remains idempotent',()=>{
  const f=setup();try{
    const first=f.submit();assert.deepEqual(first.task.context.selectedDraft,f.draft);
    f.service.updateDraft(f.draft.id,1,'手动标题','手动修改');
    assert.equal(f.submit().run.id,first.run.id);
    assert.throws(()=>f.submit('stale'),errorStatus(409));
    const other=f.service.createProject('其他项目');
    assert.throws(()=>f.service.submit(other.id,'修改','cross','fixture',{...f.policy,projectId:other.id},[],undefined,f.context),errorStatus(403));
    assert.throws(()=>f.service.submit(f.project.id,'修改','bad','fixture',f.policy,[],undefined,{...f.context,selectedDraftRevision:undefined}),errorStatus(400));
    assert.throws(()=>f.service.submit(f.project.id,'修改','view','fixture',f.policy,[],undefined,{...f.context,view:'results'}),errorStatus(400));
    assert.equal(f.store.list('task').length,1);assert.equal(f.store.get<Task>('task',first.task.id).context.selectedDraft?.body,f.draft.body);
  }finally{f.store.close();}
});
test('fixed draft reading pages the complete original text and never adopts a later manual revision',()=>{
  const body='中文\r\n'.repeat(9000)+'最后的原文';const f=setup(body);try{
    const {run}=f.start();f.service.updateDraft(f.draft.id,1,'手动','后来修改');
    let offset=0,actual='';do{const r=f.service.tool(run.id,'read_draft',{offset,limit:10000}) as {body:string;revision:number;changedSinceBinding:boolean;nextOffset?:number};assert.equal(r.revision,1);assert(r.changedSinceBinding);actual+=r.body;if(r.nextOffset===undefined)break;offset=r.nextOffset;}while(true);
    assert.equal(actual,body);assert.throws(()=>f.service.tool(run.id,'read_draft',{offset:-1}),errorStatus(400));
    assert.throws(()=>f.service.tool(run.id,'read_draft',{draftId:'other'}),errorStatus(403));
  }finally{f.store.close();}
});
test('original draft updates retain provenance, durable receipts and sequential authority without duplicate writes',async()=>{
  const f=setup();try{
    const {run,task}=f.start();const first={draftId:f.draft.id,revision:1,title:'修改后的标题',body:'  新正文\r\n保持空白  \r\n'};
    const r=await f.service.executeOperation(run.id,'edit-1','update_draft',first) as {draft:Draft};
    assert.equal(r.draft.id,f.draft.id);assert.equal(r.draft.body,first.body);assert.deepEqual(r.draft.sourceIds,[f.source.id]);
    assert.deepEqual(await f.service.executeOperation(run.id,'edit-1','update_draft',first),r);
    assert.equal(f.store.list<Draft>('draft').length,1);assert.equal(f.store.get<Draft>('draft',f.draft.id).revision,2);
    assert.deepEqual(f.store.get<Run>('run',run.id).resultDraftIds,[f.draft.id]);
    assert.equal(f.store.get<Task>('task',task.id).context.selectedDraft?.body,f.draft.body);
    const read=f.service.tool(run.id,'read_draft',{}) as {revision:number;body:string};assert.equal(read.revision,2);assert.equal(read.body,first.body);
    await f.service.executeOperation(run.id,'edit-2','update_draft',{...first,revision:2,body:'第二次修改'});
    assert.equal(f.store.get<Draft>('draft',f.draft.id).revision,3);
    await assert.rejects(f.service.executeOperation(run.id,'edit-1','update_draft',{...first,body:'different'}),errorStatus(409));
  }finally{f.store.close();}
});
test('manual edits cannot be rebased by agent, and failed writes preserve both task input and live draft',async()=>{
  const f=setup();try{
    const {run}=f.start();f.service.updateDraft(f.draft.id,1,'手动','我的后来修改');
    const args={draftId:f.draft.id,revision:1,title:'AI','body':'AI修改'};
    await assert.rejects(f.service.executeOperation(run.id,'conflict','update_draft',args),errorStatus(409));
    await assert.rejects(f.service.executeOperation(run.id,'adopt-manual','update_draft',{...args,revision:2}),errorStatus(409));
    assert.equal(f.store.get<Draft>('draft',f.draft.id).body,'我的后来修改');
    assert.equal(f.store.get<Operation>('operation',fingerprint({runId:run.id,operationId:'conflict'})).state,'failed');
    assert.equal(f.store.get<Run>('run',run.id).resultDraftIds,undefined);
  }finally{f.store.close();}
});
test('draft mutation and result receipt roll back together if durable receipt cannot be saved',async()=>{
  const f=setup();try{
    const {run}=f.start();const event=f.store.event.bind(f.store);
    f.store.event=(...args:Parameters<Store['event']>)=>{if(args[0]==='operation.completed')throw new Error('controlled receipt storage failure');return event(...args);};
    await assert.rejects(f.service.executeOperation(run.id,'rollback','update_draft',{draftId:f.draft.id,revision:1,title:'AI',body:'must roll back'}),/controlled receipt/);
    f.store.event=event;
    assert.deepEqual(f.store.get<Draft>('draft',f.draft.id),f.draft);assert.equal(f.store.get<Run>('run',run.id).resultDraftIds,undefined);
    assert(!f.store.events(0).some(e=>e.type==='draft.updated'));
    assert.equal(f.store.get<Operation>('operation',fingerprint({runId:run.id,operationId:'rollback'})).state,'failed');
    await f.service.executeOperation(run.id,'new-edit','update_draft',{draftId:f.draft.id,revision:1,title:'AI',body:'saved'});
    const recovered=new Store(f.store.path,{readOnly:true});try{assert.equal(recovered.get<Draft>('draft',f.draft.id).body,'saved');assert.equal(recovered.get<Operation>('operation',fingerprint({runId:run.id,operationId:'new-edit'})).state,'completed');}finally{recovered.close();}
  }finally{f.store.close();}
});
test('draft update rejects unbound targets, missing grants, expired and cancelled runs',async()=>{
  const f=setup();try{
    const {run}=f.start();const args={draftId:f.draft.id,revision:1,title:'AI',body:'new'};
    const other=f.service.draft(f.project.id,'另外一篇','保留',[]);
    await assert.rejects(f.service.executeOperation(run.id,'other','update_draft',{...args,draftId:other.id}),errorStatus(403));
    assert.throws(()=>f.service.tool(run.id,'update_draft',args),errorStatus(403));
    const unbound=f.service.submit(f.project.id,'一般任务','unbound','fixture',f.policy).run;f.service.transition(unbound.id,'running');
    await assert.rejects(f.service.executeOperation(unbound.id,'unbound','update_draft',args),errorStatus(403));
    const old=f.service.submit(f.project.id,'旧许可','old','fixture',{...f.policy,toolNames:[]},[],undefined,f.context).run;f.service.transition(old.id,'running');
    await assert.rejects(f.service.executeOperation(old.id,'old','update_draft',args),errorStatus(403));
    f.service.cancel(run.id);await assert.rejects(f.service.executeOperation(run.id,'cancelled','update_draft',args),errorStatus(403));
    const expired=f.service.submit(f.project.id,'过期','expired','fixture',f.policy,[],undefined,f.context).run;f.service.transition(expired.id,'running',{startedAt:new Date(Date.now()-20000).toISOString()});
    await assert.rejects(f.service.executeOperation(expired.id,'expired','update_draft',args),errorStatus(403));
    assert.deepEqual(f.store.get<Draft>('draft',f.draft.id),f.draft);
  }finally{f.store.close();}
});
test('newly captured and read sources join original draft lineage and remain project-scoped',async()=>{
  const f=setup();try{
    const policy={...f.policy,toolNames:[...f.policy.toolNames,'capture_source'],allowedHosts:['raw.githubusercontent.com']};
    const {run}=f.service.submit(f.project.id,'使用补充来源修改','sources','fixture',policy,[],undefined,f.context);f.service.transition(run.id,'running');
    const captured=await f.service.executeOperation(run.id,'capture','capture_source',{url:'https://raw.githubusercontent.com/owner/repo/fixed/source.md'},()=>f.service.captureSource(run.id,'https://raw.githubusercontent.com/owner/repo/fixed/source.md',(async()=>new Response('受控新增资料')) as typeof fetch)) as {assetId:string};
    const additional=f.assets.write(f.project.id,'其他实际读取资料.md','text/markdown','补充事实');
    await f.service.executeOperation(run.id,'read-extra','read_asset',{assetId:additional.id});
    const edited=await f.service.executeOperation(run.id,'edit-sourced','update_draft',{draftId:f.draft.id,revision:1,title:'综合资料',body:'保留原来源，引用新增事实'}) as {draft:Draft};
    assert.deepEqual(new Set(edited.draft.sourceIds),new Set([f.source.id,captured.assetId,additional.id]));
    const other=f.service.createProject('其他项目');const secret=f.assets.write(other.id,'私有.md','text/plain','其他项目内容');
    await assert.rejects(f.service.executeOperation(run.id,'cross-read','read_asset',{assetId:secret.id}),errorStatus(403));
    assert(!edited.draft.sourceIds.includes(secret.id));
  }finally{f.store.close();}
});

test('cancelled, failed and reconciled interrupted retries continue confirmed edits and sources without replay',async()=>{
  const f=setup();try{
    const first=f.start();const extra=f.assets.write(f.project.id,'补充来源.md','text/markdown','事实补充');
    await f.service.executeOperation(first.run.id,'read-extra','read_asset',{assetId:extra.id});
    await f.service.executeOperation(first.run.id,'edit','update_draft',{draftId:f.draft.id,revision:1,title:'第一轮',body:'第一轮已保存'});
    f.service.cancel(first.run.id);f.service.transition(first.run.id,'cancelled');
    const second=f.service.retry(first.run.id,'retry-1');assert.equal(f.service.retry(first.run.id,'retry-1').id,second.id);f.service.transition(second.id,'running');
    assert.equal(f.store.get<Draft>('draft',f.draft.id).revision,2);
    const read=f.service.tool(second.id,'read_draft',{}) as {revision:number;body:string;sourceIds:string[]};
    assert.equal(read.revision,2);assert.equal(read.body,'第一轮已保存');assert.deepEqual(new Set(read.sourceIds),new Set([f.source.id,extra.id]));
    await f.service.executeOperation(second.id,'edit','update_draft',{draftId:f.draft.id,revision:2,title:'第二轮',body:'第二轮继续修改'});
    f.service.transition(second.id,'failed');
    const third=f.service.retry(second.id,'retry-2');f.service.transition(third.id,'running');
    assert.equal((f.service.tool(third.id,'read_draft',{}) as {revision:number}).revision,3);
    f.service.transition(third.id,'interrupted');assert.throws(()=>f.service.retry(third.id,'retry-3'),errorStatus(409));
    const interrupted=f.store.get<Run>('run',third.id);f.store.update<Run>('run',third.id,interrupted.revision,{error:'已对账：没有未知操作'});
    const fourth=f.service.retry(third.id,'retry-3');f.service.transition(fourth.id,'running');
    const result=await f.service.executeOperation(fourth.id,'edit','update_draft',{draftId:f.draft.id,revision:3,title:'最终',body:'第四轮接续正文'}) as {draft:Draft};
    assert.equal(result.draft.revision,4);assert.deepEqual(new Set(result.draft.sourceIds),new Set([f.source.id,extra.id]));
    assert.equal(f.store.list<Operation>('operation').filter(o=>o.name==='update_draft'&&o.state==='completed').length,3);
    assert.equal(f.store.list<Draft>('draft').length,1);assert.deepEqual(f.store.get<Task>('task',first.task.id).context.selectedDraft,f.draft);
    assert.deepEqual(f.store.get<Run>('run',fourth.id).resultDraftIds,[f.draft.id]);
  }finally{f.store.close();}
});

test('clean joint restore preserves retry authority in durable receipts while original task remains frozen',async()=>{
  const f=setup();let restored:Store|undefined;try{
    const {run,task}=f.start();await f.service.executeOperation(run.id,'saved','update_draft',{draftId:f.draft.id,revision:1,title:'保存的标题',body:'已保存正文'});
    f.service.transition(run.id,'failed');
    const base=mkdtempSync(join(tmpdir(),'草稿重试干净恢复 '));backup(f.store,f.dir,join(base,'backup'));restore(join(base,'backup'),join(base,'restored'));
    const root=join(base,'restored');restored=new Store(join(root,'workbench.sqlite'));const service=new Service(restored,new Assets(restored,root));
    const next=service.retry(run.id,'after-restore');service.transition(next.id,'running');
    const read=service.tool(next.id,'read_draft',{}) as {revision:number;body:string};assert.equal(read.revision,2);assert.equal(read.body,'已保存正文');
    await service.executeOperation(next.id,'continue','update_draft',{draftId:f.draft.id,revision:2,title:'接续',body:'恢复后继续正文'});
    assert.equal(restored.get<Draft>('draft',f.draft.id).revision,3);assert.equal(f.store.get<Draft>('draft',f.draft.id).revision,2);
    assert.deepEqual(restored.get<Task>('task',task.id).context.selectedDraft,f.draft);
    assert.equal(restored.list<Operation>('operation').filter(o=>o.name==='update_draft').length,2);
  }finally{restored?.close();f.store.close();}
});

test('retry never adopts later manual edits; a new explicitly bound task can edit the reviewed version',async()=>{
  const f=setup();try{
    const {run}=f.start();await f.service.executeOperation(run.id,'saved','update_draft',{draftId:f.draft.id,revision:1,title:'AI',body:'AI已保存'});f.service.transition(run.id,'failed');
    f.service.updateDraft(f.draft.id,2,'用户标题','用户后来的正文');
    const retry=f.service.retry(run.id,'retry');f.service.transition(retry.id,'running');
    const read=f.service.tool(retry.id,'read_draft',{}) as {revision:number;body:string;changedSinceBinding:boolean};
    assert.equal(read.revision,2);assert.equal(read.body,'AI已保存');assert(read.changedSinceBinding);
    for(const revision of [2,3])await assert.rejects(f.service.executeOperation(retry.id,`conflict-${revision}`,'update_draft',{draftId:f.draft.id,revision,title:'不允许',body:'覆盖'}),errorStatus(409));
    assert.equal(f.store.get<Draft>('draft',f.draft.id).body,'用户后来的正文');
    const fresh=f.service.submit(f.project.id,'修改我重新查看的当前版本','fresh','fixture',f.policy,[],undefined,{...f.context,selectedDraftRevision:3}).run;f.service.transition(fresh.id,'running');
    await f.service.executeOperation(fresh.id,'approved','update_draft',{draftId:f.draft.id,revision:3,title:'新任务',body:'明确绑定后的修改'});
    assert.equal(f.store.get<Draft>('draft',f.draft.id).revision,4);
  }finally{f.store.close();}
});

test('sibling attempts and other tasks cannot advance retry draft authority',async()=>{
  const f=setup();try{
    const {run}=f.start();await f.service.executeOperation(run.id,'saved','update_draft',{draftId:f.draft.id,revision:1,title:'根尝试',body:'根尝试保存'});f.service.transition(run.id,'failed');
    const sibling=f.service.retry(run.id,'sibling');f.service.transition(sibling.id,'running');
    await f.service.executeOperation(sibling.id,'edit','update_draft',{draftId:f.draft.id,revision:2,title:'另一个尝试',body:'兄弟尝试保存'});f.service.transition(sibling.id,'failed');
    // Resume only from the latest attempt (same contract as task-budget-addition); root is no longer eligible.
    assert.throws(()=>f.service.retry(run.id,'from-root'),/后续执行/);
    const retry=f.service.retry(sibling.id,'branch');f.service.transition(retry.id,'running');
    // Ancestry includes sibling's confirmed update (revision 3); other tasks still cannot advance this authority.
    assert.equal((f.service.tool(retry.id,'read_draft',{}) as {revision:number}).revision,3);
    const other=f.service.submit(f.project.id,'另一个目标','other-task','fixture',f.policy,[],undefined,{...f.context,selectedDraftRevision:3}).run;f.service.transition(other.id,'running');
    await f.service.executeOperation(other.id,'edit','update_draft',{draftId:f.draft.id,revision:3,title:'其他任务',body:'其他任务保存'});
    const read=f.service.tool(retry.id,'read_draft',{}) as {revision:number;changedSinceBinding:boolean};assert.equal(read.revision,3);assert(read.changedSinceBinding);
    for(const revision of [3,4,5])await assert.rejects(f.service.executeOperation(retry.id,`adopt-${revision}`,'update_draft',{draftId:f.draft.id,revision,title:'不允许',body:'覆盖'}),errorStatus(409));
    assert.equal(f.store.get<Draft>('draft',f.draft.id).body,'其他任务保存');
  }finally{f.store.close();}
});

test('invalid retry ancestry and discontinuous host receipts fail closed',async()=>{
  const f=setup();try{
    const {run}=f.start();await f.service.executeOperation(run.id,'saved','update_draft',{draftId:f.draft.id,revision:1,title:'保存',body:'已保存'});f.service.transition(run.id,'failed');
    const retry=f.service.retry(run.id,'retry');f.service.transition(retry.id,'running');
    const change=(fields:Partial<Run>)=>{const r=f.store.get<Run>('run',retry.id);f.store.update<Run>('run',r.id,r.revision,fields);};
    for(const fields of [{parentRunId:retry.id},{parentRunId:'missing-parent'},{attempt:3},{parentRunId:undefined}]){
      change(fields);assert.throws(()=>f.service.tool(retry.id,'read_draft',{}),errorStatus(409));change({parentRunId:run.id,attempt:2});
    }
    for(const fields of [{taskId:'other-task'},{status:'running' as const},{status:'interrupted' as const,error:'未核对'}]){
      const parent=f.store.get<Run>('run',run.id);f.store.update<Run>('run',parent.id,parent.revision,fields);
      assert.throws(()=>f.service.tool(retry.id,'read_draft',{}),errorStatus(409));
      const changed=f.store.get<Run>('run',run.id);f.store.update<Run>('run',changed.id,changed.revision,{taskId:run.taskId,projectId:run.projectId,status:'failed',error:undefined});
    }
    const otherProject=f.service.createProject('其他项目');
    const other=f.service.submit(otherProject.id,'其他项目目标','cross-project','fixture',{...f.policy,projectId:otherProject.id}).run;
    f.service.transition(other.id,'running');f.service.transition(other.id,'failed');
    change({parentRunId:other.id});assert.throws(()=>f.service.tool(retry.id,'read_draft',{}),errorStatus(409));change({parentRunId:run.id});
    const operation=f.store.get<Operation>('operation',fingerprint({runId:run.id,operationId:'saved'}));
    f.store.update<Operation>('operation',operation.id,operation.revision,{result:{...(operation.result as object),previousRevision:7}});
    assert.throws(()=>f.service.tool(retry.id,'read_draft',{}),errorStatus(409));assert.equal(f.store.get<Draft>('draft',f.draft.id).body,'已保存');
  }finally{f.store.close();}
});

test('unknown ancestor operations block retries and user reconciliation cannot fabricate draft-update authority',async()=>{
  const f=setup();try{
    const {run}=f.start();await f.service.executeOperation(run.id,'saved','update_draft',{draftId:f.draft.id,revision:1,title:'保存',body:'已保存'});f.service.transition(run.id,'failed');
    const retry=f.service.retry(run.id,'retry');f.service.transition(retry.id,'running');
    const id=fingerprint({runId:run.id,operationId:'saved'});let operation=f.store.get<Operation>('operation',id);
    f.store.update<Operation>('operation',id,operation.revision,{state:'unknown'});
    assert.throws(()=>f.service.retry(run.id,'blocked'),errorStatus(409));assert.throws(()=>f.service.tool(retry.id,'read_draft',{}),errorStatus(409));
    operation=f.store.get<Operation>('operation',id);f.service.resolveOperation(id,operation.revision,true,'受控未知结果核对，不提供宿主草稿版本回执');
    assert.equal((f.service.tool(retry.id,'read_draft',{}) as {revision:number}).revision,1);
    await assert.rejects(f.service.executeOperation(retry.id,'adopt','update_draft',{draftId:f.draft.id,revision:2,title:'不允许',body:'覆盖'}),errorStatus(409));
    assert.equal(f.store.get<Draft>('draft',f.draft.id).body,'已保存');
  }finally{f.store.close();}
});
