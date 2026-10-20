import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Store } from '../server/store.js';

function markers(root: string) {
  const store = new Store(join(root, 'workbench.sqlite'));
  try {
    const synchronous = Number(store.db.prepare('PRAGMA synchronous').get()!.synchronous);
    const notes = store.list<import('../shared/contracts.js').Entity & { marker: string }>('note').map(note => note.marker).sort();
    return { synchronous, notes };
  } finally { store.close(); }
}

async function killDuring(stage: 'before-commit' | 'after-commit') {
  const root = mkdtempSync(join(tmpdir(), 'sqlite-kill-'));
  const helper = fileURLToPath(new URL('./helpers/sqlite-kill-child.ts', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', helper, root, stage], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore' });
  const progress = join(root, 'progress');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !existsSync(progress)) await delay(20);
  assert.equal(existsSync(progress), true);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await new Promise<void>(resolve => child.once('exit', () => resolve()));
  }
  assert.equal(existsSync(join(root, 'finished')), false);
  return markers(root);
}

test('killing the host before commit drops the open transaction and keeps the committed row', { timeout: 30000 }, async () => {
  const opened = await killDuring('before-commit');
  assert.equal(opened.synchronous, 2);
  assert.deepEqual(opened.notes, ['ANCHOR']);
});

test('killing the host after commit keeps the committed rows', { timeout: 30000 }, async () => {
  const opened = await killDuring('after-commit');
  assert.equal(opened.synchronous, 2);
  assert.deepEqual(opened.notes, ['ANCHOR', 'COMMITTED']);
});
