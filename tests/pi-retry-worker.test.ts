import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';
import { toolExecutions } from '../server/tool-progress.js';
import { messageChunks } from '../server/run-stream.js';

// Nine modes include 503/429 backoff, cancel-during-wait, tool recovery and stream; wall clock exceeds 60s under load.
test('production native retries are bounded, accounted and cancellable; permanent errors and task limits stop requests', {timeout:120000}, async()=>{
  const before={...config};
  Object.assign(config,{apiKey:'offline-retry-key',provider:'openai',model:'gpt-5.6-sol',maxCalls:100,budgetUsd:1000,reservePerCallUsd:10});
  const root=mkdtempSync(join(tmpdir(),'pi-retry-worker-'));const source=join(root,'transport');mkdirSync(source);
  const control=join(root,'control.json');const count=join(root,'requests.txt');
  const writes=join(root,'writes.txt');
  const timings=join(root,'request-times.json');
  writeFileSync(join(source,'package.json'),JSON.stringify({name:'controlled-retry-transport',pi:{extensions:['transport.mjs']}}));
  writeFileSync(join(source,'transport.mjs'),`import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
    export default pi=>pi.on('session_start',()=>{
      let calls=0;const times=[];
      pi.registerTool({name:'append_once',label:'Append once',description:'Append one controlled record',parameters:{type:'object',properties:{}},execute:async(_id,_params,_signal,onUpdate)=>{onUpdate?.({content:[{type:'text',text:'WRITING_PROGRESS'}],details:{}});await new Promise(resolve=>setTimeout(resolve,500));appendFileSync(${JSON.stringify(writes)},'written\\n');return {content:[{type:'text',text:'WRITE_CONFIRMED '+ '工具🙂'.repeat(10000)}],details:{marker:'FULL_DETAILS'}};}});
      globalThis.fetch=async()=>{
        // Re-read mode each request so a late previous worker cannot freeze the wrong scenario.
        const mode=JSON.parse(readFileSync(${JSON.stringify(control)},'utf8')).mode;
        calls++;writeFileSync(${JSON.stringify(count)},String(calls));
        times.push(Date.now());writeFileSync(${JSON.stringify(timings)},JSON.stringify(times));
        if(mode==='tool'&&calls===1){
          const item={id:'fc-fixture',call_id:'call-fixture',type:'function_call',name:'append_once',arguments:'{}',status:'completed'};
          const events=[{type:'response.output_item.added',output_index:0,item:{...item,arguments:''}},
            {type:'response.function_call_arguments.delta',output_index:0,item_id:item.id,delta:'{}'},
            {type:'response.output_item.done',output_index:0,item},
            {type:'response.completed',response:{id:'response-tool',status:'completed',output:[item],usage:{input_tokens:100,output_tokens:10,total_tokens:110,input_tokens_details:{cached_tokens:0}}}}];
          return new Response(events.map(e=>'event: '+e.type+'\\ndata: '+JSON.stringify(e)+'\\n\\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
        }
        if(mode==='tool'&&calls===2)return Response.json({error:{message:'503 service unavailable RAW_SECRET',type:'server_error'}},{status:503});
        if(mode==='auth')return Response.json({error:{message:'401 RAW_SECRET',type:'authentication_error'}},{status:401});
        if(mode==='quota')return Response.json({error:{message:'You exceeded your current quota RAW_SECRET',type:'insufficient_quota',code:'insufficient_quota'}},{status:429});
        if(mode==='always'||mode==='cancel'||mode==='budget'||(calls===1&&mode!=='stream'))return Response.json({error:{message:mode==='429'?'429 rate limit exceeded RAW_SECRET':'503 service unavailable RAW_SECRET',type:'server_error'}},{status:mode==='429'?429:503,headers:mode==='429'?{'retry-after':'2'}:{}});
        const text=mode==='stream'?'STREAM_FIRST STREAM_LAST':'RECOVERED RETRY';const item={id:'retry-msg',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};
        const events=[{type:'response.output_item.added',output_index:0,item:{...item,content:[]}},
          {type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},
          {type:'response.output_text.delta',output_index:0,content_index:0,delta:text},
          {type:'response.output_item.done',output_index:0,item},
          {type:'response.completed',response:{id:'retry-response',status:'completed',output:[item],usage:{input_tokens:100,output_tokens:10,total_tokens:110,input_tokens_details:{cached_tokens:0}}}}];
        if(mode==='stream'){
          events[2].delta='STREAM_FIRST';events.splice(3,0,{type:'response.output_text.delta',output_index:0,content_index:0,delta:' STREAM_LAST'});
          const encode=items=>new TextEncoder().encode(items.map(e=>'event: '+e.type+'\\ndata: '+JSON.stringify(e)+'\\n\\n').join(''));
          return new Response(new ReadableStream({start(controller){controller.enqueue(encode(events.slice(0,3)));setTimeout(()=>{controller.enqueue(encode(events.slice(3)));controller.close();},600);}}),{headers:{'Content-Type':'text/event-stream'}});
        }
        return new Response(events.map(e=>'event: '+e.type+'\\ndata: '+JSON.stringify(e)+'\\n\\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
      };
    });`);
  const app=createApp({dataDir:join(root,'data'),password:'retry-test-password',schedule:false});
  try{
    const state=app.plugins.state;const op=state.enqueue({action:'install',source,revision:state.configuration().revision,commandId:'transport',trusted:true});
    const pkg=await inspectPlugin(source,app.plugins.agentDir);state.phase(op.id,'committing','Controlled transport');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    const project=app.service.createProject('原生重试验证');
    const policy:Policy={version:8,projectId:project.id,allowModel:true,toolNames:[],modelBinding:app.modelAccess.settings().binding,maxCalls:10,maxCostUsd:100,reservePerCallUsd:10,maxOutputTokens:1024,timeoutMs:20000,piRuntime:{schemaVersion:1,configurationRevision:0,requestedThinkingLevel:'medium',thinkingLevel:'medium',autoRetry:true,networkIdleTimeoutMs:10000}};
    for(const mode of ['503','429','auth','quota','always','cancel','budget','tool','stream']){
      writeFileSync(control,JSON.stringify({mode}));writeFileSync(count,'0');
      const run=app.service.submit(project.id,`Controlled ${mode}`,mode,'pi',{...policy,maxCalls:mode==='budget'?2:10},[],undefined,{view:'project'},null).run;
      const deadline=Date.now()+22000;let terminal:Run|undefined;let cancellationSent=false;let sawPartial=false;let sawToolProgress=false;
      while(Date.now()<deadline){
        app.scheduler.tick();const current=app.store.get<Run>('run',run.id);
        if(mode==='stream'&&current.status==='running')sawPartial ||= app.service.conversation(project.id).messages.some(m=>m.runId===run.id&&m.phase==='partial'&&m.text==='STREAM_FIRST');
        if(mode==='tool'&&current.status==='running')sawToolProgress ||= toolExecutions(app.store,run.id).items.some(t=>t.phase==='running'&&t.preview==='WRITING_PROGRESS');
        if(mode==='cancel'&&current.retryState?.phase==='waiting'&&!cancellationSent){await app.service.requestCancel(run.id);cancellationSent=true;}
        if(['completed','failed','cancelled','interrupted'].includes(current.status)&&!app.scheduler.pluginMaintenanceBlocked()){terminal=current;break;}
        await delay(20);
      }
      assert(terminal,`${mode}: worker timeout`);
      const expectedCalls=mode==='tool'?3:mode==='always'?4:mode==='503'||mode==='429'||mode==='budget'?2:1;
      assert.equal(Number(readFileSync(count,'utf8')),expectedCalls,`${mode}: external HTTP attempts`);
      assert.equal(terminal.calls,expectedCalls,`${mode}: host calls`);
      assert.equal(terminal.status,mode==='503'||mode==='429'||mode==='tool'||mode==='stream'?'completed':mode==='cancel'?'cancelled':'failed',`${mode}: ${terminal.error}`);
      const receipts=app.store.list<ModelRequestReceipt>('model_request').filter(r=>r.runId===run.id);
      assert.equal(receipts.length,expectedCalls);assert(receipts.every(r=>r.state!=='reserved'));
      if(mode==='503'||mode==='429'){assert.equal(terminal.retryState?.phase,'succeeded');assert.equal(receipts.at(-1)?.state,'settled');}
      if(mode==='429'){const times=JSON.parse(readFileSync(timings,'utf8')) as number[];assert(times[1]-times[0]>=1900,'HTTP hint must extend native 1s delay');}
      if(mode==='auth'||mode==='quota')assert.equal(terminal.retryState,undefined);
      if(mode==='always')assert.equal(terminal.retryState?.attempt,3);
      if(mode==='cancel')assert.equal(terminal.error,undefined);
      if(mode==='stream'){
        assert(sawPartial,'partial reply must be durably visible while the real worker is still running');
        const replies=app.service.conversation(project.id).messages.filter(m=>m.runId===run.id&&m.role==='assistant');
        assert.equal(replies.length,1);assert.equal(replies[0].text,'STREAM_FIRST STREAM_LAST');assert.equal(replies[0].phase,'final');
      }
      if(mode==='tool'){
        assert(sawToolProgress,'tool progress must be durable before execution completes');
        const tools=toolExecutions(app.store,run.id).items;assert.equal(tools.length,1);assert.equal(tools[0].phase,'completed');assert(tools[0].resultMessageId);
        const saved=JSON.parse(messageChunks(app.store,run.id,tools[0].resultMessageId).map(c=>c.text).join(''));
        assert.equal(saved.content[0].text,'WRITE_CONFIRMED '+ '工具🙂'.repeat(10000));assert.equal(saved.details.marker,'FULL_DETAILS');
        assert.equal(readFileSync(writes,'utf8'),'written\n','successful tool write must not replay during model recovery');
        assert.deepEqual(receipts.map(r=>r.state),['settled','unknown','settled']);
        assert(readFileSync(terminal.sessionPath!,'utf8').includes('WRITE_CONFIRMED'));
      }
      // Drain scheduler ownership before the next mode so a late exit cannot race the shared control files.
      const drain=Date.now()+3000;while(app.scheduler.pluginMaintenanceBlocked()&&Date.now()<drain){app.scheduler.tick();await delay(20);}
      await delay(50);
      assert(!readFileSync(terminal.sessionPath!,'utf8').includes('RAW_SECRET'));
    }
  }finally{await app.close();Object.assign(config,before);}
});
