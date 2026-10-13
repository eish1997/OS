import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fork } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createApp } from '../server/app.js';
import { Store, AppError } from '../server/store.js';
import { StorageCapacity,storageUsage } from '../server/storage.js';
import { BoundedLog } from '../server/bounded-log.js';
import { loadPi } from '../server/pi-adapter.js';
import { guardSessionPersistence } from '../server/session-capacity.js';
import { NodeStorage } from '../server/node-storage.js';
import type { Run, Project } from '../shared/contracts.js';
const dir = () => mkdtempSync(join(tmpdir(), '存储 配额 '));
const quota = (error: unknown) => error instanceof AppError && error.status === 507;

test('fresh single storage walk includes unclassified files, database companions and nested groups without following links',()=>{
  const root=dir();mkdirSync(join(root,'assets','nested'),{recursive:true});mkdirSync(join(root,'sessions'));writeFileSync(join(root,'assets','nested','a'),Buffer.alloc(7));writeFileSync(join(root,'sessions','s'),Buffer.alloc(9));writeFileSync(join(root,'workbench.sqlite'),Buffer.alloc(11));writeFileSync(join(root,'workbench.sqlite-wal'),Buffer.alloc(13));writeFileSync(join(root,'credentials.json'),Buffer.alloc(17));writeFileSync(join(root,'other.bin'),Buffer.alloc(19));
  let usage=storageUsage(root,500);assert.equal(usage.measuredBytes,76);assert.deepEqual(usage.groups.assets,{bytes:7,files:1});assert.deepEqual(usage.groups.database,{bytes:24,files:2});assert.deepEqual(usage.groups.sessions,{bytes:9,files:1});assert.equal(usage.issues.length,0);writeFileSync(join(root,'other.bin'),Buffer.alloc(23));usage=storageUsage(root,500);assert.equal(usage.measuredBytes,80);
  const outside=dir();writeFileSync(join(outside,'external'),Buffer.alloc(100));symlinkSync(outside,join(root,'assets','linked'),process.platform==='win32'?'junction':'dir');usage=storageUsage(root,500);assert.equal(usage.measuredBytes,80);assert.equal(usage.groups.assets.bytes,7);assert(usage.issues.some(i=>i.includes('link skipped')));assert.throws(()=>new StorageCapacity(root,{minFreeBytes:0}).assert('assets',1),quota);
});

test('one prospective write checks all constraints against one fresh measurement, preserving reserve and external-change rejection',()=>{
  const root=dir();mkdirSync(join(root,'assets'));writeFileSync(join(root,'assets','old'),Buffer.from('keep'));
  const capacity=new StorageCapacity(root,{totalBytes:256*1024,databaseBytes:64*1024,assetsBytes:32,uploadsBytes:32,controlReserveBytes:1024,minFreeBytes:0});let measurements=0;const original=capacity.usage.bind(capacity);capacity.usage=()=>{measurements++;return original();};
  const checks=[{group:'uploads' as const,growth:8},{group:'assets' as const,growth:8,totalGrowth:32},{group:'database' as const,growth:16}];const usage=capacity.assertAll(checks);assert.equal(measurements,1);assert.equal(usage.groups.assets.bytes,4);
  writeFileSync(join(root,'unclassified.bin'),Buffer.alloc(256*1024-1024-4+1));assert.throws(()=>capacity.assertAll(checks),quota);assert.equal(measurements,2);assert.equal(readFileSync(join(root,'assets','old'),'utf8'),'keep');capacity.assertAll([{group:undefined,growth:1,control:true}]);assert.equal(measurements,3);
  assert.throws(()=>capacity.assertAll([{group:'assets',growth:1,totalGrowth:0}]),e=>e instanceof AppError&&e.status===400);assert.equal(measurements,3);assert.throws(()=>capacity.assertAll([]),e=>e instanceof AppError&&e.status===400);
});

test('upload preflight measures all three bounds once and rejects external asset growth before staging',async()=>{
  const root=dir(),app=createApp({dataDir:root,password:'capacity-password',schedule:false,storageLimits:{assetsBytes:32,uploadsBytes:32,minFreeBytes:0}});
  try{
    const capacity=app.store.capacity!;let measurements=0;const usage=capacity.usage.bind(capacity);capacity.usage=()=>{measurements++;return usage();};const original=capacity.assertAll.bind(capacity);const preflights:number[]=[];
    capacity.assertAll=(checks)=>{const before=measurements;try{return original(checks);}finally{if(checks.length===3)preflights.push(measurements-before);}};
    const p=app.service.createProject('preflight');const a=app.assets.write(p.id,'old.txt','text/plain','original');assert.deepEqual(preflights,[1]);writeFileSync(join(app.assets.dir,'external-retained.bin'),Buffer.alloc(25));const upload=app.assets.begin(p.id,'blocked.txt','text/plain');assert.throws(()=>app.assets.commit(upload.id,Buffer.from('x')),quota);assert.deepEqual(preflights,[1,1]);assert(!existsSync(join(app.assets.temp,upload.id)));assert.equal(app.snapshot().assets.length,1);assert.equal(app.assets.read(a).toString(),'original');
  }finally{await app.close();}
});

