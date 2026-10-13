import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, AppError } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import { createApp } from '../server/app.js';
import { backup, restore } from '../server/backup.js';
import type { Asset, Policy } from '../shared/contracts.js';
function setup() { const dir = mkdtempSync(join(tmpdir(), '全文 搜索 ')); const store = new Store(join(dir, 'workbench.sqlite')); const assets = new Assets(store, dir); const service = new Service(store, assets); return { dir, store, assets, service }; }
test('UTF-8 content beyond 100KB, names and tags search with literal SQL metacharacters and pagination', () => {
  const { store, assets, service } = setup();
  try {
    const p = service.createProject('A'); const file = assets.write(p.id, '中文 文件.md', 'text/markdown', 'first\r\n' + 'x'.repeat(200_000) + '\r\n全文末端命中 50%_literal');
    const renamed = assets.metadata(file.id, 1, '重命名资料.md', ['研究', 'Memory', '研究']); assert.equal(renamed.hash, file.hash); assert.equal(renamed.locator, file.locator); assert.equal(renamed.version, file.version); assert.equal(renamed.id, file.id); assert.deepEqual(renamed.tags, ['研究', 'Memory']);
    const content = assets.searchIndex.search(p.id, '全文末端命中'); assert.equal(content.items[0].asset.id, file.id); assert.equal(content.items[0].matched, 'content'); assert(content.items[0].snippet.includes('全文末端命中')); assert(content.items[0].snippet.length < 250);
    assert.equal(assets.searchIndex.search(p.id, 'Memory').items[0].matched, 'tags'); assert.equal(assets.searchIndex.search(p.id, '重命名').items[0].matched, 'name'); assert.equal(assets.searchIndex.search(p.id, '50%_literal').items.length, 1); assert.equal(assets.searchIndex.search(p.id, '50%anything').items.length, 0);
    assert.throws(() => assets.metadata(file.id, 1, 'stale.md', []), (e: unknown) => e instanceof AppError && e.status === 409); assert.equal(assets.searchIndex.search(p.id, 'stale').items.length, 0); assert.throws(() => assets.metadata(file.id, 2, '../bad', []));
    for (let i = 0; i < 53; i++) assets.write(p.id, `分页${i}.md`, 'text/plain', '分页标记');
    const first = assets.searchIndex.search(p.id, '分页标记'); assert.equal(first.items.length, 50); assert.equal(first.total, 53); assert.equal(first.nextOffset, 50); const next = assets.searchIndex.search(p.id, '分页标记', first.nextOffset); assert.equal(next.items.length, 3); assert.equal(next.nextOffset, undefined); assert.equal(new Set([...first.items, ...next.items].map(i => i.asset.id)).size, 53);
    const invalid = assets.begin(p.id, '非UTF8.txt', 'text/plain'); const binary = assets.commit(invalid.id, Buffer.from([0xff, 0xfe])); assert.equal(assets.searchIndex.search(p.id, '非UTF8').items[0].asset.id, binary.id);
  } finally { store.close(); }
});
test('deleted search content disappears, restore and new immutable version retain searchable metadata', () => {
  const { store, assets, service } = setup();
  try {
    const p = service.createProject('A'); const file = assets.write(p.id, '来源.md', 'text/markdown', '删除标记'); const tagged = assets.metadata(file.id, 1, file.name, ['类别']); const deleted = assets.remove(tagged.id, tagged.revision);
    assert.equal(assets.searchIndex.search(p.id, '删除标记').items.length, 0); assert.equal(store.db.prepare('SELECT COUNT(*) n FROM asset_search WHERE asset_id=?').get(file.id)!.n, 0);
    const restored = assets.restore(file.id, deleted.revision); assert.equal(assets.searchIndex.search(p.id, '类别').items.length, 1);
    const upload = assets.begin(p.id, '来源.md', 'text/markdown', [], { parentVersionId: restored.id }); const next = assets.commit(upload.id, Buffer.from('第二版唯一标记')); assert.equal(next.version, 2); assert.deepEqual(next.tags, ['类别']); assert.equal(assets.searchIndex.search(p.id, '第二版唯一标记').items[0].asset.id, next.id); assert.equal(assets.searchIndex.search(p.id, '删除标记').items[0].asset.id, file.id);
  } finally { store.close(); }
});
test('HTTP authentication, agent project scope, source tamper and damaged derived snippet are checked', async () => {
  const dir = mkdtempSync(join(tmpdir(), '搜索 HTTP ')); const app = createApp({ dataDir: dir, password: 'search-password', schedule: false }); await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    const a = app.service.createProject('A'); const b = app.service.createProject('B'); const file = app.assets.write(a.id, 'a.md', 'text/markdown', '真实内容'); const other = app.assets.write(b.id, 'b.md', 'text/markdown', 'B内容');
    const endpoint = base + `/api/projects/${a.id}/assets/search?q=`; assert.equal((await fetch(endpoint + '真实')).status, 401);
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'search-password' }) }); const cookie = login.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await (await fetch(endpoint + 'B内容', { headers: { Cookie: cookie } })).json()).items.length, 0); assert.equal((await fetch(endpoint + '真实&offset=-1', { headers: { Cookie: cookie } })).status, 400);
    const policy: Policy = { version: 4, projectId: a.id, toolNames: ['search_assets', 'update_asset_metadata'], allowModel: false, maxCalls: 0, maxCostUsd: 0, reservePerCallUsd: 1, maxOutputTokens: 100, timeoutMs: 10000 }; const run = app.service.submit(a.id, 'search', 'search', 'fixture', policy).run; app.service.transition(run.id, 'running');
    assert.throws(() => app.service.tool(run.id, 'search_assets', { query: 'B内容', projectId: b.id })); assert.throws(() => app.service.tool(run.id, 'update_asset_metadata', { assetId: other.id, revision: 1, name: 'wrong', tags: [] }));
    const metadata = await fetch(base + `/api/assets/${file.id}/metadata`, { method: 'PATCH', headers: { Cookie: cookie }, body: JSON.stringify({ revision: 1, name: '界面修改.md', tags: ['入口一致'] }) }); assert.equal(metadata.status, 200); const updated = await metadata.json() as Asset; assert.equal(updated.hash, file.hash);
    const toolResult = app.service.tool(run.id, 'update_asset_metadata', { assetId: file.id, revision: updated.revision, name: 'Agent修改.md', tags: ['入口一致'] }) as Asset; assert.equal(toolResult.id, file.id); assert.equal(app.assets.searchIndex.search(a.id, '入口一致').items[0].asset.name, 'Agent修改.md');
    app.store.db.prepare('UPDATE asset_search SET content=? WHERE asset_id=?').run('虚假证据', file.id); const damaged = app.assets.searchIndex.search(a.id, '虚假证据'); assert.equal(damaged.items.length, 0); assert.equal(damaged.issues.length, 1); assert.equal(app.assets.searchIndex.search(a.id, '真实内容').items.length, 1);
    writeFileSync(join(dir, 'assets', file.locator), '未登记修改'); const tampered = app.assets.searchIndex.search(a.id, '真实内容'); assert.equal(tampered.items.length, 0); assert.equal(tampered.issues.length, 1); assert(!JSON.stringify(tampered).includes('未登记修改'));
  } finally { await app.close(); }
});
test('search index survives joint backup and missing derived rows rebuild from authoritative assets', () => {
  const { dir, store, assets, service } = setup(); const p = service.createProject('A'); const file = assets.write(p.id, '保留.md', 'text/plain', '恢复检索标记'); assets.metadata(file.id, 1, file.name, ['备份']); const destination = join(mkdtempSync(join(tmpdir(), '搜索 包 ')), 'snapshot');
  try { backup(store, dir, destination); } finally { store.close(); }
  const target = join(mkdtempSync(join(tmpdir(), '搜索 恢复 ')), 'data'); restore(destination, target); const reopened = new Store(join(target, 'workbench.sqlite')); reopened.db.exec('DELETE FROM asset_search'); const restored = new Assets(reopened, target);
  try { assert.equal(restored.searchIndex.search(p.id, '恢复检索标记').items[0].asset.hash, file.hash); assert.equal(restored.searchIndex.search(p.id, '备份').items[0].asset.id, file.id); } finally { reopened.close(); }
});

