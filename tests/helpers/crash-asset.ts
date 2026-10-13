import { join } from 'node:path';
import { Store } from '../../server/store.js';
import { Assets } from '../../server/assets.js';
import { Service } from '../../server/service.js';
const [directory, stopAt] = process.argv.slice(2);
const store = new Store(join(directory, 'workbench.sqlite'));
const assets = new Assets(store, directory, 100000, (stage, upload) => {
  if (stage === stopAt) { process.send!({ stage, uploadId: upload.id }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); }
});
const p = new Service(store, assets).createProject('Crash fixture'); const upload = assets.begin(p.id, 'crash.md', 'text/plain'); assets.commit(upload.id, Buffer.from('fixed crash evidence'));
process.exit(0);
