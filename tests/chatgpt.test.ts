import { nativePiTools } from '../shared/pi-tools.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { validateIdToken } from '../server/chatgpt-auth.js';
import { backup } from '../server/backup.js';
import { subscriptionPayload } from '../server/subscription-request.js';
import { PrivateFiles } from '../server/private-files.js';
import type { Policy, Run } from '../shared/contracts.js';
import { InMemoryCredentialStore, lazyStream, Type } from '@earendil-works/pi-ai';
import { loadPi, workbenchResources } from '../server/pi-adapter.js';
import { accountedStream } from '../server/model-stream.js';
import type { AssistantMessageEvent, AssistantMessage } from '@earendil-works/pi-ai';

test('provider receipt is acknowledged before terminal delivery; aborted/missing usage stays incomplete',async()=>{
  const message:AssistantMessage={role:'assistant',content:[],api:'openai-responses',provider:'openai',model:'offline',usage:{input:4,output:1,cacheRead:0,cacheWrite:0,totalTokens:5,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()};
  async function* source(events:AssistantMessageEvent[]){yield*events;}
  let unlock:()=>void=()=>{};const gate=new Promise<void>(r=>{unlock=r;});let receipts=0;let starts=0;let delivered=false;
  const stream=accountedStream(source([{type:'start',partial:message},{type:'text_delta',contentIndex:0,delta:'x',partial:message},{type:'done',reason:'stop',message}]),async(_cost,usage)=>{assert.equal(usage?.complete,true);receipts++;await gate;},()=>{starts++;});
  assert.equal((await stream.next()).value?.type,'start');assert.equal(starts,0);assert.equal((await stream.next()).value?.type,'text_delta');assert.equal(starts,1);
  const terminal=stream.next().then(v=>{delivered=true;return v;});await new Promise(r=>setImmediate(r));assert.equal(receipts,1);assert.equal(delivered,false);unlock();assert.equal((await terminal).value?.type,'done');await stream.next();assert.equal(receipts,1);
  for await(const _event of accountedStream(source([{type:'error',reason:'aborted',error:{...message,stopReason:'aborted'}}]),async(cost,usage)=>{assert.equal(cost,undefined);assert.equal(usage?.complete,false);},()=>assert.fail())){}
  let missing=0;for await(const _event of accountedStream(source([]),async(cost,usage)=>{assert.equal(cost,undefined);assert.equal(usage,undefined);missing++;},()=>assert.fail())){}assert.equal(missing,1);
  const failed=accountedStream(source([{type:'done',reason:'stop',message}]),async()=>{throw new Error('receipt rejected');},()=>assert.fail());await assert.rejects(failed.next(),/receipt rejected/);
});

const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const publicKey={...keys.publicKey.export({format:'jwk'}),kid:'offline-qa-key',use:'sig',alg:'RS256'};
const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
function token(claims:Record<string,unknown>) {const input=[encode({alg:'RS256',kid:publicKey.kid}),encode({iss:'https://auth.openai.com',aud:'oaiapp-offline-qa',sub:'offline-user',email:'qa@example.invalid',exp:Math.floor(Date.now()/1000)+3600,...claims})].join('.');return input+'.'+sign('RSA-SHA256',Buffer.from(input),keys.privateKey).toString('base64url');}
test('ChatGPT ID token verifies signature, identity, nonce, issuer, audience and expiry',()=>{
  assert.equal(validateIdToken(token({nonce:'n'}),[publicKey],{clientId:'oaiapp-offline-qa',nonce:'n'}).subject,'offline-user');
  for(const claims of [{nonce:'wrong'},{iss:'https://evil.invalid',nonce:'n'},{aud:'another-app',nonce:'n'},{exp:0,nonce:'n'},{sub:'other-user',nonce:'n'},{aud:['oaiapp-offline-qa','another'],azp:'another',nonce:'n'},{nbf:Math.floor(Date.now()/1000)+1000,nonce:'n'}])assert.throws(()=>validateIdToken(token(claims),[publicKey],{clientId:'oaiapp-offline-qa',nonce:'n',subject:'offline-user'}));
  const original=token({nonce:'n'}).split('.');original[1]=encode({sub:'tampered'});assert.throws(()=>validateIdToken(original.join('.'),[publicKey],{clientId:'oaiapp-offline-qa',nonce:'n'}));
  assert.throws(()=>validateIdToken(token({nonce:'n'}),[],{clientId:'oaiapp-offline-qa',nonce:'n'}));
});
async function setup(failToken?: {status:number;body:string},automaticSetup=false) {
  const root=mkdtempSync(join(tmpdir(),'工作台订阅 QA '));let authUrl:URL;let badNonce=false;let expired=false;let scopeMissing=false;let refreshes=0;let tokenRequests=0;let modelRequests=0;
  let catalog: unknown = {models:[{slug:'gpt-6.1-sol',display_name:'Offline QA Sol',visibility:'list'},{slug:'not-in-fixed-pi',display_name:'Unsupported',visibility:'list'},{slug:'hidden',display_name:'Hidden',visibility:'hide'}]};
  const fetcher:typeof fetch=async(input,init)=>{
    const url=String(input);
    if(url==='https://auth.openai.com/.well-known/jwks.json')return Response.json({keys:[publicKey]});
    if(url==='https://auth.openai.com/api/accounts/oauth/token'){
      if (failToken) return new Response(failToken.body, {status:failToken.status,headers:{'x-request-id':'req_123456'}});
      tokenRequests++;const form=new URLSearchParams(String(init?.body));assert.equal(form.get('resource'),'https://api.openai.com/v1');
      if(form.get('grant_type')==='refresh_token'){refreshes++;assert.equal(form.get('refresh_token'),'offline-refresh');}
      else {assert.equal(form.get('redirect_uri'),authUrl!.searchParams.get('redirect_uri'));assert.equal(form.get('client_id'),'oaiapp-offline-qa');assert(form.get('code_verifier'));}
      return Response.json({access_token:refreshes?'offline-new-access':'offline-access',refresh_token:'offline-refresh',id_token:token({nonce:badNonce?'bad':authUrl!.searchParams.get('nonce')}),scope:scopeMissing?'openid email profile':'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',token_type:'Bearer',expires_in:expired?120:3600});
    }
    if(url==='https://api.openai.com/v1/models'){modelRequests++;assert(String((init?.headers as Record<string,string>).Authorization).startsWith('Bearer offline-'));return Response.json(catalog);}
    if(url==='https://auth.openai.com/api/accounts/oauth/revoke')return new Response('',{status:200});
    throw new Error('Unexpected network request blocked by offline test');
  };
  const app=createApp({dataDir:root,password:'offline-qa-password',schedule:false,chatgpt:{fetch:fetcher,loginTimeoutMs:10_000,automaticSetup}});
  await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'offline-qa-password'})});const cookie=login.headers.get('set-cookie')!.split(';')[0];
  const call=async(path:string,data?:unknown)=>{const response=await fetch(base+'/api'+path,{headers:{Cookie:cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});return {status:response.status,value:await response.json()};};
  const start=async()=>{const result=await call('/chatgpt/start',{});assert.equal(result.status,200);authUrl=new URL(result.value.url);return authUrl;};
  const callback=async(overrides:Record<string,string>={})=>{const url=new URL(authUrl.searchParams.get('redirect_uri')!);url.search=new URLSearchParams({code:'offline-code',state:authUrl.searchParams.get('state')!,client_id:'oaiapp-offline-qa',...overrides}).toString();return fetch(url);};
  return {app,root,base,cookie,call,start,callback,getUrl:()=>authUrl,setCatalog:(v:unknown)=>catalog=v,setBadNonce:(v:boolean)=>badNonce=v,setExpired:(v:boolean)=>expired=v,setScopeMissing:(v:boolean)=>scopeMissing=v,counts:()=>({refreshes,tokenRequests,modelRequests})};
}

