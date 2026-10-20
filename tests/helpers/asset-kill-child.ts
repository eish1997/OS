import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Assets } from '../../server/assets.js';
import { Store } from '../../server/store.js';

const [dataDir, stage] = process.argv.slice(2);
if (!dataDir || !stage) throw new Error('usage: asset-kill-child <dataDir> <stage>');
mkdirSync(dataDir, { recursive: true });
const store = new Store(join(dataDir, 'workbench.sqlite'));
const bytes = Buffer.from('HOST_KILL_BYTES');
const hash = createHash('sha256').update(bytes).digest('hex');
const assets = new Assets(store, dataDir, 500 * 1024 * 1024, name => {
  if (name !== stage) return;
  process.kill(process.pid, 'SIGKILL');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  throw new Error('宿主进程没有在写盘检查点停止');
});
const upload = assets.begin('kill-project', 'note.txt', 'text/plain', [], { expectedHash: hash });
assets.commit(upload.id, bytes, hash);
writeFileSync(join(dataDir, 'finished'), '1');
store.close();
void assets;
