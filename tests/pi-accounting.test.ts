import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { loadPi } from '../server/pi-adapter.js';
import { installAccountedRuntime, type ModelRequestPurpose } from '../server/accounted-runtime.js';
import { PiSessionLifecycle } from '../server/pi-session-lifecycle.js';

// Only the external Responses endpoint is deterministic; all Pi routing,
// compaction, tree navigation, retry and stream accounting use the real SDK.
function response(text: string, inputTokens = 30) {
  const message={id:'message-probe',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};
  const events=[
    {type:'response.output_item.added',output_index:0,item:{...message,content:[]}},
    {type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},
    {type:'response.output_text.delta',output_index:0,content_index:0,delta:text},
    {type:'response.output_item.done',output_index:0,item:message},
    {type:'response.completed',response:{id:'response-probe',status:'completed',output:[message],usage:{input_tokens:inputTokens,output_tokens:5,total_tokens:inputTokens+5,input_tokens_details:{cached_tokens:0}}}}
  ];
  return new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'Content-Type':'text/event-stream'}});
}

async function fixture(retry=false, networkIdleTimeoutMs?: number) {
  const root=mkdtempSync(join(tmpdir(),'pi-accounting-'));const agentDir=join(root,'.host-pi');mkdirSync(agentDir);
  const pi=await loadPi();
  const runtime=await pi.ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsPath:null,allowModelNetwork:false,refreshOnCreate:false});
  const model=runtime.getModel('openai','gpt-5.6-sol')!;assert(model);
  await runtime.setRuntimeApiKey('openai','offline-probe-not-a-real-key');
  const settings=pi.SettingsManager.inMemory({compaction:{enabled:false,reserveTokens:512,keepRecentTokens:128},branchSummary:{reserveTokens:512},retry:{enabled:retry,maxRetries:2,baseDelayMs:1,maxAgentDelayMs:10,provider:{maxRetries:0}},cacheWarming:'off',packages:[]});
  const loader=new pi.DefaultResourceLoader({cwd:root,agentDir,settingsManager:settings,noExtensions:true,noThemes:true,noSkills:true,noPromptTemplates:true});await loader.reload();
  const lifecycle = new PiSessionLifecycle();let reserved=0;let settled=0;
  const receipts:{call:number;purpose:ModelRequestPurpose;complete:boolean}[]=[];const purposes=new Map<number,ModelRequestPurpose>();
  const phases: string[] = [];
  installAccountedRuntime(runtime,{maxOutputTokens:4096,reservePerCallUsd:0,modelBinding:{kind:'chatgpt',provider:model.provider,model:model.id},piRuntime:networkIdleTimeoutMs || retry ? {schemaVersion:1,configurationRevision:1,requestedThinkingLevel:'medium',thinkingLevel:'medium',networkIdleTimeoutMs,autoRetry:retry} : undefined},{
    phase: value => { phases.push(value); },
    assertHealthy:()=>{},purpose:()=>lifecycle.purpose,
    reserve:async p=>{assert.equal(reserved,settled,'previous response must settle before next reservation');const callNumber=++reserved;purposes.set(callNumber,p);return {apiKey:'offline-probe-not-a-real-key',callNumber};},
    settle:async(call,_cost,usage)=>{assert.equal(call,settled+1);settled++;receipts.push({call,purpose:purposes.get(call)!,complete:usage?.complete??false});},started:()=>{}
  });
  const manager=pi.SessionManager.inMemory(root);
  const {session}=await pi.createAgentSession({cwd:root,agentDir,modelRuntime:runtime,model,settingsManager:settings,resourceLoader:loader,sessionManager:manager,tools:[],customTools:[],thinkingLevel:'medium'});
  lifecycle.bind(session);
  session.subscribe(event => lifecycle.observe(event));
  return {session,manager,settings,lifecycle,receipts,phases,cleanup:()=>{session.dispose();rmSync(root,{recursive:true,force:true});}};
}

test('idle deadline aborts an actual SDK request and settles unknown usage once', {timeout:10000}, async () => {
  const previous=globalThis.fetch;const f=await fixture(false,100);let requests=0;let aborted=0;
  globalThis.fetch=async(_url,options)=>{
    requests++;
    return await new Promise<Response>((_resolve,reject)=>{
      const abort=()=>{aborted++;reject(new DOMException('Aborted','AbortError'));};
      if(options?.signal?.aborted)abort();else options?.signal?.addEventListener('abort',abort,{once:true});
    });
  };
  try {
    await f.session.prompt('Controlled stalled response');
    assert.equal(requests,1);assert.equal(aborted,1);
    assert.equal(f.phases.filter(p=>p==='model_idle_timeout').length,1);
    assert.deepEqual(f.receipts,[{call:1,purpose:'agent',complete:false}]);
    assert.equal(f.lifecycle.modelFailed,true);
    // A later request can proceed; the expired timer must not poison the session.
    globalThis.fetch=async()=>response('RECOVERED AFTER IDLE');
    await f.session.prompt('Continue after controlled idle failure');
    assert.equal(f.session.getLastAssistantText(),'RECOVERED AFTER IDLE');
    assert.equal(f.lifecycle.modelFailed,false);
    assert.equal(f.receipts.length,2);assert.equal(f.receipts[1].complete,true);
  } finally {globalThis.fetch=previous;f.cleanup();}
});

