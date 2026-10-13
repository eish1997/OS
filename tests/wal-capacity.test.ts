import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,lstatSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {Store,AppError} from '../server/store';
import {StorageCapacity} from '../server/storage';
import type {Project} from '../shared/contracts';

function fixture() {
  const directory=mkdtempSync(join(tmpdir(),'WAL 容量恢复 '));
  const store=new Store(join(directory,'workbench.sqlite'));
  const capacity=new StorageCapacity(directory,{totalBytes:4*1024**2,databaseBytes:512*1024,controlReserveBytes:32*1024,minFreeBytes:0});store.attachCapacity(capacity);
  store.db.exec('PRAGMA wal_autocheckpoint=0; PRAGMA busy_timeout=4500');
  const project=store.create<Project>('project',{name:'保留项目',description:'初始来源',archived:false});
  return {directory,store,capacity,project};
}

test('pinned real reader bounds WAL writes without long maintenance waits; release resumes same-size save and preserves committed content', () => {
  const {store,capacity,project}=fixture();
  const reader=new DatabaseSync(store.path,{readOnly:true});reader.exec('BEGIN');
  const pinned=String(reader.prepare('SELECT body FROM entities WHERE id=?').get(project.id)!.body);
  let current=project,blocked=false,writes=0,slowest=0;
  try {
    for(;writes<100;writes++) {
      const started=performance.now();
      try {current=store.update<Project>('project',current.id,current.revision,{description:`版本${writes} `+'固定内容'.repeat(1024)});}
      catch(e){assert(e instanceof AppError && e.status===507);blocked=true;}
      slowest=Math.max(slowest,performance.now()-started);if(blocked)break;
    }
    assert(blocked);assert(writes>2);assert(slowest<1500,'Maintenance must not wait for busy_timeout=4500');
    assert.equal(String(reader.prepare('SELECT body FROM entities WHERE id=?').get(project.id)!.body),pinned);
    assert.equal(store.get<Project>('project',project.id).description,current.description);
    assert.equal(Number(store.db.prepare('PRAGMA busy_timeout').get()!.timeout),4500);
    const before=capacity.usage().groups.database.bytes;
    reader.exec('COMMIT');reader.close();
    const next=store.update<Project>('project',current.id,current.revision,{description:'恢复保存 '+'固定内容'.repeat(1024)});
    assert.equal(next.revision,current.revision+1);assert(next.description.startsWith('恢复保存'));
    assert(capacity.usage().groups.database.bytes<before);
    assert.equal(Number(store.db.prepare('PRAGMA busy_timeout').get()!.timeout),4500);
    assert.equal(Object.values(store.db.prepare('PRAGMA integrity_check').get()!)[0],'ok');
    const reopened=new Store(store.path,{readOnly:true});try{assert.equal(reopened.get<Project>('project',project.id).description,next.description);}finally{reopened.close();}
  } finally {try{reader.close();}catch{}store.close();}
});

test('nested transaction never checkpoints mid-transaction and rolls back a full-log multi-write atomically', () => {
  const {store,project}=fixture();
  try {
    let current=project;
    for(let i=0;i<30;i++)current=store.update<Project>('project',current.id,current.revision,{description:'保留 '+'内容'.repeat(1024)});
    const before=store.get<Project>('project',project.id);
    assert.throws(()=>store.transaction(()=>{
      const changed=store.update<Project>('project',before.id,before.revision,{description:'本事务应回滚'});
      store.update<Project>('project',changed.id,changed.revision,{description:'x'.repeat(512*1024)});
    }),e=>e instanceof AppError&&e.status===507);
    assert.deepEqual(store.get<Project>('project',project.id),before);
    assert.equal(Number(store.db.prepare('PRAGMA busy_timeout').get()!.timeout),4500);
    const next=store.update<Project>('project',before.id,before.revision,{description:'后续可继续'});assert.equal(next.revision,before.revision+1);
  }finally{store.close();}
});

test('insufficient real disk headroom skips WAL maintenance and rejects writes without changing files or metadata', () => {
  const {store,capacity,project}=fixture();
  try {
    let current=project;
    for(let i=0;i<5;i++)current=store.update<Project>('project',current.id,current.revision,{description:'有限日志 '+'内容'.repeat(2048)});
    // Inflate only the headroom policy, never fill or format the host disk.
    const disk=capacity.usage().disk!;capacity.limits.minFreeBytes=disk.availableBytes+512*1024**2;
    const before=readFileSync(`${store.path}-wal`),row=store.get<Project>('project',project.id);
    assert.throws(()=>store.update<Project>('project',row.id,row.revision,{description:'不可写入'}),e=>e instanceof AppError&&e.status===507);
    assert.deepEqual(readFileSync(`${store.path}-wal`),before);assert.deepEqual(store.get<Project>('project',project.id),row);
    assert.equal(lstatSync(`${store.path}-wal`).size,before.length);
    assert.equal(Number(store.db.prepare('PRAGMA busy_timeout').get()!.timeout),4500);
  }finally{store.close();}
});
