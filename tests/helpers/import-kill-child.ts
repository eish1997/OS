import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NativeImports } from '../../server/native-imports.js';
import { Store } from '../../server/store.js';

const [root, stage] = process.argv.slice(2);
if (!root || !['before-write', 'during-write', 'after-sync'].includes(stage)) throw new Error('usage: import-kill-child <root> <stage>');
mkdirSync(root, { recursive: true });
const bytes = Buffer.concat([Buffer.from('IMPORT_KILL_'), Buffer.alloc(40, 0x61)]);
writeFileSync(join(root, 'payload.bin'), bytes);
const store = new Store(join(root, 'workbench.sqlite'));
const project = store.create('project', {});
const imports = new NativeImports(store, root, name => {
  if (name !== stage) return;
  process.kill(process.pid, 'SIGKILL');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  throw new Error('宿主进程没有在导入写盘检查点停止');
});
const record = imports.begin(String(project.id), 'killed.jsonl', bytes.length, createHash('sha256').update(bytes).digest('hex'), 'import-kill');
writeFileSync(join(root, 'ids.json'), JSON.stringify({ projectId: project.id, importId: record.id }));
imports.write(String(project.id), record.id, 0, bytes);
writeFileSync(join(root, 'finished'), '1');
store.close();