test('ordinary prompts, native compaction and branch summaries all cross the same settled accounting boundary',async()=>{
  const previous=globalThis.fetch;const f=await fixture();let requests=0;const efforts:string[]=[];
  globalThis.fetch=async(_url,options)=>{
    const payload=JSON.parse(String(options?.body));efforts.push(payload.reasoning?.effort);assert(!('max_output_tokens' in payload));
    requests++;return response('Preserve objective MARKER, decisions and file changes. '+ 'summary '.repeat(80));
  };
  try{
    for(let i=0;i<4;i++)await f.session.prompt(`Step ${i}: keep MARKER. `+'history '.repeat(300));
    const first=f.manager.getEntries().find(e=>e.type==='message'&&e.message.role==='user')!;
    const compacted=await f.session.compact('Preserve MARKER');assert.match(compacted.summary,/MARKER/);
    assert(f.manager.getEntries().some(e=>e.type==='compaction'));
    const branched=await f.session.navigateTree(first.id,{summarize:true});assert.equal(branched.cancelled,false);assert(branched.summaryEntry);
    assert.equal(requests,f.receipts.length);assert(f.receipts.every(r=>r.complete));
    assert(efforts.slice(0,4).every(e=>e==='medium'));
    // Pi's branch summary helper does not pass the session thinking level.
    // Preserve and expose that native distinction instead of assuming parity.
    assert.equal(efforts.at(-1),'none');
    for(const purpose of ['agent','compaction','branch_summary'])assert(f.receipts.some(r=>r.purpose===purpose),purpose);
  }finally{globalThis.fetch=previous;f.cleanup();}
});

test('sanitized transient errors retain native retry classification and every attempt is accounted',async()=>{
  const previous=globalThis.fetch;const f=await fixture(true);let requests=0;
  globalThis.fetch=async()=>{requests++;return requests===1?Response.json({error:{message:'503 RAW_PROVIDER_SECRET',type:'server_error'}},{status:503}):response('RECOVERED');};
  try{
    await f.session.prompt('Recover from a controlled transient error');
    assert.equal(requests,2);assert.deepEqual(f.receipts.map(r=>r.complete),[false,true]);assert.equal(f.session.getLastAssistantText(),'RECOVERED');
    assert(!JSON.stringify(f.manager.getEntries()).includes('RAW_PROVIDER_SECRET'));
  }finally{globalThis.fetch=previous;f.cleanup();}
});

