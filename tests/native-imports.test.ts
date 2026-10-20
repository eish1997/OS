import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Store} from '../server/store.js';
import {StorageCapacity} from '../server/storage.js';
import {NativeImports,type NativeImport} from '../server/native-imports.js';
import {createApp} from '../server/app.js';

test('native import durable chunks recover overlap, duplicate commands, restart and quota failure',async()=>{
  const root=mkdtempSync(join(tmpdir(),'native-upload-'));let store=new Store(join(root,'workbench.sqlite'));
  const capacity=new StorageCapacity(root,{sessionsBytes:1024*1024,minFreeBytes:0});store.attachCapacity(capacity);
  try{
    const project=store.create('project',{});const other=store.create('project',{});let uploads=new NativeImports(store,root);
    const bytes=Buffer.from(JSON.stringify({type:'session',version:3,id:'source',timestamp:new Date().toISOString(),cwd:'Z:/not-followed'})+'\n');
    const hash=createHash('sha256').update(bytes).digest('hex');const record=uploads.begin(project.id,'test.jsonl',bytes.length,hash,'same');
    assert.equal(uploads.begin(project.id,'test.jsonl',bytes.length,hash,'same').id,record.id);
    assert.throws(()=>uploads.begin(project.id,'different.jsonl',bytes.length,hash,'same'),{status:409});
    assert.throws(()=>uploads.write(other.id,record.id,0,bytes),{status:403});
    assert.throws(()=>uploads.write(project.id,record.id,1,bytes),{status:409});
    assert.equal(uploads.write(project.id,record.id,0,bytes.subarray(0,20)).received,20);
    await assert.rejects(uploads.preview(project.id,record.id),{status:409});
    store.db.close();store=new Store(join(root,'workbench.sqlite'));store.attachCapacity(capacity);uploads=new NativeImports(store,root);
    assert.equal(uploads.get(project.id,record.id).received,20);
    assert.equal(uploads.write(project.id,record.id,0,bytes).received,bytes.length);
    assert.equal(uploads.write(project.id,record.id,0,bytes).received,bytes.length);
    assert.throws(()=>uploads.write(project.id,record.id,0,Buffer.from('bad')),{status:409});
    const result=await uploads.preview(project.id,record.id);assert.equal(result.preview.sha256,hash);assert.equal(result.preview.environmentVerified,false);
    const path=join(root,'sessions',project.id,`import-${record.id}.jsonl`);assert.deepEqual(readFileSync(path),bytes);
    const wrong=uploads.begin(project.id,'wrong.jsonl',bytes.length,'0'.repeat(64),'wrong');uploads.write(project.id,wrong.id,0,bytes);await assert.rejects(uploads.preview(project.id,wrong.id),{status:422});
    const huge=uploads.begin(project.id,'huge.jsonl',1024*1024,'0'.repeat(64),'huge');assert.throws(()=>uploads.write(project.id,huge.id,0,Buffer.alloc(1024*1024)),{status:507});assert.equal(uploads.get(project.id,huge.id).received,0);
    assert.equal(store.list('run').length,0);assert.equal(store.list('task').length,0);
    assert.throws(()=>uploads.cancel(other.id,record.id),{status:403});
    // Persisted revocation with original still present models the crash window before unlink.
    const current=store.get<NativeImport>('native_import',record.id);store.update<NativeImport>('native_import',record.id,current.revision,{revoked:true});
    store.db.close();store=new Store(join(root,'workbench.sqlite'));store.attachCapacity(capacity);uploads=new NativeImports(store,root);
    assert.throws(()=>uploads.write(project.id,record.id,0,bytes),{status:410});
    const cancelled=uploads.cancel(project.id,record.id);assert.equal(cancelled.revoked,true);assert.equal(cancelled.received,0);
    assert.equal(uploads.cancel(project.id,record.id).received,0);await assert.rejects(uploads.preview(project.id,record.id),{status:410});
    assert.equal(uploads.list(project.id).find(item=>item.id===record.id)?.revoked,true);
  }finally{store.db.close();rmSync(root,{recursive:true,force:true});}
});

test('native import HTTP enforces authentication, scope and bounded chunks before preview',async()=>{
  const root=mkdtempSync(join(tmpdir(),'native-import-http-'));const app=createApp({dataDir:root,password:'import-test',schedule:false});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try{
    const project=app.service.createProject('Import');const other=app.service.createProject('Other');
    const timestamp=new Date().toISOString();const bytes=Buffer.from([JSON.stringify({type:'session',version:3,id:'original',cwd:'Z:/untrusted',timestamp}),JSON.stringify({type:'message',id:'a',parentId:null,timestamp,message:{role:'user',content:'x'.repeat(1024*1024),timestamp:1}})].join('\n')+'\n');
    const data={projectId:project.id,name:'original.jsonl',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),commandId:'http-owned'};
    assert.equal((await fetch(base+'/api/native-imports',{method:'POST',body:JSON.stringify(data)})).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'import-test'})});const headers={cookie:login.headers.get('set-cookie')!.split(';')[0]};
    const created=await fetch(base+'/api/native-imports',{method:'POST',headers,body:JSON.stringify(data)});assert.equal(created.status,201);const record=await created.json() as {id:string};
    const url=base+`/api/native-imports/${record.id}`;const scoped=url+`?projectId=${project.id}`;
    assert.equal((await fetch(url+`?projectId=${other.id}`,{headers})).status,403);
    assert.equal((await fetch(scoped+'&offset=0',{method:'PUT',headers,body:bytes})).status,413);
    assert.equal((await (await fetch(scoped,{headers})).json()).received,0);
    assert.equal((await fetch(scoped+'&offset=0',{method:'PUT',headers,body:bytes.subarray(0,1024*1024)})).status,200);
    assert.equal((await fetch(scoped+'&offset=1048576',{method:'PUT',headers,body:bytes.subarray(1024*1024)})).status,200);
    const response=await fetch(url+`/preview?projectId=${project.id}`,{headers});assert.equal(response.status,200);const result=await response.json();assert.equal(result.preview.sha256,data.sha256);assert.equal(result.preview.messageCount,1);
    const points=await fetch(url+`/points?projectId=${project.id}`,{headers});assert.equal(points.status,200);const page=await points.json();assert.equal(page.sourceHash,data.sha256);assert.equal(page.points[0].entryId,'a');
    assert.equal((await fetch(url+`/points?projectId=${other.id}`,{headers})).status,403);
    assert.equal((await fetch(url+`/points?projectId=${project.id}&offset=30`,{headers})).status,400);
    assert.equal((await fetch(url+`/points?projectId=${project.id}&sourceHash=${'0'.repeat(64)}`,{headers})).status,409);
    assert.equal(app.store.list('run').length,0);assert.equal(app.store.list('task').length,0);
    assert.deepEqual(readFileSync(join(root,'sessions',project.id,`import-${record.id}.jsonl`)),bytes);
    assert.equal((await fetch(scoped,{method:'DELETE'})).status,401);
    assert.equal((await fetch(url+`?projectId=${other.id}`,{method:'DELETE',headers})).status,403);
    assert.equal((await fetch(scoped,{method:'DELETE',headers})).status,200);
    assert.equal((await fetch(scoped+'&offset=0',{method:'PUT',headers,body:bytes.subarray(0,50)})).status,410);
    const listed=await (await fetch(base+`/api/native-imports?projectId=${project.id}`,{headers})).json();assert.equal(listed[0].revoked,true);assert.equal(listed[0].received,0);
  }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