test('large account catalogs populate the picker without exposing templates or enabling inference',async()=>{
  const q=await setup();
  try {
    await q.start();assert.equal((await q.callback()).status,200);
    const models=[{slug:'gpt-6.1-sol',display_name:'Offline QA Sol',visibility:'list',base_instructions:'PRIVATE_TEMPLATE_SENTINEL'.repeat(16000)},{slug:'hidden',display_name:'Hidden',visibility:'hide'}];
    assert(Buffer.byteLength(JSON.stringify({models}))>256_000);q.setCatalog({models});
    const result=await q.call('/chatgpt/models',{});assert.equal(result.status,200);assert.deepEqual(result.value,[{id:'gpt-6.1-sol',name:'Offline QA Sol'}]);
    assert.equal(q.app.chatgpt.status().enabled,false);assert.equal(q.app.snapshot().config.modelConfigured,false);assert(!JSON.stringify(q.app.snapshot()).includes('PRIVATE_TEMPLATE_SENTINEL'));
  } finally {await q.app.close();}
});

test('oversized catalogs keep the connection intact and remain ineligible for model configuration',async()=>{
  const q=await setup();
  try {
    await q.start();assert.equal((await q.callback()).status,200);
    q.setCatalog({models:[{slug:'gpt-6.1-sol',display_name:'Offline QA Sol',visibility:'list',base_instructions:'x'.repeat(2*1024*1024)}]});
    const result=await q.call('/chatgpt/models',{});assert.equal(result.status,502);assert.match(result.value.error,/目录超过安全读取上限/);
    assert.equal(q.app.chatgpt.status().connected,true);assert.equal(q.app.chatgpt.status().enabled,false);
    assert.equal((await q.call('/chatgpt/configure',{model:'gpt-6.1-sol',maxCalls:2,timeoutMs:120000,consent:true})).status,400);
    assert.equal(q.app.snapshot().config.modelConfigured,false);
  } finally {await q.app.close();}
});