test('read-only background search preserves literal matches/pagination, repairs derived damage and never trusts a tampered source',async()=>{
  const q=setup();try{
    const project=q.service.createProject('async');for(let i=0;i<53;i++)q.assets.write(project.id,`中文${i}.md`,'text/plain','正文 50%_literal 中文分页');
    const first=await q.assets.searchIndex.searchAsync(project.id,'50%_literal');assert.deepEqual(first,q.assets.searchIndex.search(project.id,'50%_literal'));assert.equal(first.total,53);assert.equal(first.items.length,50);const next=await q.assets.searchIndex.searchAsync(project.id,'50%_literal',50);assert.equal(next.items.length,3);assert.equal(next.nextOffset,undefined);
    const file=first.items[0].asset;q.store.db.prepare('UPDATE asset_search SET content=? WHERE asset_id=?').run('虚假正文',file.id);const damaged=await q.assets.searchIndex.searchAsync(project.id,'虚假正文');assert.equal(damaged.items.length,0);assert.equal(damaged.issues.length,1);assert.equal((await q.assets.searchIndex.searchAsync(project.id,'中文分页')).total,53);
    writeFileSync(join(q.dir,'assets',file.locator),'未登记正文');const tampered=await q.assets.searchIndex.searchAsync(project.id,'中文分页');assert(!tampered.items.some(i=>i.asset.id===file.id));assert(tampered.issues.some(i=>i.assetId===file.id));assert(!JSON.stringify(tampered).includes('未登记正文'));
  }finally{await q.assets.searchIndex.close();q.store.close();}
});

