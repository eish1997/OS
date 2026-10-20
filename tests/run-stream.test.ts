import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { persistTextChunk, messageChunks } from '../server/run-stream.js';
import { PiTextStream } from '../server/pi-text-stream.js';
import type { Policy } from '../shared/contracts.js';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { Store } from '../server/store.js';
import type { RunMessage } from '../shared/run-stream.js';

test('durable streamed text has one message identity, exact replay, full unicode download and restart recovery',async()=>{
  const root=mkdtempSync(join(tmpdir(),'run-stream-'));
  const app=createApp({dataDir:root,password:'stream-password',schedule:false});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  let messageId='';
  try{
    const project=app.service.createProject('流式恢复');
    const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
    const run=app.service.submit(project.id,'stream','stream','pi',policy).run;app.service.transition(run.id,'running');
    const input={messageId:'stable',chunk:0,text:'FIRST',phase:'partial' as const};
    persistTextChunk(app.store,run.id,input);persistTextChunk(app.store,run.id,input);
    assert.throws(()=>persistTextChunk(app.store,run.id,{...input,text:'different'}),/幂等/);
    assert.throws(()=>persistTextChunk(app.store,run.id,{...input,chunk:2}),/顺序/);
    assert.equal(app.service.conversation(project.id).messages.filter(m=>m.role==='assistant').length,1);
    assert.equal(app.service.conversation(project.id).messages.at(-1)?.phase,'partial');
    app.store.db.exec("CREATE TRIGGER reject_delta BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='assistant.delta' BEGIN SELECT RAISE(ABORT,'controlled stream failure'); END");
    assert.throws(()=>persistTextChunk(app.store,run.id,{...input,chunk:1,text:'NO'}),/controlled stream failure/);
    assert.equal(app.service.conversation(project.id).messages.at(-1)?.text,'FIRST');
    app.store.db.exec('DROP TRIGGER reject_delta');
    persistTextChunk(app.store,run.id,{...input,chunk:1,text:' LAST',phase:'final'});
    assert.equal(app.service.conversation(project.id).messages.at(-1)?.text,'FIRST LAST');
    assert.throws(()=>persistTextChunk(app.store,run.id,{...input,chunk:2}),/终态/);
    const full='x'.repeat(16383)+'🙂'.repeat(22000)+' END';
    const stream=new PiTextStream(async chunk=>persistTextChunk(app.store,run.id,chunk),error=>{throw error;});
    stream.observe({type:'message_start',message:{role:'assistant'}} as AgentSessionEvent);
    stream.observe({type:'message_update',message:{role:'assistant'},assistantMessageEvent:{type:'text_delta',delta:full}} as AgentSessionEvent);
    stream.observe({type:'message_end',message:{role:'assistant',content:[{type:'text',text:full}],stopReason:'stop'}} as AgentSessionEvent);
    await stream.finish();
    const history=app.service.conversation(project.id);const result=history.messages.at(-1)!;
    messageId=result.id;assert(result.fullTextUrl);assert.equal(result.phase,'final');
    assert(full.startsWith(result.text));assert(!/[\uD800-\uDBFF]$/.test(result.text));
    assert.equal(history.messages.filter(m=>m.role==='assistant').length,2);
    assert.equal((await fetch(base+result.fullTextUrl)).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'stream-password'})});
    const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0]};
    const response=await fetch(base+result.fullTextUrl,{headers});assert.equal(response.status,200);assert.equal(await response.text(),full);
    assert.throws(()=>messageChunks(app.store,'other',result.id),/不属于/);
    app.service.transition(run.id,'completed');
    // Accepted chunk replay still resolves after terminal state, without adding content.
    persistTextChunk(app.store,run.id,input);
    assert.equal(app.service.conversation(project.id).messages.length,3);
  }finally{await app.close();}
  const reopened=new Store(join(root,'workbench.sqlite'));
  try{const message=reopened.get<RunMessage>('run_message',messageId);assert.equal(message.phase,'final');assert(message.characters>30000);assert(messageChunks(reopened,message.runId,message.id).length>1);}finally{reopened.close();}
});

test('a final assistant message keeps one identity and includes text that arrived only at the end',async()=>{
  const root=mkdtempSync(join(tmpdir(),'run-stream-tail-'));
  const app=createApp({dataDir:root,password:'stream-tail',schedule:false});
  try{
    const project=app.service.createProject('流式补齐');
    const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
    const run=app.service.submit(project.id,'tail','tail','pi',policy).run;app.service.transition(run.id,'running');
    const stream=new PiTextStream(async chunk=>persistTextChunk(app.store,run.id,chunk),error=>{throw error;});
    stream.observe({type:'message_start',message:{role:'assistant'}} as AgentSessionEvent);
    stream.observe({type:'message_update',message:{role:'assistant'},assistantMessageEvent:{type:'text_delta',delta:'HELLO'}} as AgentSessionEvent);
    stream.observe({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'HELLO TAIL'}],stopReason:'stop'}} as AgentSessionEvent);
    await stream.finish();
    const messages=app.service.conversation(project.id).messages.filter(m=>m.role==='assistant');
    assert.equal(messages.length,1);
    assert.equal(messages[0]?.text,'HELLO TAIL');
    assert.equal(messages[0]?.phase,'final');
  }finally{await app.close();}
});
