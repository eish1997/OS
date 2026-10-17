import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page, type Frame } from 'playwright-core';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

const directory = mkdtempSync(join(tmpdir(), 'canvas-acceptance-ui-'));
const evidence = process.env.CANVAS_QA_EVIDENCE ?? 'output/dev-evidence/canvas-embedding/acceptance-ui-096';
mkdirSync(evidence, { recursive: true });
const packageDir = process.env.CANVAS_QA_PACKAGE ?? '.runtime/canvas-workbench-package-090';
const app = createApp({
  dataDir: join(directory, 'host'), staticDir: 'output/canvas-workbench-build',
  canvasPackageDir: packageDir, password: 'isolated-acceptance-password', schedule: false
});
await app.canvasService!.start();
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
const previous = config.origin; config.origin = origin;
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const report: Record<string, unknown> = { directory, packageDir };
let step = 'login';

async function openWorkbench(page: Page) {
  await page.addInitScript(() => { if (location.pathname === '/canvas/') history.replaceState(null, '', location.href + '&test'); });
  const started = Date.now();
  await page.goto(origin);
  await page.getByLabel('工作台密码').fill('isolated-acceptance-password');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  const iframe = page.locator('iframe[title="画板编辑器"]');
  await iframe.waitFor();
  const frame = (await (await iframe.elementHandle())!.contentFrame())!;
  await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 90000 });
  await frame.waitForFunction(() => !document.body.inert);
  return { iframe, frame, loadMs: Date.now() - started };
}

