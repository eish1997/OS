import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createApp} from '../server/app.js';

test('upload intents replay one identity and bind exact bytes without breaking legacy clients',async()=>{
  const app=createApp({dataDir:mkdtempSync(join(tmpdir(),'upload-intent-')),password:'upload-intent-password',schedule:false});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try{
    const project=app.service.createProject('Upload intent');
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'upload-intent-password'})});
    const headers={cookie:login.headers.get('set-cookie')!.split(';')[0],'content-type':'application/json'};
    const bytes=Buffer.from('owned bytes');const expectedHash=createHash('sha256').update(bytes).digest('hex');
    const intent={projectId:project.id,name:'owned.png',mime:'image/png',commandId:'owned-upload-command',expectedHash};
    const post=(body:unknown)=>fetch(base+'/api/uploads',{method:'POST',headers,body:JSON.stringify(body)});
    assert.equal((await fetch(base+'/api/uploads',{method:'POST',body:JSON.stringify(intent)})).status,401);
    const first=await post(intent);assert.equal(first.status,201);const upload=await first.json();
    const replay=await post(intent);assert.equal(replay.status,201);assert.equal((await replay.json()).id,upload.id);assert.equal(app.store.list('upload').length,1);
    assert.equal((await post({...intent,name:'other.png'})).status,409);
    assert.equal((await post({...intent,expectedHash:'0'.repeat(64)})).status,409);
    assert.equal((await post({...intent,commandId:'bad-hash',expectedHash:'bad'})).status,400);
    // A different valid header cannot override the hash frozen by creation.
    const bad=Buffer.from('other bytes');const badHash=createHash('sha256').update(bad).digest('hex');
    assert.equal((await fetch(base+`/api/uploads/${upload.id}`,{method:'PUT',headers:{cookie:headers.cookie,'x-content-hash':badHash},body:bad})).status,422);
    assert.equal(app.store.list('asset').length,0);
    const committed=await fetch(base+`/api/uploads/${upload.id}`,{method:'PUT',headers:{cookie:headers.cookie},body:bytes});assert.equal(committed.status,200);const asset=await committed.json();assert.equal(asset.hash,expectedHash);
    assert.equal((await (await post(intent)).json()).id,upload.id,'creation replay after commit preserves identity');
    const duplicate=await fetch(base+`/api/uploads/${upload.id}`,{method:'PUT',headers:{cookie:headers.cookie},body:bytes});assert.equal((await duplicate.json()).id,asset.id);
    const legacy=await post({projectId:project.id,name:'legacy.txt',mime:'text/plain'});assert.equal(legacy.status,201);
    assert.equal(app.store.list('asset').length,1);assert.equal(app.store.list('upload').length,2);
  }finally{await app.close();}
});
