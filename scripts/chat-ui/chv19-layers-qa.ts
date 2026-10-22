/**
 * CHV-19：候选包三层命中（canvas 层注入探测 + 中层留白穿透 + 浮窗不透明挡事件）。
 * 默认 CANVAS_ENABLED=0：验证宿主层序；画板 iframe 嵌入开时另扩（记嵌入前置）。
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
fs.mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1');

Object.assign(config, {
  apiKey: 'offline-chat-ui-only',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  maxCalls: 4,
  budgetUsd: 4,
  reservePerCallUsd: 1,
});

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv19-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });

await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(25000);
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  staticDir,
  realModelRequests: 0,
  canvasEnabled: false,
  embeddingNote: 'chat-ui isolate defaults CANVAS_ENABLED off; iframe mount is a separate embedding gate',
  blockedExternalConnectsBefore: blockedExternalConnects(),
};

try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });
  await page.goto(base);
  await page.getByRole('button', { name: '直接编辑布局', exact: true }).click();

  await page.locator('.wb-canvas-layer').evaluate((el) => {
    const probe = document.createElement('div');
    probe.id = 'canvas-probe';
    probe.style.cssText =
      'position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 39px,#4565 40px),repeating-linear-gradient(90deg,#152029,#152029 39px,#4565 40px)';
    el.append(probe);
    for (const type of ['pointerdown', 'pointermove', 'wheel'] as const) {
      probe.addEventListener(type, () => {
        probe.dataset[type] = String(Number(probe.dataset[type] || 0) + 1);
      });
    }
  });
  const probe = page.locator('#canvas-probe');
  const region = await page.locator('.wb-region').first().boundingBox();
  assert.ok(region);

  await page.mouse.move(region.x + 30, region.y + 60);
  await page.mouse.down();
  await page.mouse.move(region.x + 80, region.y + 90);
  await page.mouse.up();
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(() => Number(document.querySelector<HTMLElement>('#canvas-probe')?.dataset.wheel) > 0);
  assert.ok(Number(await probe.getAttribute('data-pointerdown')) > 0);
  assert.ok(Number(await probe.getAttribute('data-pointermove')) > 0);
  report.canvasReceivesNative = true;

  await page.getByRole('button', { name: '添加窗口', exact: true }).first().click();
  await page.getByRole('button', { name: /布局演示/ }).click();

  const demo = page.locator('.wb-demo');
  const demoBox = await demo.boundingBox();
  assert.ok(demoBox);
  // Docked window interior padding / gap should forward to canvas
  assert.equal(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, { x: demoBox.x + 5, y: demoBox.y + 5 }),
    'canvas-probe',
  );
  const beforeGap = Number(await probe.getAttribute('data-pointerdown'));
  await page.mouse.click(demoBox.x + 5, demoBox.y + 5);
  assert.equal(Number(await probe.getAttribute('data-pointerdown')), beforeGap + 1);
  report.layoutGapForwards = true;

  const editor = page.getByLabel('演示窗口 1内容');
  let before = await probe.getAttribute('data-pointerdown');
  await editor.click();
  await editor.fill('透明留白不影响编辑');
  assert.equal(await probe.getAttribute('data-pointerdown'), before);
  report.editorBlocksCanvas = true;

  await page.locator('.wb-panel').getByLabel('悬浮', { exact: true }).click();
  const floating = page.locator('.wb-floating');
  assert.equal(await floating.evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(25, 25, 25)');
  const floatBox = await demo.boundingBox();
  assert.ok(floatBox);
  before = await probe.getAttribute('data-pointerdown');
  await page.mouse.click(floatBox.x + 5, floatBox.y + 5);
  assert.equal(await probe.getAttribute('data-pointerdown'), before);
  const wheelBefore = await probe.getAttribute('data-wheel');
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(100);
  assert.equal(await probe.getAttribute('data-wheel'), wheelBefore);
  report.floatingOpaque = true;

  const title = await page.locator('.wb-floating .wb-window-title').boundingBox();
  assert.ok(title);
  before = await probe.getAttribute('data-pointerdown');
  await page.mouse.click(title.x + 65, title.y + 15);
  assert.equal(await probe.getAttribute('data-pointerdown'), before);
  report.titleDragChrome = true;

  // Toolbar second window path (not layout fixture) still blocks canvas under chrome
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  before = await probe.getAttribute('data-pointerdown');
  await page.mouse.click(region.x + 10, region.y + 10);
  // Menu may be open; click empty region after dismiss if needed
  await page.keyboard.press('Escape').catch(() => undefined);
  assert.equal(await probe.getAttribute('data-pointerdown'), before);
  report.toolbarChromeBlocks = true;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv19-layers.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv19-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv19-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv19-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv19-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
