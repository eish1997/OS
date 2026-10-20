import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
import {inspectPlugin} from '../server/plugin-packages.js';
import {modelToolSequence} from './helpers/model-tool-sequence.js';
import type {Policy,Run} from '../shared/contracts.js';
import type {PluginInteraction,PluginNotice} from '../shared/plugin-interaction.js';

test('real plugin command waits for durable HTTP dialog answers and closes on timeout/cancel',{timeout:90000},async()=>{
  const before={...config};Object.assign(config,{apiKey:'offline-dialog',provider:'openai',model:'gpt-5.6-sol',maxCalls:2,budgetUsd:100,reservePerCallUsd:10});
  const root=mkdtempSync(join(tmpdir(),'pi-dialog-worker-'));const transport=modelToolSequence(root,[]);const resultFile=join(root,'result.json');
  writeFileSync(join(transport.source,'transport.mjs'),`import {writeFileSync} from 'node:fs';export default pi=>{
    pi.on('session_start',async(event,ctx)=>{ctx.ui.notify('DIALOG_SESSION_READY');});
    pi.on('session_shutdown',async(event,ctx)=>{ctx.ui.notify('DIALOG_SESSION_CLOSED','warning');});
    pi.registerCommand('closing',{description:'Finish during host shutdown',handler:async(args,ctx)=>{ctx.ui.notify('CLOSING_READY');await new Promise(resolve=>setTimeout(resolve,250));}});
    pi.registerCommand('dialog',{description:'Owned dialog fixture',handler:async(args,ctx)=>{
      if(!ctx.hasUI)throw new Error('Missing UI bridge');
      const confirmed=await ctx.ui.confirm('Confirm fixture','Proceed?');if(!confirmed)return;
      const input=await ctx.ui.input('Input fixture','Value');ctx.ui.notify('Received '+input+' with offline-dialog','info');const selected=await ctx.ui.select('Select fixture',['A','B']);
      writeFileSync(${JSON.stringify(resultFile)},JSON.stringify({confirmed,input,selected}));
    }});
    pi.registerCommand('expire',{description:'Timeout fixture',handler:async(args,ctx)=>{const value=await ctx.ui.confirm('Expire fixture','Wait',{timeout:100});if(value)throw new Error('Timeout must not consent');}});
    pi.registerCommand('abortinput',{description:'Abort input fixture',handler:async(args,ctx)=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),100);try{const value=await ctx.ui.input('Abort input fixture','Value',{signal:controller.signal});if(value!==undefined)throw new Error('Abort must not supply input');}finally{clearTimeout(timer);}}});
    pi.registerCommand('flood',{description:'Bounded notices',handler:async(args,ctx)=>{ctx.ui.notify('x'.repeat(9000));for(let i=0;i<105;i++)ctx.ui.notify('NOTICE '+i);}});
    pi.registerCommand('waitcap',{description:'Host waiting limit',handler:async(args,ctx)=>{const value=await ctx.ui.confirm('Host cap fixture','Wait',{timeout:60000});if(value)throw new Error('Expiry must not consent');}});
    pi.registerCommand('contextcheck',{description:'No false command success',handler:async(args,ctx)=>{
      await ctx.waitForIdle();const before=ctx.sessionManager.getSessionId();let rejected=0;let callback=false;
      for(const action of ['newSession','fork','navigateTree','switchSession','reload']){try{await ctx[action]('unused',{withSession:()=>{callback=true;}});}catch(error){if(!error.message.includes('尚未接入'))throw error;rejected++;}}
      if(rejected!==5||callback||ctx.sessionManager.getSessionId()!==before)throw new Error('Unsupported command reported success or changed session');
    }});
  };`);
  const app=createApp({dataDir:join(root,'data'),password:'dialog-test-password',schedule:false});
  let droppedResponses=0;
  app.server.on('request',(req,res)=>{
    if(req.headers['x-owned-drop-response']==='once')res.end=(()=>{droppedResponses++;res.destroy();return res;}) as typeof res.end;
  });
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;config.origin=base;
  try{
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({password:'dialog-test-password'})});const cookie=login.headers.get('set-cookie')!.split(';')[0];
    const headers={'content-type':'application/json',origin:base,cookie};
    const state=app.plugins.state;const op=state.enqueue({action:'install',source:transport.source,revision:state.configuration().revision,commandId:'transport',trusted:true});const pkg=await inspectPlugin(transport.source,app.plugins.agentDir);state.phase(op.id,'committing','Fixture');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    const project=app.service.createProject('Plugin dialogs');const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:true,modelBinding:app.modelAccess.settings().binding,maxCalls:2,maxCostUsd:100,reservePerCallUsd:10,maxOutputTokens:1024,timeoutMs:20000};
    for(const scenario of ['answer','expire','abort','flood','waitcap','context','cancel','kill'] as const){
      const activePolicy:Policy=scenario==='waitcap'?{...policy,piRuntime:{schemaVersion:1,configurationRevision:0,requestedThinkingLevel:'off',thinkingLevel:'off',userWaitTimeoutMs:1000}}:policy;
      const run=app.service.submit(project.id,scenario==='expire'?'/expire':scenario==='abort'?'/abortinput':scenario==='flood'?'/flood':scenario==='waitcap'?'/waitcap':scenario==='context'?'/contextcheck':'/dialog',scenario,'pi',activePolicy,[],undefined,{view:'project'}).run;
      const seen=new Set<string>();let final=run;const deadline=Date.now()+20000;
      while(Date.now()<deadline){
        app.scheduler.tick();
        const response=await fetch(`${base}/api/runs/${run.id}/interactions`,{headers});assert.equal(response.status,200);
        const dialogs=(await response.json() as {interactions:PluginInteraction[]}).interactions;
        for(const item of dialogs.filter(item=>item.state==='pending'&&!seen.has(item.id))){
          seen.add(item.id);
          if(scenario==='expire'||scenario==='abort'||scenario==='waitcap')continue;
          if(scenario==='kill'){assert(app.scheduler.terminateOwnedWorker(run.id));continue;}
          if(scenario==='cancel'){await app.service.requestCancel(run.id);continue;}
          const answer=item.kind==='confirm'?true:item.kind==='input'?'private-dialog-value':'B';
          const url=`${base}/api/runs/${run.id}/interactions/${item.id}/answer`;const body=JSON.stringify({revision:item.revision,commandId:item.id,answer});
          assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/json',origin:base},body})).status,401);
          if(item.kind==='input')await assert.rejects(fetch(url,{method:'POST',headers:{...headers,'x-owned-drop-response':'once'},body}),/fetch failed/);
          else assert.equal((await fetch(url,{method:'POST',headers,body})).status,200);
          assert.equal((await fetch(url,{method:'POST',headers,body})).status,200,'lost-response retry must return receipt');
          assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({revision:item.revision,commandId:'other-page',answer})})).status,409);
        }
        final=app.store.get<Run>('run',run.id);if(final.status==='interrupted'||(['completed','failed','cancelled'].includes(final.status)&&!app.scheduler.pluginMaintenanceBlocked()))break;await delay(20);
      }
      assert.equal(final.status,scenario==='kill'?'interrupted':scenario==='cancel'?'cancelled':'completed',final.error??scenario);
      const dialogs=app.store.list<PluginInteraction>('plugin_interaction').filter(item=>item.runId===run.id);
      const notices=app.store.list<PluginNotice>('plugin_notice').filter(item=>item.runId===run.id);
      assert(notices.some(item=>item.message==='DIALOG_SESSION_READY'));
      if(scenario!=='kill'&&scenario!=='flood')assert(notices.some(item=>item.message==='DIALOG_SESSION_CLOSED'&&item.level==='warning'),'normal/cancelled shutdown notices must persist before terminal receipt');
      if(scenario==='answer')assert(notices.some(item=>item.message==='Received [已隐藏] with [已隐藏]'));
      if(scenario==='answer'){assert.equal(dialogs.length,3);assert(dialogs.every(item=>item.state==='delivered'));assert.deepEqual(JSON.parse(readFileSync(resultFile,'utf8')),{confirmed:true,input:'private-dialog-value',selected:'B'});}
      else if(scenario==='flood'){assert.equal(dialogs.length,0);assert.equal(notices.length,101);assert(notices.every(item=>item.message.length<=8000));assert(notices.some(item=>item.truncated&&item.message.includes('100条')));assert(notices.some(item=>item.truncated&&item.message.includes('通知已缩短')));}
      else if(scenario==='context'){assert.equal(dialogs.length,0);assert.equal(notices.filter(item=>item.level==='error'&&item.message.includes('尚未接入')).length,5);assert.equal(final.calls,0);}
      else {assert.equal(dialogs.length,1);assert.equal(dialogs[0].state,scenario==='expire'||scenario==='waitcap'?'expired':'closed');}
      if(scenario==='waitcap'){assert.equal(final.calls,0,'waiting does not start a model request');assert(Date.parse(dialogs[0].expiresAt)-Date.parse(dialogs[0].createdAt)<=1000);assert(Date.parse(final.endedAt!)>=Date.parse(dialogs[0].expiresAt));assert(!final.timedOutAt,'dialog expiry is separate from total task deadline');}
    }
    assert(!JSON.stringify(app.store.db.prepare('SELECT body FROM entities UNION ALL SELECT body FROM events').all()).includes('private-dialog-value'));
    assert.equal(droppedResponses,1);
    const input=app.store.list<PluginInteraction>('plugin_interaction').find(item=>item.kind==='input')!;
    assert.equal(app.store.events(0,1000).filter(event=>event.type==='run.interaction_answered'&&(event.data as {id:string}).id===input.id).length,1);
    // The killed fixture was stopped at its first confirm, before any file write.
    // Reconcile it explicitly: an unknown interrupted run blocks all new launches.
    const killed=app.store.list<Run>('run').find(item=>item.status==='interrupted')!;
    app.scheduler.acknowledge(killed.id);
    // Avoid implicitly continuing the killed fixture's session.
    const closingProject=app.service.createProject('Closing worker');
    const closing=app.service.submit(closingProject.id,'/closing','closing-fixture','pi',{...policy,projectId:closingProject.id},[],undefined,{view:'project'}).run;
    const closingDeadline=Date.now()+20000;
    while(!app.store.list<PluginNotice>('plugin_notice').some(item=>item.runId===closing.id&&item.message==='CLOSING_READY')){
      assert(Date.now()<closingDeadline,'closing fixture did not start');app.scheduler.tick();await delay(10);
    }
    assert.equal(app.store.get<Run>('run',closing.id).status,'running');
    const queued=app.service.submit(closingProject.id,'/closing','after-closing-fixture','pi',{...policy,projectId:closingProject.id},[],undefined,{view:'project'}).run;
    const stopping=app.scheduler.stop();
    assert.equal(app.scheduler.stop(),stopping,'concurrent stop calls share the cleanup result');
    app.scheduler.tick();
    assert.equal(await app.scheduler.withIdleMaintenance(async()=>{assert.fail('maintenance started while stopping');}),false);
    await stopping;
    app.scheduler.tick();
    assert.equal(app.store.get<Run>('run',queued.id).status,'queued','stopped scheduler must leave queued work for the next host');
    assert.equal(app.store.get<Run>('run',queued.id).workerPid,undefined);
    assert.throws(()=>app.scheduler.start(),/调度器已关闭/);
    assert.equal(app.store.get<Run>('run',closing.id).status,'completed','host shutdown lets a finishing worker persist its terminal receipt');
    assert(app.store.list<PluginNotice>('plugin_notice').some(item=>item.runId===closing.id&&item.message==='DIALOG_SESSION_CLOSED'));
    assert.equal(app.scheduler.pluginMaintenanceBlocked(),false,'natural exit releases plugin read ownership');
  }catch(error){console.error(error);throw error;}
  finally{try{await app.close();}catch(error){console.error(error);app.server.closeAllConnections();await new Promise<void>(resolve=>app.server.close(()=>resolve()));throw error;}finally{Object.assign(config,before);}}
});
