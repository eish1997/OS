import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

const directory = mkdtempSync(join(tmpdir(), 'canvas-focus-ui-'));
const evidence = process.env.CANVAS_QA_EVIDENCE ?? 'output/dev-evidence/canvas-embedding/focus-ui-092';
mkdirSync(evidence, { recursive: true });
const app = createApp({
  dataDir: join(directory, 'host'), staticDir: 'output/canvas-workbench-build',
  canvasPackageDir: process.env.CANVAS_QA_PACKAGE ?? '.runtime/canvas-workbench-package-090',
  password: 'isolated-focus-password', schedule: false
});
await app.canvasService!.start();
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
const previous = config.origin; config.origin = origin;
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
const report: Record<string, unknown> = { directory };
let step = 'login';
try {
  await page.goto(origin);
  await page.getByLabel('工作台密码').fill('isolated-focus-password');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await page.locator('iframe[title="画板编辑器"]').waitFor();
  await page.getByRole('button', { name: '添加窗口', exact: true }).first().click();
  await page.getByRole('button', { name: /布局演示/ }).click();
  await page.getByText('演示窗口').first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.wb-save')].some(node => node.textContent === '布局已保存'));
  const before = await page.evaluate(async () => await (await fetch('/api/workbench/config')).json());
  step = 'enter';
  await page.getByRole('button', { name: '专注画板', exact: true }).click();
  await page.getByRole('button', { name: '退出专注画板', exact: true }).waitFor();
  const hidden = await page.locator('.wb-dock-scroll').evaluate(element => getComputedStyle(element).visibility);
  assert.equal(hidden, 'hidden');
  const during = await page.evaluate(async () => await (await fetch('/api/workbench/config')).json());
  assert.equal(during.revision, before.revision);
  assert.deepEqual(during.layout, before.layout);
  step = 'exit';
  await page.getByRole('button', { name: '退出专注画板', exact: true }).click();
  await page.getByRole('button', { name: '专注画板', exact: true }).waitFor();
  const shown = await page.locator('.wb-dock-scroll').evaluate(element => getComputedStyle(element).visibility);
  assert.equal(shown, 'visible');
  await page.getByText('演示窗口').first().waitFor();
  step = 'refresh';
  await page.getByRole('button', { name: '专注画板', exact: true }).click();
  await page.reload();
  await page.locator('iframe[title="画板编辑器"]').waitFor();
  await page.getByRole('button', { name: '专注画板', exact: true }).waitFor();
  const restored = await page.locator('.wb-dock-scroll').evaluate(element => getComputedStyle(element).visibility);
  assert.equal(restored, 'visible');
  const after = await page.evaluate(async () => await (await fetch('/api/workbench/config')).json());
  assert.deepEqual(after.layout, before.layout);
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'focus.png'), fullPage: true });
} catch (error) {
  report.passed = false; report.step = step; report.failure = String(error);
  await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); await app.close(); config.origin = previous;
}
