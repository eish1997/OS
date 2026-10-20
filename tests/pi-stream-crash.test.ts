import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import { backup, restore } from '../server/backup.js';
import { Store } from '../server/store.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { RunMessage } from '../shared/run-stream.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';

test('killing the owned worker during a real stream retains partial output and its unreconciled request through restore', {timeout:25000},async()=>{
  const before={...config};Object.assign(config,{apiKey:'offline-crash-key',provider:'openai',model:'gpt-5.6-sol',maxCalls:4,budgetUsd:100,reservePerCallUsd:10});
  const root=mkdtempSync(join(tmpdir(),'pi-stream-crash-'));const source=join(root,'transport');mkdirSync(source);
  const attempts=join(root,'attempts.txt');
  writeFileSync(join(source,'package.json'),JSON.stringify({name:'controlled-crash-transport',pi:{extensions:['transport.mjs']}}));
  writeFileSync(join(source,'transport.mjs'),`import {appendFileSync} from 'node:fs';
    export default pi=>pi.on('session_start',()=>{globalThis.fetch=async()=>{
      appendFileSync(${JSON.stringify(attempts)},'request\\n');
      const events=[{type:'response.output_item.added',output_index:0,item:{id:'crash-message',type:'message',role:'assistant',content:[]}},
        {type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},
        {type:'response.output_text.delta',output_index:0,content_index:0,delta:'PERSISTED_PARTIAL_MARKER'}];
      return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(events.map(e=>'event: '+e.type+'\\ndata: '+JSON.stringify(e)+'\\n\\n').join('')));}}),{headers:{'Content-Type':'text/event-stream'}});
    };});`);
  const data=join(root,'data');const app=createApp({dataDir:data,password:'stream-crash-password',schedule:false});
  try{
    const state=app.plugins.state;const op=state.enqueue({action:'install',source,revision:state.configuration().revision,commandId:'crash-transport',trusted:true});
    const pkg=await inspectPlugin(source,app.plugins.agentDir);state.phase(op.id,'committing','Controlled transport');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    const project=app.service.createProject('真实流式中断');
    const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:true,modelBinding:app.modelAccess.settings().binding,maxCalls:4,maxCostUsd:40,reservePerCallUsd:10,maxOutputTokens:1024,timeoutMs:15000,piRuntime:{schemaVersion:1,configurationRevision:0,requestedThinkingLevel:'medium',thinkingLevel:'medium',autoRetry:true,networkIdleTimeoutMs:10000}};
    const run=app.service.submit(project.id,'Preserve crash objective','crash-run','pi',policy).run;
    const deadline=Date.now()+10000;let partialId:string|undefined;
    while(Date.now()<deadline){app.scheduler.tick();const reply=app.service.conversation(project.id).messages.find(m=>m.runId===run.id&&m.phase==='partial');if(reply){partialId=reply.id;break;}await delay(20);}
    assert(partialId,'must reach a durable partial response before killing');
    const active=app.store.get<Run>('run',run.id);assert.equal(active.status,'running');assert(active.workerPid);
    assert.equal(app.scheduler.terminateOwnedWorker(run.id),true);
    const exitDeadline=Date.now()+15000;
    while(app.store.get<Run>('run',run.id).status==='running'&&Date.now()<exitDeadline)await delay(20);
    const stopped=app.store.get<Run>('run',run.id);assert.equal(stopped.status,'interrupted');
    const reply=app.service.conversation(project.id).messages.find(m=>m.id===partialId)!;
    assert.equal(reply.text,'PERSISTED_PARTIAL_MARKER');assert.equal(reply.phase,'interrupted');
    assert.equal(app.store.list<ModelRequestReceipt>('model_request')[0].state,'reserved','without a provider terminal receipt, preserve unknown reservation');
    assert.equal(stopped.calls,1);assert.equal(stopped.reservedUsd,10);
    assert.throws(()=>app.service.retry(run.id,'unsafe-replay'),/对账/);
    for(let i=0;i<3;i++){app.scheduler.tick();await delay(30);}
    assert.equal(readFileSync(attempts,'utf8'),'request\n');assert.equal(app.store.list<Run>('run').length,1);
    await app.scheduler.stop();backup(app.store,data,join(root,'backup'));restore(join(root,'backup'),join(root,'restored'));
    const restored=new Store(join(root,'restored','workbench.sqlite'));
    try{assert.equal(restored.get<RunMessage>('run_message',partialId).preview,reply.text);assert.equal(restored.get<Run>('run',run.id).status,'interrupted');assert.equal(restored.list<ModelRequestReceipt>('model_request')[0].state,'reserved');}finally{restored.close();}
  }finally{await app.close();Object.assign(config,before);}
});
