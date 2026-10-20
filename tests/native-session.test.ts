import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,appendFileSync,unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Store,AppError } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import { loadPi } from '../server/pi-adapter.js';
import { StorageCapacity } from '../server/storage.js';
import { forkNative,continuationFor,rewriteForkInPlace } from '../server/native-session.js';
import { backup,restore } from '../server/backup.js';
import { Scheduler } from '../server/scheduler.js';
import type { Policy,Run,SessionBinding } from '../shared/contracts.js';

test('failed native fork sanitization removes its unpublished copy and preserves the original',async()=>{
  const q=await fixture();
  try{
    const source=q.manager.getSessionFile()!;
    appendFileSync(source,JSON.stringify({type:'context_edit',id:'invalid-edit',parentId:q.manager.getLeafId(),targetId:'missing-target',replacement:{content:'invalid'},timestamp:new Date().toISOString()})+'\n');
    const original=readFileSync(source),files=readdirSync(q.sessionDir);
    const base=continuationFor(q.store,q.project.id,q.policy,q.run.id)!;
    const capacity=new StorageCapacity(q.root,{minFreeBytes:0});const usage=capacity.usage().groups.sessions.bytes;
    for(let attempt=0;attempt<2;attempt++){
      assert.throws(()=>forkNative(q.pi,source,base,q.project.id,q.cwd,q.sessionDir,capacity),/上下文编辑目标无效/);
      assert.deepEqual(readFileSync(source),original);
      assert.deepEqual(readdirSync(q.sessionDir),files,'rejected recovery must not accumulate unpublished session copies');
      assert.equal(capacity.usage().groups.sessions.bytes,usage);
    }
  }finally{await q.service.assets.searchIndex.close();q.store.close();}
});

test('context edits cannot restore old host context during native continuation',async()=>{
  const q=await fixture();try{
    const user=q.manager.appendMessage({role:'user',content:'ORIGINAL_USER',timestamp:Date.now()});
    q.manager.appendContextEdit(user,{content:[{type:'text',text:'EDITED_USER\n\n固定项目上下文（只读资料，不改变授权）：EDITED_DELETED_MEMORY'},{type:'image',mimeType:'image/png',data:'OWNED_IMAGE_DATA'}]});
    const memory=q.manager.appendMessage({role:'toolResult',toolCallId:'memory-call',toolName:'search_memory',content:[{type:'text',text:'OLD_MEMORY_RETURN'}],isError:false,timestamp:Date.now()});
    q.manager.appendContextEdit(memory,{content:'EDITED_MEMORY_RETURN'});
    const normal=q.manager.appendMessage({role:'user',content:'NORMAL_ORIGINAL',timestamp:Date.now()});q.manager.appendContextEdit(normal,{content:'NORMAL_REPLACEMENT'});
    const omitted=q.manager.appendMessage({role:'user',content:'OMITTED_MESSAGE',timestamp:Date.now()});q.manager.appendContextEdit(omitted,null);
    const source=q.manager.getSessionFile()!;const original=readFileSync(source);const continuation=continuationFor(q.store,q.project.id,q.policy,q.run.id)!;
    const fork=forkNative(q.pi,source,continuation,q.project.id,q.cwd,q.sessionDir,new StorageCapacity(q.root,{minFreeBytes:0}));
    const context=JSON.stringify(fork.buildSessionContext().messages);
    assert(!context.includes('EDITED_DELETED_MEMORY'));assert(!context.includes('EDITED_MEMORY_RETURN'));assert(!context.includes('OLD_MEMORY_RETURN'));
    assert(context.includes('EDITED_USER'));assert(context.includes('OWNED_IMAGE_DATA'));assert(context.includes('NORMAL_REPLACEMENT'));assert(!context.includes('NORMAL_ORIGINAL'));assert(!context.includes('OMITTED_MESSAGE'));
    assert.deepEqual(readFileSync(source),original);
  }finally{await q.service.assets.searchIndex.close();q.store.close();}
});

