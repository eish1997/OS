import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

const directory = mkdtempSync(join(tmpdir(), 'canvas-switch-leak-'));
const evidence = process.env.CANVAS_QA_EVIDENCE ?? 'output/dev-evidence/canvas-embedding/switch-leak-095';
mkdirSync(evidence, { recursive: true });
const app = createApp({
  dataDir: join(directory, 'host'), staticDir: 'output/canvas-workbench-build',
  canvasPackageDir: process.env.CANVAS_QA_PACKAGE ?? '.runtime/canvas-workbench-package-090',
  password: 'isolated-switch-password', schedule: false
});
await app.canvasService!.start();
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
const previous = config.origin; config.origin = origin;
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
await page.addInitScript(() => { if (location.pathname === '/canvas/') history.replaceState(null, '', location.href + '&test'); });
const report: Record<string, unknown> = { directory };
let step = 'login';
try {
  await page.goto(origin);
  await page.getByLabel('工作台密码').fill('isolated-switch-password');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  const iframe = page.locator('iframe[title="画板编辑器"]');
  await iframe.waitFor();
  let frame = (await (await iframe.elementHandle())!.contentFrame())!;
  await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 90000 });
  await frame.waitForFunction(() => !document.body.inert);
  const projects = await page.evaluate(async () => {
    const rows = [];
    for (const name of ['Switch A', 'Switch B']) {
      const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!response.ok) throw new Error('project setup failed');
      rows.push(await response.json());
    }
    return rows as { id: string }[];
  });
  const select = async (name: string) => {
    await page.getByRole('combobox', { name: '当前项目', exact: true }).click();
    await page.getByRole('option', { name, exact: true }).click();
    await page.waitForFunction(name => document.querySelector('[aria-label="当前项目"]')?.textContent?.includes(name), name);
    await frame.waitForFunction(() => !document.body.inert);
  };
  step = 'baseline';
  await select('Switch A');
  const before = await page.evaluate(() => ({
    iframes: document.querySelectorAll('iframe[title="画板编辑器"]').length,
    listenersHint: (window as any).__wbListenerCount ?? null
  }));
  assert.equal(before.iframes, 1);
  step = 'switch-20';
  for (let index = 0; index < 20; index++) {
    await select(index % 2 === 0 ? 'Switch B' : 'Switch A');
  }
  const after = await page.evaluate(() => ({
    iframes: document.querySelectorAll('iframe[title="画板编辑器"]').length,
    canvasLayers: document.querySelectorAll('.wb-canvas-layer').length
  }));
  assert.equal(after.iframes, 1);
  assert.equal(after.canvasLayers, 1);
  assert.equal(await frame.evaluate(() => Boolean((window as any).openPencil?.getStore)), true);
  report.switches = 20;
  report.iframeCount = after.iframes;
  report.projectIds = projects.map(row => row.id);
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'switch-leak.png'), fullPage: true });
} catch (error) {
  report.passed = false; report.step = step; report.failure = String(error);
  await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); await app.close(); config.origin = previous;
}