test('background search has bounded concurrency, abort and owned-process shutdown',async()=>{
  const q=setup();try{
    const project=q.service.createProject('bounded');q.assets.write(project.id,'a.md','text/plain','fixed');const a=q.assets.searchIndex.searchAsync(project.id,'fixed');const b=q.assets.searchIndex.searchAsync(project.id,'fixed');void a.catch(()=>{});void b.catch(()=>{});
    await assert.rejects(q.assets.searchIndex.searchAsync(project.id,'fixed'),e=>e instanceof AppError&&e.status===429);await q.assets.searchIndex.close();await assert.rejects(a);await assert.rejects(b);await assert.rejects(q.assets.searchIndex.searchAsync(project.id,'fixed'),e=>e instanceof AppError&&e.status===503);
    const reopen=new Assets(q.store,q.dir);try{const controller=new AbortController();const pending=reopen.searchIndex.searchAsync(project.id,'fixed',0,50,controller.signal);void pending.catch(()=>{});controller.abort();await assert.rejects(pending);assert.equal((await reopen.searchIndex.searchAsync(project.id,'fixed')).items.length,1);}finally{await reopen.searchIndex.close();}
  }finally{await q.assets.searchIndex.close();q.store.close();}
});

test('byte comparison preserves BOM/Unicode/literal snippets, detects equal-length index damage and falls back for UTF-16 databases',async()=>{
  const q=setup();try{
    const p=q.service.createProject('bytes');const upload=q.assets.begin(p.id,'source.md','text/markdown');const bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('中文😀\r\n50%_literal\nUnicode Ä Σ K 真实末端')]);const asset=q.assets.commit(upload.id,bytes);
    const expected=q.assets.searchIndex.search(p.id,'真实末端');const page=await q.assets.searchIndex.searchAsync(p.id,'真实末端');assert.deepEqual(page,JSON.parse(JSON.stringify(expected)));assert.equal(page.items.length,1);assert(page.items[0].snippet.includes('真实末端'));assert.equal((await q.assets.searchIndex.searchAsync(p.id,'50%_literal')).items.length,1);
    const content=String(q.store.db.prepare('SELECT content FROM asset_search WHERE asset_id=?').get(asset.id)!.content);const damaged=content.replace('真实末端','伪造末端');assert.equal(Buffer.byteLength(damaged),Buffer.byteLength(content));q.store.db.prepare('UPDATE asset_search SET content=? WHERE asset_id=?').run(damaged,asset.id);const forged=await q.assets.searchIndex.searchAsync(p.id,'伪造末端');assert.equal(forged.items.length,0);assert.equal(forged.issues.length,1);assert.equal(q.store.db.prepare('SELECT content FROM asset_search WHERE asset_id=?').get(asset.id)!.content,content);
    const invalid=q.assets.begin(p.id,'invalid-UTF8.txt','text/plain');q.assets.commit(invalid.id,Buffer.from([0xff,0xfe]));assert.equal((await q.assets.searchIndex.searchAsync(p.id,'invalid-UTF8')).issues.length,0);
  }finally{await q.assets.searchIndex.close();q.store.close();}
  const dir=mkdtempSync(join(tmpdir(),'UTF16 搜索 '));const path=join(dir,'workbench.sqlite');const {DatabaseSync}=await import('node:sqlite');const initial=new DatabaseSync(path);initial.exec("PRAGMA encoding='UTF-16le'; CREATE TABLE encoding_fixture(value TEXT);");initial.close();const store=new Store(path);const assets=new Assets(store,dir);const service=new Service(store,assets);
  try{assert.equal(store.db.prepare('PRAGMA encoding').get()!.encoding,'UTF-16le');const p=service.createProject('fallback');const asset=assets.write(p.id,'source.md','text/markdown','中文😀 真正末端');assert.equal((await assets.searchIndex.searchAsync(p.id,'真正末端')).items[0].asset.id,asset.id);store.db.prepare('UPDATE asset_search SET content=? WHERE asset_id=?').run('伪造末端',asset.id);const page=await assets.searchIndex.searchAsync(p.id,'伪造末端');assert.equal(page.items.length,0);assert.equal(page.issues.length,1);assert.equal((await assets.searchIndex.searchAsync(p.id,'真正末端')).items[0].asset.id,asset.id);}
  finally{await assets.searchIndex.close();store.close();}
});

