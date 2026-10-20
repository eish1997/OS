import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { Assets } from '../server/assets.js';
import { Store } from '../server/store.js';
import type { Asset } from '../shared/contracts.js';

const hash = createHash('sha256').update('HOST_KILL_BYTES').digest('hex');

async function recover(stage: string) {
  const dataDir = mkdtempSync(join(tmpdir(), 'asset-kill-'));
  const helper = fileURLToPath(new URL('./helpers/asset-kill-child.ts', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', helper, dataDir, stage], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr?.on('data', chunk => { stderr += String(chunk); });
  await once(child, 'exit');
  assert.equal(existsSync(join(dataDir, 'finished')), false, stderr);
  const store = new Store(join(dataDir, 'workbench.sqlite'));
  const assets = new Assets(store, dataDir);
  try {
    const saved = store.list<Asset>('asset');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].status, 'ready');
    assert.equal(saved[0].hash, hash);
    assert.equal(assets.read(saved[0]).toString(), 'HOST_KILL_BYTES');
    const upload = store.list<import('../shared/contracts.js').Entity & { state: string }>('upload')[0];
    assert.equal(upload.state, 'done');
    assert.equal(assets.commit(upload.id, Buffer.from('HOST_KILL_BYTES')).id, saved[0].id);
  } finally {
    await assets.searchIndex.close();
    store.close();
  }
}

test('host kill during upload resumes the same asset from durable bytes', { timeout: 60000 }, async () => {
  for (const stage of ['staged', 'intent', 'renamed']) await recover(stage);
});

test('an unfinished upload partial is discarded and stays unregistered', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'asset-partial-'));
  const store = new Store(join(dataDir, 'workbench.sqlite'));
  const assets = new Assets(store, dataDir);
  const upload = assets.begin('kill-project', 'note.txt', 'text/plain', [], { expectedHash: hash });
  writeFileSync(join(assets.temp, `${upload.id}.partial`), Buffer.from('torn'));
  await assets.searchIndex.close();
  store.close();
  const reopened = new Store(join(dataDir, 'workbench.sqlite'));
  const recovered = new Assets(reopened, dataDir);
  try {
    assert.equal(reopened.list('asset').length, 0);
    assert.equal(readdirSync(recovered.temp).some(file => file.endsWith('.partial')), false);
    assert.equal(reopened.list<import('../shared/contracts.js').Entity & { state: string }>('upload')[0].state, 'pending');
  } finally {
    await recovered.searchIndex.close();
    reopened.close();
  }
});
