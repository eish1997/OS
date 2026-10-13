import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Store, AppError } from '../../server/store.js';
import { Service } from '../../server/service.js';
import { Assets } from '../../server/assets.js';
import type { Draft, Policy, Task } from '../../shared/contracts.js';
const phase=process.argv[2];assert(['before','after'].includes(phase));
const root=mkdtempSync(join(tmpdir(),'草稿重试复现054 '));const store=new Store(join(root,'workbench.sqlite'));
try {
  const service=new Service(store,new Assets(store,root));const project=service.createProject('合成草稿重试');
  const source=service.assets.write(project.id,'来源.md','text/markdown','固定合成来源');
  const draft=service.draft(project.id,'原标题','原文',[source.id]);
  const policy:Policy={version:6,projectId:project.id,allowModel:false,toolNames:['read_draft','update_draft'],maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
  const first=service.submit(project.id,'继续修改同一篇','first','fixture',policy,[],undefined,{view:'drafts',selectedDraftId:draft.id,selectedDraftRevision:1});
  service.transition(first.run.id,'running');
  await service.executeOperation(first.run.id,'saved','update_draft',{draftId:draft.id,revision:1,title:'已保存标题',body:'第一轮已保存的正文'});
  service.cancel(first.run.id);service.transition(first.run.id,'cancelled');
  const next=service.retry(first.run.id,'retry');service.transition(next.id,'running');
  const read=service.tool(next.id,'read_draft',{}) as {revision:number;body:string};
  let errorStatus:number|undefined;
  try {await service.executeOperation(next.id,'continue','update_draft',{draftId:draft.id,revision:2,title:'继续后的标题',body:'接续已保存的正文'});}catch(e){if(!(e instanceof AppError))throw e;errorStatus=e.status;}
  const live=store.get<Draft>('draft',draft.id);const frozen=store.get<Task>('task',first.task.id).context.selectedDraft!;
  if(phase==='before'){assert.equal(read.revision,1);assert.equal(errorStatus,409);assert.equal(live.revision,2);}
  else{assert.equal(read.revision,2);assert.equal(read.body,'第一轮已保存的正文');assert.equal(errorStatus,undefined);assert.equal(live.revision,3);assert.equal(live.body,'接续已保存的正文');}
  assert.equal(frozen.revision,1);assert.equal(frozen.body,'原文');assert.deepEqual(live.sourceIds,[source.id]);
  const result={at:new Date().toISOString(),phase,status:phase==='before'?'reproduced':'passed',scope:'Isolated synthetic service fixture; no browser or model request',readRevision:read.revision,liveRevision:live.revision,updateErrorStatus:errorStatus??null,originalTaskRevision:frozen.revision,sourcesPreserved:true,modelRequests:0};
  writeFileSync(`output/dev-evidence/draft-retry-054-${phase}.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{store.close();}