test('larger catalog allowance does not increase OAuth token response limits',async()=>{
  const q=await setup({status:200,body:JSON.stringify({padding:'x'.repeat(300_000)})});
  try {await q.start();const result=await q.callback();assert.equal(result.status,502);assert.match(await result.text(),/授权响应超过安全读取上限/);assert.equal(q.app.chatgpt.status().connected,false);}
  finally {await q.app.close();}
});

test('successful plan sign-in automatically prepares compatible defaults and remembers the one-time notice',async()=>{
  const q=await setup(undefined,true);
  try {
    await q.start();const callback=await q.callback();assert.equal(callback.status,200);assert.match(await callback.text(),/直接开始对话/);
    const s=q.app.chatgpt.status();assert.equal(s.enabled,true);assert.equal(s.model,'gpt-6.1-sol');assert.equal(s.limitsMode,'automatic');assert.equal(s.limitScope,'task');assert.equal(s.maxCalls,20);assert.equal(s.timeoutMs,300000);assert.equal(s.welcomePending,true);
    assert.equal(q.app.snapshot().config.modelConfigured,true);assert.equal(q.app.snapshot().config.limitScope,'task');assert.equal(q.counts().modelRequests,1);
    assert.equal((await q.call('/chatgpt/welcome',{})).status,200);assert.equal(q.app.chatgpt.status().welcomePending,false);
    const restarted=createApp({dataDir:q.root,password:'ignored',schedule:false});try {assert.equal(restarted.chatgpt.ready(),true);assert.equal(restarted.chatgpt.status().welcomePending,false);}finally{await restarted.close();}
    await q.start();assert.equal((await q.callback()).status,200);assert.equal(q.app.chatgpt.ready(),true);assert.equal(q.app.chatgpt.status().welcomePending,false);
    assert(!JSON.stringify(q.app.snapshot()).includes('offline-access'));assert.equal(q.app.store.list('run').length,0);
  } finally {await q.app.close();}
});

test('automatic mode limits each task without permanently exhausting the workbench; custom cumulative limits remain effective',async()=>{
  const q=await setup(undefined,true);
  try {
    await q.start();assert.equal((await q.callback()).status,200);const project=q.app.service.createProject('自动用量QA');
    const policy:Policy={version:5,projectId:project.id,toolNames:[],allowModel:true,modelBinding:q.app.modelAccess.settings().binding,maxCalls:20,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:2048,timeoutMs:300000};
    const first=q.app.service.submit(project.id,'first','auto-first','pi',policy).run;q.app.service.transition(first.id,'running');
    for(let i=0;i<20;i++){await q.app.modelAccess.reserve(q.app.service,first.id);q.app.service.settleCall(first.id,undefined);}
    await assert.rejects(q.app.modelAccess.reserve(q.app.service,first.id),/上限/);q.app.service.transition(first.id,'completed');
    const second=q.app.service.submit(project.id,'second','auto-second','pi',policy).run;q.app.service.transition(second.id,'running');await q.app.modelAccess.reserve(q.app.service,second.id);assert.equal(q.app.store.get<Run>('run',second.id).calls,1);
    assert.equal(q.app.modelAccess.settings().callsRemaining,20);q.app.service.transition(second.id,'completed');
    assert.equal((await q.call('/chatgpt/configure',{model:'gpt-6.1-sol',maxCalls:21,timeoutMs:120000,consent:true})).status,200);
    assert.equal(q.app.modelAccess.settings().limitScope,'connection');assert.equal(q.app.modelAccess.settings().callsRemaining,0);
    const third=q.app.service.submit(project.id,'third','auto-third','pi',policy).run;q.app.service.transition(third.id,'running');await assert.rejects(q.app.modelAccess.reserve(q.app.service,third.id),/上限/);q.app.service.transition(third.id,'cancelled');
    assert.equal((await q.call('/chatgpt/automatic',{})).status,200);assert.equal(q.app.store.get<Run>('run',first.id).calls,20);
    const fourth=q.app.service.submit(project.id,'fourth','auto-fourth','pi',policy).run;q.app.service.transition(fourth.id,'running');await q.app.modelAccess.reserve(q.app.service,fourth.id);assert.equal(q.app.store.get<Run>('run',fourth.id).calls,1);
  } finally {await q.app.close();}
});

