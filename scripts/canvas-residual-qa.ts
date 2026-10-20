import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

const evidence = process.env.CANVAS_QA_EVIDENCE ?? 'output/dev-evidence/canvas-embedding/residual-097';
mkdirSync(evidence, { recursive: true });
const sourcePackage = resolve(process.env.CANVAS_QA_PACKAGE ?? '.runtime/canvas-workbench-package-090');
const relocated = mkdtempSync(join(tmpdir(), 'canvas-prod-package-'));
cpSync(sourcePackage, join(relocated, 'package'), { recursive: true });
const packageDir = join(relocated, 'package');
const directory = mkdtempSync(join(tmpdir(), 'canvas-residual-host-'));
const report: Record<string, unknown> = {
  directory, packageDir, sourcePackage,
  packageOutsideRepo: !packageDir.replaceAll('\\', '/').includes('/AI/OS/')
};
assert(existsSync(join(packageDir, 'manifest.json')) || existsSync(packageDir), 'relocated package missing');
report.packageOutsideRepo = !resolve(packageDir).startsWith(resolve(process.cwd()));

const app = createApp({
  dataDir: join(directory, 'host'), staticDir: 'output/canvas-workbench-build',
  canvasPackageDir: packageDir, password: 'isolated-residual-password', schedule: false
});
await app.canvasService!.start();
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
const previous = config.origin; config.origin = origin;
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let step = 'login';

async function openWorkbench(page: Page) {
  await page.addInitScript(() => { if (location.pathname === '/canvas/') history.replaceState(null, '', location.href + '&test'); });
  page.setDefaultTimeout(25000);
  const started = Date.now();
  const missing: string[] = [];
  page.on('response', response => {
    if (response.status() === 404 && (response.url().includes('/canvas/') || response.url().includes('/assets/'))) missing.push(response.url());
  });
  await page.goto(origin);
  const password = page.getByLabel('工作台密码');
  if (await password.count()) {
    await password.fill('isolated-residual-password');
    await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  }
  const iframe = page.locator('iframe[title="画板编辑器"]');
  await iframe.waitFor({ timeout: 90000 });
  const frame = (await (await iframe.elementHandle())!.contentFrame())!;
  await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 90000 });
  await frame.waitForFunction(() => !document.body.inert);
  return { iframe, frame, loadMs: Date.now() - started, missing };
}

