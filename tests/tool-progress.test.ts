import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { persistToolProgress, toolExecutions,requireToolReconciliation,reconcileTool } from '../server/tool-progress.js';
import { PiToolStream } from '../server/pi-tool-stream.js';
import { persistTextChunk, messageChunks } from '../server/run-stream.js';
import { backup, restore } from '../server/backup.js';
import { Store } from '../server/store.js';
import type { Policy,Run } from '../shared/contracts.js';
import type { ToolProgress } from '../shared/run-stream.js';

test('unknown MCP outcomes survive backup and reconciliation is atomic, versioned and non-destructive',async()=>{
  const root=mkdtempSync(join(tmpdir(),'mcp-unknown-restore-'));const data=join(root,'data');const app=createApp({dataDir:data,password:'unknown-restore-password',schedule:false});
  try{
    const project=app.service.createProject('Unknown MCP');const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
    const run=app.service.submit(project.id,'Check unknown remote write','unknown-write','pi',policy).run;app.service.transition(run.id,'running');
    const start:ToolProgress={callId:'remote-write',name:'mcp__owned__write',source:'builtin:mcp',sequence:0,phase:'running',preview:'started'};
    persistToolProgress(app.store,run.id,start);
    persistTextChunk(app.store,run.id,{messageId:'lost-response',channel:'tool_result',chunk:0,text:'transport disconnected after request',phase:'final'});
    persistToolProgress(app.store,run.id,{...start,sequence:1,phase:'failed',outcomeUnknown:true,preview:'response lost',resultMessageId:`${run.id}:lost-response`});app.service.transition(run.id,'failed');
    backup(app.store,data,join(root,'backup'));restore(join(root,'backup'),join(root,'restored'));
    const reopened=new Store(join(root,'restored','workbench.sqlite'));
    try{
      const original=toolExecutions(reopened,run.id).items[0];assert.equal(original.outcomeUnknown,true);assert.equal(original.phase,'failed');assert.throws(()=>requireToolReconciliation(reopened,run.id),/尚未确认/);
      assert.equal(messageChunks(reopened,run.id,original.resultMessageId!).map(c=>c.text).join(''),'transport disconnected after request');
      reopened.db.exec("CREATE TRIGGER reject_confirmation BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='tool.reconciled' BEGIN SELECT RAISE(ABORT,'controlled rollback'); END");
      assert.throws(()=>reconcileTool(reopened,run.id,original.id,original.revision,'performed','remote audit confirms one write'),/controlled rollback/);
      assert.equal(toolExecutions(reopened,run.id).items[0].revision,original.revision);assert.throws(()=>requireToolReconciliation(reopened,run.id),/尚未确认/);reopened.db.exec('DROP TRIGGER reject_confirmation');
      const confirmed=reconcileTool(reopened,run.id,original.id,original.revision,'performed','remote audit confirms one write');
      assert.deepEqual(reconcileTool(reopened,run.id,original.id,original.revision,'performed','remote audit confirms one write'),confirmed);
      assert.throws(()=>reconcileTool(reopened,run.id,original.id,original.revision,'not_performed','another page disagrees'),/已核对/);
      assert.equal(confirmed.phase,'failed');assert.equal(confirmed.outcomeUnknown,true);assert.equal(confirmed.resultMessageId,original.resultMessageId);assert.doesNotThrow(()=>requireToolReconciliation(reopened,run.id));
      assert.equal(reopened.events(0).filter(e=>e.type==='tool.reconciled').length,1);
    }finally{reopened.close();}
    assert.throws(()=>requireToolReconciliation(app.store,run.id),/尚未确认/,'restored copy must not mutate the original database');
  }finally{await app.close();}
});

