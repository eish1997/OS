import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Store, AppError } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import { backup, restore } from '../server/backup.js';
import type { Policy, Run, Memory, Draft, Asset } from '../shared/contracts.js';
const temp = () => mkdtempSync(join(tmpdir(), '工作台 tests with spaces '));
const policy = (projectId: string): Policy => ({ version: 1, projectId, allowModel: true, toolNames: ['read_asset', 'write_asset', 'search_memory', 'create_draft'], maxCalls: 2, maxCostUsd: 2, reservePerCallUsd: 1, maxOutputTokens: 100, timeoutMs: 10000 });
function setup() { const dir = temp(); const store = new Store(join(dir, 'workbench.sqlite')); const assets = new Assets(store, dir); return { dir, store, assets, service: new Service(store, assets) }; }
test('command idempotency, conflict and durable ordered events', () => {
  const { store, service, dir } = setup(); const p = service.createProject('研究 A');
  const first = service.submit(p.id, 'goal', 'cmd', 'fixture', policy(p.id)); const again = service.submit(p.id, 'goal', 'cmd', 'fixture', policy(p.id)); assert.equal(first.run.id, again.run.id); assert.equal(store.list('run').length, 1);
  assert.throws(() => service.submit(p.id, 'other', 'cmd', 'fixture', policy(p.id)), (e: unknown) => e instanceof AppError && e.status === 409);
  const events = store.events(0); assert.equal(events.length, 2); assert(events[1].sequence > events[0].sequence); assert.equal(store.events(events[0].sequence).length, 1);
  store.close(); const opened = new Store(join(dir, 'workbench.sqlite')); assert.equal(opened.list('run').length, 1); assert.equal(opened.cursor(), 2); opened.close();
});
test('terminal state rejects late updates, cancel and retry keep task context', () => {
  const { service, store } = setup(); const p = service.createProject('A'); const r = service.submit(p.id, 'x', 'x', 'fixture', policy(p.id)).run;
  service.transition(r.id, 'running'); service.cancel(r.id); assert.equal(store.get<Run>('run', r.id).cancelRequested, true); service.transition(r.id, 'cancelled'); assert.throws(() => service.transition(r.id, 'running'));
  const retry = service.retry(r.id, 'retry'); assert.equal(retry.taskId, r.taskId); assert.equal(retry.parentRunId, r.id); assert.equal(retry.attempt, 2); assert.equal(retry.projectId, p.id); store.close();
});
test('assets immutable, upload replay checked, hash tamper detected, quotas enforce', () => {
  const { service, store, assets } = setup(); const p = service.createProject('A'); const upload = assets.begin(p.id, '中文 空格.md', 'text/markdown'); const a = assets.commit(upload.id, Buffer.from('one\r\ntwo'));
  assert.equal(assets.commit(upload.id, Buffer.from('one\r\ntwo')).id, a.id); assert.throws(() => assets.commit(upload.id, Buffer.from('changed')));
  const versionUpload = assets.begin(p.id, a.name, a.mime, [], { parentVersionId: a.id }); const next = assets.commit(versionUpload.id, Buffer.from('v2')); assert.equal(next.version, 2); assert.equal(assets.read(a).toString(), 'one\r\ntwo');
  writeFileSync(join(assets.dir, a.locator), 'tampered'); assert.throws(() => assets.read(a));
  assets.quotaBytes = 1; assert.throws(() => assets.write(p.id, 'quota.md', 'text/plain', 'too long')); assert.throws(() => assets.begin(p.id, '../secret', 'text/plain')); store.close();
});
test('asset reconciliation recovers committed content but missing writes fail', () => {
  const { service, store, assets, dir } = setup(); const p = service.createProject('A'); const upload = assets.begin(p.id, 'recovered.md', 'text/plain');
  const content = Buffer.from('recover'); const hash = createHash('sha256').update(content).digest('hex');
  store.update('upload', upload.id, 1, { ...({ state: 'committing', assetId: 'recovery-test', expectedHash: hash } as object) }); writeFileSync(join(assets.temp, upload.id), content);
  const other = assets.begin(p.id, 'missing.md', 'text/plain'); store.update('upload', other.id, 1, { ...({ state: 'committing', assetId: 'missing-test', expectedHash: hash } as object) });
  const recovered = new Assets(store, dir); assert.equal(store.list<Asset>('asset').length, 1); assert.equal(recovered.read(store.get('asset', 'recovery-test')).toString(), 'recover'); assert.equal((store.get('upload', other.id) as unknown as { state: string }).state, 'failed'); store.close();
});
test('project tools reject cross-scope reads and cancelled tool calls', () => {
  const { service, store, assets } = setup(); const a = service.createProject('A'); const b = service.createProject('B'); const asset = assets.write(a.id, 'private.md', 'text/plain', 'A private');
  const r = service.submit(b.id, 'goal', 'b', 'fixture', policy(b.id)).run; service.transition(r.id, 'running'); assert.throws(() => service.tool(r.id, 'read_asset', { assetId: asset.id })); assert.throws(() => service.tool(r.id, 'write_asset', { projectId: a.id, name: 'x', content: 'x' })); assert.throws(() => service.tool(r.id, 'bash', { command: 'dir' })); service.cancel(r.id); assert.throws(() => service.tool(r.id, 'search_memory', {})); store.close();
});
test('memory provenance, confirmation, correction, scope and deletion', () => {
  const { service, store } = setup(); const a = service.createProject('A'); const b = service.createProject('B');
  service.memory({ kind: 'preference', text: '中文', source: '用户', confirmed: true }); const m = service.memory({ projectId: a.id, kind: 'project', text: 'old', source: '用户决定', confirmed: true }); service.memory({ projectId: a.id, kind: 'inference', text: '猜测', source: '网页', confirmed: false });
  assert.equal(service.memories(a.id).length, 2); assert.equal(service.memories(b.id).length, 1);
  const corrected = service.reviseMemory(m.id, m.revision, 'new'); assert.equal(corrected.supersedes, m.id); assert.equal(corrected.source, m.source); assert(!service.memories(a.id).some(x => x.text === 'old'));
  service.reviseMemory(corrected.id, corrected.revision, undefined, undefined, true); assert(!service.memories(a.id).some(x => x.text === 'new')); assert.equal(store.get<Memory>('memory', corrected.id).deleted, true); store.close();
});
test('draft revision conflicts preserve both device intent and asset provenance', () => {
  const { service, store, assets } = setup(); const p = service.createProject('A'); const source = assets.write(p.id, 'source.md', 'text/plain', 'source'); const d = service.draft(p.id, 'title', 'original', [source.id]);
  service.updateDraft(d.id, 1, 'title', 'desktop'); assert.throws(() => service.updateDraft(d.id, 1, 'title', 'phone')); assert.equal(store.get<Draft>('draft', d.id).body, 'desktop'); store.close();
});
test('two stores cannot claim same live lease and concurrent budgets cannot overreserve', () => {
  const { service, store, dir } = setup(); const second = new Store(join(dir, 'workbench.sqlite')); assert(store.lease('scheduler', 'one', 10000)); assert(!second.lease('scheduler', 'two', 10000)); store.release('scheduler', 'one'); assert(second.lease('scheduler', 'two', 10000));
  const p = service.createProject('A'); const r1 = service.submit(p.id, 'x', '1', 'pi', policy(p.id)).run; const r2 = service.submit(p.id, 'y', '2', 'pi', policy(p.id)).run; service.transition(r1.id, 'running'); service.transition(r2.id, 'running'); service.reserveCall(r1.id, 2, 1); const svc2 = new Service(second, new Assets(second, dir)); assert.throws(() => svc2.reserveCall(r2.id, 2, 1)); service.settleCall(r1.id); assert.equal(store.get<Run>('run', r1.id).spentUsd, 1); assert.throws(() => service.reserveCall(r2.id, 2, 1)); second.close(); store.close();
});
test('joint backup restores hashes/drafts/memories in clean directory without credentials', () => {
  const { service, store, assets, dir } = setup(); const p = service.createProject('A'); const a = assets.write(p.id, 'result.md', 'text/plain', 'evidence'); service.draft(p.id, 'report', 'body', [a.id]); service.memory({ text: 'Pi', source: 'user', kind: 'project', projectId: p.id, confirmed: true });
  writeFileSync(join(dir, 'credentials.json'), 'secret'); store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('secret-session', Date.now() + 10000, Date.now()); store.db.prepare('INSERT INTO node_tokens VALUES(?,?)').run('node', 'secret-node');
  const backupDir = join(temp(), 'backup'); const manifest = backup(store, dir, backupDir); assert.equal(manifest.assetCount, 1); assert(!existsSync(join(backupDir, 'credentials.json')));
  const restoredDir = join(temp(), 'restored'); restore(backupDir, restoredDir); const restoredStore = new Store(join(restoredDir, 'workbench.sqlite')); const restoredAssets = new Assets(restoredStore, restoredDir); assert.equal(restoredAssets.read(restoredStore.get('asset', a.id)).toString(), 'evidence'); assert.equal(restoredStore.list('draft').length, 1); assert.equal(restoredStore.list('memory').length, 1); assert.equal(restoredStore.db.prepare('SELECT COUNT(*) n FROM sessions').get()!.n, 0); assert.equal(restoredStore.db.prepare('SELECT COUNT(*) n FROM node_tokens').get()!.n, 0);
  writeFileSync(join(backupDir, 'assets', a.locator), 'corrupt'); assert.throws(() => restore(backupDir, join(temp(), 'bad'))); restoredStore.close(); store.close();
});
test('external source host policy rejects credentials, loopback, redirects and oversized content', async () => {
  const { service, store } = setup(); const p = service.createProject('A'); const pol = { ...policy(p.id), toolNames: ['capture_source'], allowedHosts: ['raw.githubusercontent.com'] }; const run = service.submit(p.id, 'read', 'net', 'fixture', pol).run; service.transition(run.id, 'running');
  const fetcher = async (_url: unknown, options: { redirect?: string }) => { assert.equal(options.redirect, 'error'); return new Response('source facts'); };
  for (const url of ['http://127.0.0.1/secret', 'https://evil.example/file', 'https://user:password@raw.githubusercontent.com/x', 'https://raw.githubusercontent.com/x?secret=x']) await assert.rejects(service.captureSource(run.id, url, fetcher as typeof fetch));
  const captured = await service.captureSource(run.id, 'https://raw.githubusercontent.com/a/b/commit/README.md', fetcher as typeof fetch); assert.equal(captured.content, 'source facts'); assert(store.list<Asset>('asset')[0].sourceIds.length === 0); assert.equal(captured.source, 'https://raw.githubusercontent.com/a/b/commit/README.md');
  await assert.rejects(service.captureSource(run.id, 'https://raw.githubusercontent.com/a/huge', (async () => new Response('x'.repeat(100001))) as typeof fetch)); store.close();
});
test('operation receipts deduplicate tools, mismatched input rejects, unknown is not replayed', async () => {
  const { service, store } = setup(); const p = service.createProject('A'); const run = service.submit(p.id, 'write', 'op', 'fixture', policy(p.id)).run; service.transition(run.id, 'running');
  const first = await service.executeOperation(run.id, 'tool-1', 'write_asset', { name: 'out.md', content: 'result' }); const again = await service.executeOperation(run.id, 'tool-1', 'write_asset', { name: 'out.md', content: 'result' }); assert.deepEqual(first, again); assert.equal(store.list('asset').length, 1); await assert.rejects(service.executeOperation(run.id, 'tool-1', 'write_asset', { name: 'out.md', content: 'other' }));
  await assert.rejects(service.executeOperation(run.id, 'bad', 'write_asset', { name: '../bad', content: 'x' })); await assert.rejects(service.executeOperation(run.id, 'bad', 'write_asset', { name: '../bad', content: 'x' })); assert.equal((store.list('operation').at(-1) as unknown as { state: string }).state, 'unknown'); store.close();
});
test('asset deletion checks references, hides data, and can be restored during retention', () => {
  const { service, store, assets } = setup(); const p = service.createProject('A'); const referenced = assets.write(p.id, 'source.md', 'text/plain', 'keep'); service.draft(p.id, 'article', 'x', [referenced.id]); assert.throws(() => assets.remove(referenced.id, 1));
  const free = assets.write(p.id, 'free.md', 'text/plain', 'restore me'); const deleted = assets.remove(free.id, free.revision); assert.throws(() => assets.read(deleted)); const restored = assets.restore(free.id, deleted.revision); assert.equal(assets.read(restored).toString(), 'restore me'); store.close();
});
test('temporary memory is never injected as a long-term shared preference', () => {
  const { service, store } = setup(); const p = service.createProject('A'); service.memory({ text: 'Only this task uses English', source: 'one task', kind: 'temporary', confirmed: true }); assert.equal(service.memories(p.id).length, 0); store.close();
});
test('retention cleanup previews, rejects new references to deleted assets and updates restore metadata', () => {
  const { service, store, assets } = setup(); const p = service.createProject('A'); const asset = assets.write(p.id, 'expired.md', 'text/plain', 'x'); const deleted = assets.remove(asset.id, asset.revision);
  assert.throws(() => service.draft(p.id, 'bad reference', 'body', [asset.id])); assert.throws(() => service.submit(p.id, 'bad reference', 'deleted', 'fixture', policy(p.id), [asset.id])); assert.equal(assets.purgeExpired(false).candidates.length, 0);
  const time = Date.now() + 31 * 86400000; assert.deepEqual(assets.purgeExpired(false, time).candidates, [asset.id]); assert.equal(store.get<Asset>('asset', asset.id).contentRemoved, undefined);
  assets.purgeExpired(true, time); assert.equal(store.get<Asset>('asset', asset.id).contentRemoved, true); assert.throws(() => assets.restore(asset.id, deleted.revision + 1)); store.close();
});
test('native Pi session and binding survive clean backup restore with remapped paths', async () => {
  const { service, store, dir } = setup(); const { loadPi } = await import('../server/pi-adapter.js'); const pi = await loadPi(); const project = service.createProject('A'); const cwd = join(dir, 'workspaces', project.id); mkdirSync(cwd, { recursive: true });
  const manager = pi.SessionManager.create(cwd, join(dir, 'sessions', project.id)); manager.appendMessage({ role: 'user', content: 'native session fixed input', timestamp: Date.now() }); const path = manager.getSessionFile()!;
  store.create('session_binding', { id: 'binding', projectId: project.id, ...({ sessionId: manager.getSessionId(), sessionPath: path, cwd, pid: 123, worker: 'old-host' } as object) });
  const destination = join(temp(), 'backup'); backup(store, dir, destination); const restoredDir = join(temp(), 'restore'); restore(destination, restoredDir);
  const restored = new Store(join(restoredDir, 'workbench.sqlite')); const binding = restored.get('session_binding', 'binding') as unknown as { sessionPath: string; cwd: string; pid?: number; worker?: string };
  assert(binding.sessionPath.startsWith(restoredDir)); assert(binding.cwd.startsWith(restoredDir)); assert.equal(binding.pid, undefined); assert.equal(binding.worker, undefined);
  const opened = pi.SessionManager.open(binding.sessionPath, undefined, binding.cwd); assert.equal(opened.getSessionId(), manager.getSessionId()); assert.equal(opened.buildSessionContext().messages.length, 1); assert.equal(opened.getCwd(), binding.cwd); restored.close(); store.close();
});