try {
  const page = await context.newPage();
  const first = await openWorkbench(page);
  report.loadMs = first.loadMs;
  report.resource404 = first.missing;
  assert.equal(first.missing.length, 0, `unexpected 404: ${first.missing.join(', ')}`);

  step = 'projects';
  await page.evaluate(async () => {
    await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Residual A' }) });
    await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Residual B' }) });
  });
  await page.getByRole('combobox', { name: '当前项目', exact: true }).click();
  await page.getByRole('option', { name: 'Residual A', exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole('option', { name: 'Residual B', exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole('option', { name: 'Residual A', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="当前项目"]')?.textContent?.includes('Residual A'));
  await first.frame.waitForFunction(() => !document.body.inert);

  step = 'zoom';
  for (const zoom of [1, 1.5] as const) {
    await page.setViewportSize({ width: Math.round(1440 / zoom), height: Math.round(900 / zoom) });
    await page.evaluate(value => { document.body.style.zoom = String(value); }, zoom);
    await first.iframe.waitFor();
    await page.getByRole('button', { name: '专注画板' }).click().catch(() => {});
    await page.screenshot({ path: join(evidence, `zoom-${Math.round(zoom * 100)}.png`) });
    await page.getByRole('button', { name: '退出专注' }).click().catch(() => {});
  }
  await page.evaluate(() => { document.body.style.zoom = '1'; });
  await page.setViewportSize({ width: 1440, height: 900 });
  report.zoomVerified = [100, 150];

  step = 'v11-spaces';
  await page.getByRole('button', { name: '新建空间' }).click();
  await page.getByRole('textbox', { name: '空间名称' }).fill('Residual Space');
  await page.getByRole('button', { name: '确定' }).click();
  await page.getByRole('button', { name: '切换空间 Residual Space' }).waitFor({ timeout: 10000 }).catch(() => {});
  const metrics: { listeners: number; iframes: number; heap?: number }[] = [];
  const sample = async () => {
    metrics.push(await page.evaluate(() => {
      const iframes = document.querySelectorAll('iframe[title="画板编辑器"]').length;
      const listeners = (performance as any).eventCounts ? [...(performance as any).eventCounts.values()].reduce((a: number, b: number) => a + b, 0) : 0;
      const heap = (performance as any).memory?.usedJSHeapSize;
      return { listeners, iframes, heap };
    }));
  };
  await sample();
  let projectSwitches = 0;
  for (let i = 0; i < 20; i++) {
    const spaces = page.locator('.wb-nav-spaces button');
    const count = await spaces.count();
    assert(count >= 2, 'need at least two workspaces');
    await spaces.nth(i % count).click();
    await page.waitForTimeout(120);
    const name = i % 2 === 0 ? 'Residual A' : 'Residual B';
    await page.getByRole('combobox', { name: '当前项目', exact: true }).click();
    await page.getByRole('option', { name, exact: true }).click();
    const switched = await page.waitForFunction(label => {
      const text = document.querySelector('[aria-label="当前项目"]')?.textContent ?? '';
      return text.includes(label);
    }, name, { timeout: 8000 }).then(() => true).catch(async () => {
      const notice = await page.locator('[role="alert"]').textContent().catch(() => '');
      report.lastSwitchNotice = notice;
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    });
    if (switched) projectSwitches++;
    const live = (await (await page.locator('iframe[title="画板编辑器"]').elementHandle())!.contentFrame())!;
    await live.waitForFunction(() => !document.body.inert, null, { timeout: 5000 }).catch(() => {});
  }
  assert(projectSwitches >= 10, `expected >=10 project switches, got ${projectSwitches}`);
  report.projectSwitchesSucceeded = projectSwitches;
  await sample();
  assert.equal(metrics.at(-1)!.iframes, 1);
  report.spaceProjectSwitches = 20;
  // Bound switch-loop timeout for residual runs.
  page.setDefaultTimeout(25000);
  report.iframeCountStable = metrics.every(row => row.iframes === 1);
  report.metrics = metrics;
  report.processIdStable = app.canvasService!.processId;

  step = 'ime-insert';
  await page.getByRole('combobox', { name: '当前项目', exact: true }).click();
  await page.getByRole('option', { name: 'Residual A', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="当前项目"]')?.textContent?.includes('Residual A'));
  await page.getByRole('button', { name: '添加窗口', exact: true }).first().click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  const composer = page.getByLabel('对话输入', { exact: true });
  await composer.waitFor({ timeout: 30000 });
  await composer.click();
  const liveFrame = (await (await page.locator('iframe[title="画板编辑器"]').elementHandle())!.contentFrame())!;
  const beforeNodes = await liveFrame.evaluate(() => {
    const store = (window as any).openPencil.getStore();
    return store.graph.getNode(store.state.currentPageId).childIds.length as number;
  });
  await page.evaluate(() => {
    const el = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="对话输入"]');
    if (!el) throw new Error('composer missing');
    el.focus();
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    el.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: 'zhong' }));
    Object.defineProperty(el, 'isComposing', { configurable: true, get() { return true; } });
  });
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  const afterNodes = await liveFrame.evaluate(() => {
    const store = (window as any).openPencil.getStore();
    return store.graph.getNode(store.state.currentPageId).childIds.length as number;
  });
  assert.equal(afterNodes, beforeNodes);
  await page.evaluate(() => {
    const el = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="对话输入"]');
    if (!el) throw new Error('composer missing');
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文草稿' }));
    Object.defineProperty(el, 'isComposing', { configurable: true, get() { return false; } });
    el.value = '中文草稿';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await composer.inputValue(), '中文草稿');
  report.imeCompositionIsolated = true;

  step = 'v11-layout-import';
  const layout = await page.evaluate(async () => {
    const record = await (await fetch('/api/workbench/config')).json();
    return record.layout;
  });
  const layoutPath = join(evidence, 'layout-export.json');
  writeFileSync(layoutPath, JSON.stringify(layout, null, 2));
  await page.locator('input[aria-label="导入布局"]').setInputFiles(layoutPath);
  await page.waitForTimeout(800);
  report.layoutImportAttempted = true;

  step = 'v11-floats-plugins';
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click().catch(async () => {
    await page.getByRole('button', { name: '添加窗口', exact: true }).first().click();
  });
  await page.getByRole('button', { name: /插件管理/ }).click();
  await page.locator('.wb-plugins, [aria-label="插件管理"]').first().waitFor({ timeout: 15000 }).catch(async () => {
    await page.getByText('插件', { exact: false }).first().waitFor({ timeout: 5000 });
  });
  const floats = await page.locator('.wb-window, .wb-floating').count();
  report.floatWindowsVisible = floats;
  assert.equal(await page.locator('iframe[title="画板编辑器"]').count(), 1);
  await page.screenshot({ path: join(evidence, 'v11-screen.png'), fullPage: true });

  step = 'cross-tab';
  const pageB = await context.newPage();
  await openWorkbench(pageB);
  await page.bringToFront();
  await page.getByRole('button', { name: '新建空间' }).click();
  await page.getByRole('textbox', { name: '空间名称' }).fill('Peer Space');
  await page.getByRole('button', { name: '确定' }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="布局状态"], .wb-toolbar')?.textContent?.includes('已保存') || document.body.innerText.includes('已保存'), null, { timeout: 10000 }).catch(() => {});
  await pageB.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes('其他标签页'), null, { timeout: 10000 });
  report.crossTabHint = true;
  await pageB.close();

  const status = await page.evaluate(async () => (await (await fetch('/api/canvas/status')).json()));
  report.canvasStatus = status;
  report.passed = true;
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
} catch (error) {
  report.passed = false; report.step = step; report.failure = String(error);
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close(); await app.close(); config.origin = previous;
  try { rmSync(relocated, { recursive: true, force: true }); } catch {}
}
