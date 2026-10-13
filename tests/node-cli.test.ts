import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fork } from 'node:child_process';
import { createApp } from '../server/app.js';
import type { Run } from '../shared/contracts.js';
test('actual outbound node CLI writes only allowed directory and uploads a real receipt', async () => {
  const directory = mkdtempSync(join(tmpdir(), '实际电脑 节点 ')); const allowed = join(directory, 'permitted');
  const app = createApp({ dataDir: join(directory, 'server'), password: 'node-test-password', schedule: true });
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', () => r())); const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'node-test-password' }) }); const cookie = login.headers.get('set-cookie')!.split(';')[0];
  async function post(path: string, value: unknown) { const response = await fetch(base + path, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); assert(response.ok); return response.json(); }
  const project = await post('/api/projects', { name: 'node project' }); const paired = await post('/api/nodes', { name: 'real node', projectIds: [project.id] });
  const submitted = await post('/api/tasks', { projectId: project.id, mode: 'node', nodeId: paired.node.id, goal: '运行电脑节点可信文件验证', commandId: 'actual-node' });
  const child = fork(resolve('scripts/local-node.ts'), [], { cwd: directory, execPath: process.execPath, execArgv: ['--import', pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_SERVER: base, NODE_ID: paired.node.id, NODE_TOKEN: paired.token, NODE_ALLOWED_DIR: allowed }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  try {
    const deadline = Date.now() + 15000;
    while (app.store.get<Run>('run', submitted.run.id).status !== 'completed' && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
    assert.equal(app.store.get<Run>('run', submitted.run.id).status, 'completed'); assert(existsSync(join(allowed, submitted.run.id + '.md')));
    // Host completion precedes the outbound client's durable receipt acknowledgement.
    let ledger: Record<string,{sent:boolean}>={}; const receiptDeadline=Date.now()+5000;
    while(Date.now()<receiptDeadline){ if(existsSync(join(allowed,'node-ledger.json'))) ledger=JSON.parse(readFileSync(join(allowed,'node-ledger.json'),'utf8')); if(ledger[submitted.run.id]?.sent)break;await new Promise(r=>setTimeout(r,50)); }
    assert.equal(ledger[submitted.run.id].sent, true); const snap = app.snapshot(); assert.equal(snap.assets.length, 1); assert(app.assets.read(snap.assets[0]).toString().includes(submitted.run.id));
    const original = readFileSync(join(allowed, submitted.run.id + '.md'));
    assert.deepEqual(app.assets.read(snap.assets[0]), original, 'Uploaded node file must preserve final newline');
    const download = await fetch(base + '/api/assets/' + snap.assets[0].id, { headers: { Cookie: cookie } }); assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), original);
  } finally { const exited = new Promise<void>(r => child.once('exit', () => r())); child.kill(); await exited; await app.close(); }
});