test('generated reports and drafts retain fixed and actually read source versions across restore', async()=>{
  const {service,store,assets,dir}=setup();const p=service.createProject('来源');
  try {
    const fixed=assets.write(p.id,'固定资料.md','text/markdown','12,18,9,21');const extra=assets.write(p.id,'补充资料.md','text/markdown','合成数据');
    const run=service.submit(p.id,'生成带来源文章','lineage','fixture',policy(p.id),[fixed.id]).run;service.transition(run.id,'running');
    const receipt=await service.executeOperation(run.id,'read-extra','read_asset',{assetId:extra.id}) as {assetId:string;hash:string;version:number};assert.equal(receipt.assetId,extra.id);assert.equal(receipt.hash,extra.hash);assert.equal(receipt.version,extra.version);
    const result=await service.executeOperation(run.id,'report','write_asset',{name:'分析.md',content:'合计60，平均15'}) as {id:string};const report=store.get<Asset>('asset',result.id);assert.deepEqual(report.sourceIds,[fixed.id,extra.id]);
    const draft=await service.executeOperation(run.id,'draft','create_draft',{title:'短文',body:'仅描述合成数据，不能推断实际业务效果'}) as Draft;assert.deepEqual(draft.sourceIds,[report.id,fixed.id,extra.id]);assert.throws(()=>assets.remove(extra.id,extra.revision));service.transition(run.id,'completed');
    const pack=join(temp(),'lineage-backup');backup(store,dir,pack);const recovered=join(temp(),'lineage-restored');restore(pack,recovered);const opened=new Store(join(recovered,'workbench.sqlite'));try{assert.deepEqual(opened.get<Asset>('asset',report.id).sourceIds,report.sourceIds);assert.deepEqual(opened.get<Draft>('draft',draft.id).sourceIds,draft.sourceIds);}finally{opened.close();}
  }finally{store.close();}
});