test('upload and asset category limits reject before file creation and preserve existing content', async () => {
  const root = dir(); const app = createApp({dataDir:root,password:'capacity-password',schedule:false,storageLimits:{uploadsBytes:8,assetsBytes:16}});
  try {
    const p=app.service.createProject('capacity'); const original=app.assets.write(p.id,'old.txt','text/plain','original'); const before=readFileSync(join(app.assets.dir,original.locator));
    const tooLarge=app.assets.begin(p.id,'too-large.txt','text/plain'); assert.throws(()=>app.assets.commit(tooLarge.id,Buffer.alloc(9)),quota); assert(!existsSync(join(app.assets.temp,tooLarge.id))); assert.equal(app.store.list('asset').length,1);
    const second=app.assets.write(p.id,'second.txt','text/plain','12345678'); const next=app.assets.begin(p.id,'next.txt','text/plain'); assert.throws(()=>app.assets.commit(next.id,Buffer.from('x')),quota); assert.deepEqual(app.assets.read(original),before); assert.equal(app.assets.read(second).length,8); assert.equal(readdirSync(app.assets.dir).length,2);
  } finally {await app.close();}
});

test('total capacity blocks new HTTP content but preserves read/export/login/cancel recovery paths', async () => {
  const root=dir(); const app=createApp({dataDir:root,password:'capacity-password',schedule:false,storageLimits:{totalBytes:2*1024*1024,databaseBytes:1024*1024,controlReserveBytes:128*1024,minFreeBytes:0}});
  await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r)); const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try {
    const p=app.service.createProject('recovery'); const old=app.assets.write(p.id,'old.md','text/markdown','existing evidence'); const draft=app.service.draft(p.id,'safe','body',[old.id]);
    const run=app.service.submit(p.id,'fixed','capacity-run','fixture',{version:4,projectId:p.id,toolNames:[],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:1,maxOutputTokens:10,timeoutMs:1000}).run;
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'capacity-password'})}); const cookie=login.headers.get('set-cookie')!.split(';')[0]; const headers={Cookie:cookie};
    const used=app.store.capacity!.usage().measuredBytes; const normalLimit=2*1024*1024-128*1024; writeFileSync(join(root,'retained-other-data.bin'),Buffer.alloc(normalLimit-used-512));
    const blocked=await fetch(base+'/api/projects',{method:'POST',headers,body:JSON.stringify({name:'must not create'})}); assert.equal(blocked.status,507); assert((await blocked.json()).error.includes('上限')); assert.equal(app.store.list('project').length,1);
    assert.equal((await fetch(base+'/api/snapshot',{headers})).status,200); assert.equal((await fetch(base+`/api/assets/${old.id}`,{headers})).status,200); assert.equal((await fetch(base+`/api/drafts/${draft.id}/export`,{headers})).status,200);
    assert.equal((await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'capacity-password'})})).status,200);
    assert.equal((await fetch(base+`/api/runs/${run.id}/cancel`,{method:'POST',headers,body:'{}'})).status,200); assert.equal(app.store.get<Run>('run',run.id).status,'cancelled'); assert.equal(app.assets.read(old).toString(),'existing evidence');
    const usage=await (await fetch(base+'/api/storage',{headers})).json(); assert.equal(usage.limits.totalBytes,2*1024*1024); assert(!JSON.stringify(usage).includes('capacity-password'));
  } finally {await app.close();}
});

test('SQLite engine main-file limit also rejects direct SQL growth and keeps committed rows', () => {
  const root=dir(); const store=new Store(join(root,'workbench.sqlite')); const capacity=new StorageCapacity(root,{totalBytes:2*1024*1024,databaseBytes:256*1024,controlReserveBytes:32*1024,minFreeBytes:0}); store.attachCapacity(capacity);
  try {
    store.create<Project>('project',{name:'retained',description:'',archived:false}); store.db.exec('CREATE TABLE capacity_probe(id INTEGER PRIMARY KEY,body BLOB)');
    assert.throws(()=>store.db.prepare('INSERT INTO capacity_probe(body) VALUES(?)').run(Buffer.alloc(1024*1024)));
    const size=Number(store.db.prepare('PRAGMA page_size').get()!.page_size); const pages=Number(store.db.prepare('PRAGMA page_count').get()!.page_count); assert(pages*size<=256*1024); assert.equal(store.list<Project>('project')[0].name,'retained');
  } finally {store.close();}
});

