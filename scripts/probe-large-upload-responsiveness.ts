// Real HTTP uploads against an owned restored heavy library; no primary data or model calls.
import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Asset } from '../shared/contracts.js';
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const manifest = (assets: Asset[]) => sha(JSON.stringify(assets.map(a => ({ id: a.id, projectId: a.projectId, name: a.name, mime: a.mime, size: a.size, hash: a.hash, version: a.version }))));
const safeEnv = () => Object.fromEntries(['SystemRoot', 'SystemDrive', 'WINDIR', 'ComSpec', 'PATHEXT', 'USERPROFILE', 'TEMP', 'TMP', 'PATH', 'APPDATA', 'LOCALAPPDATA', 'HOME', 'LANG', 'TZ'].flatMap(k => process.env[k] === undefined ? [] : [[k, process.env[k]!]]));
const bytesFor = (index: number) => { const bytes = Buffer.alloc(8 * 1024 ** 2, index === 2 ? 0xff : 0x75); bytes.write('LARGE_UPLOAD_NEEDLE ' + index); return bytes; };
if (process.argv[2] === '--owned-http') {
  const root = resolve('.'), workspace = resolve(process.argv[3]), source = resolve(process.argv[4]);
  assert(root.startsWith(join(workspace, 'output', 'dev-evidence', 'private', 'large-upload-')));
  assert.equal(realpathSync(root), root); assert(!existsSync(join(root, '.env')));
  const owner = JSON.parse(readFileSync(join(root, 'probe-owner.json'), 'utf8'));
  assert.equal(root, join(workspace, 'output', 'dev-evidence', 'private', 'large-upload-' + owner.owner));
  assert.equal(owner.kind, 'owned large HTTP upload probe'); assert.equal(owner.workspace, workspace);
  const prior = JSON.parse(readFileSync(join(workspace, 'output/dev-evidence/upload-responsiveness.json'), 'utf8'));
  assert(prior.status === 'measured' && prior.ownedChildExited); assert.equal(prior.source, source);
  assert(source.startsWith(join(workspace, 'output', 'dev-evidence', 'private', 'batch-')));
  assert.equal(realpathSync(source), source); assert.notEqual(source, join(workspace, 'data'));
  const sourceMarker = JSON.parse(readFileSync(join(source, '..', 'probe-owner.json'), 'utf8'));
  assert.equal(sourceMarker.kind, 'owned batch probe'); assert.equal(sourceMarker.workspace, workspace);
  assert.equal(source, join(workspace, 'output', 'dev-evidence', 'private', 'batch-' + sourceMarker.owner, 'data'));
  const { Store } = await import('../server/store.js'); const { backup, restore } = await import('../server/backup.js');
  const sourceStore = new Store(join(source, 'workbench.sqlite'));
  let original: Asset[], originalManifest: string;
  try {
    assert.equal(sourceStore.db.prepare('SELECT COUNT(*) n FROM sessions').get()!.n, 0);
    original = sourceStore.list<Asset>('asset'); assert.equal(original.length, 685);
    assert(original.every(a => a.status === 'ready' && !a.contentRemoved)); originalManifest = manifest(original);
    process.send?.({ kind: 'progress', stage: 'backup-clone-source', assets: original.length });
    const saved = backup(sourceStore, source, join(root, 'snapshot')); assert.equal(saved.assetCount, 685);
  } finally { sourceStore.close(); }
  const dataDir = join(root, 'data'); restore(join(root, 'snapshot'), dataDir);
  assert.equal(realpathSync(dataDir), dataDir);
  assert(!existsSync(join(dataDir, 'credentials.json')) && !existsSync(join(dataDir, 'auth.json')));
  process.send?.({ kind: 'progress', stage: 'restore-complete', assets: 685 });
  const { createApp } = await import('../server/app.js'); const { config } = await import('../server/config.js');
  const password = randomUUID(), app = createApp({ dataDir, password, schedule: false });
  assert.equal(manifest(app.snapshot().assets), originalManifest!);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM sessions').get()!.n, 0);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM node_tokens').get()!.n, 0);
  // Purge only four unreferenced generated binary fixtures in this new clone.
  const targets = [56, 57, 58, 59].map(i => app.snapshot().assets.find(a => a.name === `大文件-${i}.bin`)!);
  assert.equal(new Set(targets.map(a => a.id)).size, 4);
  assert.equal(app.store.list<Asset>('asset').filter(a => a.status === 'deleted').length, 0);
  for (const asset of targets) {
    assert.equal(asset.size, 8 * 1024 ** 2); assert(/^[a-zA-Z0-9-]+$/.test(asset.locator));
    const path = join(dataDir, 'assets', asset.locator);
    assert(path.startsWith(dataDir + sep)); assert(!lstatSync(path).isSymbolicLink()); assert.equal(realpathSync(path), path);
    assert.equal(sha(readFileSync(path)), asset.hash); app.assets.remove(asset.id, asset.revision);
  }
  const isolatedRetentionClock = Date.now() + 31 * 86400_000;
  assert.deepEqual(app.assets.purgeExpired(false, isolatedRetentionClock).candidates.sort(), targets.map(a => a.id).sort());
  assert.deepEqual(app.assets.purgeExpired(true, isolatedRetentionClock).candidates.sort(), targets.map(a => a.id).sort());
  assert.equal(app.snapshot().assets.length, 681);
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`; config.origin = base;
  let closing = false;
  const close = async () => {
    if (closing) return; closing = true; await app.close();
    const check = new Store(join(source, 'workbench.sqlite'), { readOnly: true });
    try {
      assert.equal(manifest(check.list<Asset>('asset')), originalManifest!);
      for (const asset of original!) assert.equal(sha(readFileSync(join(source, 'assets', asset.locator))), asset.hash);
      process.send?.({ kind: 'source-verified', assets: 685, manifestSha256: originalManifest });
    } finally { check.close(); }
    process.send?.({ kind: 'closed' }, () => process.disconnect!());
  };
  process.on('message', (value: { action?: string }) => { if (value.action === 'close') void close().catch(e => { console.error(e); process.exitCode = 1; process.disconnect!(); }); });
  process.on('disconnect', () => { if (!closing) void close().catch(() => process.exit(1)); });
  process.send?.({ kind: 'ready', base, password, limits: app.store.capacity!.limits, usageBefore: app.store.capacity!.usage(), originalManifestSha256: originalManifest, cloneSourceAssets: 685, retainedReadyAssets: 681, purgedOnlyCloneIds: targets.map(a => a.id), restoredSecretsExcluded: true });
} else {
  const workspace = realpathSync(resolve('.')), prior = JSON.parse(readFileSync('output/dev-evidence/upload-responsiveness.json', 'utf8'));
  assert(prior.status === 'measured' && prior.ownedChildExited && prior.allAssetHashesVerified === 685);
  const file = resolve('output/dev-evidence/large-upload-responsiveness.json'); assert(!existsSync(file), 'Preserve existing evidence; inspect any terminal/live state before another run');
  const owner = randomUUID(), root = join(workspace, 'output', 'dev-evidence', 'private', 'large-upload-' + owner);
  assert(!existsSync(root)); mkdirSync(root); writeFileSync(join(root, 'probe-owner.json'), JSON.stringify({ owner, kind: 'owned large HTTP upload probe', workspace }));
  const health = async () => (await fetch('http://127.0.0.1:4310/api/health', { signal: AbortSignal.timeout(3000) })).json();
  const primary = await health(); assert(primary.ready);
  const report: any = { status: 'running', at: new Date().toISOString(), modelRequests: 0, previousGoalTurn: 'no progress: automatic settings explanation only', source: prior.source, root, primaryBefore: primary, thresholds: { snapshotMs: 500 }, preparation: 'Product backup and restore; remove four unreferenced generated binaries in clone only, using isolated retention clock; no quota increase', samples: [], progress: [] };
  const save = () => writeFileSync(file, JSON.stringify(report, null, 2)); save();
  let child: ChildProcess | undefined, exited: Promise<void> | undefined, ended = false, failure: Error | undefined, ready: any, stderr = '', cookie = '', sourceVerified = false;
  const request = async (path: string, method = 'GET', body?: any, binary = false) => {
    const at = performance.now(), response = await fetch(ready.base + '/api' + path, { method, headers: { Cookie: cookie, Connection: 'close', ...(body === undefined ? {} : { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }) }, body: body === undefined ? undefined : binary ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    return { status: response.status, value: await response.json(), response, ms: performance.now() - at };
  };
  try {
    child = fork(fileURLToPath(import.meta.url), ['--owned-http', workspace, prior.source], { cwd: root, env: { ...safeEnv(), PI_API_KEY: '', PI_MODEL: '', PI_MAX_CALLS: '0', WORKBENCH_PROXY_MODE: 'direct' }, execArgv: ['--import', pathToFileURL(join(workspace, 'node_modules/tsx/dist/loader.mjs')).href], windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    report.ownedPid = child.pid; save(); child.stderr!.on('data', value => stderr = (stderr + String(value)).slice(-3000));
    child.on('message', (value: any) => { if (value.kind === 'ready') ready = value; if (value.kind === 'source-verified') { sourceVerified = true; report.originalSourceVerified = value; } if (value.kind === 'progress') { report.progress.push(value); save(); console.log(value.stage); } });
    exited = new Promise<void>((done, reject) => { child!.once('exit', code => { ended = true; code === 0 ? done() : reject(new Error('Owned helper exit ' + code + ': ' + stderr)); }); child!.once('error', error => { ended = true; reject(error); }); }); void exited.catch(error => { failure = error; });
    const start = performance.now(); while (!ready) { if (failure) throw failure; assert(!ended); assert(performance.now() - start < 120000, 'Live owned helper exceeded startup bound; no restart'); await new Promise<void>(done => setTimeout(done,25)); }
    const { password: _secret, ...publicReady } = ready; report.setup = publicReady; save();
    assert.equal(ready.limits.assetsBytes, 500 * 1024 ** 2); assert.equal(ready.limits.totalBytes, 2 * 1024 ** 3);
    const login = await request('/login', 'POST', { password: ready.password }); assert.equal(login.status, 200); cookie = login.response.headers.get('set-cookie')!.split(';')[0];
    const project = await request('/projects', 'POST', { name: '8 MiB HTTP 上传测量 · ' + owner }); assert.equal(project.status, 201); report.projectId = project.value.id;
    for (let index = 0; index < 3; index++) {
      const bytes = bytesFor(index), at = performance.now(); let done = false, result: any, error: unknown;
      const work = (async () => { const begin = await request('/uploads', 'POST', { projectId: project.value.id, name: `large-http-${index}.${index === 2 ? 'bin' : 'md'}`, mime: index === 2 ? 'application/octet-stream' : 'text/markdown' }); assert.equal(begin.status, 201); const put = await request('/uploads/' + begin.value.id, 'PUT', bytes, true); assert.equal(put.status, 200); assert.equal(put.value.hash, sha(bytes)); assert.equal(put.value.projectId, project.value.id); return { beginMs: begin.ms, putMs: put.ms, operationMs: performance.now() - at, assetId: put.value.id, hash: put.value.hash }; })().then(value => { result = value; done = true; }, reason => { error = reason; done = true; });
      const reads: number[] = [];
      do { const read = await request('/snapshot'); assert.equal(read.status, 200); assert([681 + index, 682 + index].includes(read.value.assets.length)); assert.equal(read.value.runs.reduce((n: number, r: any) => n + r.calls, 0), 0); reads.push(read.ms); if (!done) await new Promise<void>(resolve => setTimeout(resolve, 5)); } while (!done);
      await work; if (error) throw error; report.samples.push({ index, bytes: bytes.length, ...result, dataReads: reads.length, maxSnapshotMs: Math.max(...reads) }); save(); console.log(`8 MiB upload ${index + 1}/3: data max ${Math.round(Math.max(...reads))}ms`);
    }
    const snapshot = await request('/snapshot'); assert.equal(snapshot.value.assets.length, 684);
    for (const asset of snapshot.value.assets as Asset[]) { const response = await fetch(ready.base + '/api/assets/' + asset.id, { headers: { Cookie: cookie, Connection: 'close' }, signal: AbortSignal.timeout(30000) }); assert.equal(response.status, 200); assert.equal(sha(Buffer.from(await response.arrayBuffer())), asset.hash); }
    report.allReadyAssetHashesVerified = 684;
    const logout = await request('/logout', 'POST', {}); assert.equal(logout.status, 200); cookie = '';
    child.send({ action: 'close' }); await exited; assert(sourceVerified); report.ownedChildExited = true; child = undefined;
    report.primaryAfter = await health(); assert.deepEqual(report.primaryAfter, primary); report.primaryIdentityUnchanged = true;
    report.maxSnapshotMs = Math.max(...report.samples.map((s: any) => s.maxSnapshotMs)); report.maxPutMs = Math.max(...report.samples.map((s: any) => s.putMs)); report.snapshotThresholdPassed = report.maxSnapshotMs <= 500; report.status = 'measured'; report.at = new Date().toISOString(); save();
    console.log(JSON.stringify({ status: report.status, uploads: 3, maxSnapshotMs: report.maxSnapshotMs, maxPutMs: report.maxPutMs, snapshotThresholdPassed: report.snapshotThresholdPassed, verifiedHashes: 684, modelRequests: 0 }));
  } catch (error) { report.status = 'failed'; report.reason = error instanceof Error ? error.message : 'Large HTTP upload probe failed'; save(); throw error; }
  finally { if (child?.connected) { if (cookie && ready) { try { await request('/logout', 'POST', {}); cookie = ''; } catch { /* Only the owned restored library can retain this synthetic login. */ } } child.send({ action: 'close' }); await exited?.catch(() => {}); report.ownedChildExited = ended; save(); } }
}
