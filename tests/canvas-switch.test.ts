import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CanvasController } from '../src/workbench/canvas-controller.js';
import { CanvasBridgeEndpoint, CanvasBridgeError, type CanvasEnvelope, type CanvasContext } from '../shared/canvas-bridge.js';

function setup(mode:'lost-ack'|'late-load'){
  const instanceId=randomUUID(),origin='http://canvas.test',hostWindow={};
  const original:CanvasContext={contextEpoch:0,projectId:null,canvasId:randomUUID()};let active={...original},cancelled=false,blocked=false;
  let finish!:()=>void;const wait=new Promise<void>(resolve=>{finish=resolve;});
  let editor:CanvasBridgeEndpoint;
  const editorWindow={postMessage(message:CanvasEnvelope){queueMicrotask(()=>editor.receive({source:hostWindow,origin,data:message}));}};
  const host=new CanvasController(instanceId,original,{origin,peer:()=>editorWindow as unknown as Window,onState:()=>{},onInteraction:()=>{},onError:()=>{},timeoutMs:40});
  const document=()=>({canvasId:active.canvasId,state:'saved',revision:1,dirty:false});
  editor=new CanvasBridgeEndpoint({instanceId,origin,peer:()=>hostWindow,context:()=>active,
    send:message=>{if(mode==='lost-ack'&&message.type==='ACK'&&message.payload.command==='OPEN_CONTEXT')return;queueMicrotask(()=>host.endpoint.receive({source:editorWindow,origin,data:message}));},
    onCommand:async message=>{
      if(message.type==='PREPARE_SWITCH'){blocked=true;return {document:document()};}
      if(message.type==='OPEN_CONTEXT'){
        if(mode==='late-load')await wait;
        if(cancelled)throw new CanvasBridgeError('switch-cancelled','cancelled');
        active={...message.payload.target as CanvasContext};return {context:active,document:document()};
      }
      if(message.type==='CANCEL_SWITCH'){cancelled=true;return {context:active,document:document()};}
      if(message.type==='SET_INTERACTION'){blocked=Boolean(message.payload.blocked);return {};}
      return {};
    }});
  return {host,editor,original,finish,active:()=>active,blocked:()=>blocked,close(){host.dispose();editor.dispose();}};
}
test('lost open acknowledgement reconciles the actual committed context before unblocking',async()=>{
  const pair=setup('lost-ack');try{const target=randomUUID();await pair.host.openCanvas(target);assert.equal(pair.host.context.canvasId,target);assert.deepEqual(pair.host.context,pair.active());assert.equal(pair.blocked(),false);}finally{pair.close();}
});
test('timed out load is cancelled while pending and cannot replace the old context later',async()=>{
  const pair=setup('late-load');try{
    await assert.rejects(pair.host.openCanvas(randomUUID()),{code:'timeout'});
    assert.deepEqual(pair.host.context,pair.original);assert.equal(pair.blocked(),false);
    pair.finish();await delay(5);assert.deepEqual(pair.active(),pair.original);assert.deepEqual(pair.host.context,pair.original);
  }finally{pair.close();}
});

test('editor open request awaits the host save and reconciled context without a command deadlock',async()=>{
  const pair=setup('lost-ack');try{
    const target=randomUUID();
    await pair.editor.request('REQUEST_CONTEXT_OPEN',{canvasId:target});
    assert.equal(pair.host.context.canvasId,target);
    assert.deepEqual(pair.active(),pair.host.context);
    assert.equal(pair.blocked(),false);
  }finally{pair.close();}
});
