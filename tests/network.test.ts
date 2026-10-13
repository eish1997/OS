import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, setGlobalProxyFromEnv } from 'node:http';
import { selectProxy } from '../server/network.js';
import { connectionFailure } from '../server/openai-error.js';

test('network route respects explicit configuration, Windows HTTP proxy and direct mode; local traffic bypasses',()=>{
  const system={enabled:true,server:'127.0.0.1:7890'};
  const chosen=selectProxy({},system);assert.equal(chosen.HTTPS_PROXY,'http://127.0.0.1:7890');assert(chosen.NO_PROXY.includes('127.0.0.1'));
  assert.equal(selectProxy({HTTPS_PROXY:'https://proxy.example.invalid:8443'},system).HTTPS_PROXY,'https://proxy.example.invalid:8443');
  assert.equal(selectProxy({HTTPS_PROXY:'http://upper.invalid',https_proxy:'http://lower.invalid'},system).HTTPS_PROXY,'http://lower.invalid');
  assert.equal(selectProxy({WORKBENCH_PROXY_MODE:'direct',HTTPS_PROXY:'http://proxy.invalid'},system).HTTPS_PROXY,'');
  assert.equal(selectProxy({WORKBENCH_PROXY_MODE:'environment'},system).HTTPS_PROXY,'');
  assert.equal(selectProxy({}, {enabled:true,server:'http=localhost:8001;https=localhost:8002'}).HTTPS_PROXY,'http://localhost:8002');
  assert.equal(selectProxy({}, {enabled:false,server:'127.0.0.1:7890'}).HTTPS_PROXY,'');
  assert.throws(()=>selectProxy({HTTPS_PROXY:'socks5://proxy.invalid'}));assert.throws(()=>selectProxy({HTTPS_PROXY:'https://user:SECRET@proxy.invalid/path'}),e=>e instanceof Error&&!e.message.includes('SECRET'));
});
test('native Node fetch uses selected proxy and bypasses local workbench without dependency or external network',async()=>{
  let proxied=0;const proxy=createServer((_req,res)=>{proxied++;res.end('PROXY_PROTOCOL_ONLY');});const local=createServer((_req,res)=>res.end('LOCAL_BYPASS'));
  proxy.on('connect',(req,socket)=>{assert.equal(req.url,'workbench-offline-proxy.invalid:80');proxied++;socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');socket.once('data',()=>socket.end(`HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength('PROXY_PROTOCOL_ONLY')}\r\nConnection: close\r\n\r\nPROXY_PROTOCOL_ONLY`));});
  await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));await new Promise<void>(r=>local.listen(0,'127.0.0.1',r));
  const port=(proxy.address() as {port:number}).port;const localPort=(local.address() as {port:number}).port;
  const restore=setGlobalProxyFromEnv(selectProxy({HTTP_PROXY:`http://127.0.0.1:${port}`,HTTPS_PROXY:`http://127.0.0.1:${port}`}));
  try {assert.equal(await (await fetch('http://workbench-offline-proxy.invalid/',{signal:AbortSignal.timeout(3000)})).text(),'PROXY_PROTOCOL_ONLY');assert.equal(await (await fetch(`http://127.0.0.1:${localPort}/`,{signal:AbortSignal.timeout(3000)})).text(),'LOCAL_BYPASS');assert.equal(proxied,1);}
  finally {restore();proxy.closeAllConnections();local.closeAllConnections();await Promise.all([new Promise<void>(r=>proxy.close(()=>r())),new Promise<void>(r=>local.close(()=>r()))]);}
});
test('OpenAI failure preserves stage/status/code/shape with actionable errors and no raw response secrets',()=>{
  const endpoint='https://auth.openai.com/api/accounts/oauth/token';const request={body:new URLSearchParams({grant_type:'authorization_code',code:'PRIVATE_CODE'})};
  const failure=connectionFailure(endpoint,request,new Response('',{status:403,headers:{'x-request-id':'req_123456'}}),JSON.stringify({error:{code:'unsupported_country_region_territory',message:'PRIVATE_CODE token=SECRET'},access_token:'SECRET'}));
  assert.equal(failure.diagnostic.errorCode,'unsupported_country_region_territory');assert.equal(failure.diagnostic.httpStatus,403);assert.equal(failure.diagnostic.stage,'code_exchange');assert.match(failure.message,/地区/);assert(!JSON.stringify(failure).includes('PRIVATE_CODE'));assert(!JSON.stringify(failure).includes('SECRET'));
  const html=connectionFailure(endpoint,request,new Response('',{status:403}),'<html>PRIVATE_CODE SECRET</html>');assert.equal(html.diagnostic.bodyShape,'html');assert.match(html.message,/网页/);assert(!JSON.stringify(html).includes('SECRET'));
  const refresh=connectionFailure(endpoint,{body:new URLSearchParams({grant_type:'refresh_token'})},new Response('',{status:400}),'{}');assert.equal(refresh.diagnostic.stage,'refresh');
  const unknown=connectionFailure(endpoint,request,new Response('',{status:400}),JSON.stringify({error:'SECRET'}));assert.equal(unknown.diagnostic.errorCode,undefined);
});
