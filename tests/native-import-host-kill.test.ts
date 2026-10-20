import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { NativeImports } from '../server/native-imports.js';
import { Store } from '../server/store.js';

async function recover(stage: 'before-write' | 'during-write' | 'after-sync') {
  const root = mkdtempSync(join(tmpdir(), 'import-kill-'));
  const helper = fileURLToPath(new URL('./helpers/import-kill-child.ts', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', helper, root, stage], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr?.on('data', chunk => { stderr += String(chunk); });
  const [code, signal] = await once(child, 'exit') as [number | null, NodeJS.Signals | null];
  assert.equal(existsSync(join(root, 'finished')), false, stderr || `exit ${code} ${signal}`);
  const bytes = readFileSync(join(root, 'payload.bin'));
  const ids = JSON.parse(readFileSync(join(root, 'ids.json'), 'utf8')) as { projectId: string; importId: string };
  const path = join(root, 'sessions', ids.projectId, `import-${ids.importId}.jsonl`);
  const torn = existsSync(path) ? readFileSync(path).length : 0;
  if (stage === 'before-write') assert.equal(torn, 0);
  if (stage === 'during-write') assert.ok(torn > 0 && torn < bytes.length);
  if (stage === 'after-sync') assert.equal(torn, bytes.length);
  const store = new Store(join(root, 'workbench.sqlite'));
  const imports = new NativeImports(store, root);
  try {
    const resumed = imports.write(ids.projectId, ids.importId, 0, bytes);
    assert.equal(resumed.received, bytes.length);
    assert.deepEqual(readFileSync(path), bytes);
    assert.equal(imports.write(ids.projectId, ids.importId, 0, bytes).received, bytes.length);
    const changed = Buffer.from(bytes);
    changed[0] ^= 1;
    assert.throws(() => imports.write(ids.projectId, ids.importId, 0, changed), (error: unknown) => error instanceof Error && /不一致/.test(error.message));
    assert.deepEqual(readFileSync(path), bytes);
  } finally { store.close(); }
}

test('host kill before an import write resumes the same bytes', async () => { await recover('before-write'); });
test('host kill during an import write keeps the prefix and resumes the same bytes', async () => { await recover('during-write'); });
test('host kill after import sync accepts the same bytes again', async () => { await recover('after-sync'); });
