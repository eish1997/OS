import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {Store,AppError} from '../../server/store';
import {StorageCapacity} from '../../server/storage';
import type {Project} from '../../shared/contracts';
const directory=mkdtempSync(join(tmpdir(),'工作台 WAL049 '));
const store=new Store(join(directory,'workbench.sqlite'));
const capacity=new StorageCapacity(directory,{totalBytes:4*1024**2,databaseBytes:512*1024,controlReserveBytes:32*1024,minFreeBytes:0});store.attachCapacity(capacity);
store.db.exec('PRAGMA wal_autocheckpoint=0');
let project=store.create<Project>('project',{name:'WAL受控验证',description:'原内容',archived:false});
const reader=new DatabaseSync(store.path,{readOnly:true});reader.exec('BEGIN');reader.prepare('SELECT body FROM entities WHERE id=?').get(project.id);
let writes=0;let blocked='';
try {
  for(;writes<100;writes++){
    try {project=store.update<Project>('project',project.id,project.revision,{description:`版本${writes} `+'固定内容'.repeat(1024)});}
    catch(e){if(!(e instanceof AppError&&e.status===507))throw e;blocked=e.message;break;}
  }
  const pinned=capacity.usage();reader.exec('COMMIT');reader.close();
  let afterRelease='';
  try {project=store.update<Project>('project',project.id,project.revision,{description:'释放只读会话后继续写入 '+'固定内容'.repeat(1024)});afterRelease='saved';}
  catch(e){if(!(e instanceof AppError&&e.status===507))throw e;afterRelease=e.message;}
  const checkpoint=store.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  const afterCheckpoint=capacity.usage();
  project=store.update<Project>('project',project.id,project.revision,{description:'显式checkpoint后继续写入'});
  const phase=process.argv[2];assert.equal(phase,'after','This probe now only records the fixed result; preserve before evidence');assert.equal(afterRelease,'saved');
  const result={at:new Date().toISOString(),phase,directory,writes,blocked,readerPinned:{databaseBytes:pinned.groups.database.bytes,diskAvailableBytes:pinned.disk?.availableBytes},afterRelease,checkpoint,afterCheckpoint:{databaseBytes:afterCheckpoint.groups.database.bytes},finalBody:project.description,scope:'Synthetic bounded local WAL pressure; not host disk exhaustion',modelRequests:0};
  writeFileSync('output/dev-evidence/wal-049-after.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{try{reader.close();}catch{}store.close();}
