/**
 * CHV-18 remainder: float → icon collapse → reload → expand restores draft.
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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chat18-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-18 收起刷新（离线）');

await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(25000);
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  staticDir,
  realModelRequests: 0,
  blockedExternalConnectsBefore: blockedExternalConnects(),
};

try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  const pane = page.locator('.wb-chat-pane');
  await pane.waitFor();
  await pane.getByLabel('对话输入', { exact: true }).fill('CHV18 收起草稿 UNIQUE_COLLAPSE_DRAFT');

  await page.getByLabel('悬浮', { exact: true }).click();
  await page.locator('.wb-floating .wb-chat-pane, .wb-float .wb-chat-pane').waitFor();
  report.floated = true;

  await page.getByLabel('收起为图标', { exact: true }).click();
  await page.locator('[data-window-icon]').waitFor();
  assert.equal(await page.locator('.wb-chat-pane').count(), 0);
  report.collapsedToIcon = true;

  // Wait for layout autosave then reload
  await page.waitForTimeout(900);
  await page.reload();
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.locator('[data-window-icon]').waitFor({ timeout: 15000 });
  report.iconSurvivedReload = true;

  await page.locator('[data-window-icon]').dblclick();
  await page.locator('.wb-floating .wb-chat-pane, .wb-chat-pane').waitFor();
  const restored = await page.getByLabel('对话输入', { exact: true }).inputValue();
  assert.equal(restored, 'CHV18 收起草稿 UNIQUE_COLLAPSE_DRAFT');
  report.draftRestoredAfterExpand = true;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat18-collapse-refresh.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chat18-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat18-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chat18-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chat18-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
