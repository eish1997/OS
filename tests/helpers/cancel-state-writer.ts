import {join} from 'node:path';
import {Store} from '../../server/store.js';
import {StorageCapacity} from '../../server/storage.js';
import type {Run} from '../../shared/contracts.js';
const root=process.argv[2],runId=process.argv[3];
const store=new Store(join(root,'workbench.sqlite'));const capacity=new StorageCapacity(root,{minFreeBytes:0});store.attachCapacity(capacity);
try{capacity.exclusive(()=>{
  process.send!({locked:true});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,700);
  store.transaction(()=>{const run=store.get<Run>('run',runId);const next=store.update<Run>('run',runId,run.revision,{status:'completed',endedAt:new Date().toISOString()});store.event('run.status',{status:'completed'},{projectId:run.projectId,runId,revision:next.revision});});
});}finally{store.close();process.disconnect?.();}
