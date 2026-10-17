import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

const directory = mkdtempSync(join(tmpdir(), 'canvas-conflict-ui-'));
const evidence = process.env.CANVAS_QA_EVIDENCE ?? 'output/dev-evidence/canvas-embedding/conflict-ui-090';
mkdirSync(evidence, { recursive: true });
const app = createApp({
  dataDir: join(directory, 'host'), staticDir: 'output/canvas-workbench-build',
  canvasPackageDir: process.env.CANVAS_QA_PACKAGE ?? '.runtime/canvas-workbench-package-090',
  password: 'isolated-conflict-password', schedule: false
});
await app.canvasService!.start();
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
const previous = config.origin; config.origin = origin;
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
await page.addInitScript(() => { if (location.pathname === '/canvas/') history.replaceState(null, '', location.href + '&test'); });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
const report: Record<string, unknown> = { directory, errors };
let step = 'login';
try {
  await page.goto(origin);
  await page.getByLabel('工作台密码').fill('isolated-conflict-password');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  const iframe = page.locator('iframe[title="画板编辑器"]');
  await iframe.waitFor();
  let frame = (await (await iframe.elementHandle())!.contentFrame())!;
  await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 90000 });
  await frame.waitForFunction(() => !document.body.inert);
  const projects = await page.evaluate(async () => {
    const rows = [];
    for (const name of ['Canvas A', 'Canvas B']) {
      const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!response.ok) throw new Error('project setup failed');
      rows.push(await response.json());
    }
    return rows as { id: string }[];
  });
  const snapshot = () => frame.evaluate(() => {
    const store = (window as any).openPencil.getStore();
    return store.graph.getNode(store.state.currentPageId).childIds.map((id: string) => {
      const node = store.graph.getNode(id);
      return { x: node.x, y: node.y, width: node.width, height: node.height, type: node.type };
    });
  });
  const select = async (name: string) => {
    await page.getByRole('combobox', { name: '当前项目', exact: true }).click();
    await page.getByRole('option', { name, exact: true }).click();
  };
  const selected = async (name: string) => {
    await page.waitForFunction(name => document.querySelector('[aria-label="当前项目"]')?.textContent?.includes(name), name);
    await frame.waitForFunction(() => !document.body.inert);
  };
  const list = (projectId: string) => page.evaluate(async id => {
    const response = await fetch('/api/canvas/workspace/canvases', { headers: { 'X-Canvas-Project': id } });
    if (!response.ok) throw new Error('list failed');
    return response.json() as Promise<{ canvasId: string; revision: number }[]>;
  }, projectId);
  const bounds = (await iframe.boundingBox())!;
  const draw = async (x: number) => {
    await page.mouse.click(bounds.x + x, bounds.y + 260);
    await page.keyboard.press('r');
    await page.mouse.move(bounds.x + x, bounds.y + 260);
    await page.mouse.down();
    await page.mouse.move(bounds.x + x + 100, bounds.y + 360, { steps: 8 });
    await page.mouse.up();
  };
  step = 'project-a';
  await select('Canvas A'); await selected('Canvas A');
  await draw(460);
  await page.waitForFunction(() => document.querySelector('[aria-label="保存画板"]')?.textContent === '画板已保存');
  const savedA = await snapshot();
  const aRows = await list(projects[0].id);
  assert.equal(aRows.length, 1);
  const originalRevision = aRows[0].revision;
  step = 'project-b';
  await select('Canvas B'); await selected('Canvas B');
  await draw(650);
  await page.waitForFunction(() => document.querySelector('[aria-label="保存画板"]')?.textContent === '画板已保存');
  const savedB = await snapshot();
  const bRows = await list(projects[1].id);
  assert.equal(bRows.length, 1);
  step = 'return-a';
  await select('Canvas A'); await selected('Canvas A');
  assert.deepEqual(await snapshot(), savedA);
  step = 'conflict';
  let conflicts = 0;
  await page.route(new RegExp(`/api/canvas/workspace/canvases/${aRows[0].canvasId}$`), async route => {
    if (route.request().method() === 'POST') {
      conflicts++;
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'isolated-revision-conflict' }) });
    } else await route.continue();
  });
  await page.mouse.click(bounds.x + 500, bounds.y + 300);
  await page.keyboard.press('ArrowRight');
  const drafted = await snapshot();
  assert.notDeepEqual(drafted, savedA);
  await page.waitForFunction(() => document.querySelector('[aria-label="保存画板"]')?.textContent === '画板版本冲突');
  assert(conflicts > 0);
  const during = await list(projects[0].id);
  assert.equal(during.find(row => row.canvasId === aRows[0].canvasId)?.revision, originalRevision);
  step = 'fork';
  await page.getByRole('button', { name: '另存冲突副本', exact: true }).click();
  await page.getByText('已另存冲突副本，原画板草稿仍保留').waitFor();
  const forked = await list(projects[0].id);
  assert.equal(forked.length, 2);
  assert.equal(forked.find(row => row.canvasId === aRows[0].canvasId)?.revision, originalRevision);
  assert.deepEqual(await snapshot(), drafted);
  assert((await page.getByRole('combobox', { name: '当前项目' }).textContent())?.includes('Canvas A'));
  step = 'reload-canvas';
  await page.getByRole('button', { name: '放弃草稿并重载', exact: true }).click();
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="保存画板"]')?.textContent === '画板已保存');
  assert.deepEqual(await snapshot(), savedA);
  const reloaded = await list(projects[0].id);
  assert.equal(reloaded.find(row => row.canvasId === aRows[0].canvasId)?.revision, originalRevision);
  await page.unroute(new RegExp(`/api/canvas/workspace/canvases/${aRows[0].canvasId}$`));
  report.conflictForkKeptRemote = true;
  report.explicitReloadDiscardedDraft = true;
  step = 'layout-barrier';
  await page.waitForFunction(() => [...document.querySelectorAll('.wb-save')].some(node => node.textContent === '布局已保存'));
  const replaced = await page.evaluate(async projectId => {
    const current = await (await fetch('/api/workbench/config')).json();
    const layout = structuredClone(current.layout);
    layout.activeProjectId = projectId;
    const response = await fetch('/api/workbench/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: current.revision, layout }) });
    return response.status;
  }, projects[1].id);
  assert.equal(replaced, 200);
  let blockedScene = false;
  await page.route(new RegExp(`/api/canvas/workspace/canvases/${bRows[0].canvasId}/scene`), async route => {
    blockedScene = true;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'isolated-layout-target' }) });
  });
  await page.getByRole('button', { name: '新建空间', exact: true }).click();
  await page.getByRole('textbox', { name: '空间名称', exact: true }).fill('本地未保存空间');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await page.getByText('布局冲突').waitFor();
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await page.getByText(/画板/).first().waitFor();
  await frame.waitForFunction(() => !document.body.inert);
  assert(blockedScene);
  assert((await page.getByRole('combobox', { name: '当前项目' }).textContent())?.includes('Canvas A'));
  assert.deepEqual(await snapshot(), savedA);
  await page.getByText('布局冲突').waitFor();
  await page.unroute(new RegExp(`/api/canvas/workspace/canvases/${bRows[0].canvasId}/scene`));
  step = 'layout-reload';
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await selected('Canvas B');
  assert.deepEqual(await snapshot(), savedB);
  await page.waitForFunction(() => [...document.querySelectorAll('.wb-save')].some(node => node.textContent === '布局已保存'));
  report.failedLayoutReloadKeptProject = true;
  report.layoutReloadFollowedCanvas = true;
  report.passed = true;
  assert.deepEqual(errors, []);
  await page.screenshot({ path: join(evidence, 'conflict.png'), fullPage: true });
} catch (error) {
  report.passed = false; report.step = step; report.failure = String(error);
  await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); await app.close(); config.origin = previous;
}