test('catalog preparation failure preserves successful sign-in and can be retried without repeating OAuth',async()=>{
  const q=await setup(undefined,true);
  try {
    q.setCatalog({models:[{slug:'unsupported-fixed-pi',display_name:'Unsupported',visibility:'list'},{slug:'gpt-6.1-sol',display_name:'Hidden',visibility:'hide'}]});
    await q.start();assert.equal((await q.callback()).status,200);assert.equal(q.app.chatgpt.status().connected,true);assert.equal(q.app.chatgpt.status().enabled,false);assert.match(q.app.chatgpt.status().error!,/登录已成功/);
    q.setCatalog({models:[{slug:'gpt-6.1-sol',display_name:'Available',visibility:'list'}]});assert.equal((await q.call('/chatgpt/automatic',{})).status,200);assert.equal(q.app.chatgpt.ready(),true);assert.equal(q.counts().tokenRequests,1);assert.equal(q.app.chatgpt.status().error,undefined);
  } finally {await q.app.close();}
});

test('task deadlines can only reduce host permission; expiration rejects credentials and new side effects',async()=>{
  const q=await setup(undefined,true);
  try {
    await q.start();assert.equal((await q.callback()).status,200);const p=q.app.service.createProject('任务时限QA');
    for(const timeoutMs of [0,999,300001,-1,1000.5,'1000',null])assert.equal((await q.call('/tasks',{projectId:p.id,mode:'pi',goal:'fixed',commandId:'bad-time-'+String(timeoutMs),timeoutMs})).status,400);
    const submitted=await q.call('/tasks',{projectId:p.id,mode:'pi',goal:'fixed',commandId:'shorter-time',requestedTools:['write_asset'],maxCalls:2,timeoutMs:1000});assert.equal(submitted.status,202);assert.equal(submitted.value.run.policy.timeoutMs,1000);assert.equal(q.app.chatgpt.status().timeoutMs,300000);
    const run=submitted.value.run as Run;q.app.service.transition(run.id,'running',{startedAt:new Date(Date.now()-2000).toISOString()});
    await assert.rejects(q.app.modelAccess.credential(run.id),/到期/);await assert.rejects(q.app.modelAccess.reserve(q.app.service,run.id),/到期/);
    assert.throws(()=>q.app.service.tool(run.id,'write_asset',{name:'late.md',content:'must not write'}),/到期/);await assert.rejects(q.app.service.executeOperation(run.id,'late','write_asset',{name:'late.md',content:'must not write'}),/到期/);assert.equal(q.app.store.list('asset').length,0);assert.equal(q.app.store.list('operation').length,0);
    q.app.scheduler.finish(run.id,true);const ended=q.app.store.get<Run>('run',run.id);assert.equal(ended.status,'failed');assert(ended.timedOutAt);assert.match(ended.error!,/超过运行时间/);
  } finally {await q.app.close();}
});

