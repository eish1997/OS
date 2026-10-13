import { nativePiTools } from '../shared/pi-tools.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { researchRequest, researchMarkdown } from '../server/research.js';
import { ResearchPanel } from '../src/research-panel.js';
import type { Asset, Run, Task } from '../shared/contracts.js';

const research = { url: 'https://github.com/example/reader', purpose: '把网页整理为资料' };
const fields = { overview: '测试资料声明可以整理正文。', fit: '适合采集资料，效果待试用。', overlap: '补充现有资料上传。', requirements: '许可证、费用和数据去向待核实。', recommendation: '先小样本验证。', nextStep: '用三篇公开文章比较完整性。' };
test('research input accepts repository roots and rejects unsupported or credential-bearing URLs', () => {
  assert.deepEqual(researchRequest({ ...research, url: research.url + '.git/' }), research);
  for (const url of ['http://github.com/a/b', 'https://github.com.evil/a/b', 'https://me:secret@github.com/a/b', 'https://github.com/a/b/tree/main', 'https://github.com/a/b?x=y', 'https://127.0.0.1/a/b', 'broken']) assert.throws(() => researchRequest({ ...research, url }));
  assert.throws(() => researchRequest({ ...research, purpose: '' }));
  assert.throws(() => researchMarkdown(research, { ...fields, fit: '' }, []));
});

test('research HTTP flow constrains tools, persists real source lineage, deduplicates and survives reopen', async () => {
  const previous = { ...config };
  Object.assign(config, { apiKey: 'offline-test-key', model: 'gpt-5.6-sol', maxCalls: 2, budgetUsd: 1, reservePerCallUsd: 0.1 });
  const dir = mkdtempSync(join(tmpdir(), 'research-flow-'));
  const app = createApp({ dataDir: dir, password: 'research-local-test-password', schedule: false, backup: { root: '' } });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  let cookie = '';
  const call = async (path: string, data?: unknown) => {
    const response = await fetch(base + '/api' + path, { method: data === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, value: await response.json() };
  };
  let cardId = '';
  try {
    assert.equal((await call('/tasks', { research })).status, 401);
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'research-local-test-password' }) });
    cookie = login.headers.get('set-cookie')!.split(';')[0];
    const project = (await call('/projects', { name: '研究测试' })).value;
    const request = { projectId: project.id, mode: 'pi', commandId: 'research-1', research, goal: '客户端无法替换研究指令', continueFromRunId: null };
    const accepted = await call('/tasks', request); assert.equal(accepted.status, 202, JSON.stringify(accepted.value));
    const { task, run } = accepted.value as { task: Task; run: Run };
    assert.deepEqual(task.context.research, research); assert.equal(task.context.view, 'research');
    assert.match(task.goal, /尚|没有执行第三方代码/); assert(!task.goal.includes('客户端无法替换'));
    for (const tool of [...nativePiTools, 'capture_source', 'read_asset', 'save_research', 'write_asset']) assert(run.policy.toolNames.includes(tool)); assert.equal(run.continuation, undefined);
    assert.equal((await call('/tasks', request)).value.run.id, run.id);
    assert.equal((await call('/tasks', { ...request, commandId: 'escape', requestedTools: ['unreviewed_extension'] })).status, 403);
    assert.equal((await call('/tasks', { ...request, commandId: 'fixture', mode: 'fixture' })).status, 400);
    app.service.transition(run.id, 'running');
    assert.throws(() => app.service.tool(run.id, 'save_research', fields), /先成功采集/);
    const url = 'https://api.github.com/repos/example/reader';
    const source = await app.service.executeOperation(run.id, 'capture-1', 'capture_source', { url }, () => app.service.captureSource(run.id, url, (async () => new Response('controlled source fixture', { status: 200 })) as typeof fetch)) as { assetId: string };
    const saved = await app.service.executeOperation(run.id, 'save-1', 'save_research', fields) as { id: string }; cardId = saved.id;
    assert.deepEqual(await app.service.executeOperation(run.id, 'save-1', 'save_research', fields), saved);
    const asset = app.store.get<Asset>('asset', cardId); assert.equal(asset.kind, 'research'); assert.deepEqual(asset.sourceIds, [source.assetId]);
    const content = app.assets.read(asset).toString(); assert.match(content, /尚未试用 · 尚未接入/); assert(content.includes(source.assetId)); assert(content.includes(url));
    assert.equal(app.store.list<Asset>('asset').filter(a => a.kind === 'research').length, 1);
    assert.equal(app.store.get<Run>('run', run.id).calls, 0);
    app.service.cancel(run.id); assert.throws(() => app.service.tool(run.id, 'save_research', fields), /到期/);
  } finally { await app.close(); Object.assign(config, previous); }
  const { Store } = await import('../server/store.js'); const reopened = new Store(join(dir, 'workbench.sqlite'), { readOnly: true });
  try { assert.equal(reopened.get<Asset>('asset', cardId).kind, 'research'); assert.equal(reopened.list<Task>('task')[0].context.research?.purpose, research.purpose); } finally { reopened.close(); }
});

test('research view separates execution completion from saved research and communicates future stages', () => {
  const task = { id: 't', projectId: 'p', context: { research } } as Task;
  const html = renderToStaticMarkup(createElement(ResearchPanel, { projectId: 'p', tasks: [task], runs: [{ id: 'r', taskId: 't', status: 'completed' } as Run], assets: [], modelReady: false, onSubmit: async () => {}, onOpen: () => {}, onTasks: () => {} }));
  assert.match(html, /本次执行未保存研究卡/); assert.match(html, /第三方扩展不会自动启用/); assert.match(html, /请先在设置中连接模型/); assert(!html.includes('阅读研究卡'));
});
