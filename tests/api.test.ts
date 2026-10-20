import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { fingerprint } from '../server/service.js';
import { config } from '../server/config.js';
import type { Project, Snapshot, Draft, Run, Asset, Task } from '../shared/contracts.js';
async function setup(schedule = false) {
  const app = createApp({ dataDir: mkdtempSync(join(tmpdir(), '工作台 HTTP ')), password: 'test-local-strong-password', schedule });
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', () => r())); const port = (app.server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  async function login() { const response = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-local-strong-password' }) }); assert.equal(response.status, 200); return response.headers.get('set-cookie')!.split(';')[0]; }
  const cookie = await login();
  async function call(path: string, data?: unknown, method = 'POST', useCookie = cookie) { const response = await fetch(base + '/api' + path, data === undefined ? { headers: { Cookie: useCookie } } : { method, headers: { Cookie: useCookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return { status: response.status, value: await response.json() }; }
  return { app, base, cookie, login, call };
}
test('HTTP selected-draft binding freezes host content and grants editing only for valid selected context', async () => {
  const previous={...config};Object.assign(config,{apiKey:'offline-unused-fixture-key',provider:'openai',model:'gpt-5.6-sol',maxCalls:2,budgetUsd:1,reservePerCallUsd:0.1});
  const {app,call}=await setup(false);
  try {
    const p=(await call('/projects',{name:'稿件HTTP项目'})).value as Project;
    const draft=(await call('/drafts',{projectId:p.id,title:'原稿',body:'宿主原文',sourceIds:[]})).value as Draft;
    const request={projectId:p.id,goal:'修改当前文章',mode:'pi',commandId:'draft-http',continueFromRunId:null,view:'drafts',selectedDraftId:draft.id,selectedDraftRevision:1,selectedDraft:{...draft,body:'客户端伪造原文'}};
    const accepted=await call('/tasks',request);assert.equal(accepted.status,202);
    const result=accepted.value as {task:Task;run:Run};assert.equal(result.task.context.selectedDraft?.body,'宿主原文');
    assert(result.run.policy.toolNames.includes('read_draft'));assert(result.run.policy.toolNames.includes('update_draft'));
    await call(`/drafts/${draft.id}`,{revision:1,title:'手动修改',body:'新内容'},'PATCH');
    assert.equal((await call('/tasks',request)).value.run.id,result.run.id);
    assert.equal((await call('/tasks',{...request,commandId:'stale-http'})).status,409);
    assert.equal((await call('/tasks',{...request,commandId:'invalid-rev',selectedDraftRevision:'1'})).status,400);
    assert.equal((await call('/tasks',{...request,commandId:'invalid-view',view:'results'})).status,400);
    const unbound=await call('/tasks',{projectId:p.id,goal:'一般任务',mode:'pi',commandId:'no-draft-http',continueFromRunId:null});
    assert.equal(unbound.status,202);assert(!unbound.value.run.policy.toolNames.includes('update_draft'));
    assert.equal((await call('/tasks',{projectId:p.id,goal:'请求编辑',mode:'pi',commandId:'forbidden-tools',requestedTools:['update_draft'],continueFromRunId:null})).status,403);
    const b=(await call('/projects',{name:'B'})).value as Project;
    assert.equal((await call('/tasks',{...request,projectId:b.id,commandId:'wrong-project',selectedDraftRevision:2})).status,403);
    assert.equal(app.store.list('draft').length,1);assert.equal(app.store.list<Run>('run').reduce((n,r)=>n+r.calls,0),0);
  } finally {await app.close();Object.assign(config,previous);}
});
test('unauthenticated API/events/files rejected; session revocation and CSRF', async () => {
  const { app, base, cookie, call, login } = await setup();
  try {
    for (const path of ['/api/snapshot', '/api/events', '/api/assets/missing']) assert.equal((await fetch(base + path)).status, 401);
    const foreign = await fetch(base + '/api/projects', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x' }) }); assert.equal(foreign.status, 403);
    const secondCookie = await login(); const sessions = await call('/sessions'); const target = sessions.value.find((s: { current: boolean }) => !s.current); await call('/sessions/revoke', { hash: target.hash }); assert.equal((await call('/snapshot', undefined, 'GET', secondCookie)).status, 401); assert.equal((await call('/snapshot')).status, 200);
    await call('/logout', {}); assert.equal((await call('/snapshot')).status, 401);
  } finally { await app.close(); }
});
test('development write origin is accepted only for a local HTTP deployment', async () => {
  const original = config.origin;
  const { app, base, cookie } = await setup();
  const create = (origin:string) => fetch(base+'/api/projects',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'origin boundary'})});
  try {
    config.origin='http://127.0.0.1:4310';
    assert.equal((await create('http://127.0.0.1:4311')).status,201);
    for (const remoteOrigin of ['https://studio.example','http://studio.example','https://localhost']) {
      config.origin=remoteOrigin;
      assert.equal((await create('http://127.0.0.1:4311')).status,403);
      assert.equal((await create(remoteOrigin)).status,201);
    }
    assert.equal(app.snapshot().projects.length,4,'Rejected writes must not create a project');
  } finally {config.origin=original;await app.close();}
});
test('upload ownership, safe preview, two-device drafts conflict and export sources', async () => {
  const { app, base, cookie, call, login } = await setup();
  try {
    const a = (await call('/projects', { name: 'A' })).value as Project; const b = (await call('/projects', { name: 'B' })).value as Project;
    const upload = (await call('/uploads', { projectId: a.id, name: 'unsafe.html', mime: 'text/html' })).value;
    const response = await fetch(base + '/api/uploads/' + upload.id, { method: 'PUT', headers: { Cookie: cookie }, body: '<script>alert(1)</script>' }); assert.equal(response.status, 200); const asset = await response.json() as Asset;
    const preview = await fetch(base + '/api/assets/' + asset.id, { headers: { Cookie: cookie } }); assert(preview.headers.get('content-type')!.startsWith('text/plain')); assert(preview.headers.get('content-disposition')!.startsWith('attachment')); assert(preview.headers.get('content-security-policy')!.includes('sandbox'));
    assert.equal((await call('/drafts', { projectId: b.id, title: 'b', body: 'x', sourceIds: [asset.id] })).status, 403);
    const draft = (await call('/drafts', { projectId: a.id, title: '文章', body: 'original', sourceIds: [asset.id] })).value as Draft;
    const phone = await login(); assert.equal((await call(`/drafts/${draft.id}`, { title: draft.title, body: 'desktop', revision: 1 }, 'PATCH')).status, 200);
    assert.equal((await call(`/drafts/${draft.id}`, { title: draft.title, body: 'phone', revision: 1 }, 'PATCH', phone)).status, 409);
    const exportResponse = await fetch(base + `/api/drafts/${draft.id}/export`, { headers: { Cookie: phone } }); const content = await exportResponse.text(); assert(content.includes(asset.hash)); assert(content.includes('desktop'));
  } finally { await app.close(); }
});
test('real deterministic worker saves chart/report/draft, frozen context and duplicate submits', async () => {
  const { app, call } = await setup(true);
  try {
    const a = (await call('/projects', { name: 'A' })).value as Project; await call('/projects', { name: 'B' });
    const request = { projectId: a.id, goal: '运行固定资料计算，保存报告、图表和文章草稿', commandId: 'same', mode: 'fixture' };
    const first = (await call('/tasks', request)).value; const second = (await call('/tasks', request)).value; assert.equal(first.run.id, second.run.id);
    const deadline = Date.now() + 20000; let snap: Snapshot;
    do { await new Promise(r => setTimeout(r, 100)); snap = app.snapshot(); } while (!['completed', 'failed', 'interrupted'].includes(snap.runs[0].status) && Date.now() < deadline);
    assert.equal(snap.runs[0].status, 'completed'); assert.equal(snap.runs.length, 1); assert.equal(snap.tasks[0].context.projectId, a.id); assert.equal(snap.tasks[0].acceptance, 'passed'); assert.equal(snap.assets.length, 2); assert.equal(snap.drafts.length, 1); assert(snap.assets.every(asset => asset.projectId === a.id));
    const report = app.assets.read(snap.assets.find(a => a.name.endsWith('.md'))!).toString(); assert(report.includes('合计：60')); assert(report.includes('平均：15')); assert.equal(snap.drafts[0].sourceIds.length, 2); assert.equal(snap.runs[0].calls, 0);
    assert(snap.runs[0].workerPid); assert(snap.runs[0].workerStartedAt); assert.equal((await call(`/runs/${snap.runs[0].id}/cancel`, {})).value.status, 'completed');
  } finally { await app.close(); }
});
test('SSE replay is ordered and an already-open stream closes on session revoke', async () => {
  const { app, base, cookie, call } = await setup();
  try {
    await call('/projects', { name: 'SSE A' }); await call('/projects', { name: 'SSE B' });
    const response = await fetch(base + '/api/events?after=1', { headers: { Cookie: cookie } }); assert.equal(response.status, 200); const reader = response.body!.getReader(); const first = await reader.read(); const text = Buffer.from(first.value!).toString(); assert(text.includes('id: 2')); assert(!text.includes('id: 1\n'));
    await call('/logout', {}); const deadline = Date.now() + 3000; let done = false;
    while (!done && Date.now() < deadline) done = (await reader.read()).done;
    assert(done); await reader.cancel();
  } finally { await app.close(); }
});
test('node pairing scopes, offline wait, receipt replay and revoke', async () => {
  const { app, base, call } = await setup(true);
  try {
    const a = (await call('/projects', { name: 'A' })).value as Project; const b = (await call('/projects', { name: 'B' })).value as Project;
    const paired = (await call('/nodes', { name: 'test PC', projectIds: [a.id] })).value;
    assert.equal((await call('/tasks', { projectId: b.id, mode: 'node', nodeId: paired.node.id, goal: 'x', commandId: 'wrong' })).status, 403);
    const submitted = (await call('/tasks', { projectId: a.id, mode: 'node', nodeId: paired.node.id, goal: 'x', commandId: 'node1' })).value;
    app.scheduler.tick(); assert.equal(app.store.get<Run>('run', submitted.run.id).status, 'waiting_node');
    const headers = { 'Content-Type': 'application/json', 'X-Node-Id': paired.node.id, Authorization: `Bearer ${paired.token}` };
    await fetch(base + '/api/node/poll', { method: 'POST', headers, body: '{}' }); app.scheduler.tick(); app.scheduler.tick(); assert.equal(app.store.get<Run>('run', submitted.run.id).status, 'running');
    const resultRequest = { runId: submitted.run.id, content: '  # 中文 node receipt\r\n\t正文保留空格。  \r\n' };
    const result = await fetch(base + '/api/node/result', { method: 'POST', headers, body: JSON.stringify(resultRequest) }); assert.equal(result.status, 200); const resultId = (await result.json()).assetId;
    const replay = await fetch(base + '/api/node/result', { method: 'POST', headers, body: JSON.stringify(resultRequest) }); assert.equal((await replay.json()).assetId, resultId); assert.equal(app.store.list<Asset>('asset').length, 1);
    assert.deepEqual(app.assets.read(app.store.get<Asset>('asset',resultId)),Buffer.from(resultRequest.content));
    const changed = await fetch(base + '/api/node/result', { method: 'POST', headers, body: JSON.stringify({...resultRequest,content:resultRequest.content.trim()}) }); assert.equal(changed.status,409); assert.equal(app.store.list<Asset>('asset').length,1);
    await call('/nodes/revoke', { id: paired.node.id }); assert.equal((await fetch(base + '/api/node/poll', { method: 'POST', headers, body: '{}' })).status, 401);
  } finally { await app.close(); }
});

