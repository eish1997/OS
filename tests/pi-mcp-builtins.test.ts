import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {InMemoryCredentialStore} from '@earendil-works/pi-ai';
import {loadPi,workbenchResources} from '../server/pi-adapter.js';
import {guardPluginRegistrations} from '../server/plugin-runtime.js';

test('explicit builtin factories discover and call an owned stdio MCP server and close its process',{timeout:20000},async()=>{
  const root=mkdtempSync(join(tmpdir(),'pi-mcp-builtins-'));const agentDir=join(root,'agent');mkdirSync(agentDir);
  const serverPath=join(root,'server.mjs');const pidPath=join(root,'server.pid');const callsPath=join(root,'calls.jsonl');const visibilityPath=join(root,'visibility');writeFileSync(visibilityPath,'visible');
  writeFileSync(serverPath,`import {createInterface} from 'node:readline';import {writeFileSync,appendFileSync,readFileSync} from 'node:fs';
    writeFileSync(${JSON.stringify(pidPath)},String(process.pid));
    let visibility='visible';setInterval(()=>{const next=readFileSync(${JSON.stringify(visibilityPath)},'utf8');if(next!==visibility){visibility=next;process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/tools/list_changed'})+'\\n');}},20);
    const lines=createInterface({input:process.stdin});lines.on('close',()=>process.exit(0));
    lines.on('line',line=>{const request=JSON.parse(line);if(request.id===undefined)return;let result;
      if(request.method==='initialize')result={protocolVersion:request.params.protocolVersion,capabilities:{tools:{listChanged:true}},serverInfo:{name:'owned-fixture',version:'1'}};
      else if(request.method==='tools/list')result={tools:visibility==='hidden'?[]:[{name:'echo',description:'Return controlled text',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']}}]};
      else if(request.method==='tools/call'){appendFileSync(${JSON.stringify(callsPath)},JSON.stringify(request.params)+'\\n');result={content:[{type:'text',text:'MCP_CONFIRMED '+request.params.arguments.text}]};}
      else if(request.method==='ping')result={};else {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Unsupported'}})+'\\n');return;}
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
      if(request.method==='tools/call')process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/tools/list_changed'})+'\\n');
    });`);
  const pi=await loadPi();
  // A project config is deliberately present but must not be discovered implicitly.
  mkdirSync(join(root,'.pi'));writeFileSync(join(root,'.pi','mcp.json'),JSON.stringify({mcpServers:{unapproved:{command:'must-not-start-unapproved-process'}}}));
  const resources=await workbenchResources(pi,root,agentDir,'Controlled builtin probe',{}, {codemode:true,toolSearch:true,mcp:{servers:[{name:'fixture',scope:'global',source:'workbench-test',config:{command:process.execPath,args:[serverPath],exposure:'direct',timeout:3}}],errors:[],autoEnableCodemode:true}});
  assert.deepEqual(resources.loader.getExtensions().extensions.map(e=>e.path).sort(),['builtin:codemode','builtin:mcp','builtin:tool-search']);
  let registrations=0;guardPluginRegistrations(resources.loader.getExtensions(),[],name=>{if(name==='mcp__fixture__echo')registrations++;});
  const runtime=await pi.ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsPath:null,allowModelNetwork:false});const model=runtime.getModel('openai','gpt-5.6-sol');assert(model);
  await runtime.setRuntimeApiKey('openai','offline-mcp-probe');
  const {session}=await pi.createAgentSession({cwd:root,agentDir,modelRuntime:runtime,model,sessionManager:pi.SessionManager.inMemory(root),settingsManager:resources.settings,resourceLoader:resources.loader});
  let pid:number|undefined;const originalFetch=globalThis.fetch;
  try{
    await session.bindExtensions({});const deadline=Date.now()+8000;
    while(!session.getActiveToolNames().includes('mcp__fixture__echo')&&Date.now()<deadline)await delay(20);
    assert(existsSync(pidPath));pid=Number(readFileSync(pidPath,'utf8'));
    const tool=session.agent.state.tools.find(t=>t.name==='mcp__fixture__echo');assert(tool,JSON.stringify(session.getActiveToolNames()));
    const result=await tool.execute('probe-echo',{text:'DIRECT_OK'});assert(JSON.stringify(result).includes('MCP_CONFIRMED DIRECT_OK'));
    const refreshDeadline=Date.now()+3000;while(registrations<2&&Date.now()<refreshDeadline)await delay(20);assert(registrations>=2,'native list_changed must refresh the same-owner tool without a name conflict');
    assert(session.getActiveToolNames().includes('codemode'));assert(session.getActiveToolNames().includes('tool_search'));
    writeFileSync(visibilityPath,'hidden');const hideDeadline=Date.now()+3000;while(session.getActiveToolNames().includes('mcp__fixture__echo')&&Date.now()<hideDeadline)await delay(20);
    assert(!session.getActiveToolNames().includes('mcp__fixture__echo'),'withdrawn tool must leave the active model loadout');
    let requests=0;
    globalThis.fetch=async()=>{
      const first=++requests===1;const item=first?{id:'fc',call_id:'code-call',type:'function_call',name:'codemode',arguments:JSON.stringify({code:'const result = await tools.mcp__fixture__echo({text:"CODEMODE_OK"}); text(result);'}),status:'completed'}:{id:'msg',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'MCP_COMPLETE',annotations:[]}]};
      const events:unknown[]=first?[{type:'response.output_item.added',output_index:0,item:{...item,arguments:''}},{type:'response.function_call_arguments.delta',output_index:0,item_id:'fc',delta:item.arguments}]:[{type:'response.output_item.added',output_index:0,item:{...item,content:[]}},{type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,delta:'MCP_COMPLETE'}];
      events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response',status:'completed',output:[item],usage:{input_tokens:100,output_tokens:10,total_tokens:110,input_tokens_details:{cached_tokens:0}}}});
      return new Response(events.map(e=>{const value=e as {type:string};return 'event: '+value.type+'\ndata: '+JSON.stringify(e)+'\n\n';}).join(''),{headers:{'Content-Type':'text/event-stream'}});
    };
    await session.prompt('Attempt the withdrawn tool through codemode');
    const denied=session.messages.filter(m=>m.role==='toolResult'&&m.toolName==='codemode').at(-1);assert(denied?.role==='toolResult'&&denied.isError,'withdrawn tool must be unreachable from codemode');assert.equal(readFileSync(callsPath,'utf8').trim().split('\n').length,1,'withdrawal must prevent a service call');
    writeFileSync(visibilityPath,'visible');const restoreDeadline=Date.now()+3000;while(!session.getActiveToolNames().includes('mcp__fixture__echo')&&Date.now()<restoreDeadline)await delay(20);assert(session.getActiveToolNames().includes('mcp__fixture__echo'),'restored direct tool must return to the active loadout');
    requests=0;await session.prompt('Use the restored controlled codemode tool');
    const compiled=session.messages.filter(m=>m.role==='toolResult'&&m.toolName==='codemode').at(-1);
    assert(compiled&&JSON.stringify(compiled).includes('MCP_CONFIRMED CODEMODE_OK'),JSON.stringify(compiled));assert.equal(requests,2);
    assert.equal(readFileSync(callsPath,'utf8').trim().split('\n').length,2);
  }finally{globalThis.fetch=originalFetch;await session.extensionRunner.emit({type:'session_shutdown',reason:'quit'});session.dispose();}
  assert(pid);const deadline=Date.now()+3000;let alive=true;while(alive&&Date.now()<deadline){try{process.kill(pid,0);await delay(20);}catch{alive=false;}}
  assert.equal(alive,false,'MCP stdio child must exit on session shutdown');
});