test('actual SDK retries honor HTTP hints before reservation and cancellation consumes no extra call', {timeout:10000}, async()=>{
  const previous=globalThis.fetch;const f=await fixture(true);const started:number[]=[];
  globalThis.fetch=async()=>{started.push(Date.now());return started.length===1?Response.json({error:{message:'503 service unavailable'}},{status:503,headers:{'retry-after-ms':'180'}}):response('RETRY AFTER RECOVERED');};
  try {
    await f.session.prompt('Honor bounded response delay');
    assert.equal(started.length,2);assert(started[1]-started[0]>=170);
    assert.equal(f.receipts.length,2);assert(f.phases.includes('model_backoff'));
    f.phases.length=0;let requests=0;
    globalThis.fetch=async()=>{requests++;return Response.json({error:{message:'503 service unavailable'}},{status:503,headers:{'retry-after':'30'}});};
    const pending=f.session.prompt('Cancel while waiting for response hint');
    const deadline=Date.now()+2000;
    while(!f.phases.includes('model_backoff')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
    assert(f.phases.includes('model_backoff'));
    await f.session.abort();await pending;
    assert.equal(requests,1);assert.equal(f.receipts.length,3);
  }finally{globalThis.fetch=previous;f.cleanup();}
});

test('sanitized authentication errors do not become retryable',async()=>{
  const previous=globalThis.fetch;const f=await fixture(true);let requests=0;
  globalThis.fetch=async()=>{requests++;return Response.json({error:{message:'RAW_AUTH_SECRET',type:'authentication_error'}},{status:401});};
  try{await f.session.prompt('Controlled authentication failure');assert.equal(requests,1);assert.deepEqual(f.receipts.map(r=>r.complete),[false]);assert(!JSON.stringify(f.manager.getEntries()).includes('RAW_AUTH_SECRET'));}
  finally{globalThis.fetch=previous;f.cleanup();}
});

test('native overflow recovery attributes its summary request and clears the recovered model error', async () => {
  const previous = globalThis.fetch; const f = await fixture();
  globalThis.fetch = async () => response('Preserve MARKER. ' + 'history '.repeat(80));
  try {
    for (let i = 0; i < 4; i++) await f.session.prompt(`Seed ${i} MARKER ` + 'history '.repeat(300));
    const originalIds = f.manager.getEntries().map(e => e.id);
    f.settings.setCompactionEnabled(true);
    let calls = 0;
    globalThis.fetch = async () => ++calls === 1
      ? Response.json({ error: { message: 'maximum context length exceeded RAW_SECRET', code: 'context_length_exceeded' } }, { status: 400 })
      : response('Recovered MARKER. ' + 'summary '.repeat(80));
    await f.session.prompt('Continue MARKER after overflow');
    assert.equal(f.lifecycle.modelFailed, false);
    assert.equal(f.lifecycle.compaction?.phase, 'completed');
    assert.equal(f.lifecycle.compaction?.reason, 'overflow');
    assert.equal(f.lifecycle.purpose, 'agent');
    assert(f.receipts.slice(4).some(r => r.purpose === 'compaction' && r.complete));
    assert.equal(f.receipts.at(-1)?.purpose, 'agent');
    assert(originalIds.every(id => f.manager.getEntries().some(e => e.id === id)));
    assert(!JSON.stringify(f.manager.getEntries()).includes('RAW_SECRET'));
  } finally { globalThis.fetch = previous; f.cleanup(); }
});

test('manual compaction failure and cancellation preserve entries and settle unknown usage', async () => {
  const previous = globalThis.fetch; const f = await fixture();
  globalThis.fetch = async () => response('Preserve MARKER. ' + 'history '.repeat(80));
  try {
    for (let i = 0; i < 4; i++) await f.session.prompt(`Seed ${i} MARKER ` + 'history '.repeat(300));
    const before = JSON.stringify(f.manager.getEntries());
    globalThis.fetch = async () => Response.json({ error: { message: 'authentication failed RAW_SECRET' } }, { status: 401 });
    await assert.rejects(f.session.compact());
    assert.equal(f.receipts.length, 5, 'failed manual compaction made one request');
    assert.equal(f.lifecycle.compaction?.phase, 'failed');
    assert.equal(JSON.stringify(f.manager.getEntries()), before);
    let started!: () => void; const waiting = new Promise<void>(resolve => { started = resolve; });
    globalThis.fetch = async (_url, options) => {
      started();
      return await new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (options?.signal?.aborted) abort(); else options?.signal?.addEventListener('abort', abort, { once: true });
      });
    };
    const pending = assert.rejects(f.session.compact());
    await waiting;
    await f.session.abort();
    await pending;
    assert.equal(f.lifecycle.compaction?.phase, 'cancelled');
    assert.equal(f.lifecycle.purpose, 'agent');
    assert.equal(JSON.stringify(f.manager.getEntries()), before);
    assert.deepEqual(f.receipts.slice(4).map(r => [r.purpose, r.complete]), [['compaction', false], ['compaction', false]]);
  } finally { globalThis.fetch = previous; f.cleanup(); }
});

test('native threshold compaction preserves original entries and accounts summary before the next answer', async () => {
  const previous = globalThis.fetch; const f = await fixture();
  globalThis.fetch = async () => response('MARKER ' + 'history '.repeat(80), 1800);
  try {
    for (let i = 0; i < 4; i++) await f.session.prompt(`Seed ${i} MARKER ` + 'history '.repeat(300));
    const ids = f.manager.getEntries().map(e => e.id);
    await f.session.setModel({ ...f.session.model!, contextWindow: 2048 });
    f.settings.setCompactionEnabled(true);
    globalThis.fetch = async () => response('MARKER summary and answer');
    await f.session.prompt('Continue MARKER ' + 'new material '.repeat(600));
    assert.equal(f.lifecycle.compaction?.reason, 'threshold');
    assert.equal(f.lifecycle.compaction?.phase, 'completed');
    assert(f.receipts.slice(4).some(r => r.purpose === 'compaction' && r.complete));
    assert.equal(f.lifecycle.modelFailed, false);
    assert(ids.every(id => f.manager.getEntries().some(e => e.id === id)));
  } finally { globalThis.fetch = previous; f.cleanup(); }
});