const snapshot = (frame: Frame) => frame.evaluate(() => {
  const store = (window as any).openPencil.getStore();
  return store.graph.getNode(store.state.currentPageId).childIds.map((id: string) => {
    const node = store.graph.getNode(id);
    return { x: node.x, y: node.y, width: node.width, height: node.height, type: node.type };
  });
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(25000);
  const first = await openWorkbench(page);
  report.embeddedLoadMs = first.loadMs;
  let frame = first.frame;
  const bounds = () => first.iframe.boundingBox().then(box => {
    if (!box) throw new Error('canvas bounds missing');
    return box;
  });

  step = 'project';
  await page.evaluate(async () => {
    const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Acceptance' }) });
    if (!response.ok) throw new Error('project setup failed');
  });
  await page.getByRole('combobox', { name: '当前项目', exact: true }).click();
  await page.getByRole('option', { name: 'Acceptance', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="当前项目"]')?.textContent?.includes('Acceptance'));
  await frame.waitForFunction(() => !document.body.inert);

  step = 'draw';
  const box = await bounds();
  await page.mouse.click(box.x + 460, box.y + 260);
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 460, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 360, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[aria-label="保存画板"]')?.textContent === '画板已保存');
  const art = await snapshot(frame);
  assert.equal(art.length, 1);

  step = 'v11-windows';
  await page.getByRole('button', { name: '添加窗口', exact: true }).first().click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.getByLabel('对话输入', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /插件管理/ }).click();
  await page.locator('.wb-plugins, [aria-label="插件管理"]').first().waitFor({ timeout: 30000 }).catch(async () => {
    await page.getByText('插件', { exact: false }).first().waitFor({ timeout: 5000 });
  });
  assert.equal(await page.locator('iframe[title="画板编辑器"]').count(), 1);
  assert.equal(await page.getByLabel('对话输入', { exact: true }).count(), 1);
  await page.waitForFunction(() => [...document.querySelectorAll('.wb-save')].some(node => node.textContent === '布局已保存'));
  report.v11ChatAndPluginsBesideCanvas = true;

  step = 'v03-ime';
  const composer = page.getByLabel('对话输入', { exact: true });
  await composer.click();
  await page.evaluate(() => {
    const el = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="对话输入"]');
    if (!el) throw new Error('composer missing');
    el.focus();
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    el.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: 'ni' }));
    Object.defineProperty(el, 'isComposing', { configurable: true, get() { return true; } });
  });
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  assert.deepEqual(await snapshot(frame), art);
  await page.evaluate(() => {
    const el = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="对话输入"]');
    if (!el) throw new Error('composer missing');
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你' }));
    Object.defineProperty(el, 'isComposing', { configurable: true, get() { return false; } });
    el.value = '你好';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await composer.inputValue(), '你好');
  assert.deepEqual(await snapshot(frame), art);
  report.v03ImeDeleteLeftCanvas = true;

  step = 'v10-narrow-themes';
  await page.setViewportSize({ width: 980, height: 720 });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const themes = [/墨黑/, /暖灰/, /石墨/, /浅色/];
  for (const theme of themes) {
    await page.getByRole('radio', { name: theme }).check();
    await page.waitForTimeout(120);
  }
  await page.locator('#wb-line-width').fill('2');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await frame.waitForFunction(() => !document.body.inert);
  const narrow = await bounds();
  assert(narrow.width > 200 && narrow.height > 200);
  assert.equal(await page.locator('iframe[title="画板编辑器"]').isVisible(), true);
  assert.equal(await page.getByRole('button', { name: '专注画板', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('radio', { name: /墨黑/ }).check();
  await page.locator('#wb-line-width').fill('1');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await frame.waitForFunction(() => !document.body.inert);
  await page.setViewportSize({ width: 1440, height: 900 });
  report.v10NarrowFourThemes = true;

  step = 'v06-dual-browser';
  const canvasMeta = await page.evaluate(async () => {
    const snap = await (await fetch('/api/snapshot')).json();
    const project = snap.projects.find((row: { name: string }) => row.name === 'Acceptance');
    const rows = await (await fetch('/api/canvas/workspace/canvases', { headers: { 'X-Canvas-Project': project.id } })).json();
    return { projectId: project.id as string, canvasId: rows[0].canvasId as string, revision: rows[0].revision as number };
  });
  const pageB = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  pageB.setDefaultTimeout(25000);
  const second = await openWorkbench(pageB);
  await pageB.getByRole('combobox', { name: '当前项目', exact: true }).click();
  await pageB.getByRole('option', { name: 'Acceptance', exact: true }).click();
  await pageB.waitForFunction(() => document.querySelector('[aria-label="当前项目"]')?.textContent?.includes('Acceptance'));
  await second.frame.waitForFunction(() => !document.body.inert);
  assert.equal((await snapshot(second.frame)).length, art.length);
  await page.getByRole('button', { name: '专注画板', exact: true }).click();
  await page.getByRole('button', { name: '退出专注画板', exact: true }).waitFor();
  const boxA = await bounds();
  await page.mouse.click(boxA.x + 620, boxA.y + 240);
  await page.keyboard.press('r');
  await page.mouse.move(boxA.x + 620, boxA.y + 240);
  await page.mouse.down();
  await page.mouse.move(boxA.x + 720, boxA.y + 340, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[aria-label="保存画板"]')?.textContent === '画板待保存' || document.querySelector('[aria-label="保存画板"]')?.textContent === '画板保存中');
  await page.waitForFunction(() => document.querySelector('[aria-label="保存画板"]')?.textContent === '画板已保存');
  const afterA = await page.evaluate(async meta => {
    const rows = await (await fetch('/api/canvas/workspace/canvases', { headers: { 'X-Canvas-Project': meta.projectId } })).json() as { canvasId: string; revision: number }[];
    const row = rows.find(item => item.canvasId === meta.canvasId);
    if (!row) throw new Error('canvas missing after A save');
    return row.revision;
  }, canvasMeta);
  assert(afterA > canvasMeta.revision, `revision stayed ${afterA} from ${canvasMeta.revision}`);
  await page.getByRole('button', { name: '退出专注画板', exact: true }).click();
  await pageB.getByRole('button', { name: '专注画板', exact: true }).click();
  const boxB = (await pageB.locator('iframe[title="画板编辑器"]').boundingBox())!;
  await pageB.mouse.click(boxB.x + 500, boxB.y + 280);
  await pageB.keyboard.press('r');
  await pageB.mouse.move(boxB.x + 500, boxB.y + 280);
  await pageB.mouse.down();
  await pageB.mouse.move(boxB.x + 600, boxB.y + 380, { steps: 8 });
  await pageB.mouse.up();
  await pageB.waitForFunction(() => {
    const text = document.querySelector('[aria-label="保存画板"]')?.textContent ?? '';
    return text === '画板版本冲突' || text.includes('失败');
  }, undefined, { timeout: 60000 });
  assert.equal(await pageB.locator('[aria-label="保存画板"]').textContent(), '画板版本冲突');
  const remote = await pageB.evaluate(async meta => {
    const rows = await (await fetch('/api/canvas/workspace/canvases', { headers: { 'X-Canvas-Project': meta.projectId } })).json();
    return rows.find((row: { canvasId: string }) => row.canvasId === meta.canvasId).revision as number;
  }, canvasMeta);
  assert.equal(remote, afterA);
  await pageB.getByRole('button', { name: '另存冲突副本', exact: true }).waitFor();
  report.v06DualBrowserConflict = true;
  await pageB.getByRole('button', { name: '退出专注画板', exact: true }).click().catch(() => {});
  await pageB.close();

  step = 'v12-compare';
  let standaloneLoadMs: number | undefined;
  try {
    const standalone = JSON.parse(readFileSync('output/dev-evidence/canvas-embedding/standalone/report.json', 'utf8')) as { loadMs?: number };
    standaloneLoadMs = standalone.loadMs;
  } catch {}
  report.standaloneLoadMs = standaloneLoadMs;
  report.embeddedOverStandalone = standaloneLoadMs ? Number((first.loadMs / standaloneLoadMs).toFixed(2)) : null;
  if (standaloneLoadMs) assert(first.loadMs < standaloneLoadMs * 4, `embedded load ${first.loadMs}ms too slow vs standalone ${standaloneLoadMs}ms`);
  report.v12LoadCompared = Boolean(standaloneLoadMs);

  report.passed = true;
  await page.screenshot({ path: join(evidence, 'acceptance.png'), fullPage: true });
} catch (error) {
  report.passed = false; report.step = step; report.failure = String(error);
  try {
    const pages = browser.contexts().flatMap(context => context.pages());
    if (pages[0]) await pages[0].screenshot({ path: join(evidence, 'failure.png'), fullPage: true });
  } catch {}
  throw error;
} finally {
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); await app.close(); config.origin = previous;
}
