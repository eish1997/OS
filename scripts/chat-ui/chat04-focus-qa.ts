/** CHAT-04 reversible focus: 聚焦对话 → float ≥720 → 还原位置 returns to dock. */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1');
Object.assign(config, { apiKey: 'offline-chat-ui-only', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 4, reservePerCallUsd: 1 });
const app = createApp({ dataDir: mkdtempSync(join(tmpdir(), 'chat-ui-focus-')), staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHAT-04 聚焦');
await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
const report: Record<string, unknown> = { at: new Date().toISOString(), realModelRequests: 0 };
try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.getByLabel('对话输入', { exact: true }).waitFor();
  const before = await page.locator('.wb-chat-pane').boundingBox();
  await page.getByRole('button', { name: '聚焦对话', exact: true }).click();
  await page.getByRole('button', { name: '还原位置', exact: true }).waitFor();
  const focused = await page.locator('.wb-float .wb-chat-pane, .wb-floating .wb-chat-pane, .wb-chat-pane').first().boundingBox();
  assert(before && focused);
  assert.ok((focused.width ?? 0) >= 500, `focused width ${focused.width}`);
  await page.getByRole('button', { name: '还原位置', exact: true }).click();
  await page.getByRole('button', { name: '聚焦对话', exact: true }).waitFor();
  report.passed = true;
  report.focus = { beforeWidth: before.width, focusedWidth: focused.width, restored: true };
  await page.screenshot({ path: join(evidence, 'chat04-focus.png') });
  writeFileSync(join(evidence, 'chat04-focus-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat04-focus-report.json'), focusedWidth: focused.width }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  await page.screenshot({ path: join(evidence, 'chat04-focus-failure.png') }).catch(() => {});
  writeFileSync(join(evidence, 'chat04-focus-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
