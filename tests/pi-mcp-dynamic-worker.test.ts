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
import type {ToolExecution} from '../shared/run-stream.js';

test('production MCP worker rejects withdrawn tools and accepts restored tools in the same session',{timeout:35000},async()=>{
  const before={...config};Object.assign(config,{apiKey:'offline-dynamic-mcp',provider:'openai',model:'gpt-5.6-sol',maxCalls:5,budgetUsd:100,reservePerCallUsd:10});
  const root=mkdtempSync(join(tmpdir(),'pi-mcp-dynamic-'));const visibility=join(root,'visibility');const calls=join(root,'calls.jsonl');const pidFile=join(root,'server.pid');const observations=join(root,'observations.jsonl');
  writeFileSync(visibility,'visible');
  const transport=modelToolSequence(root,[{name:'mcp__fixture__echo',args:{text:'BEFORE'}},{name:'codemode',args:{code:'const result = await tools.mcp__fixture__echo({text:"WITHDRAWN"}); text(result);'}},{name:'codemode',args:{code:'text("WAITED_FOR_RESTORE");'}},{name:'mcp__fixture__echo',args:{text:'RESTORED'}}]);
  const transportFile=join(transport.source,'transport.mjs');
  // Coordinate against the native active catalog, not an arbitrary sleep. The model
  // returns a stale call after withdrawal, as can happen while a request is in flight.
  writeFileSync(transportFile,readFileSync(transportFile,'utf8').replace("import {appendFileSync}","import {appendFileSync,writeFileSync}").replace('const step=steps[calls++];',`const step=steps[calls++];
    if(calls===2||calls===3){const visible=calls===3;writeFileSync(${JSON.stringify(visibility)},visible?'visible':'hidden');
      const deadline=Date.now()+5000;while(pi.getActiveTools().includes('mcp__fixture__echo')!==visible&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
      const active=pi.getActiveTools().includes('mcp__fixture__echo');appendFileSync(${JSON.stringify(observations)},JSON.stringify({visible,active})+'\\n');
      if(active!==visible)throw new Error('Native catalog did not update');
    }`));
  const server=join(root,'server.mjs');
  writeFileSync(server,`import {createInterface} from 'node:readline';import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
    writeFileSync(${JSON.stringify(pidFile)},String(process.pid));let visibility='visible';
    setInterval(()=>{const next=readFileSync(${JSON.stringify(visibility)},'utf8');if(next!==visibility){visibility=next;process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/tools/list_changed'})+'\\n');}},20);
    const lines=createInterface({input:process.stdin});lines.on('close',()=>process.exit(0));
    lines.on('line',line=>{const q=JSON.parse(line);if(q.id===undefined)return;let result;
      if(q.method==='initialize')result={protocolVersion:q.params.protocolVersion,capabilities:{tools:{listChanged:true}},serverInfo:{name:'dynamic-fixture',version:'1'}};
      else if(q.method==='tools/list')result={tools:visibility==='hidden'?[]:[{name:'echo',description:'Echo fixture',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']}}]};
      else if(q.method==='tools/call'){appendFileSync(${JSON.stringify(calls)},JSON.stringify(q.params.arguments)+'\\n');result={content:[{type:'text',text:'CONFIRMED '+q.params.arguments.text}]};}
      else result={};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');});`);
  const app=createApp({dataDir:join(root,'data'),password:'dynamic-worker-password',schedule:false});
  try{
    const state=app.plugins.state;const op=state.enqueue({action:'install',source:transport.source,revision:state.configuration().revision,commandId:'transport',trusted:true});const pkg=await inspectPlugin(transport.source,app.plugins.agentDir);state.phase(op.id,'committing','Local fixture');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    await app.mcp.update({revision:0,json:JSON.stringify({mcpServers:{fixture:{command:process.execPath,args:[server],exposure:'direct',timeout:3},unavailable:{command:join(root,'missing-program.exe'),exposure:'direct',timeout:3}}}),source:'owned dynamic test',active:true,trusted:true,codemode:true,toolSearch:false});
    const project=app.service.createProject('Dynamic MCP');const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:true,modelBinding:app.modelAccess.settings().binding,maxCalls:5,maxCostUsd:100,reservePerCallUsd:10,maxOutputTokens:1024,timeoutMs:25000};
    const run=app.service.submit(project.id,'Exercise dynamic tools','dynamic-mcp','pi',policy,[],undefined,{view:'project'}).run;
    let final=run;const deadline=Date.now()+28000;
    while(Date.now()<deadline){app.scheduler.tick();final=app.store.get<Run>('run',run.id);if(['completed','failed','interrupted'].includes(final.status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
    assert.equal(final.status,'completed',final.error??'Expected completion');
    // Pi's startup summary reports only "failed", not its underlying spawn error.
    assert(final.mcpDiagnostics?.some(item=>item.server==='unavailable'&&item.code==='connection_failed'),JSON.stringify(final.mcpDiagnostics));
    assert(!JSON.stringify(final.mcpDiagnostics).includes(root),'diagnostics must not persist raw native error details');
    assert.deepEqual(readFileSync(observations,'utf8').trim().split('\n').map(line=>JSON.parse(line)),[{visible:false,active:false},{visible:true,active:true}]);
    assert.deepEqual(readFileSync(calls,'utf8').trim().split('\n').map(line=>JSON.parse(line)),[{text:'BEFORE'},{text:'RESTORED'}],'withdrawn tool must never reach the service');
    const executions=app.store.list<ToolExecution>('tool_execution').filter(t=>t.runId===run.id);
    const echoes=executions.filter(t=>t.name==='mcp__fixture__echo');assert.equal(echoes.length,2);assert(echoes.every(t=>t.phase==='completed'&&t.source==='builtin:mcp'));
    const codeCalls=executions.filter(t=>t.name==='codemode');assert.equal(codeCalls.length,2);
    const denied=codeCalls.find(t=>t.phase==='failed');assert(denied);assert(!denied.outcomeUnknown,'local rejection is not an attempted MCP side effect');assert(codeCalls.some(t=>t.phase==='completed'));
    const payloads=readFileSync(transport.payloads,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(payloads.length,5);
    const declaresEcho=(payload:{tools?:{name?:string}[]})=>payload.tools?.some(tool=>tool.name==='mcp__fixture__echo')??false;
    assert(declaresEcho(payloads[0]));assert(!declaresEcho(payloads[2]),'next model request must exclude withdrawn tool');assert(declaresEcho(payloads[3]),'next model request must declare restored tool');
    assert(readFileSync(final.sessionPath!,'utf8').includes('CONFIRMED RESTORED'));
    const pid=Number(readFileSync(pidFile,'utf8'));const cleanup=Date.now()+3000;let alive=true;
    while(alive&&Date.now()<cleanup){try{process.kill(pid,0);await delay(20);}catch{alive=false;}}assert.equal(alive,false,'dynamic MCP process must shut down');
  }finally{await app.close();Object.assign(config,before);}
});
