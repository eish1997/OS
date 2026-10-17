import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

const directory = mkdtempSync(join(tmpdir(), 'canvas-interaction-ui-'));
const evidence = process.env.CANVAS_QA_EVIDENCE ?? 'output/dev-evidence/canvas-embedding/interaction-ui-093';
mkdirSync(evidence, { recursive: true });
const app = createApp({
  dataDir: join(directory, 'host'), staticDir: 'output/canvas-workbench-build',
  canvasPackageDir: process.env.CANVAS_QA_PACKAGE ?? '.runtime/canvas-workbench-package-090',
  password: 'isolated-interaction-password', schedule: false
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
  await page.getByLabel('工作台密码').fill('isolated-interaction-password');
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  const iframe = page.locator('iframe[title="画板编辑器"]');
  await iframe.waitFor();
  const frame = (await (await iframe.elementHandle())!.contentFrame())!;
  await frame.locator('[data-test-id="canvas-element"][data-ready="1"]').waitFor({ timeout: 90000 });
  await frame.waitForFunction(() => !document.body.inert);
  const bounds = (await iframe.boundingBox())!;
  const snapshot = () => frame.evaluate(() => {
    const store = (window as any).openPencil.getStore();
    return store.graph.getNode(store.state.currentPageId).childIds.map((id: string) => {
      const node = store.graph.getNode(id);
      return { x: node.x, y: node.y, width: node.width, height: node.height, type: node.type };
    });
  });
  await page.mouse.click(bounds.x + 480, bounds.y + 260);
  await page.keyboard.press('r');
  await page.mouse.move(bounds.x + 480, bounds.y + 260);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 580, bounds.y + 360, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[aria-label="保存画板"]')?.textContent === '画板已保存');
  const art = await snapshot();
  assert.equal(art.length, 1);
  step = 'modal-focus';
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('dialog', { name: '添加窗口' }).waitFor();
  await frame.waitForFunction(() => document.body.inert);
  const focused = await page.evaluate(() => document.activeElement?.closest('.wb-modal')?.getAttribute('aria-label') ?? document.activeElement?.tagName);
  assert(String(focused).includes('添加窗口') || String(focused) === 'BUTTON' || String(focused) === 'H2');
  await page.keyboard.press('Escape');
  await frame.waitForFunction(() => !document.body.inert);
  assert.equal(await page.getByRole('dialog', { name: '添加窗口' }).count(), 0);
  step = 'host-window-and-shortcut';
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /布局演示/ }).click();
  await page.locator('.wb-panel').getByRole('button', { name: '悬浮', exact: true }).click();
  const floating = page.locator('.wb-floating');
  await floating.waitFor();
  const textarea = floating.locator('textarea');
  await textarea.fill('宿主输入');
  await textarea.click();
  await page.keyboard.press('Delete');
  assert.deepEqual(await snapshot(), art);
  assert.equal(await textarea.inputValue(), '宿主输入');
  step = 'gesture-barrier';
  const title = (await floating.locator('.wb-window-title').boundingBox())!;
  await page.mouse.move(title.x + 40, title.y + 12);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 700, bounds.y + 220, { steps: 6 });
  await page.locator('[data-testid="gesture-barrier"]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('[data-testid="gesture-barrier"]').count(), 1);
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="gesture-barrier"]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-testid="gesture-barrier"]').count(), 0);
  assert.deepEqual(await snapshot(), art);
  step = 'drag-complete';
  const before = (await floating.boundingBox())!;
  await page.mouse.move(title.x + 40, title.y + 12);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 820, bounds.y + 280, { steps: 10 });
  await page.locator('[data-testid="gesture-barrier"]').waitFor({ state: 'attached' });
  await page.mouse.up();
  await page.locator('[data-testid="gesture-barrier"]').waitFor({ state: 'detached' });
  const after = (await floating.boundingBox())!;
  assert(Math.abs(after.x - before.x) > 80 || Math.abs(after.y - before.y) > 40);
  assert.deepEqual(await snapshot(), art);
  report.modalBlockedEditor = true;
  report.hostShortcutLeftCanvas = true;
  report.gestureBarrierEscCancel = true;
  report.gestureBarrierReleasedAfterDrag = true;
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'interaction.png'), fullPage: true });
} catch (error) {
  report.passed = false; report.step = step; report.failure = String(error);
  await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); await app.close(); config.origin = previous;
}
