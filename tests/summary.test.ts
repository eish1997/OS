import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, AppError } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import { backup, restore } from '../server/backup.js';
import { createApp } from '../server/app.js';
import type { Asset, Memory, Policy, ProjectSummary, Task } from '../shared/contracts.js';
const policy = (projectId: string): Policy => ({ version: 2, projectId, toolNames: ['read_project_summary', 'write_project_summary'], allowModel: false, maxCalls: 0, maxCostUsd: 0, reservePerCallUsd: 1, maxOutputTokens: 100, timeoutMs: 10000 });
const fields = (sourceIds: string[]) => ({ goal: '验证记忆', progress: '仅完成资料研究', decisions: '只读研究，不运行下载代码', nextStep: '固定对比', sourceIds });
test('confirmed summary and selected view freeze at submission; candidate, cross-scope and conflict rejected', () => {
  const directory = mkdtempSync(join(tmpdir(), '摘要 确认 ')); const store = new Store(join(directory, 'workbench.sqlite')); const assets = new Assets(store, directory); const service = new Service(store, assets);
  try {
    const a = service.createProject('A'); const b = service.createProject('B'); const file = assets.write(a.id, '研究.md', 'text/markdown', '第一版\r\n中文材料'); const other = assets.write(b.id, 'B.md', 'text/markdown', 'B');
    assert.throws(() => service.saveSummary(a.id, 0, fields([other.id]), true), (e: unknown) => e instanceof AppError && e.status === 403);
    const summary = service.saveSummary(a.id, 0, fields([file.id]), true);
    const first = service.submit(a.id, '验证A', 'submit', 'fixture', policy(a.id), [file.id], undefined, { view: 'summary', selectedAssetId: file.id });
    service.saveSummary(a.id, summary.revision, { ...fields([file.id]), decisions: '新的决定' }, true);
    assert.equal(store.get<Task>('task', first.task.id).context.summary?.decisions, fields([]).decisions); assert.equal(first.task.context.view, 'summary'); assert.equal(first.task.context.selectedAssetId, file.id);
    assert.equal(service.submit(a.id, '验证A', 'submit', 'fixture', policy(a.id), [file.id], undefined, { view: 'summary', selectedAssetId: file.id }).run.id, first.run.id);
    assert.throws(() => service.saveSummary(a.id, 1, fields([]), true), (e: unknown) => e instanceof AppError && e.status === 409);
    assert.throws(() => assets.remove(file.id, file.revision));
    service.transition(first.run.id, 'running'); const candidate = service.tool(first.run.id, 'write_project_summary', { ...fields([file.id]), revision: 2 }) as ProjectSummary;
    assert.equal(candidate.confirmed, false); assert.equal((service.tool(first.run.id, 'read_project_summary', {}) as ProjectSummary).revision, 1);
    const next = service.submit(a.id, '新任务', 'next', 'fixture', policy(a.id)); assert.equal(next.task.context.summary, undefined);
    assert.throws(() => service.submit(a.id, 'x', 'bad', 'fixture', policy(b.id)));
    assert.throws(() => service.submit(a.id, 'x', 'bad-object', 'fixture', policy(a.id), [file.id], undefined, { view: 'results', selectedAssetId: other.id }));
  } finally { store.close(); }
});
test('durable project conversation paginates beyond latest events and survives reopen without mixing scopes', () => {
  const directory = mkdtempSync(join(tmpdir(), '对话 重开 ')); let store = new Store(join(directory, 'workbench.sqlite')); let service = new Service(store, new Assets(store, directory)); const a = service.createProject('A'); const b = service.createProject('B');
  for (let i = 0; i < 31; i++) { const run = service.submit(a.id, `目标${i}`, `a-${i}`, 'fixture', policy(a.id)).run; store.event('assistant.text', { text: `成果${i}` }, { projectId: a.id, runId: run.id }); store.event('assistant.text', { text: 'B的私有内容' }, { projectId: b.id }); }
  for (let i = 0; i < 600; i++) store.event('irrelevant.event', { i });
  store.close(); store = new Store(join(directory, 'workbench.sqlite')); service = new Service(store, new Assets(store, directory));
  try { const newest = service.conversation(a.id); assert.equal(newest.messages.length, 50); assert(newest.olderThan); const older = service.conversation(a.id, newest.olderThan); assert.equal(older.messages.length, 12); assert.equal(older.olderThan, undefined); const all = [...older.messages, ...newest.messages]; assert.equal(all[0].text, '目标0'); assert.equal(all.at(-1)?.text, '成果30'); assert.equal(new Set(all.map(m => m.id)).size, 62); assert(all.every((m, i) => i === 0 || m.sequence > all[i - 1].sequence)); assert(!all.some(m => m.text.includes('B的'))); } finally { store.close(); }
});
test('agent memory proposals remain project-scoped and excluded until explicit versioned confirmation', async () => {
  const directory = mkdtempSync(join(tmpdir(), '候选 记忆 ')); const app = createApp({ dataDir: directory, password: 'candidate-password', schedule: false });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const a = app.service.createProject('A'); const b = app.service.createProject('B'); const file = app.assets.write(a.id, 'source.md', 'text/markdown', 'evidence'); const other = app.assets.write(b.id, 'b.md', 'text/markdown', 'other');
  const run = app.service.submit(a.id, 'proposal', 'proposal', 'fixture', { ...policy(a.id), toolNames: ['propose_memory'] }).run; app.service.transition(run.id, 'running');
  try {
    assert.throws(() => app.service.tool(run.id, 'propose_memory', { text: 'bad', sourceIds: [other.id] }));
    const memory = app.service.tool(run.id, 'propose_memory', { text: '项目偏好', sourceIds: [file.id], confirmed: true }) as Memory;
    assert.equal(memory.confirmed, false); assert.equal(memory.projectId, a.id); assert.equal(app.service.memories(a.id).length, 0); assert.equal(app.service.memories(b.id).length, 0); assert.equal(memory.sourceRunId, run.id); assert.deepEqual(memory.sourceIds, [file.id]); assert.throws(() => app.assets.remove(file.id, file.revision));
    const endpoint = base + `/api/memories/${memory.id}/confirm`; assert.equal((await fetch(endpoint, { method: 'POST', body: JSON.stringify({ revision: 1 }) })).status, 401);
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'candidate-password' }) }); const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const confirm = await fetch(endpoint, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ revision: 1 }) }); assert.equal(confirm.status, 200); assert.equal(app.service.memories(a.id).length, 1); assert.equal(app.service.memories(b.id).length, 0);
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ revision: 1 }) })).status, 409);
    const current = app.store.get<Memory>('memory', memory.id); app.service.reviseMemory(memory.id, current.revision, undefined, undefined, true); assert.throws(() => app.service.confirmMemory(memory.id, current.revision + 1)); assert.equal(app.service.memories(a.id).length, 0);
  } finally { await app.close(); }
});
test('summary HTTP permission and revision conflict, sources and frozen task survive joint restore', async () => {
  const directory = mkdtempSync(join(tmpdir(), '摘要 HTTP 恢复 ')); const app = createApp({ dataDir: join(directory, 'data'), password: 'summary-password', schedule: false });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'summary-password' }) }); const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const a = app.service.createProject('A'); const file = app.assets.write(a.id, '源.md', 'text/markdown', 'source'); const endpoint = base + `/api/projects/${a.id}/summary`;
  try {
    assert.equal((await fetch(endpoint)).status, 401);
    const saved = await fetch(endpoint, { method: 'PUT', headers: { Cookie: cookie }, body: JSON.stringify({ ...fields([file.id]), revision: 0 }) }); assert.equal(saved.status, 200);
    const conflict = await fetch(endpoint, { method: 'PUT', headers: { Cookie: cookie }, body: JSON.stringify({ ...fields([file.id]), revision: 0 }) }); assert.equal(conflict.status, 409);
    app.service.submit(a.id, 'restore', 'restore', 'fixture', policy(a.id));
    assert.equal((await fetch(base + `/api/projects/${a.id}/conversation?before=oops`, { headers: { Cookie: cookie } })).status, 400);
  } finally { await app.close(); }
  const pack = join(directory, 'backup'); const data = join(directory, 'data'); const original = new Store(join(data, 'workbench.sqlite'));
  try { backup(original, data, pack); } finally { original.close(); }
  const target = join(directory, 'restored'); restore(pack, target); const store = new Store(join(target, 'workbench.sqlite'));
  try { assert.equal(store.list<ProjectSummary>('summary')[0].sourceIds[0], file.id); assert.equal(store.list<Task>('task')[0].context.summary?.goal, '验证记忆'); assert.equal(new Assets(store, target).read(store.list<Asset>('asset')[0]).toString(), 'source'); } finally { store.close(); }
});