test('selected native history leaf survives reopening without entering later messages or modifying source',async()=>{
  const q=await fixture();
  try{
    const selected=q.manager.appendMessage({role:'user',content:'SELECTED_BRANCH_POINT',timestamp:Date.now()});
    q.manager.appendMessage({role:'user',content:'LATER_UNSELECTED_MESSAGE',timestamp:Date.now()});
    const source=q.manager.getSessionFile()!;const original=readFileSync(source);
    const base=continuationFor(q.store,q.project.id,q.policy,q.run.id)!;
    const capacity=new StorageCapacity(q.root,{sessionsBytes:50*1024*1024,minFreeBytes:0});
    const beforeFiles=readdirSync(q.sessionDir);
    assert.throws(()=>forkNative(q.pi,source,{...base,entryId:'missing-node'},q.project.id,q.cwd,q.sessionDir,capacity),/历史节点/);
    assert.deepEqual(readdirSync(q.sessionDir),beforeFiles,'invalid branch does not leave a new session');
    const fork=forkNative(q.pi,source,{...base,entryId:selected},q.project.id,q.cwd,q.sessionDir,capacity);
    const context=JSON.stringify(fork.buildSessionContext().messages);
    assert(context.includes('SELECTED_BRANCH_POINT'));assert(!context.includes('LATER_UNSELECTED_MESSAGE'));assert(!context.includes('DELETED_MEMORY'));
    fork.appendMessage({role:'user',content:'NEW_BRANCH_MESSAGE',timestamp:Date.now()});
    const reopened=q.pi.SessionManager.open(fork.getSessionFile()!,q.sessionDir,q.cwd);
    const reopenedContext=JSON.stringify(reopened.buildSessionContext().messages);
    assert(reopenedContext.includes('NEW_BRANCH_MESSAGE'));assert(!reopenedContext.includes('LATER_UNSELECTED_MESSAGE'));
    assert.deepEqual(readFileSync(source),original);assert.notEqual(fork.getSessionId(),q.manager.getSessionId());
    assert(fork.getEntries().some(entry=>entry.type==='custom'&&entry.customType==='workbench_branch'));
  }finally{await q.service.assets.searchIndex.close();q.store.close();}
});

test('branch submission atomically creates an independent conversation and retains selected source on pre-start retry',async()=>{
  const q=await fixture();
  try{
    const entryId=q.manager.appendMessage({role:'user',content:'BRANCH_SUBMISSION',timestamp:Date.now()});
    const source=continuationFor(q.store,q.project.id,q.policy,q.run.id)!;
    const submit=(commandId:string,node=entryId,hash=source.sha256)=>q.service.branchConversation(q.project.id,q.run.id,node,hash,'Branch title','Branch goal',commandId,q.policy);
    const counts=()=>[q.store.list('conversation').length,q.store.list('task').length,q.store.list('run').length];const before=counts();
    assert.throws(()=>submit('invalid-node','missing'),/历史节点/);assert.deepEqual(counts(),before);
    assert.throws(()=>submit('stale-node',entryId,'0'.repeat(64)),/已变化/);assert.deepEqual(counts(),before);
    q.store.db.exec("CREATE TRIGGER reject_branch_run BEFORE INSERT ON entities WHEN NEW.kind='run' BEGIN SELECT RAISE(ABORT,'controlled run rejection'); END");
    assert.throws(()=>submit('rollback-branch'));assert.deepEqual(counts(),before);q.store.db.exec('DROP TRIGGER reject_branch_run');
    const branch=submit('branch-source');assert.deepEqual(submit('branch-source'),JSON.parse(JSON.stringify(branch)));
    assert.equal(branch.run.conversationId,branch.conversation.id);assert.equal(branch.run.continuation?.entryId,entryId);assert.equal(branch.conversation.branch?.sourceRunId,q.run.id);
    assert.throws(()=>submit('branch-source','different-node'),/不同|冲突|重复/);
    q.service.cancel(branch.run.id);const retry=q.service.retry(branch.run.id,'retry-branch-before-start');assert.deepEqual(retry.continuation,branch.run.continuation);assert.equal(retry.conversationId,branch.conversation.id);
  }finally{await q.service.assets.searchIndex.close();q.store.close();}
});

test('cancelled manual compaction retries retain their action, source checkpoint and original allowance', async () => {
  const q = await fixture();
  try {
    const submitted = q.service.submit(q.project.id, 'compact', 'manual-action', 'pi', q.policy, [], undefined, { view: 'project' }, q.run.id, undefined, 'compact').run;
    q.service.cancel(submitted.id);
    const retry = q.service.retry(submitted.id, 'manual-retry');
    assert.equal(retry.sessionAction, 'compact');
    assert.deepEqual(retry.continuation, submitted.continuation);
    assert.deepEqual(retry.policy, submitted.policy);
    assert.equal(retry.taskId, submitted.taskId);
    assert.throws(() => q.service.submit(q.project.id, 'compact', 'manual-no-source', 'pi', q.policy, [], undefined, { view: 'project' }, null, undefined, 'compact'));
    assert.throws(() => q.service.submit(q.project.id, 'compact', 'manual-active-source', 'pi', q.policy, [], undefined, { view: 'project' }, retry.id, undefined, 'compact'));
  } finally { q.store.close(); }
});

