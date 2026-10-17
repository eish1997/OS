import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { CanvasTransport } from '../server/canvas-transport.js';
import { config } from '../server/config.js';

test('private canvas transport authenticates browser, bounds writes and never forwards client credentials', async () => {
  const token='private-canvas-token-for-test-only-123456789';
  const seen:{path:string;authorization?:string;cookie?:string;origin?:string}[]=[];
  const upstream=createServer(async(req,res)=>{
    seen.push({path:req.url!,authorization:req.headers.authorization,cookie:req.headers.cookie,origin:req.headers.origin});
    for await (const _ of req) { /* Drain the actual forwarded body. */ }
    res.writeHead(200,{'Content-Type':'application/json'});res.end('[]');
  });
  await new Promise<void>(r=>upstream.listen(0,'127.0.0.1',r));
  const privateURL=`http://127.0.0.1:${(upstream.address() as {port:number}).port}`;
  const root=mkdtempSync(join(tmpdir(),'canvas-transport-'));
  const app=createApp({dataDir:root,canvasStaticDir:root,
    canvasTransport:new CanvasTransport(privateURL,token,'http://private.invalid',64),
    password:'canvas-transport-password',schedule:false});
  await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  const previous=config.origin;config.origin=base;
  try {
    const path=base+'/api/canvas/workspace/canvases';
    assert.equal((await fetch(path)).status,401);assert.equal(seen.length,0);
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'canvas-transport-password'})});
    const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0],Authorization:'Bearer attacker',Origin:base,'Content-Type':'application/json'};
    const response=await fetch(path,{headers});assert.equal(response.status,200);assert.equal(await response.text(),'[]');
    assert.equal(seen[0].authorization,`Bearer ${token}`);assert.equal(seen[0].cookie,undefined);assert.equal(seen[0].origin,'http://private.invalid');
    assert.equal((await fetch(path+'/doc',{method:'POST',headers,body:'{}'})).status,200);
    assert.equal((await fetch(path+'/doc',{method:'POST',headers:{...headers,Origin:'https://other.invalid'},body:'{}'})).status,403);
    const {Origin:_,...withoutOrigin}=headers;
    assert.equal((await fetch(path+'/doc',{method:'POST',headers:withoutOrigin,body:'{}'})).status,403);
    assert.equal((await fetch(path+'/doc',{method:'POST',headers,body:'x'.repeat(65)})).status,413);
    assert.equal((await fetch(path+'?unrestricted=true',{headers})).status,404);
    assert.equal((await fetch(base+'/api/canvas/workspace/node-runs',{headers})).status,404);
    assert.equal(seen.length,2);
  } finally {config.origin=previous;await app.close();upstream.closeAllConnections();await new Promise<void>(r=>upstream.close(()=>r()));}
});

test('private canvas transport rejects non-loopback targets and credentials in URLs',()=>{
  for(const address of ['http://example.com','https://127.0.0.1','http://u:p@127.0.0.1','http://127.0.0.1/path']) {
    assert.throws(()=>new CanvasTransport(address,'x'.repeat(32),'http://private.invalid'));
  }
});
