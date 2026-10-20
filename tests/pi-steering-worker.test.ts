import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
import {inspectPlugin} from '../server/plugin-packages.js';
import type {Policy,Run} from '../shared/contracts.js';
import type {RunInput} from '../shared/run-input.js';
import {backup,restore} from '../server/backup.js';
import {Store} from '../server/store.js';

// Multi-phase steering + force-stop tree confirmation; 30s is too tight under serial-suite load.
test('native steering stays in the active run, survives replay and preserves identical messages as distinct inputs',{timeout:90000},async()=>{
  const before={...config};Object.assign(config,{apiKey:'offline-steering',provider:'openai',model:'gpt-5.6-sol',maxCalls:10,budgetUsd:100,reservePerCallUsd:10});
  const root=mkdtempSync(join(tmpdir(),'pi-steering-'));const source=join(root,'plugin');mkdirSync(source);const started=join(root,'started');const release=join(root,'release');const payloads=join(root,'payloads');
  mkdirSync(join(source,'skills','check'),{recursive:true});mkdirSync(join(source,'prompts'));
  writeFileSync(join(source,'skills','check','SKILL.md'),'---\nname: check\ndescription: Controlled steering skill\n---\nNATIVE_SKILL_BODY');
  writeFileSync(join(source,'prompts','guide.md'),'---\ndescription: Controlled steering template\n---\nNATIVE_TEMPLATE $1');
  writeFileSync(join(source,'package.json'),JSON.stringify({name:'steering-transport',pi:{extensions:['transport.mjs'],skills:['skills'],prompts:['prompts']}}));
  writeFileSync(join(source,'transport.mjs'),`import {writeFileSync,appendFileSync,existsSync} from 'node:fs';
    export default pi=>{pi.on('input',event=>{if(event.text==='STEER_IDENTICAL_CONTENT'){pi.sendUserMessage('PLUGIN_SIDE_MESSAGE',{deliverAs:'steer'});return {action:'transform',text:'NATIVE_INPUT_TRANSFORMED'};}return event.text==='HANDLE_ONLY'?{action:'handled'}:undefined;});
      pi.registerCommand('controlled-command',{description:'Must not execute through steer',handler:async()=>{throw new Error('should not dispatch');}});
      pi.on('session_start',()=>{let calls=0;
      pi.registerTool({name:'wait_control',label:'Wait',description:'Controlled wait',parameters:{type:'object',properties:{}},execute:async(_id,_args,signal)=>{writeFileSync(${JSON.stringify(started)},'started');while(!existsSync(${JSON.stringify(release)})&&!signal?.aborted)await new Promise(r=>setTimeout(r,20));return {content:[{type:'text',text:'WAIT_DONE'}],details:{}};}});
      globalThis.fetch=async(_url,init)=>{calls++;appendFileSync(${JSON.stringify(payloads)},String(init.body)+'\\n');
        const item=calls===1?{id:'fc',call_id:'wait-call',type:'function_call',name:'wait_control',arguments:'{}',status:'completed'}:{id:'m'+calls,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'CONTINUED',annotations:[]}]};
        const events=calls===1?[{type:'response.output_item.added',output_index:0,item:{...item,arguments:''}},{type:'response.function_call_arguments.delta',output_index:0,item_id:'fc',delta:'{}'}]:[{type:'response.output_item.added',output_index:0,item:{...item,content:[]}},{type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,delta:'CONTINUED'}];
        events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response'+calls,status:'completed',output:[item],usage:{input_tokens:100,output_tokens:10,total_tokens:110,input_tokens_details:{cached_tokens:0}}}});
        return new Response(events.map(e=>'event: '+e.type+'\\ndata: '+JSON.stringify(e)+'\\n\\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
      };
    });};`);
  const app=createApp({dataDir:join(root,'data'),password:'steering-password',schedule:false});
  await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try{
    const state=app.plugins.state;const op=state.enqueue({action:'install',source,revision:state.configuration().revision,commandId:'transport',trusted:true});const pkg=await inspectPlugin(source,app.plugins.agentDir);state.phase(op.id,'committing','Local fixture');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    const project=app.service.createProject('原生中途指导');const conversation=app.service.createConversation(project.id,'指导验证','conversation');
    const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:true,modelBinding:app.modelAccess.settings().binding,maxCalls:10,maxCostUsd:100,reservePerCallUsd:10,maxOutputTokens:1024,timeoutMs:20000};
    const run=app.service.submit(project.id,'Run controlled tool','start','pi',policy,[],undefined,{view:'project'},null,conversation.id).run;
    let deadline=Date.now()+10000;while(!existsSync(started)&&Date.now()<deadline){app.scheduler.tick();await delay(20);}assert(existsSync(started));
    assert.equal(app.store.get<Run>('run',run.id).mcpManifest?.enabled,false,'scheduler freezes the actual default-disabled MCP environment');
    assert.equal(app.store.get<Run>('run',run.id).mcpManifest?.signature,app.mcp.manifest(project.id).signature);
    const post=(headers:Record<string,string>={})=>fetch(base+`/api/runs/${run.id}/steer`,{method:'POST',headers,body:JSON.stringify({conversationId:conversation.id,commandId:'steer-1',text:'STEER_IDENTICAL_CONTENT'})});
    assert.equal((await post()).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'steering-password'})});const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0]};
    assert.equal((await post({...headers,Origin:'https://untrusted.invalid'})).status,403);
    assert.equal((await post(headers)).status,200);
    assert.throws(()=>app.scheduler.steer(run.id,'other','wrong','text'),/话题/);
    const first=app.scheduler.steer(run.id,conversation.id,'steer-1','STEER_IDENTICAL_CONTENT');
    assert.equal(app.scheduler.steer(run.id,conversation.id,'steer-1','STEER_IDENTICAL_CONTENT').id,first.id);
    assert.throws(()=>app.scheduler.steer(run.id,conversation.id,'steer-1','changed'),/幂等/);
    const second=app.scheduler.steer(run.id,conversation.id,'steer-2','STEER_IDENTICAL_CONTENT');assert.notEqual(first.id,second.id);
    const handled=app.scheduler.steer(run.id,conversation.id,'handled','HANDLE_ONLY');
    const rejected=app.scheduler.steer(run.id,conversation.id,'command','/controlled-command');
    const template=app.scheduler.steer(run.id,conversation.id,'template','/guide alpha');
    const skill=app.scheduler.steer(run.id,conversation.id,'skill','/skill:check beta');
    deadline=Date.now()+5000;while(Date.now()<deadline){if(app.store.get<RunInput>('run_input',skill.id).state==='queued')break;await delay(20);}
    assert.deepEqual([first,second].map(i=>app.store.get<RunInput>('run_input',i.id).state),['queued','queued']);
    assert.equal(app.store.get<RunInput>('run_input',handled.id).state,'handled');assert.equal(app.store.get<RunInput>('run_input',rejected.id).state,'not_applied');
    assert.equal(app.store.get<Run>('run',run.id).status,'running');writeFileSync(release,'go');
    deadline=Date.now()+10000;while(Date.now()<deadline){app.scheduler.tick();if(['completed','failed','interrupted'].includes(app.store.get<Run>('run',run.id).status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
    const final=app.store.get<Run>('run',run.id);assert.equal(final.status,'completed',final.error??'steering run');
    assert.deepEqual([first,second,template,skill].map(i=>app.store.get<RunInput>('run_input',i.id).state),['applied','applied','applied','applied']);assert.equal(app.store.list<Run>('run').length,1);
    const requests=readFileSync(payloads,'utf8').trim().split('\n');assert(requests.slice(1).some(p=>p.includes('NATIVE_INPUT_TRANSFORMED')));assert(!requests.some(p=>p.includes('STEER_IDENTICAL_CONTENT')||p.includes('HANDLE_ONLY')||p.includes('/controlled-command')));
    assert(requests.some(p=>p.includes('NATIVE_TEMPLATE alpha')));assert(requests.some(p=>p.includes('NATIVE_SKILL_BODY')&&p.includes('beta')));
    const history=app.service.conversation(project.id,undefined,50,conversation.id);assert.equal(history.messages.filter(m=>m.inputState==='applied').length,4);
    assert.equal(app.scheduler.steer(run.id,conversation.id,'steer-1','STEER_IDENTICAL_CONTENT').state,'applied','replay after run completion returns latest receipt');
    assert.throws(()=>app.scheduler.steer(run.id,conversation.id,'late','too late'),/不可接收|已结束/);
    assert(readFileSync(final.sessionPath!,'utf8').includes(first.id),'native history retains input metadata identity');
    const nativeMessages=readFileSync(final.sessionPath!,'utf8').trim().split('\n').map(row=>JSON.parse(row)).filter(row=>row.type==='message').map(row=>row.message);
    const injected=nativeMessages.filter(m=>m.role==='user'&&JSON.stringify(m.content).includes('PLUGIN_SIDE_MESSAGE'));assert.equal(injected.length,2);assert(injected.every(m=>!m.workbenchInputId),'plugin messages must not acquire a user steering receipt');
    unlinkSync(release);unlinkSync(started);
    const cancelledRun=app.service.submit(project.id,'Cancel queued steering','cancel-run','pi',policy,[],undefined,{view:'project'},run.id,conversation.id).run;
    deadline=Date.now()+7000;while(!existsSync(started)&&Date.now()<deadline){app.scheduler.tick();await delay(20);}assert(existsSync(started));
    const cancelledInput=app.scheduler.steer(cancelledRun.id,conversation.id,'cancel-steer','NEVER_APPLY_AFTER_CANCEL');
    deadline=Date.now()+3000;while(app.store.get<RunInput>('run_input',cancelledInput.id).state==='accepted'&&Date.now()<deadline)await delay(20);
    await app.service.requestCancel(cancelledRun.id);app.scheduler.tick();
    deadline=Date.now()+7000;while(Date.now()<deadline){app.scheduler.tick();if(app.store.get<Run>('run',cancelledRun.id).status==='cancelled'&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
    assert.equal(app.store.get<Run>('run',cancelledRun.id).status,'cancelled');assert.equal(app.store.get<RunInput>('run_input',cancelledInput.id).state,'not_applied');
    assert(!readFileSync(payloads,'utf8').includes('NEVER_APPLY_AFTER_CANCEL'));
    unlinkSync(started);
    const crashRun=app.service.submit(project.id,'Preserve pending steering','crash-run','pi',policy,[],undefined,{view:'project'},null,conversation.id).run;
    deadline=Date.now()+20000;while(!existsSync(started)&&Date.now()<deadline){app.scheduler.tick();await delay(20);}assert(existsSync(started));
    const crashInput=app.scheduler.steer(crashRun.id,conversation.id,'crash-steer','PRESERVE_UNCONFIRMED_GUIDANCE');
    deadline=Date.now()+3000;while(app.store.get<RunInput>('run_input',crashInput.id).state==='accepted'&&Date.now()<deadline)await delay(20);
    // Force-stop confirms the process tree before marking interrupted; Windows listing can exceed 5s under suite load.
    app.scheduler.terminateOwnedWorker(crashRun.id);deadline=Date.now()+20000;
    while(app.store.get<Run>('run',crashRun.id).status==='running'&&Date.now()<deadline)await delay(20);
    assert.equal(app.store.get<Run>('run',crashRun.id).status,'interrupted');
    assert.equal(app.service.conversation(project.id,undefined,50,conversation.id).messages.find(m=>m.id===crashInput.id)?.inputState,'unknown');
    assert.equal(app.scheduler.steer(crashRun.id,conversation.id,'crash-steer','PRESERVE_UNCONFIRMED_GUIDANCE').state,'unknown');
    assert.equal(app.store.list<RunInput>('run_input').filter(i=>i.id===crashInput.id).length,1);
    await app.scheduler.stop();backup(app.store,join(root,'data'),join(root,'backup'));restore(join(root,'backup'),join(root,'restored'));
    const restored=new Store(join(root,'restored','workbench.sqlite'));try{assert.equal(restored.get<RunInput>('run_input',crashInput.id).text,'PRESERVE_UNCONFIRMED_GUIDANCE');assert.equal(restored.get<Run>('run',crashRun.id).status,'interrupted');}finally{restored.close();}
  }finally{await app.close();Object.assign(config,before);}
});