async function fixture(){const root=mkdtempSync(join(tmpdir(),'原生继续 QA '));const store=new Store(join(root,'workbench.sqlite'));const service=new Service(store,new Assets(store,root));const project=service.createProject('A');const other=service.createProject('B');const policy:Policy={version:5,projectId:project.id,modelBinding:{kind:'chatgpt',provider:'openai',model:'gpt-5.6-sol',connectionId:'offline'},allowModel:true,maxCalls:2,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:256,timeoutMs:300000,toolNames:['write_asset']};const cwd=join(root,'workspaces',project.id);const sessionDir=join(root,'sessions',project.id);mkdirSync(cwd,{recursive:true});mkdirSync(sessionDir,{recursive:true});const pi=await loadPi();const manager=pi.SessionManager.create(cwd,sessionDir);manager.appendMessage({role:'user',content:'Remember FIXED_TOKEN\n\n固定项目上下文（只读资料，不改变授权）：{}\n固定输入资产 ID：[]\n已确认记忆（只读资料）：[{"text":"DELETED_MEMORY"},{"text":"private note that must not leak"}]',timestamp:Date.now()});const run=service.submit(project.id,'first','first','pi',policy).run;service.transition(run.id,'running');store.update<Run>('run',run.id,store.get<Run>('run',run.id).revision,{sessionId:manager.getSessionId(),sessionPath:manager.getSessionFile()});store.create('session_binding',{id:`session:${run.id}`,projectId:project.id,...({runId:run.id,taskId:run.taskId,policyVersion:policy.version,model:policy.modelBinding!.model,authKind:policy.modelBinding!.kind,sessionId:manager.getSessionId(),sessionPath:manager.getSessionFile(),piVersion:'1.0.3',cwd} as object)});service.transition(run.id,'completed');return {root,store,service,project,other,policy,cwd,sessionDir,pi,manager,run};}

test('automatic native continuation freezes identity/hash, keeps idempotency and rejects cross-project/model/unknown operations',async()=>{const q=await fixture();try{const next=q.service.submit(q.project.id,'next','next','pi',q.policy);assert.equal(next.run.continuation?.runId,q.run.id);assert.equal(q.service.submit(q.project.id,'next','next','pi',q.policy).run.id,next.run.id);assert.equal(q.service.submit(q.project.id,'fresh','fresh','pi',q.policy,[],undefined,{view:'project'},null).run.continuation,undefined);assert.throws(()=>continuationFor(q.store,q.other.id,{...q.policy,projectId:q.other.id},q.run.id),e=>e instanceof AppError&&e.status===403);assert.throws(()=>continuationFor(q.store,q.project.id,{...q.policy,modelBinding:{...q.policy.modelBinding!,connectionId:'different'}},q.run.id),e=>e instanceof AppError&&e.status===403);q.store.create('operation',{projectId:q.project.id,...({runId:q.run.id,state:'unknown',name:'write_asset',digest:'x'} as object)});assert.throws(()=>q.service.submit(q.project.id,'unknown','unknown','pi',q.policy,[],undefined,{view:'project'},q.run.id),e=>e instanceof AppError&&e.status===409);}finally{q.store.close();}});

