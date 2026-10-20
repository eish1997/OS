import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type ServerResponse} from 'node:http';
import {mkdtempSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
import {inspectPlugin} from '../server/plugin-packages.js';
import {modelToolSequence} from './helpers/model-tool-sequence.js';
import type {Policy,Run} from '../shared/contracts.js';
import type {ToolExecution} from '../shared/run-stream.js';
import {requireToolReconciliation,reconcileTool} from '../server/tool-progress.js';
import {McpCredentials} from '../server/mcp-credentials.js';

for(const scenario of ['direct','deferred','hidden','missing','timeout','cancel','disconnect'] as const)test(`real HTTP MCP ${scenario} and ephemeral environment credential`,{timeout:30000},async()=>{
  const exposure=scenario==='deferred'||scenario==='hidden'?scenario:'direct';
  const previous={...config};const previousToken=process.env.MCP_FIXTURE_TOKEN;const token=randomUUID();process.env.MCP_FIXTURE_TOKEN=token;
  if(scenario==='missing')delete process.env.MCP_FIXTURE_TOKEN;
  Object.assign(config,{apiKey:'offline-http-mcp',provider:'openai',model:'gpt-5.6-sol',maxCalls:6,budgetUsd:100,reservePerCallUsd:10});
  let authenticated=0;let calls=0;const methods:string[]=[];const operations:string[]=[];const pendingResponses=new Set<ServerResponse>();
  const server=createServer(async(req,res)=>{
    if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(401).end();return;}authenticated++;
    if(req.method!=='POST'){res.writeHead(405).end();return;}
    let body='';for await(const chunk of req)body+=chunk;const q=JSON.parse(body);methods.push(q.method);
    if(q.id===undefined){res.writeHead(202).end();return;}
    let result:unknown;
    if(q.method==='initialize')result={protocolVersion:q.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned-http',version:'1'}};
    else if(q.method==='tools/list')result={tools:[{name:'echo',description:'Echo fixture document',inputSchema:{type:'object',properties:{operation:{type:'string'}}}}]};
    else if(q.method==='tools/call'){calls++;operations.push(q.params.arguments?.operation??'default');if(scenario==='disconnect'&&calls===1){res.destroy();return;}if(scenario==='timeout'||scenario==='cancel'){pendingResponses.add(res);res.once('close',()=>pendingResponses.delete(res));return;}result={content:[{type:'text',text:'HTTP_MCP_CONFIRMED'}]};}else result={};
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
  });
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/mcp`;
  const root=mkdtempSync(join(tmpdir(),'mcp-http-worker-'));
  const steps=scenario==='disconnect'?[{name:'mcp__fixture__echo',args:{operation:'lost-receipt'}},{name:'mcp__fixture__echo',args:{operation:'new-explicit-call'}}]:exposure==='direct'?[{name:'mcp__fixture__echo',args:{}}]:exposure==='deferred'?[{name:'tool_search',args:{query:'fixture echo'}},{name:'mcp__fixture__echo',args:{}}]:[{name:'tool_search',args:{query:'fixture echo'}},{name:'codemode',args:{code:'const result = await tools.mcp__fixture__echo({}); text(result);'}}];
  const transport=modelToolSequence(root,steps);const app=createApp({dataDir:join(root,'data'),password:'http-mcp-password',schedule:false});
  try{
    if(scenario==='direct'){new McpCredentials(app.store).update(undefined,0,'MCP_FIXTURE_TOKEN',token);delete process.env.MCP_FIXTURE_TOKEN;}
    const state=app.plugins.state;const op=state.enqueue({action:'install',source:transport.source,revision:state.configuration().revision,commandId:'transport',trusted:true});const pkg=await inspectPlugin(transport.source,app.plugins.agentDir);state.phase(op.id,'committing','Owned fixture');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    await app.mcp.update({revision:0,json:JSON.stringify({mcpServers:{fixture:{url,headers:{Authorization:'Bearer ${MCP_FIXTURE_TOKEN}'},exposure,timeout:3}}}),source:'owned-http',active:true,trusted:true,codemode:exposure==='hidden',toolSearch:exposure!=='direct'});
    const project=app.service.createProject('HTTP MCP');const policy:Policy={version:8,projectId:project.id,toolNames:[],allowModel:true,modelBinding:app.modelAccess.settings().binding,maxCalls:6,maxCostUsd:100,reservePerCallUsd:10,maxOutputTokens:1024,timeoutMs:20000};
    const run=app.service.submit(project.id,'Use the controlled HTTP MCP sequence',`http-${scenario}`,'pi',policy).run;let final=run;const deadline=Date.now()+23000;let cancelled=false;
    while(Date.now()<deadline){app.scheduler.tick();if(scenario==='cancel'&&calls&&!cancelled){await app.service.requestCancel(run.id);cancelled=true;app.scheduler.tick();}final=app.store.get<Run>('run',run.id);if(['completed','failed','interrupted','cancelled'].includes(final.status)&&!app.scheduler.pluginMaintenanceBlocked())break;await delay(20);}
    if(scenario==='missing'){assert.equal(final.status,'failed');assert(final.error?.includes('MCP_FIXTURE_TOKEN'));assert.equal(final.workerPid,undefined);assert.equal(authenticated,0);return;}
    if(scenario==='cancel'||scenario==='timeout'||scenario==='disconnect'){
      assert.equal(final.status,scenario==='cancel'?'cancelled':'failed',final.error??'HTTP lifecycle');assert.equal(calls,1);
      const tool=app.store.list<ToolExecution>('tool_execution').find(t=>t.runId===run.id&&t.name==='mcp__fixture__echo');assert.equal(tool?.phase,'failed');
      assert(tool?.outcomeUnknown);assert.throws(()=>requireToolReconciliation(app.store,run.id),/尚未确认/);assert.throws(()=>app.service.retry(run.id,'must-not-replay'),/尚未确认/);
      const verified=reconcileTool(app.store,run.id,tool.id,tool.revision,'performed','Owned HTTP server recorded exactly one request; response was lost.');assert.equal(verified.phase,'failed');assert(verified.resultMessageId);assert.equal(verified.reconciliation?.outcome,'performed');assert.doesNotThrow(()=>requireToolReconciliation(app.store,run.id));
      if(scenario==='disconnect')assert.deepEqual(operations,['lost-receipt'],'unknown outcome must stop the following model-directed call');
      const closed=Date.now()+2000;while(pendingResponses.size&&Date.now()<closed)await delay(20);assert.equal(pendingResponses.size,0,'HTTP request must close on timeout or cancellation');return;
    }
    assert.equal(final.status,'completed',final.error??'worker completion');assert(authenticated>0);assert(methods.includes('initialize'));assert.equal(calls,exposure==='hidden'?0:1);
    const requests=readFileSync(transport.payloads,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    // Fixed Pi uses Responses additional_tools messages for tools discovered mid-turn.
    const names=(index:number)=>[...(requests[index].tools??[]),...(requests[index].input??[]).filter((item:{type:string})=>['additional_tools','tool_search_output'].includes(item.type)).flatMap((item:{tools?:unknown[]})=>item.tools??[])].map((t:{name?:string})=>t.name);
    assert.equal(names(0).includes('mcp__fixture__echo'),exposure==='direct');
    if(exposure==='deferred')assert(names(1).includes('mcp__fixture__echo'),'tool_search must activate the deferred tool for the next model request');
    if(exposure==='hidden')for(let index=0;index<requests.length;index++)assert(!names(index).includes('mcp__fixture__echo'));
    const tools=app.store.list<ToolExecution>('tool_execution').filter(t=>t.runId===run.id);
    if(exposure!=='direct')assert(tools.some(t=>t.name==='tool_search'&&t.phase==='completed'));
    if(exposure==='hidden')assert(tools.some(t=>t.name==='codemode'&&t.phase==='failed'),'hidden tools must be unreachable even through codemode');
    else assert(tools.some(t=>t.name==='mcp__fixture__echo'&&t.phase==='completed'));
    for(const table of ['entities','events'])assert(!JSON.stringify(app.store.db.prepare(`SELECT body FROM ${table}`).all()).includes(token),'environment secret must not be persisted');
    assert(!readFileSync(final.sessionPath!,'utf8').includes(token));
  }finally{await app.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));Object.assign(config,previous);if(previousToken===undefined)delete process.env.MCP_FIXTURE_TOKEN;else process.env.MCP_FIXTURE_TOKEN=previousToken;}
});
