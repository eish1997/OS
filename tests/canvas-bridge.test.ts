import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CanvasBridgeEndpoint, isCanvasEnvelope, type CanvasContext, type CanvasEnvelope } from '../shared/canvas-bridge.js';

const origin='http://127.0.0.1:4310';
function setup(onCommand?:(message:CanvasEnvelope)=>Promise<Record<string,unknown>>|Record<string,unknown>,timeoutMs=500){
  const instanceId=randomUUID(),hostWindow={},editorWindow={};
  const context:CanvasContext={contextEpoch:0,projectId:null,canvasId:null};
  const hostMessages:CanvasEnvelope[]=[],editorMessages:CanvasEnvelope[]=[],events:CanvasEnvelope[]=[];
  let editor:CanvasBridgeEndpoint;
  const host=new CanvasBridgeEndpoint({instanceId,origin,peer:()=>editorWindow,context:()=>context,timeoutMs,
    send:(message,target)=>{assert.equal(target,origin);hostMessages.push(message);queueMicrotask(()=>editor.receive({source:hostWindow,origin,data:message}));},onEvent:m=>events.push(m)});
  editor=new CanvasBridgeEndpoint({instanceId,origin,peer:()=>hostWindow,context:()=>context,timeoutMs,
    send:(message,target)=>{assert.equal(target,origin);editorMessages.push(message);queueMicrotask(()=>host.receive({source:editorWindow,origin,data:message}));},onCommand});
  return {host,editor,hostWindow,editorWindow,hostMessages,editorMessages,context,events,close(){host.dispose();editor.dispose();}};
}

test('canvas bridge checks origin, source, version, instance, fields and payload size',async()=>{
  const pair=setup(()=>({}));
  try {
    await pair.host.request('SAVE');const message=pair.hostMessages[0];assert(isCanvasEnvelope(message));
    for(const data of [{...message,protocolVersion:2},{...message,instanceId:randomUUID()},{...message,payload:{unexpected:true}},{...message,extra:true}]){
      assert.equal(pair.editor.receive({source:pair.hostWindow,origin,data}),false);
    }
    assert.equal(pair.editor.receive({source:{},origin,data:message}),false);
    assert.equal(pair.editor.receive({source:pair.hostWindow,origin:'http://wrong.invalid',data:message}),false);
    assert.equal(isCanvasEnvelope({...message,type:'ACK',payload:{command:'SAVE',result:{large:'x'.repeat(65536)}}}),false);
  }finally{pair.close();}
});

test('save waits for actual handler completion, duplicates execute once and ACK stays bound to original document',async()=>{
  let finish!:(result:Record<string,unknown>)=>void,calls=0;
  const pair=setup(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  try {
    let settled=false;const pending=pair.host.request('SAVE').then(result=>{settled=true;return result;});
    await delay(0);const original=pair.hostMessages[0];
    assert.equal(pair.editor.receive({source:pair.hostWindow,origin,data:original}),true);
    await delay(0);assert.equal(calls,1);assert.equal(settled,false);
    assert.equal(pair.host.receive({source:pair.editorWindow,origin,data:{...original,type:'ACK',canvasId:randomUUID(),payload:{command:'SAVE',result:{revision:999}}}}),false);
    finish({revision:3,canvasId:null});assert.deepEqual(await pending,{revision:3,canvasId:null});
    assert.equal(pair.editor.receive({source:pair.hostWindow,origin,data:original}),true);
    await delay(0);assert.equal(calls,1);
  }finally{pair.close();}
});

test('queued commands recheck epoch, serial execution does not apply work to a replaced context',async()=>{
  let finish!:(result:Record<string,unknown>)=>void,calls=0;
  const pair=setup(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  try {
    const first=pair.host.request('SAVE');const next=pair.host.request('PREPARE_SWITCH');
    const rejected=assert.rejects(next,{code:'stale-context'});
    await delay(0);pair.context.contextEpoch=1;finish({revision:1});await first;await rejected;assert.equal(calls,1);
  }finally{pair.close();}
});

test('late replies, superseded instances, queue pressure and disposal are explicit failures',async()=>{
  const pair=setup(()=>new Promise(()=>{}),25);
  try {
    const requests=Array.from({length:16},()=>pair.host.request('SAVE'));
    const failures=requests.map(request=>assert.rejects(request,{code:'timeout'}));
    await assert.rejects(pair.host.request('SAVE'),{code:'queue-full'});await Promise.all(failures);
    const original=pair.hostMessages[0];
    assert.equal(pair.host.receive({source:pair.editorWindow,origin,data:{...original,type:'ACK',payload:{command:'SAVE',result:{revision:4}}}}),false);
    const pending=pair.host.request('SAVE');const rejected=assert.rejects(pending,{code:'disposed'});pair.host.dispose();await rejected;
  }finally{pair.close();}
});

test('evicted response IDs cannot replay commands and out-of-order state notifications are ignored',async()=>{
  let calls=0;const pair=setup(()=>{calls++;return {};});
  try {
    for(let i=0;i<70;i++)await pair.host.request('SAVE');
    assert.equal(pair.editor.receive({source:pair.hostWindow,origin,data:pair.hostMessages[0]}),false);assert.equal(calls,70);
    pair.editor.notify('DOCUMENT_STATE',{state:'saved',revision:5,dirty:false});await delay(0);
    const state=pair.editorMessages.at(-1)!;assert.equal(pair.events.length,1);
    assert.equal(pair.host.receive({source:pair.editorWindow,origin,data:state}),false);
    pair.context.contextEpoch++;
    assert.equal(pair.host.receive({source:pair.editorWindow,origin,data:{...state,sequence:state.sequence+1}}),false);
  }finally{pair.close();}
});

test('modal controls bypass a full save queue without acknowledging or interrupting persistence',async()=>{
  let finish!:(result:Record<string,unknown>)=>void,blocked=false,saves=0;
  const pair=setup(message=>{
    if(message.type==='SET_INTERACTION'){blocked=message.payload.blocked as boolean;return {};}
    saves++;
    return saves===1?new Promise(resolve=>{finish=resolve;}):{};
  });
  try{
    let completed=false;
    const first=pair.host.request('SAVE').then(()=>{completed=true;});
    const remaining=Array.from({length:15},()=>pair.host.request('SAVE'));
    await delay(0);
    await pair.host.request('SET_INTERACTION',{blocked:true});assert.equal(blocked,true);assert.equal(completed,false);
    await pair.host.request('SET_INTERACTION',{blocked:false});assert.equal(blocked,false);assert.equal(completed,false);
    finish({revision:1});await first;await Promise.all(remaining);assert.equal(saves,16);
  }finally{pair.close();}
});

test('conflict recovery command accepts only fork or reload',async()=>{
  const pair=setup(message=>{
    assert.equal(message.type,'RESOLVE_CONFLICT');
    return {document:{state:'conflict',revision:2,dirty:true,error:'版本冲突'},copyId:message.payload.action==='fork'?randomUUID():undefined};
  });
  try{
    const forked=await pair.host.request('RESOLVE_CONFLICT',{action:'fork'});
    assert.equal(typeof forked.copyId,'string');
    await pair.host.request('RESOLVE_CONFLICT',{action:'reload'});
    await assert.rejects(Promise.resolve().then(()=>pair.host.request('RESOLVE_CONFLICT',{action:'merge' as 'fork'})));
  }finally{pair.close();}
});