test('tool executions deduplicate, require complete owned results and retain full records through HTTP and backup restore',async()=>{
  const root=mkdtempSync(join(tmpdir(),'tool-progress-'));const data=join(root,'data');
  const app=createApp({dataDir:data,password:'tool-progress-password',schedule:false});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try{
    const project=app.service.createProject('工具记录');
    const policy:Policy={version:8,projectId:project.id,toolNames:['read'],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
    const run=app.service.submit(project.id,'tool','tool','pi',policy).run;app.service.transition(run.id,'running');
    const start:ToolProgress={callId:'call-1',name:'read',source:'工作台/原生工具',sequence:0,phase:'running',preview:'开始执行'};
    persistToolProgress(app.store,run.id,start);persistToolProgress(app.store,run.id,start);
    assert.equal(toolExecutions(app.store,run.id).items.length,1);
    assert.throws(()=>persistToolProgress(app.store,run.id,{...start,preview:'other'}),/幂等/);
    assert.throws(()=>persistToolProgress(app.store,run.id,{...start,sequence:2}),/顺序/);
    assert.throws(()=>persistToolProgress(app.store,run.id,{...start,sequence:1,phase:'completed'}),/完整结果/);
    const result=JSON.stringify({content:[{type:'text',text:'Full result'}],details:{truncated:false}});
    persistTextChunk(app.store,run.id,{messageId:'tool-result',chunk:0,channel:'tool_result',text:result,phase:'partial'});
    const final:ToolProgress={...start,sequence:1,phase:'failed',preview:'工具报告失败',resultMessageId:`${run.id}:tool-result`};
    assert.throws(()=>persistToolProgress(app.store,run.id,final),/尚未保存/);
    persistTextChunk(app.store,run.id,{messageId:'tool-result',chunk:1,channel:'tool_result',text:'',phase:'final'});
    app.store.db.exec("CREATE TRIGGER reject_tool_event BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='tool.progress' BEGIN SELECT RAISE(ABORT,'controlled tool failure'); END");
    assert.throws(()=>persistToolProgress(app.store,run.id,final),/controlled tool failure/);
    assert.equal(toolExecutions(app.store,run.id).items[0].phase,'running');
    app.store.db.exec('DROP TRIGGER reject_tool_event');
    persistToolProgress(app.store,run.id,final);persistToolProgress(app.store,run.id,final);
    assert.equal(toolExecutions(app.store,run.id).items[0].phase,'failed');
    assert.equal(app.service.conversation(project.id).messages.filter(m=>m.role==='assistant').length,0,'tool results must not become assistant chat messages');
    assert.equal((await fetch(base+`/api/runs/${run.id}/tools`)).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'tool-progress-password'})});const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0]};
    const page=await(await fetch(base+`/api/runs/${run.id}/tools`,{headers})).json();assert.equal(page.items.length,1);
    assert.equal((await fetch(base+`/api/runs/${run.id}/tools?after=-1`,{headers})).status,400);
    assert.equal(await(await fetch(base+`/api/runs/${run.id}/messages/${encodeURIComponent(final.resultMessageId!)}/text`,{headers})).text(),result);
    app.service.transition(run.id,'failed');
    backup(app.store,data,join(root,'backup'));restore(join(root,'backup'),join(root,'restored'));
    const reopened=new Store(join(root,'restored','workbench.sqlite'));
    try{assert.equal(toolExecutions(reopened,run.id).items[0].phase,'failed');assert.equal(messageChunks(reopened,run.id,final.resultMessageId!).map(c=>c.text).join(''),result);}finally{reopened.close();}
  }finally{await app.close();}
});

test('tool reconciliation enforces login, origin, ownership, revision and dead worker before retry',async()=>{
  const app=createApp({dataDir:mkdtempSync(join(tmpdir(),'tool-reconcile-http-')),password:'reconcile-password',schedule:false});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try{
    const project=app.service.createProject('恢复HTTP');const policy:Policy={version:8,projectId:project.id,toolNames:['read'],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
    const run=app.service.submit(project.id,'check','check','pi',policy).run;app.service.transition(run.id,'running');
    persistToolProgress(app.store,run.id,{callId:'pending',name:'read',source:'工作台/原生工具',sequence:0,phase:'running',preview:'pending'});
    const tool=toolExecutions(app.store,run.id).items[0];const route=`/api/runs/${run.id}/tools/${encodeURIComponent(tool.id)}/reconcile`;const body={revision:tool.revision,outcome:'not_performed',evidence:'checked source file and process'};
    const post=(path:string,headers:Record<string,string>={},data=body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
    assert.equal((await post(route)).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'reconcile-password'})});const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0]};
    assert.equal((await post(route,headers)).status,409);
    app.service.transition(run.id,'failed');assert.throws(()=>app.service.retry(run.id,'before-check'),/工具结果尚未确认/);
    assert.equal((await post(route,{...headers,Origin:'https://untrusted.invalid'})).status,403);
    assert.equal((await post(route,headers,{...body,revision:tool.revision+1})).status,409);
    const fresh=app.store.get<Run>('run',run.id);app.store.update<Run>('run',run.id,fresh.revision,{workerPid:process.pid});
    assert.equal((await post(route,headers)).status,409);
    const active=app.store.get<Run>('run',run.id);app.store.update<Run>('run',run.id,active.revision,{workerPid:undefined});
    const other=app.service.submit(project.id,'other','other','pi',policy,[],undefined,{view:'project'},null).run;
    assert.equal((await post(route.replace(run.id,other.id),headers)).status,403);
    assert.equal((await post(route,headers)).status,200);assert.equal((await post(route,headers)).status,200);
    assert.equal((await post(route,headers,{...body,outcome:'performed'})).status,409);
    const resumed=app.service.retry(run.id,'after-check');assert.equal(resumed.parentRunId,run.id);
    assert.equal(toolExecutions(app.store,run.id).items[0].phase,'running','human reconciliation must not fabricate a tool terminal receipt');
  }finally{await app.close();}
});

test('a throttled tool preview is stored when the stream finishes before the timer',async()=>{
  const root=mkdtempSync(join(tmpdir(),'tool-preview-finish-'));const app=createApp({dataDir:join(root,'data'),password:'tool-preview-password',schedule:false});
  try{
    const project=app.service.createProject('Tool preview');const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
    const run=app.service.submit(project.id,'Preview','preview','pi',policy).run;app.service.transition(run.id,'running');
    const stream=new PiToolStream(run.id,()=>'工作台/原生工具',async(type,value)=>{if(type==='tool_progress')persistToolProgress(app.store,run.id,value as ToolProgress);},()=>{throw new Error('stream failed');});
    stream.observe({type:'tool_execution_start',toolCallId:'call',toolName:'read',args:{}} as never);
    stream.observe({type:'tool_execution_update',toolCallId:'call',partialResult:{content:[{type:'text',text:'PARTIAL_TOOL'}]}} as never);
    await stream.finish();
    const item=toolExecutions(app.store,run.id).items[0];
    assert.equal(item.phase,'running');assert.equal(item.preview,'PARTIAL_TOOL');assert.equal(item.sequence,1);
  }finally{await app.close();}
});