test('native Pi session capacity includes first buffered flush and rejects later append without corrupting file', async () => {
  const pi=await loadPi(); const root=dir(); const cwd=join(root,'workspaces','A'); const sessions=join(root,'sessions'); mkdirSync(cwd,{recursive:true});
  const small=new StorageCapacity(root,{sessionsBytes:100,minFreeBytes:0}); const denied=pi.SessionManager.create(cwd,sessions); const unhealthy=guardSessionPersistence(denied,small); denied.appendModelChange('anthropic','offline');
  assert.throws(()=>denied.appendMessage({role:'user',content:'first prompt',timestamp:Date.now()}),quota); assert(!existsSync(denied.getSessionFile()!)); assert.throws(unhealthy.assertHealthy,quota);
  const capacity=new StorageCapacity(root,{sessionsBytes:2048,minFreeBytes:0}); const manager=pi.SessionManager.create(cwd,sessions); const guard=guardSessionPersistence(manager,capacity); manager.appendModelChange('anthropic','offline'); manager.appendMessage({role:'user',content:'small prompt',timestamp:Date.now()});
  const file=manager.getSessionFile()!; const before=readFileSync(file); assert(before.toString().includes('small prompt')); assert(before.toString().includes('session')); assert.throws(()=>manager.appendCustomEntry('oversized', 'x'.repeat(4096)),quota); assert.deepEqual(readFileSync(file),before); assert.throws(guard.assertHealthy,quota); assert.equal(pi.SessionManager.open(file).getEntries().filter(e=>e.type==='message').length,1);
});

test('bounded logs stop appending at limit; workspace and disk headroom block before write', () => {
  const root=dir(); const capacity=new StorageCapacity(root,{logsBytes:140,workspacesBytes:16,minFreeBytes:0}); const log=new BoundedLog(capacity);
  for(let i=0;i<10;i++) log.record('scheduler_failure'); const file=join(root,'logs','host.jsonl'); assert(statSync(file).size<=140); assert(log.status().droppedRecords>0); const before=readFileSync(file); log.record('service_started'); assert.deepEqual(readFileSync(file),before);
  mkdirSync(join(root,'workspaces')); capacity.write('workspaces',8,()=>writeFileSync(join(root,'workspaces','existing'),Buffer.alloc(8))); assert.throws(()=>capacity.write('workspaces',9,()=>writeFileSync(join(root,'workspaces','blocked'),Buffer.alloc(9))),quota); assert(!existsSync(join(root,'workspaces','blocked')));
  const disk=new StorageCapacity(root,{minFreeBytes:Number.MAX_SAFE_INTEGER}); assert.throws(()=>disk.write('assets',1,()=>assert.fail('must not write')),quota); assert(existsSync(file));
});

test('live capacity lock rejects another writer; exceptions release owned lock without touching files', () => {
  const root=dir(); const a=new StorageCapacity(root,{minFreeBytes:0}); const b=new StorageCapacity(root,{minFreeBytes:0});
  assert.throws(()=>a.exclusive(()=>b.exclusive(()=>assert.fail('overlap'))),(e:unknown)=>e instanceof AppError&&e.status===423); assert(!existsSync(join(root,'.storage-write.lock'))); assert.equal(b.exclusive(()=>42),42);
  writeFileSync(join(root,'.storage-write.lock'),'invalid'); assert.throws(()=>a.exclusive(()=>0),(e:unknown)=>e instanceof AppError&&e.status===423); assert.equal(readFileSync(join(root,'.storage-write.lock'),'utf8'),'invalid');
});

test('native session writer waits for a live host writer and persists the prompt exactly once', async () => {
  const root=dir();const cwd=join(root,'workspaces','p');const sessions=join(root,'sessions','p');mkdirSync(cwd,{recursive:true});mkdirSync(sessions,{recursive:true});
  const pi=await loadPi();const manager=pi.SessionManager.create(cwd,sessions);const guard=guardSessionPersistence(manager,new StorageCapacity(root,{minFreeBytes:0},1000));
  const child=fork(resolve('tests/helpers/capacity-lock.ts'),[root,'250'],{execPath:process.execPath,execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],stdio:['ignore','ignore','ignore','ipc']});
  const gone=new Promise<void>(r=>child.once('exit',()=>r()));
  try {
    await new Promise<void>((r,reject)=>{const timer=setTimeout(()=>reject(new Error('lock fixture timeout')),10000);child.once('message',()=>{clearTimeout(timer);r();});child.once('error',reject);});
    const owner=JSON.parse(readFileSync(join(root,'.storage-write.lock'),'utf8'));assert.equal(owner.pid,child.pid);
    manager.appendMessage({role:'user',content:'ONE_NATIVE_PROMPT',timestamp:Date.now()});guard.assertHealthy();
    const rows=readFileSync(manager.getSessionFile()!,'utf8').trim().split('\n').map(s=>JSON.parse(s));assert.equal(rows.filter(r=>r.type==='message'&&r.message.content==='ONE_NATIVE_PROMPT').length,1);
    await gone;assert(!existsSync(join(root,'.storage-write.lock')));
  } finally {if(child.exitCode===null)child.kill();await gone;}
});