test('in-flight subscription usage stays incomplete and settlement receipts are deduplicated by reserved call number',async()=>{
  const q=await setup(undefined,true);
  try {
    await q.start();assert.equal((await q.callback()).status,200);const p=q.app.service.createProject('中止用量QA');const policy:Policy={version:5,projectId:p.id,toolNames:['write_asset'],allowModel:true,modelBinding:q.app.modelAccess.settings().binding,maxCalls:2,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:2048,timeoutMs:300000};
    const run=q.app.service.submit(p.id,'fixed','settlement-order','pi',policy).run;q.app.service.transition(run.id,'running');
    const first=await q.app.modelAccess.reserve(q.app.service,run.id);assert.equal(first.callNumber,1);assert.equal(q.app.store.get<Run>('run',run.id).usage?.complete,false);
    const reported={input:20,output:4,cacheRead:0,cacheWrite:0,totalTokens:24,complete:true};q.app.service.settleCall(run.id,undefined,reported,1);assert.equal(q.app.store.get<Run>('run',run.id).usage?.complete,true);
    const asset=q.app.service.tool(run.id,'write_asset',{name:'checkpoint.md',content:'RETAINED'}) as {id:string};
    const second=await q.app.modelAccess.reserve(q.app.service,run.id);assert.equal(second.callNumber,2);assert.equal(q.app.store.get<Run>('run',run.id).usage?.complete,false);
    q.app.service.settleCall(run.id,undefined,reported,1);assert.equal(q.app.store.get<Run>('run',run.id).usage?.totalTokens,24);assert.equal(q.app.store.get<Run>('run',run.id).modelCallsSettled,1);assert.throws(()=>q.app.service.settleCall(run.id,undefined,reported,3),/序号/);
    const cancelled=q.app.service.cancel(run.id);const twice=q.app.service.cancel(run.id);assert.equal(twice.revision,cancelled.revision);assert.equal(twice.cancelRequestedAt,cancelled.cancelRequestedAt);
    q.app.scheduler.finish(run.id,false);assert.equal(q.app.store.get<Run>('run',run.id).status,'cancelled');assert.equal(q.app.store.get<Run>('run',run.id).usage?.complete,false);assert.equal(q.app.assets.read(q.app.store.get('asset',asset.id)).toString(),'RETAINED');
    q.app.service.settleCall(run.id,undefined,undefined,2);assert.equal(q.app.store.get<Run>('run',run.id).modelCallsSettled,2);assert.equal(q.app.store.get<Run>('run',run.id).usage?.complete,false);
  } finally {await q.app.close();}
});
test('upstream region refusal is actionable and preserves status without credentials or raw error text',async()=>{
  for (const body of [JSON.stringify({error:{code:'unsupported_country_region_territory',message:'SECRET_SENTINEL'}}),'<html>SECRET_SENTINEL</html>']) {
    const q=await setup({status:403,body});
    try {await q.start();const response=await q.callback();assert.equal(response.status,403);const message=await response.text();assert.match(message,/HTTP 403/);assert(!message.includes('SECRET_SENTINEL'));const status=(await q.call('/chatgpt/status')).value;assert.equal(status.diagnostic.httpStatus,403);assert.equal(status.diagnostic.stage,'code_exchange');assert(!JSON.stringify(status).includes('SECRET_SENTINEL'));assert.equal(status.connected,false);assert(!existsSync(join(q.root,'private-model','chatgpt.json')));}
    finally {await q.app.close();}
  }
});
test('shutdown during callback startup cancels login before issuing authorization or saving credentials',async()=>{
  const q=await setup();
  try {
    const attempt=q.app.chatgpt.start('offline-session');q.app.chatgpt.close();
    await assert.rejects(attempt,/已退出/);assert.equal(q.app.chatgpt.status().pending,false);
    assert.equal(existsSync(join(q.root,'private-model','chatgpt.json')),false);
    assert.deepEqual(q.counts(),{refreshes:0,tokenRequests:0,modelRequests:0});
    await assert.rejects(q.app.chatgpt.start('offline-session'),/正在退出/);
  } finally {await q.app.close();}
});
test('actual loopback OAuth rejects wrong state; signed callback, separate consent, restart and backup privacy',async()=>{
  const q=await setup();let second:ReturnType<typeof createApp>|undefined;
  try{
    assert.equal((await fetch(q.base+'/api/chatgpt/status')).status,401);
    const foreign=await fetch(q.base+'/api/chatgpt/start',{method:'POST',headers:{Cookie:q.cookie,Origin:'https://evil.invalid'},body:'{}'});assert.equal(foreign.status,403);
    const url=await q.start();assert.equal(url.hostname,'auth.openai.com');assert(url.searchParams.get('ext_agent_host_id')?.startsWith('urn:uuid:'));assert.equal((await q.call('/chatgpt/start',{})).status,409);
    assert.equal((await q.callback({state:'wrong'})).status,400);assert.equal(q.counts().tokenRequests,0);assert.equal((await q.call('/chatgpt/status')).value.pending,true);
    const callback=await q.callback();assert.equal(callback.status,200);await callback.text();
    const status=(await q.call('/chatgpt/status')).value;assert.equal(status.connected,true);assert.equal(status.enabled,false);assert.equal(q.app.snapshot().config.modelConfigured,false);assert(!JSON.stringify(status).includes('offline-access'));assert(!JSON.stringify(q.app.snapshot()).includes('offline-refresh'));
    const project=q.app.service.createProject('订阅QA');assert.equal((await q.call('/tasks',{projectId:project.id,goal:'x',commandId:'preconsent',mode:'pi'})).status,503);
    const models=await q.call('/chatgpt/models',{});assert.equal(models.status,200);assert.deepEqual(models.value.map((m:{id:string})=>m.id),['gpt-6.1-sol']);
    assert.equal((await q.call('/chatgpt/configure',{model:'gpt-6.1-sol',maxCalls:10,timeoutMs:120000,consent:false})).status,400);
    assert.equal((await q.call('/chatgpt/configure',{model:'gpt-6.1-sol',maxCalls:10,timeoutMs:120000,consent:true})).status,200);
    const result=await q.call('/tasks',{projectId:project.id,goal:'x',commandId:'withconsent',mode:'pi'});assert.equal(result.status,202);assert.equal(result.value.run.policy.modelBinding.kind,'chatgpt');assert.equal(result.value.run.policy.maxCostUsd,0);assert.equal(q.app.snapshot().config.authMode,'chatgpt');
    const diagnostics=await q.call('/diagnostics');assert.equal(diagnostics.value.model.kind,'chatgpt');assert(!('budgetUsd' in diagnostics.value.model));assert(!JSON.stringify(diagnostics).includes('offline-access'));
    const destination=join(mkdtempSync(join(tmpdir(),'订阅备份 QA ')),'backup');const manifest=backup(q.app.store,q.root,destination);assert(!manifest.files.some(f=>f.path.includes('private-model')));assert(!existsSync(join(destination,'private-model')));
    second=createApp({dataDir:q.root,password:'ignored',schedule:false});assert.doesNotThrow(()=>new PrivateFiles(q.root,second!.store.capacity!).read('chatgpt.json'));assert.equal(second.chatgpt.status().connected,true,JSON.stringify(second.chatgpt.status()));assert.equal(second.snapshot().config.modelConfigured,true);assert.equal(second.chatgpt.status().connectionId,status.connectionId);
    await second.close();second=undefined;
    const originalHost=url.searchParams.get('ext_agent_host_id');const reauth=await q.start();assert.equal(reauth.searchParams.get('ext_agent_host_id'),originalHost);assert.equal(reauth.searchParams.get('client_id'),'oaiapp-offline-qa');assert(!reauth.searchParams.has('agent_name_hint'));
    assert.equal((await q.callback({client_id:'other'})).status,400);assert.equal(q.app.chatgpt.status().connected,true);
    await q.call('/chatgpt/disconnect',{});assert.equal(q.app.chatgpt.status().connected,false);assert.equal(q.app.snapshot().config.authMode,'chatgpt');assert.equal(q.app.snapshot().config.modelConfigured,false);assert.equal(q.app.store.get<Run>('run',result.value.run.id).status,'cancelled');
  }finally{if(second)await second.close();await q.app.close();}
});
test('identity/permission failure preserves original credentials; revoked initiating session cannot commit',async()=>{
  const q=await setup();try{
    await q.start();q.setBadNonce(true);assert.equal((await q.callback()).status,502);assert.equal(q.app.chatgpt.status().connected,false);assert(!existsSync(join(q.root,'private-model','chatgpt.json')));
    q.setBadNonce(false);q.setScopeMissing(true);await q.start();assert.equal((await q.callback()).status,502);assert.equal(q.app.chatgpt.status().connected,false);
    q.setScopeMissing(false);await q.start();assert.equal((await q.callback()).status,200);const original=readFileSync(join(q.root,'private-model','chatgpt.json'),'utf8');q.setBadNonce(true);await q.start();assert.equal((await q.callback()).status,502);assert.equal(readFileSync(join(q.root,'private-model','chatgpt.json'),'utf8'),original);
    await q.start();await q.call('/logout',{});assert.equal((await q.callback()).status,401);assert.equal(readFileSync(join(q.root,'private-model','chatgpt.json'),'utf8'),original);
  }finally{await q.app.close();}
});
test('host-only token rotation, independent subscription call budget and no invented API bill',async()=>{
  const q=await setup();try{
    q.setExpired(true);await q.start();assert.equal((await q.callback()).status,200);await q.call('/chatgpt/models',{});assert.equal(q.counts().refreshes,1);q.setExpired(false); // Make the next rotation long-lived.
    const path=join(q.root,'private-model','chatgpt.json');const c=JSON.parse(readFileSync(path,'utf8'));c.expires=Date.now()+3600000;writeFileSync(path,JSON.stringify(c));
    await q.call('/chatgpt/configure',{model:'gpt-6.1-sol',maxCalls:2,timeoutMs:120000,consent:true});
    const project=q.app.service.createProject('订阅预算QA');const policy:Policy={version:5,projectId:project.id,toolNames:[],allowModel:true,modelBinding:q.app.modelAccess.settings().binding,maxCalls:2,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:2048,timeoutMs:120000};
    const first=q.app.service.submit(project.id,'a','a','pi',policy).run;const second=q.app.service.submit(project.id,'b','b','pi',policy).run;
    q.app.service.transition(first.id,'running');q.app.service.transition(second.id,'running');
    assert.equal((await q.app.modelAccess.reserve(q.app.service,first.id)).apiKey,'offline-new-access');q.app.service.settleCall(first.id,999,{input:12,output:3,cacheRead:0,cacheWrite:0,totalTokens:15,complete:true});
    await q.app.modelAccess.reserve(q.app.service,second.id);q.app.service.settleCall(second.id,undefined);
    await assert.rejects(q.app.modelAccess.reserve(q.app.service,first.id),/上限/);assert.equal(q.app.store.get<Run>('run',first.id).spentUsd,0);assert.equal(q.app.store.get<Run>('run',first.id).usage?.totalTokens,15);assert.equal(q.app.store.get<Run>('run',second.id).usage?.complete,false);
    const updated=JSON.parse(readFileSync(path,'utf8'));updated.connectionId='replacement';writeFileSync(path,JSON.stringify(updated));await assert.rejects(q.app.modelAccess.reserve(q.app.service,first.id),/改变/);
  }finally{await q.app.close();}
});
test('subscription request uses public Responses restrictions and namespaced client tools',()=>{
  const payload=subscriptionPayload({store:true,stream:false,input:[{role:'developer',content:'trusted'}],tools:[{type:'function',name:'write_asset',parameters:{type:'object'}}],max_output_tokens:1,temperature:1,previous_response_id:'old',metadata:{secret:'no'}});
  assert.equal(payload.store,false);assert.equal(payload.stream,true);assert(!('max_output_tokens' in payload));assert(!('temperature' in payload));assert(!('previous_response_id' in payload));assert(!('metadata' in payload));assert.deepEqual(payload.tools,[{type:'namespace',name:'workbench',description:'Host-approved personal workbench tools',tools:[{type:'function',name:'write_asset',parameters:{type:'object'}}]}]);assert.throws(()=>subscriptionPayload({tools:[{type:'image_generation'}]}));
});
test('fixed Pi SDK executes a namespaced subscription tool roundtrip through a controlled Responses stream',async()=>{
  const originalFetch=globalThis.fetch;let requests=0;let settled=0;const root=mkdtempSync(join(tmpdir(),'Pi订阅协议 QA '));const resultPath=join(root,'native-result.md');
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),'https://api.openai.com/v1/responses');requests++;assert(requests<=3);const payload=JSON.parse(String(init?.body));assert.equal(payload.store,false);assert.equal(payload.stream,true);assert(!('max_output_tokens' in payload));assert.equal(payload.tools[0].type,'namespace');assert(payload.tools[0].tools.some((t:{name:string})=>t.name==='write')); assert(payload.tools[0].tools.some((t:{name:string})=>t.name==='write_asset'));
    const tool={id:'item-tool-1',type:'function_call',call_id:'call-offline-'+requests,name:requests===1?'write':'write_asset',namespace:'workbench',arguments:JSON.stringify(requests===1?{path:resultPath,content:'OFFLINE_PROTOCOL_ONLY'}:{content:'HOST_TOOL_OK'})};
    const message={id:'item-text-1',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Offline protocol completed',annotations:[]}]};
    const events=requests<3?[{type:'response.output_item.added',output_index:0,item:{...tool,arguments:''}},{type:'response.function_call_arguments.delta',output_index:0,delta:tool.arguments},{type:'response.output_item.done',output_index:0,item:tool}]:[{type:'response.output_item.added',output_index:0,item:{...message,content:[]}},{type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,delta:'Offline protocol completed'},{type:'response.output_item.done',output_index:0,item:message}];
    if(requests===2)assert(payload.input.some((item:{type:string;call_id:string})=>item.type==='function_call_output'&&item.call_id==='call-offline-1'));
    events.push({type:'response.completed',response:{id:'response-offline-'+requests,status:'completed',output:requests<3?[tool]:[message],usage:{input_tokens:20,output_tokens:5,total_tokens:25,input_tokens_details:{cached_tokens:0}}}} as never);
    return new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'Content-Type':'text/event-stream'}});
  };
  let session:Awaited<ReturnType<(Awaited<ReturnType<typeof loadPi>>)['createAgentSession']>>['session']|undefined;
  try{
    const pi=await loadPi();const runtime=await pi.ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsPath:null,allowModelNetwork:false});const model=runtime.getModel('openai','gpt-6.1-sol')!;assert(model);await runtime.setRuntimeApiKey('openai','offline-subscription-access');
    const original=runtime.streamSimple.bind(runtime);runtime.streamSimple=(m,context,options)=>lazyStream(m,async()=>{assert.equal(settled,requests);await runtime.setRuntimeApiKey('openai','offline-subscription-access');return accountedStream(original(m,context,{...options,maxTokens:2048,maxRetries:0,env:{},cacheRetention:'none',onPayload:subscriptionPayload}),async(_cost,usage)=>{assert.equal(usage?.complete,true);assert.equal(usage?.totalTokens,25);settled++;},()=>{});});
    const {settings,loader}=await workbenchResources(pi,root,root,'Offline protocol fixture; use only the provided tool.');const manager=pi.SessionManager.create(root,root);
    session=(await pi.createAgentSession({cwd:root,agentDir:root,modelRuntime:runtime,model,sessionManager:manager,settingsManager:settings,resourceLoader:loader,tools:[...nativePiTools,'write_asset'],customTools:[{name:'write_asset',label:'QA save',description:'Offline fixture only',parameters:Type.Object({content:Type.String()}),execute:async(_id,args)=>{assert.equal((args as {content:string}).content,'HOST_TOOL_OK');assert.equal(readFileSync(resultPath,'utf8'),'OFFLINE_PROTOCOL_ONLY');return {content:[{type:'text',text:'saved offline QA'}],details:{}};}}],thinkingLevel:'off'})).session;
    await session.prompt('Offline protocol fixture');assert.equal(requests,3);assert.equal(settled,3);assert.equal(readFileSync(resultPath,'utf8'),'OFFLINE_PROTOCOL_ONLY');assert.equal(session.getLastAssistantText(),'Offline protocol completed');
    const native=readFileSync(manager.getSessionFile()!,'utf8');assert(!native.includes('offline-subscription-access'));
  }finally{session?.dispose();globalThis.fetch=originalFetch;}
});