test('fork strips host memory from an old compaction summary without rewriting the source',async()=>{
  const q=await fixture();
  try{
    const user=q.manager.getEntries().find(entry=>entry.type==='message'&&entry.message.role==='user');
    assert(user);
    q.manager.appendCompaction('Keep FIXED_TOKEN\n\n固定项目上下文（只读资料，不改变授权）：{}\n已确认记忆（只读资料）：[{"text":"SUMMARY_DELETED_MEMORY"}]',user.id,100);
    q.manager.appendCompaction('Keep FIXED_TOKEN. The user confirmed DELETED_MEMORY without a host marker.',user.id,100);
    q.manager.appendCompaction('Keep FIXED_TOKEN. Light rewrite: deleted_memory with spaces DELETED   MEMORY.',user.id,100);
    q.manager.appendCompaction('Keep FIXED_TOKEN. Semantic paraphrase only: the user once saved a private note that must not leak.',user.id,100);
    q.manager.appendCompaction('Keep FIXED_TOKEN. Synonym-only rewrite: confidential personal writing was stored earlier.',user.id,100);
    const reference=continuationFor(q.store,q.project.id,q.policy,q.run.id)!;
    const original=readFileSync(q.manager.getSessionFile()!);
    const branch=forkNative(q.pi,q.manager.getSessionFile()!,reference,q.project.id,q.cwd,q.sessionDir,new StorageCapacity(q.root,{minFreeBytes:0}));
    assert.deepEqual(readFileSync(q.manager.getSessionFile()!),original);
    const copied=readFileSync(branch.getSessionFile()!,'utf8');
    assert(copied.includes('FIXED_TOKEN'));
    assert(!copied.includes('SUMMARY_DELETED_MEMORY'));
    assert(!copied.includes('DELETED_MEMORY'));
    assert(!copied.includes('deleted_memory'));
    assert(!/DELETED\s+MEMORY/i.test(copied));
    assert(copied.includes('（已删除记忆）'));
    assert(!copied.includes('private note that must not leak'));
    assert(!copied.includes('the user once saved a private note'));
    assert(copied.includes('confidential personal writing was stored earlier'),'synonym-only rewrite with no shared tokens stays as a documented limit');
    assert(!JSON.stringify(branch.buildSessionContext()).includes('DELETED_MEMORY'));
    assert(!JSON.stringify(branch.buildSessionContext()).includes('private note that must not leak'));
  }finally{q.store.close();}
});

test('killing rewriteForkInPlace mid-write keeps the source intact and leaves an unusable unfinished copy',{timeout:30000},async()=>{
  const q=await fixture();
  try{
    for(let i=0;i<40;i++)q.manager.appendMessage({role:'user',content:`PAD_${i} `+'x'.repeat(2000),timestamp:Date.now()});
    const source=q.manager.getSessionFile()!;
    const sourceBytes=readFileSync(source);
    const copy=join(q.sessionDir,`mid-write-${Date.now()}.jsonl`);
    const progress=join(q.sessionDir,`mid-write-progress-${Date.now()}.txt`);
    copyFileSync(source,copy);
    const header=JSON.parse(readFileSync(copy,'utf8').split('\n').find(Boolean)!);
    const helper=fileURLToPath(new URL('./helpers/rewrite-midwrite-child.ts',import.meta.url));
    const child=spawn(process.execPath,['--import','tsx',helper,copy,header.id],{
      env:{...process.env,PI_REWRITE_YIELD_MS:'50',PI_REWRITE_PROGRESS:progress,PI_OFFLINE:'1'},stdio:['ignore','ignore','pipe'],windowsHide:true,cwd:process.cwd()
    });
    assert(child.pid);
    let stderr='';
    child.stderr?.on('data',chunk=>{stderr+=String(chunk);});
    const deadline=Date.now()+15000;
    while(Date.now()<deadline&&!existsSync(progress))await delay(20);
    assert(existsSync(progress),`整理必须已经开始写入${stderr}`);
    child.kill('SIGKILL');
    await new Promise<void>(resolve=>child.once('exit',()=>resolve()));
    assert.deepEqual(readFileSync(source),sourceBytes);
    assert(existsSync(copy));
    assert(existsSync(`${copy}.unpublished`));
    // Kill after the first rewritten line: later original bytes still contain the undeleted memory.
    assert(readFileSync(copy,'utf8').includes('DELETED_MEMORY'),'中断副本尚未完成记忆清理');
    unlinkSync(copy);
    unlinkSync(`${copy}.unpublished`);
    if(existsSync(progress))unlinkSync(progress);
    const reference=continuationFor(q.store,q.project.id,q.policy,q.run.id)!;
    const recovered=forkNative(q.pi,source,reference,q.project.id,q.cwd,q.sessionDir,new StorageCapacity(q.root,{minFreeBytes:0}));
    assert.deepEqual(readFileSync(source),sourceBytes);
    assert(readFileSync(recovered.getSessionFile()!,'utf8').includes('FIXED_TOKEN'));
    mkdirSync('output/dev-evidence/pi-parity/loop-106',{recursive:true});
    writeFileSync('output/dev-evidence/pi-parity/loop-106/report.json',JSON.stringify({sourceBytes:sourceBytes.length,copyExistedAfterKill:true,recovered:true},null,2));
  }finally{q.store.close();}
});