test('bounded writer waiting preserves live locks and never retries an entered callback', () => {
  const root=dir();const a=new StorageCapacity(root,{minFreeBytes:0});const b=new StorageCapacity(root,{minFreeBytes:0},30);let calls=0;
  a.exclusive(()=>{const original=readFileSync(join(root,'.storage-write.lock'),'utf8');assert.throws(()=>b.exclusive(()=>{calls++;}),e=>e instanceof AppError&&e.status===423);assert.equal(readFileSync(join(root,'.storage-write.lock'),'utf8'),original);});assert.equal(calls,0);
  assert.throws(()=>b.exclusive(()=>{calls++;throw new AppError(423,'其他进程正在写入，稍后重试');}),e=>e instanceof AppError&&e.status===423);assert.equal(calls,1);assert(!existsSync(join(root,'.storage-write.lock')));
});
test('node local capacity and colocated host capacity both reject writes while keeping receipts', () => {
  const root=dir(); const host=new StorageCapacity(root,{workspacesBytes:8,minFreeBytes:0}); const allowed=join(root,'node-workspace'); const storage=new NodeStorage(allowed,1024,host); storage.capacity.limits.minFreeBytes=0;
  const receipt=join(allowed,'receipt'); storage.write(receipt,'receipt',true); host.limits.totalBytes=host.usage().measuredBytes+host.limits.controlReserveBytes+4; assert.throws(()=>storage.write(join(allowed,'blocked'),'123456789',true),quota); assert.equal(readFileSync(receipt,'utf8'),'receipt');
  const isolated=new NodeStorage(dir(),1024); isolated.capacity.limits.minFreeBytes=0; assert.throws(()=>isolated.write(join(isolated.capacity.dataDir,'too-large'),'x'.repeat(1100),true),quota); assert.equal(readdirSync(isolated.capacity.dataDir).length,0);
  assert.throws(()=>isolated.write(join(isolated.capacity.dataDir,'..','outside'),'wrong',true),(e:unknown)=>e instanceof AppError&&e.status===403);
});
test('node receipt save interrupted before rename retains prior committed ledger', async () => {
  const root=dir(); const ledger=join(root,'node-ledger.json'); writeFileSync(ledger,'{"retained":true}');
  const child=fork(resolve('tests/helpers/node-ledger-crash.ts'),[root],{execPath:process.execPath,execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],stdio:['ignore','ignore','ignore','ipc']});
  await new Promise<void>((r,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('ledger fixture timeout'));},10000); child.once('message',()=>{clearTimeout(timer);r();});child.once('error',reject);});
  const gone=new Promise<void>(r=>child.once('exit',()=>r())); child.kill(); await gone; assert.equal(readFileSync(ledger,'utf8'),'{"retained":true}'); assert(existsSync(ledger+'.next'));
  const storage=new NodeStorage(root); storage.write(ledger,'{"reconciled":true}',false,true); assert.equal(readFileSync(ledger,'utf8'),'{"reconciled":true}'); assert(!existsSync(ledger+'.next'));
});

test('actual process death inside guarded write is reclaimed only after PID gone and retained data survives', async () => {
  const root=dir(); writeFileSync(join(root,'existing.txt'),'retained');
  const child=fork(resolve('tests/helpers/capacity-lock.ts'),[root],{execPath:process.execPath,execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],stdio:['ignore','ignore','ignore','ipc']});
  await new Promise<void>((r,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('capacity fixture timeout'));},10000); child.once('message',()=>{clearTimeout(timer);r();});child.once('error',reject);});
  const gone=new Promise<void>(r=>child.once('exit',()=>r())); child.kill(); await gone;
  const capacity=new StorageCapacity(root,{minFreeBytes:0}); assert.equal(capacity.exclusive(()=>7),7); assert(!existsSync(join(root,'.storage-write.lock'))); assert(!existsSync(join(root,'.storage-recovery.lock'))); assert.equal(readFileSync(join(root,'existing.txt'),'utf8'),'retained');
});
