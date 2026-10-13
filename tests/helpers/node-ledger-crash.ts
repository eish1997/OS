import { join } from 'node:path';
import { NodeStorage } from '../../server/node-storage.js';
const storage=new NodeStorage(process.argv[2],undefined,undefined,()=>{process.send!({staged:true});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);});
storage.write(join(process.argv[2],'node-ledger.json'),'{"next":true}',false,true);