test('native fork preserves original, strips old injected memory, enforces source integrity and capacity before writing',async()=>{const q=await fixture();try{const reference=continuationFor(q.store,q.project.id,q.policy,q.run.id)!;const original=readFileSync(q.manager.getSessionFile()!);const capacity=new StorageCapacity(q.root,{minFreeBytes:0});const branch=forkNative(q.pi,q.manager.getSessionFile()!,reference,q.project.id,q.cwd,q.sessionDir,capacity);assert.notEqual(branch.getSessionId(),q.manager.getSessionId());assert.deepEqual(readFileSync(q.manager.getSessionFile()!),original);const native=readFileSync(branch.getSessionFile()!,'utf8');assert(native.includes('FIXED_TOKEN'));assert(!native.includes('DELETED_MEMORY'));assert.equal(branch.buildSessionContext().messages.length,1);const count=readdirSync(q.sessionDir).length;capacity.limits.sessionsBytes=capacity.usage().groups.sessions.bytes+1;assert.throws(()=>forkNative(q.pi,q.manager.getSessionFile()!,reference,q.project.id,q.cwd,q.sessionDir,capacity),e=>e instanceof AppError&&e.status===507);assert.equal(readdirSync(q.sessionDir).length,count);appendFileSync(q.manager.getSessionFile()!,'\n');capacity.limits.sessionsBytes=128*1024*1024;assert.throws(()=>forkNative(q.pi,q.manager.getSessionFile()!,reference,q.project.id,q.cwd,q.sessionDir,capacity),e=>e instanceof AppError&&e.status===409);writeFileSync(q.manager.getSessionFile()!,original.toString().replace('FIXED_TOKEN','FIXED_TOKEN')+'bad json\n');assert.throws(()=>continuationFor(q.store,q.project.id,q.policy,q.run.id),e=>e instanceof AppError&&e.status===422);}finally{q.store.close();}});

test('joint restore remaps binding and forks preserved native history in a clean root',async()=>{const q=await fixture();try{const base=mkdtempSync(join(tmpdir(),'原生干净恢复 '));backup(q.store,q.root,join(base,'backup'));restore(join(base,'backup'),join(base,'restored'));const restored=new Store(join(base,'restored','workbench.sqlite'));try{const ref=continuationFor(restored,q.project.id,q.policy,q.run.id)!;const run=restored.get<Run>('run',q.run.id);const branch=forkNative(q.pi,run.sessionPath!,ref,q.project.id,join(base,'restored','workspaces',q.project.id),join(base,'restored','sessions',q.project.id),new StorageCapacity(join(base,'restored'),{minFreeBytes:0}));assert(branch.buildSessionContext().messages.some(m=>JSON.stringify(m).includes('FIXED_TOKEN')));}finally{restored.close();}}finally{q.store.close();}});

test('missing legacy binding is reconstructed from validated native identity; retry fixes source history without replaying operations',async()=>{const q=await fixture();try{q.store.db.prepare("DELETE FROM entities WHERE kind='session_binding'").run();const reference=continuationFor(q.store,q.project.id,q.policy,q.run.id)!;const bindings=q.store.list<SessionBinding>('session_binding');assert.equal(bindings.length,1);assert.equal(bindings[0].runId,q.run.id);assert.equal(bindings[0].id,`session:${q.run.id}`);assert.equal(bindings[0].reconstructed,true);const run=q.store.get<Run>('run',q.run.id);q.store.update<Run>('run',run.id,run.revision,{status:'failed'});const next=q.service.retry(run.id,'retry-native');assert.deepEqual(next.continuation,reference);assert.equal(next.parentRunId,run.id);assert.equal(q.store.list('operation').length,0);assert.equal(q.service.retry(run.id,'retry-native').id,next.id);}finally{q.store.close();}});

test('queued followups depend on their immediate predecessor; missing history fails without dispatch or silently using an older topic',async()=>{const q=await fixture();try{const first=q.service.submit(q.project.id,'new topic','pending-1','pi',q.policy,[],undefined,{view:'project'},null).run;const second=q.service.submit(q.project.id,'followup','pending-2','pi',q.policy).run;assert.equal(second.continueAfterRunId,first.id);assert.equal(second.continuation,undefined);const third=q.service.submit(q.project.id,'another','pending-3','pi',q.policy).run;assert.equal(third.continueAfterRunId,second.id);q.service.cancel(first.id);const scheduler=new Scheduler(q.service,()=>assert.fail(),{matches:()=>true} as never);scheduler.tick();assert.equal(q.store.get<Run>('run',second.id).status,'failed');assert.equal(q.store.get<Run>('run',third.id).status,'failed');assert.equal(q.store.get<Run>('run',second.id).calls,0);}finally{q.store.close();}});
