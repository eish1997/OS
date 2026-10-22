/**
 * CHAT-02 operable prototype measurements against frozen baselines.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import { CHAT_UI_DESIGN, cssPxForVisual } from '../../shared/chat-ui-design.js';
import { measureNarrow, measureWide } from './measure-chat.ts';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1');

Object.assign(config, {
  apiKey: 'offline-chat-ui-only',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  maxCalls: 4,
  budgetUsd: 4,
  reservePerCallUsd: 1,
});

const dataDir = mkdtempSync(join(tmpdir(), 'chat-ui-chat02-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHAT-02 设计冻结样例');
await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const report: Record<string, unknown> = { at: new Date().toISOString(), design: CHAT_UI_DESIGN.version, staticDir, realModelRequests: 0 };

try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.getByLabel('对话输入', { exact: true }).waitFor();

  const bodyCss = cssPxForVisual(CHAT_UI_DESIGN.typography.bodyVisualPx);
  const wide = await page.evaluate(({ source, arg }) => {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${source});`)();
    return fn(arg);
  }, { source: measureWide.toString(), arg: { bodyCssTarget: bodyCss } });

  assert.equal(wide.designAttr, CHAT_UI_DESIGN.version);
  assert.ok(wide.paneVisualWidth >= CHAT_UI_DESIGN.layout.preferredMainChatVisualPx - 40, `main chat visual width ${wide.paneVisualWidth}`);
  assert.ok((wide.bodyVisualPx ?? 0) >= CHAT_UI_DESIGN.typography.bodyVisualPx - 0.5, `body visual ${wide.bodyVisualPx}`);
  assert.ok((wide.inputVisualPx ?? 0) >= CHAT_UI_DESIGN.typography.controlVisualPx - 0.5, `input visual ${wide.inputVisualPx}`);
  assert.ok((wide.buttonVisualHeight ?? 0) >= CHAT_UI_DESIGN.hitTarget.pointerVisualMinPx - 1, `hit ${wide.buttonVisualHeight}`);

  await page.setViewportSize({ width: 800, height: 600 });
  const narrow = await page.evaluate(({ source, arg }) => {
    const fn = new Function(`return (${source});`)();
    return fn(arg);
  }, { source: measureNarrow.toString(), arg: CHAT_UI_DESIGN.layout.messageAreaMinFraction });
  assert.ok(narrow.historyFraction + 0.02 >= CHAT_UI_DESIGN.layout.messageAreaMinFraction, `history fraction ${narrow.historyFraction}`);

  await page.getByRole('button', { name: CHAT_UI_DESIGN.composer.expandLabel, exact: true }).click();
  await page.locator('.wb-chat-composer.is-expanded').waitFor();
  await page.getByRole('button', { name: CHAT_UI_DESIGN.composer.collapseLabel, exact: true }).click();

  report.wide = wide;
  report.narrow = narrow;
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat02-wide.png') });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.screenshot({ path: join(evidence, 'chat02-narrow.png') });
  writeFileSync(join(evidence, 'chat02-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat02-report.json'), paneVisualWidth: wide.paneVisualWidth, bodyVisualPx: wide.bodyVisualPx }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  await page.screenshot({ path: join(evidence, 'chat02-failure.png') }).catch(() => {});
  writeFileSync(join(evidence, 'chat02-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
