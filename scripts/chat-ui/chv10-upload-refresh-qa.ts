/**
 * CHV-10 remainder: upload interrupt → recovery UI → same-file resume;
 * refresh keeps draft text + attached asset; late task response must not wipe new input.
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

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_1X1 = Buffer.from(PNG_B64, 'base64');

Object.assign(config, {
  apiKey: 'offline-chat-ui-only',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  maxCalls: 8,
  budgetUsd: 8,
  reservePerCallUsd: 1,
});

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv10-up-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-10 上传刷新（离线）');

await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
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
  const input = page.getByLabel('对话输入', { exact: true });
  await input.waitFor();

  // --- Upload interrupt: abort first PUT, intent retained ---
  let abortPut = true;
  await page.route('**/api/uploads/**', async (route) => {
    if (route.request().method() === 'PUT' && abortPut) {
      abortPut = false;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.getByLabel('选择聊天图片', { exact: true }).setInputFiles({
    name: 'chv10-resume.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await pane.locator('[data-upload-recovery]').waitFor({ timeout: 15000 });
  assert.match(await pane.locator('[data-upload-recovery]').innerText(), /chv10-resume\.png/);
  report.uploadInterrupted = { recoveryUi: true };

  // Same file resume completes attachment
  await page.getByLabel('选择聊天图片', { exact: true }).setInputFiles({
    name: 'chv10-resume.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.wb-chat-pane .wb-attachment-chip').length >= 1,
    null,
    { timeout: 20000 },
  );
  assert.equal(await pane.locator('[data-upload-recovery]').count(), 0);
  const assetId = await pane.locator('.wb-attachment-chip').first().getAttribute('data-attachment-id');
  assert.ok(assetId);
  report.uploadResumed = { assetId };

  // Draft + attachment survive reload
  const draft = 'CHV10 刷新草稿 UNIQUE_DRAFT_KEEP';
  await input.fill(draft);
  await page.waitForTimeout(400);
  await page.reload();
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  // Layout should restore chat window with conversation
  await page.locator('.wb-chat-pane').waitFor({ timeout: 20000 });
  const restoredInput = page.getByLabel('对话输入', { exact: true });
  await restoredInput.waitFor();
  const restoredDraft = await restoredInput.inputValue();
  assert.equal(restoredDraft, draft);
  await page.locator(`.wb-chat-pane .wb-attachment-chip[data-attachment-id="${assetId}"]`).waitFor({
    timeout: 15000,
  });
  report.refreshKeepsDraftAndAttachment = { draft: restoredDraft, assetId };

  // Late task response must not clear newer composer text
  let holdTask: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    holdTask = resolve;
  });
  await page.route('**/api/tasks', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await gate;
    await route.continue();
  });
  await restoredInput.fill('CHV10 late UNIQUE_FIRST_GOAL');
  await page.locator('[data-chat-primary-action]').click();
  await page.waitForTimeout(300);
  await restoredInput.fill('CHV10 late UNIQUE_NEWER_INPUT');
  holdTask!();
  await page.waitForResponse((r) => r.url().includes('/api/tasks') && r.request().method() === 'POST');
  await page.waitForTimeout(500);
  const afterLate = await restoredInput.inputValue();
  assert.equal(afterLate, 'CHV10 late UNIQUE_NEWER_INPUT');
  report.lateResponseKeepsNewInput = { value: afterLate };

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv10-upload-refresh.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv10-upload-refresh-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv10-upload-refresh-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv10-upload-refresh-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv10-upload-refresh-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
