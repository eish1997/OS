import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
import {inspectPlugin} from '../server/plugin-packages.js';
import {toolExecutions,reconcileTool} from '../server/tool-progress.js';
import {continuationFor} from '../server/native-session.js';
import {backup,restore} from '../server/backup.js';
import {Store} from '../server/store.js';
import type {Policy,Run} from '../shared/contracts.js';

test('real tool writes before worker death; recovery requires evidence and passes it to the next worker',{timeout:30000},async()=>{
  const before={...config};Object.assign(config,{apiKey:'offline-recovery',provider:'openai',model:'gpt-5.6-sol',maxCalls:10,budgetUsd:100,reservePerCallUsd:10});
  const root=mkdtempSync(join(tmpdir(),'tool-recovery-'));const source=join(root,'plugin');mkdirSync(source);const written=join(root,'written.txt');const payload=join(root,'payload.txt');
  writeFileSync(join(source,'package.json'),JSON.stringify({name:'controlled-tool-recovery',pi:{extensions:['transport.mjs']}}));
  writeFileSync(join(source,'transport.mjs'),`import {appendFileSync,writeFileSync,existsSync} from 'node:fs';
    export default pi=>pi.on('session_start',()=>{
      pi.registerTool({name:'write_then_wait',label:'Controlled write',description:'Controlled write',parameters:{type:'object',properties:{}},execute:async()=>{appendFileSync(${JSON.stringify(written)},'once\\n');await new Promise(()=>{});}});
      globalThis.fetch=async(_url,init)=>{
        const resume=existsSync(${JSON.stringify(written)});if(resume)writeFileSync(${JSON.stringify(payload)},String(init.body));
        const item=resume?{id:'m',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'RECOVERY_RECEIVED',annotations:[]}]}:{id:'fc',call_id:'crash-call',type:'function_call',name:'write_then_wait',arguments:'{}',status:'completed'};
        const events=resume?[{type:'response.output_item.added',output_index:0,item:{...item,content:[]}},{type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,delta:'RECOVERY_RECEIVED'}]:[{type:'response.output_item.added',output_index:0,item:{...item,arguments:''}},{type:'response.function_call_arguments.delta',output_index:0,item_id:'fc',delta:'{}'}];
        events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response',status:'completed',output:[item],usage:{input_tokens:100,output_tokens:10,total_tokens:110,input_tokens_details:{cached_tokens:0}}}});
        return new Response(events.map(e=>'event: '+e.type+'\\ndata: '+JSON.stringify(e)+'\\n\\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
      };
    });`);
  const data=join(root,'data');const app=createApp({dataDir:data,password:'recovery-password',schedule:false});
  try{
    const state=app.plugins.state;const op=state.enqueue({action:'install',source,revision:state.configuration().revision,commandId:'recovery',trusted:true});const pkg=await inspectPlugin(source,app.plugins.agentDir);state.phase(op.id,'committing','Local fixture');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    const project=app.service.createProject('工具中断恢复');const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:true,modelBinding:app.modelAccess.settings().binding,maxCalls:4,maxCostUsd:40,reservePerCallUsd:10,maxOutputTokens:1024,timeoutMs:20000};
    app.store.db.exec("CREATE TRIGGER reject_start BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='tool.progress' BEGIN SELECT RAISE(ABORT,'controlled admission failure'); END");
    const rejected=app.service.submit(project.id,'Reject before tool writes','reject-start','pi',policy).run;let rejectDeadline=Date.now()+10000;
    while(Date.now()<rejectDeadline){app.scheduler.tick();if(['failed','interrupted'].includes(app.store.get<Run>('run',rejected.id).status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
    assert.equal(app.store.get<Run>('run',rejected.id).status,'failed');assert.equal(existsSync(written),false,'no side effect before durable start acknowledgement');
    app.store.db.exec('DROP TRIGGER reject_start');
    const run=app.service.submit(project.id,'Write controlled record','crash','pi',policy).run;
    let deadline=Date.now()+10000;
    while(Date.now()<deadline){app.scheduler.tick();if(existsSync(written)&&toolExecutions(app.store,run.id).items.length)break;await delay(20);}
    assert.equal(readFileSync(written,'utf8'),'once\n');const tool=toolExecutions(app.store,run.id).items[0];assert(tool);assert.equal(tool.phase,'running');
    assert.throws(()=>reconcileTool(app.store,run.id,tool.id,tool.revision,'performed','checked'),/尚未结束/);
    app.scheduler.terminateOwnedWorker(run.id);deadline=Date.now()+5000;
    while(app.store.get<Run>('run',run.id).status==='running'&&Date.now()<deadline)await delay(20);
    assert.equal(app.store.get<Run>('run',run.id).status,'interrupted');
    assert.throws(()=>app.scheduler.acknowledge(run.id),/工具结果尚未确认/);
    assert.throws(()=>app.service.retry(run.id,'unsafe'),/工具结果尚未确认/);
    const stopped=app.store.get<Run>('run',run.id);app.store.update<Run>('run',run.id,stopped.revision,{error:'进程已对账'});
    assert.throws(()=>continuationFor(app.store,project.id,policy,run.id),/工具结果尚未确认/);
    app.store.db.exec("CREATE TRIGGER reject_recovery BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='tool.reconciled' BEGIN SELECT RAISE(ABORT,'controlled rollback'); END");
    const evidence='CHECKED_ONE_LINE_AND_PROCESS_EXIT';
    assert.throws(()=>reconcileTool(app.store,run.id,tool.id,tool.revision,'partial',evidence),/controlled rollback/);
    assert.equal(toolExecutions(app.store,run.id).items[0].reconciliation,undefined);app.store.db.exec('DROP TRIGGER reject_recovery');
    const confirmed=reconcileTool(app.store,run.id,tool.id,tool.revision,'partial',evidence);
    assert.deepEqual(reconcileTool(app.store,run.id,tool.id,tool.revision,'partial',evidence),confirmed);
    assert.throws(()=>reconcileTool(app.store,run.id,tool.id,tool.revision,'not_performed','different'),/已核对/);
    app.scheduler.acknowledge(run.id);const next=app.service.retry(run.id,'safe');
    deadline=Date.now()+10000;
    while(Date.now()<deadline){app.scheduler.tick();if(['completed','failed','interrupted'].includes(app.store.get<Run>('run',next.id).status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
    const final=app.store.get<Run>('run',next.id);assert.equal(final.status,'completed',final.error??'recovery worker');assert.equal(readFileSync(written,'utf8'),'once\n');
    assert(readFileSync(payload,'utf8').includes(evidence),'actual next model request must carry operator evidence');
    await app.scheduler.stop();backup(app.store,data,join(root,'backup'));restore(join(root,'backup'),join(root,'restored'));
    const restored=new Store(join(root,'restored','workbench.sqlite'));try{assert.deepEqual(toolExecutions(restored,run.id).items[0].reconciliation,confirmed.reconciliation);}finally{restored.close();}
  }finally{await app.close();Object.assign(config,before);}
});
