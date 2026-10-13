import { StorageCapacity } from '../../server/storage.js';
const capacity=new StorageCapacity(process.argv[2],{minFreeBytes:0});
capacity.exclusive(()=>{ process.send!({locked:true}); const wait=new Int32Array(new SharedArrayBuffer(4)); Atomics.wait(wait,0,0,Number(process.argv[3] ?? 30000)); });
process.disconnect?.();
