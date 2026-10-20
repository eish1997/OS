import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
import {inspectPlugin} from '../server/plugin-packages.js';
import {modelToolSequence} from './helpers/model-tool-sequence.js';
import type {Policy,Run} from '../shared/contracts.js';
import type {PluginInteraction,PluginNotice} from '../shared/plugin-interaction.js';
import type {ToolExecution} from '../shared/run-stream.js';

test('session_start and dynamically registered tool dialogs preserve source and gate real side effects',{timeout:30000},async()=>{
  const before={...config};Object.assign(config,{apiKey:'offline-dialog-tool',provider:'openai',model:'gpt-5.6-sol',maxCalls:6,budgetUsd:100,reservePerCallUsd:10});
  const root=mkdtempSync(join(tmpdir(),'pi-dialog-tool-'));const transport=modelToolSequence(root,[{name:'dialog_gate',args:{}}]);const effects=join(root,'effects.txt');
  const extension=join(transport.source,'dialog.mjs');
  writeFileSync(join(transport.source,'package.json'),JSON.stringify({name:'owned-dialog-tool',pi:{extensions:['transport.mjs','dialog.mjs']}}));
  writeFileSync(extension,`import {appendFileSync} from 'node:fs';export default pi=>{
    pi.on('session_start',async(event,ctx)=>{
      if(!await ctx.ui.confirm('Event permission','Continue startup?'))throw new Error('Startup rejected');
      pi.registerTool({name:'dialog_gate',label:'Gate',description:'Owned gated write',parameters:{type:'object',properties:{}},execute:async(id,args,signal,onUpdate,ctx)=>{
        const approvals=await Promise.all([ctx.ui.confirm('Tool check A','First condition',{signal}),ctx.ui.confirm('Tool check B','Second condition',{signal})]);
        const selected=approvals.every(Boolean)?await ctx.ui.select('Tool permission',['write','skip'],{signal}):'skip';
        if(selected==='write')appendFileSync(${JSON.stringify(effects)},'WRITTEN\\n');
        ctx.ui.notify(selected==='write'?'Tool write confirmed':'Tool write skipped');
        return {content:[{type:'text',text:selected==='write'?'WROTE_ONCE':'NO_WRITE'}],details:{}};
      }});
    });
  };`);
  const app=createApp({dataDir:join(root,'data'),password:'dialog-tool-password',schedule:false});
  const count=()=>existsSync(effects)?readFileSync(effects,'utf8').trim().split('\n').length:0;
  try{
    const state=app.plugins.state;const op=state.enqueue({action:'install',source:transport.source,revision:state.configuration().revision,commandId:'dialog-fixture',trusted:true});const pkg=await inspectPlugin(transport.source,app.plugins.agentDir);state.phase(op.id,'committing','Fixture');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    const project=app.service.createProject('Event and tool dialogs');const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:true,modelBinding:app.modelAccess.settings().binding,maxCalls:3,maxCostUsd:100,reservePerCallUsd:10,maxOutputTokens:1024,timeoutMs:20000};
    for(const selected of ['write','skip','cancel']){
      const startCount=count();const run=app.service.submit(project.id,'Call dialog_gate',selected,'pi',policy,[],undefined,{view:'project'},null).run;const seen=new Set<string>();let final=run;const deadline=Date.now()+12000;let simultaneous=false;
      while(Date.now()<deadline){
        app.scheduler.tick();const dialogs=app.store.list<PluginInteraction>('plugin_interaction').filter(item=>item.runId===run.id&&item.state==='pending'&&!seen.has(item.id));
        if(!simultaneous&&dialogs.some(item=>item.title.startsWith('Tool check'))){
          if(dialogs.filter(item=>item.title.startsWith('Tool check')).length<2){await delay(20);continue;}
          simultaneous=true;
          if(selected==='cancel'){for(const item of dialogs)seen.add(item.id);await app.service.requestCancel(run.id);continue;}
        }
        dialogs.sort((a,b)=>b.title.localeCompare(a.title)); // Answer B before A, independent of creation order.
        for(const item of dialogs){seen.add(item.id);assert.equal(item.source,extension);assert.equal(count(),startCount,'no side effect before user choice');
          const current=app.store.get<Run>('run',run.id);assert.equal(current.calls,item.title==='Event permission'?0:1,'startup must wait before model; tool must wait before next model turn');
          if(item.kind==='select'){const tool=app.store.list<ToolExecution>('tool_execution').find(tool=>tool.runId===run.id&&tool.name==='dialog_gate');assert.equal(tool?.phase,'running');assert.equal(tool?.source,extension);}
          await delay(100);assert.equal(app.store.get<Run>('run',run.id).calls,current.calls,'waiting must not generate extra model requests');assert.equal(count(),startCount);
          app.scheduler.answerDialog(run.id,item.id,item.revision,item.id,item.kind==='confirm'?!(selected==='skip'&&item.title==='Tool check B'):selected);
        }
        final=app.store.get<Run>('run',run.id);if(['completed','failed','interrupted','cancelled'].includes(final.status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);
      }
      assert.equal(final.status,selected==='cancel'?'cancelled':'completed',final.error??selected);assert(simultaneous);assert.equal(seen.size,selected==='write'?4:3);assert.equal(final.calls,selected==='cancel'?1:2);
      assert.equal(count(),startCount+(selected==='write'?1:0));
      const recorded=app.store.list<PluginInteraction>('plugin_interaction').filter(item=>item.runId===run.id);
      assert(recorded.every(item=>item.state===(selected==='cancel'&&item.title.startsWith('Tool check')?'closed':'delivered')));
      if(selected==='cancel')continue;
      assert(app.store.list<PluginNotice>('plugin_notice').some(item=>item.runId===run.id&&item.source===extension&&item.message===(selected==='write'?'Tool write confirmed':'Tool write skipped')));
      const execution=app.store.list<ToolExecution>('tool_execution').find(item=>item.runId===run.id&&item.name==='dialog_gate');assert.equal(execution?.phase,'completed');
      assert(readFileSync(final.sessionPath!,'utf8').includes(selected==='write'?'WROTE_ONCE':'NO_WRITE'));
    }
  }finally{await app.close();Object.assign(config,before);}
});
