import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {connectionRead,ConnectionUnauthorized} from '../src/connection-read.js';

async function server(handler:(req:IncomingMessage,res:ServerResponse)=>void) {
  const host=createServer(handler);await new Promise<void>(done=>host.listen(0,'127.0.0.1',done));
  return {url:'http://127.0.0.1:'+(host.address() as {port:number}).port+'/api/auth',close:async()=>{host.closeAllConnections();await new Promise<void>((done,reject)=>host.close(error=>error?reject(error):done()));}};
}
test('connection bootstrap recovers real HTTP 503 without retrying a write',async()=>{
  const methods:string[]=[];let waiting=0;
  const host=await server((req,res)=>{methods.push(req.method!);res.setHeader('Content-Type','application/json');res.writeHead(methods.length<3?503:200);res.end(JSON.stringify(methods.length<3?{error:'restarting'}:{loggedIn:true}));});
  try{const value=await connectionRead<{loggedIn:boolean}>(host.url,{signal:new AbortController().signal,delaysMs:[10,20],onWaiting:()=>waiting++});assert.equal(value.loggedIn,true);assert.equal(waiting,2);assert.deepEqual(methods,['GET','GET','GET']);}finally{await host.close();}
});
test('connection bootstrap recovers socket loss and incomplete JSON before accepting state',async()=>{
  let requests=0;let waiting=0;const host=await server((req,res)=>{requests++;if(requests===1){req.socket.destroy();return;}res.setHeader('Content-Type','application/json');res.end(requests===2?'{':JSON.stringify({loggedIn:false}));});
  try{const value=await connectionRead<{loggedIn:boolean}>(host.url,{signal:new AbortController().signal,delaysMs:[10],onWaiting:()=>waiting++});assert.equal(value.loggedIn,false);assert.equal(requests,3);assert.equal(waiting,2);}finally{await host.close();}
});
test('expired connection authentication is terminal and is not mistaken for a network outage',async()=>{
  let requests=0;let waiting=0;const host=await server((_req,res)=>{requests++;res.writeHead(401);res.end('{}');});
  try{await assert.rejects(connectionRead(host.url,{signal:new AbortController().signal,delaysMs:[10],onWaiting:()=>waiting++}),ConnectionUnauthorized);await new Promise<void>(done=>setTimeout(done,30));assert.equal(requests,1);assert.equal(waiting,0);}finally{await host.close();}
});
test('connection timeout is bounded and unmount abort stops reads during request or backoff',async()=>{
  let requests=0;let mode:'hung'|'failed'='hung';let sawRequest:()=>void=()=>{};
  const host=await server((_req,res)=>{requests++;sawRequest();if(mode==='failed'){res.writeHead(503);res.end('{}');}});
  try {
    const timeoutAbort=new AbortController();let failures=0;
    await assert.rejects(connectionRead(host.url,{signal:timeoutAbort.signal,timeoutMs:25,delaysMs:[500],onWaiting:()=>{failures++;timeoutAbort.abort(new Error('fixture-unmounted-after-timeout'));}}),/fixture-unmounted-after-timeout/);assert.equal(failures,1);assert.equal(requests,1);
    const inflight=new AbortController();const received=new Promise<void>(done=>sawRequest=done);
    const request=connectionRead(host.url,{signal:inflight.signal,delaysMs:[500]});await received;inflight.abort(new Error('fixture-inflight-abort'));await assert.rejects(request,/fixture-inflight-abort/);assert.equal(requests,2);
    mode='failed';const backoff=new AbortController();
    const waiting=new Promise<void>(done=>sawRequest=done);const read=connectionRead(host.url,{signal:backoff.signal,delaysMs:[500],onWaiting:()=>backoff.abort(new Error('fixture-backoff-abort'))});await waiting;await assert.rejects(read,/fixture-backoff-abort/);assert.equal(requests,3);
    await new Promise<void>(done=>setTimeout(done,50));assert.equal(requests,3,'No queued retry survives cancellation');
  }finally{await host.close();}
});
