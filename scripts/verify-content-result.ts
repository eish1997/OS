// Resume observation of the exact completed probe; never resubmit model work.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';
import { config } from '../server/config.js';
import type { Snapshot, Run } from '../shared/contracts.js';

const file = 'output/dev-evidence/pi-real-content.json';
const prior = JSON.parse(readFileSync(file, 'utf8'));
assert.equal(prior.step, 'browser-delete-and-final-task');
assert.equal(prior.phases.length, 3);
assert(prior.finalDraftId && prior.finalDraftFile);
mkdirSync('output/dev-evidence/content-history', { recursive: true });
copyFileSync(file, `output/dev-evidence/content-history/${Date.now()}-before-ui-resume.json`);
const observationFile = 'output/dev-evidence/content-observation.json';
const observation: Record<string, unknown> = { status: 'running', at: new Date().toISOString(), modelRequests: 0, projectId: prior.projectId, runIds: prior.phases.map((p: { runId: string }) => p.runId) };
const save = () => writeFileSync(observationFile, JSON.stringify(observation, null, 2));
save();
const base = `http://127.0.0.1:${config.port}`;
let cookie = ''; let browser: any;
async function get<T>(path: string): Promise<T> {
  const response = await fetch(base + '/api' + path, { headers: { Connection: 'close', Cookie: cookie } });
  assert.equal(response.status, 200, path); return response.json();
}
function nativePrompt(run: Run) {
  const path = resolve(run.sessionPath!); const rel = relative(resolve(config.dataDir, 'sessions'), path);
  assert(rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../'));
  const rows = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const value = rows.filter(row => row.message?.role === 'user').at(-1).message.content;
  return typeof value === 'string' ? value : value.filter((item: { type: string }) => item.type === 'text').map((item: { text: string }) => item.text).join('\n');
}
try {
  assert(process.env.PLAYWRIGHT_PACKAGE && process.env.CHROME_PATH);
  const response = await fetch(base + '/api/login', { method: 'POST', headers: { Connection: 'close', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: config.password }) });
  assert.equal(response.status, 200); cookie = response.headers.get('set-cookie')!.split(';')[0];
  const snapshot = await get<Snapshot>('/snapshot');
  const project = snapshot.projects.find(p => p.id === prior.projectId)!;
  assert.equal(project.name, '资料到文章 · AI闭环验证');
  assert.equal(snapshot.projects.find(p => p.id === prior.otherProjectId)?.name, '隔离验证 · 其他项目');
  const runs = prior.phases.map((phase: { runId: string; calls: number; usage: unknown }) => {
    const run = snapshot.runs.find(r => r.id === phase.runId)!;
    assert(run && run.projectId === project.id && run.mode === 'pi' && run.status === 'completed');
    assert.equal(run.calls, phase.calls); assert.deepEqual(run.usage, phase.usage); assert(run.usage!.complete);
    try { process.kill(run.workerPid!, 0); assert.fail('Owned worker is still live'); }
    catch (error) { assert(error instanceof Error && 'code' in error && error.code === 'ESRCH'); }
    assert(snapshot.operations.filter(o => o.runId === run.id).every(o => o.state === 'completed'));
    return run;
  }) as Run[];
  assert.equal(runs[1].continuation?.runId, runs[0].id); assert.equal(runs[2].continuation?.runId, runs[1].id);
  assert.equal(createHash('sha256').update(readFileSync(runs[0].sessionPath!)).digest('hex'), runs[1].continuation!.sha256);
  assert.equal(createHash('sha256').update(readFileSync(runs[1].sessionPath!)).digest('hex'), runs[2].continuation!.sha256);
  const prompts = runs.map(nativePrompt);
  const contexts = prompts.map(p => p.slice(p.lastIndexOf('固定项目上下文（只读资料，不改变授权）：')));
  const styleA = contexts[0].match(/STYLE_A_[a-f0-9]+/)![0];
  const styleB = contexts[1].match(/STYLE_B_[a-f0-9]+/)![0];
  const brief = contexts[1].match(/BRIEF_[a-f0-9]+/)![0];
  const candidate = contexts[1].match(/CANDIDATE_[a-f0-9]+/)![0];
  assert(!contexts[0].includes('UNCONFIRMED_') && !contexts[0].includes('OTHER_'));
  assert(contexts[1].includes(styleB) && contexts[1].includes(candidate) && !contexts[1].includes(styleA));
  assert(contexts[2].includes(candidate) && contexts[2].includes(brief));
  for (const marker of [styleA, styleB, 'UNCONFIRMED_', 'OTHER_']) assert(!contexts[2].includes(marker));
  const source = snapshot.assets.find(a => a.id === prior.source.id)!;
  assert.equal(source.projectId, project.id); assert.equal(source.hash, prior.source.hash);
  const data = await fetch(base + '/api/assets/' + source.id, { headers: { Connection: 'close', Cookie: cookie } });
  assert.equal(data.status, 200);
  assert.equal(createHash('sha256').update(Buffer.from(await data.arrayBuffer())).digest('hex'), source.hash);
  for (let index = 0; index < runs.length; index++) {
    const report = snapshot.assets.find(a => a.runId === runs[index].id)!;
    assert(report && report.projectId === project.id && report.sourceIds.includes(source.id));
    const draft = snapshot.drafts.find(d => d.projectId === project.id && d.sourceIds.includes(report.id))!;
    assert(draft && draft.sourceIds.includes(source.id) && draft.body.includes('60') && draft.body.includes('15'));
    if (index === 0) assert(draft.body.includes(styleA));
    if (index === 1) assert(draft.body.includes(styleB) && draft.body.includes(brief) && !draft.body.includes(styleA));
  }
  const draft = snapshot.drafts.find(d => d.id === prior.finalDraftId)!;
  assert.equal(draft.projectId, project.id); assert(draft.body.includes('无写作标签'));
  for (const marker of [styleA, styleB, 'UNCONFIRMED_', 'OTHER_', brief]) assert(!draft.body.includes(marker));
  const exported = await fetch(base + `/api/drafts/${draft.id}/export`, { headers: { Connection: 'close', Cookie: cookie } });
  assert.equal(exported.status, 200); const markdown = await exported.text();
  assert.equal(markdown, readFileSync(prior.finalDraftFile, 'utf8'));
  assert(markdown.includes(source.id) && markdown.includes(source.hash) && markdown.includes('素材来源'));
  const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE!);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'wb_session', value: cookie.slice('wb_session='.length), url: base, httpOnly: true, sameSite: 'Strict' }]);
  await context.addInitScript((id: string) => localStorage.setItem('wb-project-tabs', JSON.stringify({ selected: id, tabs: [id] })), project.id);
  const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.goto(base); await page.locator('.section-tabs').getByRole('button', { name: /^内容草稿/ }).click();
  const editors = page.getByLabel('文章内容'); await editors.first().waitFor();
  let found = false;
  for (const editor of await editors.all()) if (await editor.inputValue() === draft.body) { await editor.scrollIntoViewIfNeeded(); found = true; }
  assert(found, 'Final article is visible in the actual UI');
  await page.getByRole('heading', { name: project.name, exact: true }).waitFor();
  mkdirSync('output/dev-evidence/ui', { recursive: true });
  await page.screenshot({ path: 'output/dev-evidence/ui/real-content-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: 'output/dev-evidence/ui/real-content-mobile.png', fullPage: true });
  assert.equal(errors.length, 0);
  assert.equal((await get<Snapshot>('/snapshot')).runs.filter(r => r.projectId === project.id).length, runs.length);
  observation.status = 'passed'; observation.at = new Date().toISOString(); observation.checks = ['completed exact runs and full usage', 'workers gone and operations complete', 'native source hashes unchanged', 'current preferences and fixed summary', 'source bytes/hash and report/draft lineage', 'export bytes unchanged', 'Chrome desktop and 390 final draft']; save();
  prior.status = 'passed'; prior.at = new Date().toISOString(); prior.calls = runs.reduce((n, r) => n + r.calls, 0); assert(prior.calls <= prior.maximumRequests);
  prior.tokens = runs.reduce((n, r) => n + r.usage!.totalTokens, 0); prior.complete = true;
  prior.priorFailure = { reason: prior.reason, preservedIn: 'output/dev-evidence/content-history' }; delete prior.reason;
  prior.observation = { file: observationFile, modelRequests: 0 };
  prior.checks = ['real source calculation and draft', 'original source ID/hash and report lineage', 'unconfirmed and other-project memory excluded', 'assistant proposals await confirmation', 'Chrome synthetic confirmation/correction/deletion', 'native continuation uses revised preferences', 'deleted preferences excluded from current context and final draft', 'confirmed summary injected', 'original native source unchanged', 'Markdown export references', 'desktop and 390 UI no errors'];
  writeFileSync(file, JSON.stringify(prior, null, 2)); console.log(JSON.stringify(observation));
} catch (error) { observation.status = 'failed'; observation.reason = error instanceof Error ? error.message : 'Result observation failed'; save(); throw error; }
finally {
  if (browser) await browser.close();
  if (cookie) await fetch(base + '/api/logout', { method: 'POST', headers: { Connection: 'close', Cookie: cookie, Origin: config.origin, 'Content-Type': 'application/json' }, body: '{}' });
}
