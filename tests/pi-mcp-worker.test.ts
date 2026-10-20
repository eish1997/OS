import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
import {inspectPlugin} from '../server/plugin-packages.js';
import {steeringTransport} from './helpers/steering-transport.js';
import type {Policy,Run} from '../shared/contracts.js';
import type {ToolExecution} from '../shared/run-stream.js';

for(const scenario of ['direct','codemode','reject-nested','force-stop','host-stop'] as const)test(`production worker ${scenario} MCP admission and owned process cleanup`,{timeout:30000,skip:(scenario==='force-stop'||scenario==='host-stop')&&process.platform!=='win32'},async()=>{
  const forced=scenario==='force-stop'||scenario==='host-stop';
  const exposure=scenario==='direct'||forced?'direct':'codemode';
  const before={...config};Object.assign(config,{apiKey:'offline-mcp',provider:'openai',model:'gpt-5.6-sol',maxCalls:5,budgetUsd:100,reservePerCallUsd:10});
  const root=mkdtempSync(join(tmpdir(),'pi-mcp-worker-'));const transport=steeringTransport(root);const file=join(transport.source,'transport.mjs');
  const args=exposure==='direct'?'{}':JSON.stringify({code:'const result = await tools.mcp__fixture__echo({}); text(result);'});
  writeFileSync(file,readFileSync(file,'utf8').replace("name:'wait_control',arguments:'{}'",`name:'${exposure==='direct'?'mcp__fixture__echo':'codemode'}',arguments:${JSON.stringify(args)}`).replace("delta:'{}'",`delta:${JSON.stringify(args)}`));
  const server=join(root,'mcp.mjs');const pidFile=join(root,'mcp.pid');const descendantPid=join(root,'descendant.pid');const calls=join(root,'mcp.calls');
  writeFileSync(server,`import {createInterface} from 'node:readline';import {writeFileSync,appendFileSync} from 'node:fs';import {spawn} from 'node:child_process';
    writeFileSync(${JSON.stringify(pidFile)},String(process.pid));
    ${forced?`const descendant=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});writeFileSync(${JSON.stringify(descendantPid)},String(descendant.pid));`:''}
    const lines=createInterface({input:process.stdin});${forced?'setInterval(()=>{},1000);':"lines.on('close',()=>process.exit(0));"}
    lines.on('line',line=>{const q=JSON.parse(line);if(q.id===undefined)return;let result;
    if(q.method==='initialize')result={protocolVersion:q.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned',version:'1'}};
    else if(q.method==='tools/list')result={tools:[{name:'echo',description:'Owned test',inputSchema:{type:'object',properties:{}}}]};
    else if(q.method==='tools/call'){appendFileSync(${JSON.stringify(calls)},'CALLED\\n');${forced?'return;':''}result={content:[{type:'text',text:'MCP_WORKER_CONFIRMED'}]};}
    else result={};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');});`);
  const app=createApp({dataDir:join(root,'data'),password:'mcp-worker-password',schedule:false});
  try{
    const state=app.plugins.state;const op=state.enqueue({action:'install',source:transport.source,revision:state.configuration().revision,commandId:'transport',trusted:true});const pkg=await inspectPlugin(transport.source,app.plugins.agentDir);state.phase(op.id,'committing','Local fixture');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    await app.mcp.update({revision:0,json:JSON.stringify({mcpServers:{fixture:{command:process.execPath,args:[server],exposure,timeout:3}}}),source:'owned test',active:true,trusted:true,codemode:exposure==='codemode',toolSearch:false});
    const project=app.service.createProject('MCP worker');const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:true,modelBinding:app.modelAccess.settings().binding,maxCalls:5,maxCostUsd:100,reservePerCallUsd:10,maxOutputTokens:1024,timeoutMs:20000};
    if(scenario==='reject-nested')app.store.db.exec("CREATE TRIGGER reject_nested BEFORE INSERT ON entities WHEN NEW.kind='tool_execution' AND json_extract(NEW.body,'$.name')='mcp__fixture__echo' BEGIN SELECT RAISE(ABORT,'controlled nested admission failure'); END");
    const run=app.service.submit(project.id,'Call MCP fixture','mcp-worker','pi',policy,[],undefined,{view:'project'}).run;
    const deadline=Date.now()+23000;let final=run;let stopped=false;
    while(Date.now()<deadline){app.scheduler.tick();if(forced&&!stopped&&existsSync(calls)){if(scenario==='host-stop')await app.scheduler.stop();else assert(app.scheduler.terminateOwnedWorker(run.id));stopped=true;}final=app.store.get<Run>('run',run.id);if(final.status==='interrupted'||(['completed','failed'].includes(final.status)&&!app.scheduler.pluginMaintenanceBlocked()))break;await delay(20);}
    assert.equal(final.status,forced?'interrupted':scenario==='reject-nested'?'failed':'completed',final.error??'Expected completion');assert(final.mcpManifest?.enabled);
    if(scenario==='reject-nested')assert.equal(existsSync(calls),false,'nested side effect requires durable admission');
    else {assert(existsSync(calls));assert.equal(readFileSync(calls,'utf8').trim(),'CALLED');}
    assert(final.pluginTools?.some(t=>t.name==='mcp__fixture__echo'&&t.source==='builtin:mcp'));
    const tools=app.store.list<ToolExecution>('tool_execution').filter(t=>t.runId===run.id&&t.name==='mcp__fixture__echo');assert.equal(tools.length,scenario==='reject-nested'?0:1);
    if(forced){assert.equal(tools[0].phase,'running');assert.throws(()=>app.service.retry(run.id,'unsafe-replay'),/尚未确认|对账/);}
    else if(scenario!=='reject-nested'){assert.equal(tools[0].phase,'completed');assert(readFileSync(final.sessionPath!,'utf8').includes('MCP_WORKER_CONFIRMED'));}
    const pid=Number(readFileSync(pidFile,'utf8'));let alive=true;const cleanup=Date.now()+3000;while(alive&&Date.now()<cleanup){try{process.kill(pid,0);await delay(20);}catch{alive=false;}}assert.equal(alive,false);
    if(forced){const childPid=Number(readFileSync(descendantPid,'utf8'));assert.throws(()=>process.kill(childPid,0),{code:'ESRCH'},'MCP descendant must also be terminated');}
  }finally{await app.close();Object.assign(config,before);}
});
