import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../../server/store.js';

const [root, stage] = process.argv.slice(2);
if (!root || !['before-commit', 'after-commit'].includes(stage)) throw new Error('usage: sqlite-kill-child <root> <stage>');
const store = new Store(join(root, 'workbench.sqlite'));
type Note = import('../../shared/contracts.js').Entity & { marker: string };
store.create<Note>('note', { id: 'anchor', marker: 'ANCHOR' });
if (stage === 'before-commit') {
  store.db.exec('BEGIN IMMEDIATE');
  store.db.prepare('INSERT INTO entities VALUES(?,?,?,?,?)').run('note', 'pending', null, 1, JSON.stringify({ id: 'pending', revision: 1, createdAt: 'x', updatedAt: 'x', marker: 'UNCOMMITTED' }));
  writeFileSync(join(root, 'progress'), stage);
  process.kill(process.pid, 'SIGKILL');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  throw new Error('宿主进程没有在提交前停止');
}
store.create<Note>('note', { id: 'committed', marker: 'COMMITTED' });
writeFileSync(join(root, 'progress'), stage);
process.kill(process.pid, 'SIGKILL');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
throw new Error('宿主进程没有在提交后停止');