test('browser session revocation and agent cancellation reject late background search results',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'搜索撤销 '));const app=createApp({dataDir:dir,password:'search-password',schedule:false});await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try{
    const project=app.service.createProject('revoke');app.assets.write(project.id,'a.md','text/plain','fixed');const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'search-password'})});const cookie=login.headers.get('set-cookie')!.split(';')[0];await login.json();
    let started!:()=>void;const entered=new Promise<void>(done=>{started=done;});const original=app.assets.searchIndex.searchAsync.bind(app.assets.searchIndex);app.assets.searchIndex.searchAsync=(...args)=>{const pending=original(...args);started();return pending;};
    const pending=fetch(base+`/api/projects/${project.id}/assets/search?q=fixed`,{headers:{Cookie:cookie,Connection:'close'}});await entered;const devices=await (await fetch(base+'/api/sessions',{headers:{Cookie:cookie}})).json();const revoke=await fetch(base+'/api/sessions/revoke',{method:'POST',headers:{Cookie:cookie},body:JSON.stringify({hash:devices.find((d:any)=>d.current).hash})});assert.equal(revoke.status,200);await revoke.json();assert.equal((await pending).status,401);
    const policy:Policy={version:4,projectId:project.id,toolNames:['search_assets'],allowModel:false,maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:10,timeoutMs:60000};const run=app.service.submit(project.id,'fixed search','cancel-search','fixture',policy).run;app.service.transition(run.id,'running');const operation=app.service.executeOperation(run.id,'background-query','search_assets',{query:'fixed'});void operation.catch(()=>{});app.service.cancel(run.id);await assert.rejects(operation,e=>e instanceof AppError&&e.status===403);const record=app.store.list<any>('operation').find(o=>o.runId===run.id);assert.equal(record.state,'failed');assert.equal(record.result,undefined);
  }finally{await app.close();}
});

