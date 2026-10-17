import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { StorageCapacity } from '../server/storage.js';

const directory = mkdtempSync(join(tmpdir(), 'canvas-capacity-ui-'));
const evidence = process.env.CANVAS_QA_EVIDENCE ?? 'output/dev-evidence/canvas-embedding/capacity-ui-097';
mkdirSync(evidence, { recursive: true });
const canvasBytes = 8 * 1024 * 1024;
const app = createApp({
  dataDir: join(directory, 'host'), staticDir: 'output/canvas-workbench-build',
  canvasPackageDir: process.env.CANVAS_QA_PACKAGE ?? '.runtime/canvas-workbench-package-090',
  password: 'isolated-capacity-password', schedule: false,
  storageLimits: { canvasBytes, minFreeBytes: 0, controlReserveBytes: 64 * 1024 }
});
await app.canvasService!.start();
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
const previous = config.origin; config.origin = origin;
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
await page.addInitScript(() => { if (location.pathname === '/canvas/') history.replaceState(null, '', location.href + '&test'); });
const report: Record<string, unknown> = { directory, canvasBytes, mode: 'real-admission' };
let step = 'login';
const dataDir = join(directory, 'host');
try {
  await page.goto(origin);
  await page.getByLabel('工作台密码').fill('isolated-capacity-password');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  const iframe = page.locator('iframe[title="画板编辑器"]');
  await iframe.waitFor();
  const frame = (await (await iframe.elementHandle())!.contentFrame())!;
  await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 90000 });
  await frame.waitForFunction(() => !document.body.inert);
  await page.evaluate(async () => {
    const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Capacity' }) });
    if (!response.ok) throw new Error('project setup failed');
  });
  await page.getByRole('combobox', { name: '当前项目', exact: true }).click();
  await page.getByRole('option', { name: 'Capacity', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="当前项目"]')?.textContent?.includes('Capacity'));
  await frame.waitForFunction(() => !document.body.inert);
  const bounds = (await iframe.boundingBox())!;
  await page.mouse.click(bounds.x + 460, bounds.y + 260);
  await page.keyboard.press('r');
  await page.mouse.move(bounds.x + 460, bounds.y + 260);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 560, bounds.y + 360, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[aria-label="保存画板"]')?.textContent === '画板已保存');
  const list = await page.evaluate(async () => {
    const projects = await (await fetch('/api/snapshot')).json();
    const project = projects.projects.find((row: { name: string }) => row.name === 'Capacity');
    const rows = await (await fetch('/api/canvas/workspace/canvases', { headers: { 'X-Canvas-Project': project.id } })).json();
    return rows as { canvasId: string; revision: number }[];
  });
  assert.equal(list.length, 1);
  const before = list[0].revision;
  step = 'capacity-507';
  const filler = join(dataDir, 'canvas', 'isolated-quota-fixture');
  const capacity = new StorageCapacity(dataDir, { ...config.storageLimits, canvasBytes, minFreeBytes: 0, controlReserveBytes: 64 * 1024 });
  const used = capacity.usage().groups.canvas.bytes;
  writeFileSync(filler, Buffer.alloc(Math.max(0, canvasBytes - used - 1024)));
  let rejected = 0;
  page.on('response', response => {
    if (response.request().method() === 'POST' && response.url().includes(`/api/canvas/workspace/canvases/${list[0].canvasId}`) && response.status() === 507) rejected++;
  });
  await page.mouse.click(bounds.x + 500, bounds.y + 300);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => {
    const text = document.querySelector('[aria-label="保存画板"]')?.textContent ?? '';
    return text.includes('失败') || text.includes('连接失败') || text.includes('容量');
  });
  assert(rejected > 0, 'expected real HTTP 507 from canvas admission');
  const mid = await page.evaluate(async id => {
    const rows = await (await fetch('/api/canvas/workspace/canvases', { headers: { 'X-Canvas-Project': id } })).json();
    return rows[0].revision as number;
  }, (await page.evaluate(async () => {
    const projects = await (await fetch('/api/snapshot')).json();
    return projects.projects.find((row: { name: string }) => row.name === 'Capacity').id as string;
  })));
  assert.equal(mid, before);
  step = 'retry';
  unlinkSync(filler);
  await page.getByRole('button', { name: '保存画板' }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="保存画板"]')?.textContent === '画板已保存');
  const after = await page.evaluate(async () => {
    const projects = await (await fetch('/api/snapshot')).json();
    const project = projects.projects.find((row: { name: string }) => row.name === 'Capacity');
    const rows = await (await fetch('/api/canvas/workspace/canvases', { headers: { 'X-Canvas-Project': project.id } })).json();
    return rows[0].revision as number;
  });
  assert(after > before);
  report.capacityRejected = true;
  report.realHttp507 = rejected;
  report.revisionPreservedDuring507 = true;
  report.recoveredAfterClearingPressure = true;
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'capacity.png'), fullPage: true });
} catch (error) {
  report.passed = false; report.step = step; report.failure = String(error);
  await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); await app.close(); config.origin = previous;
}