test('fixed Pi provider 401/429/503 stops without automatic retries, sanitizes native errors and allows a new prompt',async()=>{
  const previous=globalThis.fetch;const root=mkdtempSync(join(tmpdir(),'Pi供应商故障 QA '));const pi=await loadPi();const runtime=await pi.ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsPath:null,allowModelNetwork:false});const model=runtime.getModel('openai','gpt-5.6-sol')!;await runtime.setRuntimeApiKey('openai','offline-error-key');let requests=0;let expected=401;let complete=false;let receipts=0;
  globalThis.fetch=async()=>{requests++;if(!complete)return Response.json({error:{message:'RAW_PROVIDER_ECHO_should_not_be_saved',type:'controlled_failure',code:'controlled'}},{status:expected});const message={id:'offline-success',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'RECOVERED',annotations:[]}]};const events=[{type:'response.output_item.added',output_index:0,item:{...message,content:[]}},{type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,delta:'RECOVERED'},{type:'response.output_item.done',output_index:0,item:message},{type:'response.completed',response:{id:'offline-recovered',status:'completed',output:[message],usage:{input_tokens:5,output_tokens:1,total_tokens:6,input_tokens_details:{cached_tokens:0}}}}];return new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'Content-Type':'text/event-stream'}});};
  const original=runtime.streamSimple.bind(runtime);runtime.streamSimple=(m,c,o)=>lazyStream(m,async()=>accountedStream(original(m,c,{...o,maxRetries:0,env:{},cacheRetention:'none',onPayload:subscriptionPayload}),async(_cost,usage)=>{assert.equal(usage?.complete,complete);receipts++;},()=>{}));
  const manager=pi.SessionManager.create(root,root);const resources=await workbenchResources(pi,root,root,'Controlled protocol fixture');const session=(await pi.createAgentSession({cwd:root,agentDir:root,modelRuntime:runtime,model,sessionManager:manager,settingsManager:resources.settings,resourceLoader:resources.loader,tools:[],customTools:[],thinkingLevel:'off'})).session;
  try {for(const status of [401,429,503]){expected=status;const before=requests;await session.prompt('Fixed controlled failure');assert.equal(requests,before+1);assert.equal(receipts,requests);assert(!readFileSync(manager.getSessionFile()!,'utf8').includes('RAW_PROVIDER_ECHO'));}complete=true;await session.prompt('Fixed controlled recovery');assert.equal(requests,4);assert.equal(receipts,4);assert.equal(session.getLastAssistantText(),'RECOVERED');}finally{session.dispose();globalThis.fetch=previous;}
});