test('bounded ASCII candidates match native literal LIKE across case, NUL, dense fallback, Unicode and pages',async()=>{
  const q=setup();try{
    const p=q.service.createProject('native comparison'),other=q.service.createProject('other');
    const contents=['ca'.repeat(100)+'CAt mixed cASE','before\0HIDDEN_NEEDLE','50%_literal\\path [a]*? \' quoted','Unicode K ſ İ Ä Σ 中文😀','before CAT then cat','boundary ca','x'.repeat(200_000)+' CAT at end'];
    for(let i=0;i<57;i++)q.assets.write(p.id,`row-${i}.md`,'text/plain',contents[i%contents.length]);
    q.assets.write(other.id,'out-of-scope.md','text/plain','CAT 50%_literal\\path HIDDEN_NEEDLE');
    const canonical=(query:string)=>{const pattern='%'+query.trim().replace(/[\\%_]/g,'\\$&')+'%';return q.store.db.prepare("SELECT x.asset_id FROM asset_search x JOIN entities e ON e.id=x.asset_id AND e.kind='asset' WHERE x.project_id=? AND e.project_id=? AND json_extract(e.body,'$.status')='ready' AND e.revision=x.revision AND (x.name LIKE ? ESCAPE '\\' OR x.tags LIKE ? ESCAPE '\\' OR x.content LIKE ? ESCAPE '\\') ORDER BY e.rowid DESC").all(p.id,p.id,pattern,pattern,pattern).map(row=>row.asset_id);};
    for(const query of ['CAT','cAt','50%_literal\\path','[a]*?','quoted','HIDDEN_NEEDLE','中文','Ä','k','s','row-','boundary ca']){
      const expected=canonical(query);
      for(const offset of [0,5]){const page=q.assets.searchIndex.search(p.id,query,offset,5);assert.equal(page.total,expected.length);assert.deepEqual(page.items.map(i=>i.asset.id),expected.slice(offset,offset+5));assert.equal(page.issues.length,0);assert.equal(page.nextOffset,offset+Math.min(5,Math.max(0,expected.length-offset))<expected.length?offset+5:undefined);}
    }
    for(const query of ['CAT','50%_literal\\path','HIDDEN_NEEDLE','中文'])assert.deepEqual(await q.assets.searchIndex.searchAsync(p.id,query,5,5),JSON.parse(JSON.stringify(q.assets.searchIndex.search(p.id,query,5,5))));
    const source=q.assets.write(p.id,'proof.md','text/plain','TRUE_NEEDLE');q.store.db.prepare('UPDATE asset_search SET content=? WHERE asset_id=?').run('FAKE_NEEDLE',source.id);
    const damaged=await q.assets.searchIndex.searchAsync(p.id,'FAKE_NEEDLE');assert.equal(damaged.items.length,0);assert.equal(damaged.issues.length,1);assert.equal((await q.assets.searchIndex.searchAsync(p.id,'TRUE_NEEDLE')).items[0].asset.id,source.id);
    const blob=q.assets.write(p.id,'blob-row.md','text/plain','BLOB_REAL_NEEDLE');q.store.db.prepare('UPDATE asset_search SET content=? WHERE asset_id=?').run(Buffer.from('FORGED_BLOB_NEEDLE'),blob.id);
    const blobExpected=canonical('FORGED_BLOB_NEEDLE').length;assert.equal(q.assets.searchIndex.search(p.id,'FORGED_BLOB_NEEDLE').total,blobExpected);
    // SQLite can hold malformed TEXT after index damage. Its own matcher keeps
    // authority for such rows, rather than treating raw bytes as valid UTF-8.
    const malformed=q.assets.write(p.id,'malformed-row.md','text/plain','REAL_ENCODING_NEEDLE');
    for(const bytes of [Buffer.from([0xc1,0x81]),Buffer.concat([Buffer.from([0xc2]),Buffer.from('ENCODING_NEEDLE')])]){
      q.store.db.prepare('UPDATE asset_search SET content=CAST(? AS TEXT) WHERE asset_id=?').run(bytes,malformed.id);
      const expectedMalformed=canonical('ENCODING_NEEDLE').length;assert.equal(q.assets.searchIndex.search(p.id,'ENCODING_NEEDLE').total,expectedMalformed);
    }
    q.store.db.exec('PRAGMA case_sensitive_like=ON');assert.equal(q.store.db.prepare("SELECT 'a' LIKE 'A' compatible").get()!.compatible,0);
    const expected=canonical('CAT'),caseSensitive=q.assets.searchIndex.search(p.id,'CAT',0,100);assert.equal(caseSensitive.total,expected.length);assert.deepEqual(caseSensitive.items.map(i=>i.asset.id),expected);
  }finally{await q.assets.searchIndex.close();q.store.close();}
});