test('legacy trimmed node receipt replays after upgrade without changing or duplicating its original asset', async () => {
  const { app, base, call } = await setup();
  try {
    const project = (await call('/projects', { name: 'legacy receipt' })).value as Project;
    const paired = (await call('/nodes', { name: 'legacy PC', projectIds: [project.id] })).value;
    const headers = { 'Content-Type':'application/json', 'X-Node-Id':paired.node.id, Authorization:`Bearer ${paired.token}` };
    await fetch(base+'/api/node/poll',{method:'POST',headers,body:'{}'});
    const submitted = (await call('/tasks',{projectId:project.id,mode:'node',nodeId:paired.node.id,goal:'legacy receipt replay',commandId:'legacy-node'})).value;
    app.scheduler.tick(); app.scheduler.tick(); const run = app.store.get<Run>('run',submitted.run.id); assert.equal(run.status,'running');
    const original = '  # 旧节点文件\r\n\t保留既有回执。  \r\n'; const oldContent = original.trim();
    const recorded = app.store.command(`node-result:${run.id}`,fingerprint({content:oldContent}),()=>{
      const asset = app.assets.write(project.id,'旧节点原件.md','text/markdown',oldContent,run.id);
      app.store.update<Run>('run',run.id,run.revision,{resultAssetIds:[asset.id]}); app.scheduler.finish(run.id,true); return {assetId:asset.id,reconciled:true};
    });
    const replay = await fetch(base+'/api/node/result',{method:'POST',headers,body:JSON.stringify({runId:run.id,content:original})}); assert.equal(replay.status,200); assert.equal((await replay.json()).assetId,recorded.assetId);
    assert.equal(app.store.list<Asset>('asset').length,1); assert.deepEqual(app.assets.read(app.store.get<Asset>('asset',recorded.assetId)),Buffer.from(oldContent));
    const changed = await fetch(base+'/api/node/result',{method:'POST',headers,body:JSON.stringify({runId:run.id,content:original.replace('既有','不同')})}); assert.equal(changed.status,409); assert.equal(app.store.list<Asset>('asset').length,1);
  } finally {await app.close();}
});
