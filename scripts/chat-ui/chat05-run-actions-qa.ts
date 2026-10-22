/**
 * CHAT-05 / CHV-07 partial / CHV-08: composer expand, pure-image gate,
 * queue/steer radiogroup, Ctrl+Enter matches primary, stop-in-progress disabled.
 * Isolated staticDir; zero model requests. System IME deferred to CHAT-13/14.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import { loadPi } from '../../server/pi-adapter.js';
import type { Run } from '../../shared/contracts.js';
import { CHAT_UI_DESIGN } from '../../shared/chat-ui-design.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1', 'must launch with preload-isolate');

Object.assign(config, {
  apiKey: 'offline-chat-ui-only',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  maxCalls: 4,
  budgetUsd: 4,
  reservePerCallUsd: 1,
});

const dataDir = mkdtempSync(join(tmpdir(), 'chat-ui-chat05-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHAT-05 输入与运行动作（离线）');
const pi = await loadPi();

function saveSession(run: Run) {
  const cwd = join(dataDir, 'workspaces', project.id);
  const dir = join(dataDir, 'sessions', project.id);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(dir, { recursive: true });
  const session = pi.SessionManager.create(cwd, dir);
  session.appendMessage({ role: 'user', content: '离线样例', timestamp: Date.now() });
  session.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: '样例回复' }],
    api: 'openai-responses',
    provider: 'openai',
    model: 'gpt-5.6-sol',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop',
    timestamp: Date.now(),
  });
  const fresh = app.store.get<Run>('run', run.id);
  app.store.update<Run>('run', run.id, fresh.revision, {
    sessionId: session.getSessionId(),
    sessionPath: session.getSessionFile(),
  });
}

/** Minimal valid 1×1 PNG. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));

const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  staticDir,
  evidence,
  designVersion: CHAT_UI_DESIGN.version,
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
  const input = page.getByLabel('对话输入', { exact: true });
  await input.waitFor();
  const pane = page.locator('.wb-chat-pane');
  const composer = pane.locator('.wb-chat-composer');
  const primary = pane.locator('[data-chat-primary-action]');

  // --- expand / collapse ---
  assert.equal(await composer.evaluate((el) => el.classList.contains('is-expanded')), false);
  await pane.getByRole('button', { name: CHAT_UI_DESIGN.composer.expandLabel, exact: true }).click();
  assert.equal(await composer.evaluate((el) => el.classList.contains('is-expanded')), true);
  await pane.getByRole('button', { name: CHAT_UI_DESIGN.composer.collapseLabel, exact: true }).click();
  assert.equal(await composer.evaluate((el) => el.classList.contains('is-expanded')), false);
  report.composerExpand = { expandLabel: CHAT_UI_DESIGN.composer.expandLabel, collapseOk: true };

  // --- pure image: attach via file picker, empty body blocks send ---
  await page.getByLabel('选择聊天图片', { exact: true }).setInputFiles({
    name: 'chat05-dot.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await pane.locator('.wb-attachments button').waitFor({ timeout: 20000 });
  assert.equal(await input.inputValue(), '');
  await pane.locator('[data-chat-pure-image-hint]').waitFor();
  const pureHint = await pane.locator('[data-chat-pure-image-hint]').innerText();
  assert.equal(pureHint, CHAT_UI_DESIGN.pureImagePrompt);
  assert.equal(await primary.isDisabled(), true, 'pure image must disable primary send');
  report.pureImage = { hint: pureHint, primaryDisabled: true };

  // Clear attachment for subsequent run-action tests
  await pane.locator('.wb-attachments button').first().click();
  await assert.rejects(async () => {
    await pane.locator('[data-chat-pure-image-hint]').waitFor({ timeout: 1500 });
  }, /Timeout/);

  // --- start a task then force running (no model) ---
  await input.fill('CHAT-05 保持运行以切换排队与指导');
  assert.equal(await primary.innerText(), '发送 ↑');
  const [taskResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/tasks') && response.request().method() === 'POST'),
    primary.click(),
  ]);
  assert.equal(taskResponse.ok(), true, await taskResponse.text());
  const live = app.store.list<Run>('run').at(-1);
  assert(live, 'expected run after task create');
  app.service.transition(live.id, 'running', { startedAt: new Date().toISOString() });
  saveSession(live);

  await pane.getByRole('radiogroup', { name: '运行中提交方式', exact: true }).waitFor();
  await pane.locator(`[data-run-stop="${live.id}"]`).waitFor();

  // Default = queue
  const queueRadio = pane.getByRole('radio', { name: '排队追问', exact: true });
  const steerRadio = pane.getByRole('radio', { name: '指导当前执行', exact: true });
  assert.equal(await queueRadio.isChecked(), true);
  assert.equal(await primary.innerText(), '排队追问');

  // Ctrl+Enter while queue → /tasks
  await input.fill('用快捷键排队');
  const [queueByKey] = await Promise.all([
    page.waitForResponse((item) => item.url().endsWith('/api/tasks') && item.request().method() === 'POST'),
    input.press('Control+Enter'),
  ]);
  assert.equal(queueByKey.ok(), true, await queueByKey.text());
  report.ctrlEnterQueue = { status: queueByKey.status(), matchedPrimary: '排队追问' };

  // Switch to steer; Ctrl+Enter must POST /steer (fulfill: no live worker in this offline harness)
  await steerRadio.check();
  assert.equal(await steerRadio.isChecked(), true);
  assert.equal(await primary.innerText(), '指导当前执行');
  await page.route(`**/api/runs/${live.id}/steer`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'offline-steer-input', runId: live.id, text: '用快捷键指导', state: 'accepted' }),
    });
  });
  await input.fill('用快捷键指导');
  const [steerByKey] = await Promise.all([
    page.waitForRequest((item) => item.url().includes(`/runs/${live.id}/steer`) && item.method() === 'POST'),
    input.press('Control+Enter'),
  ]);
  assert.ok(steerByKey.url().includes(`/runs/${live.id}/steer`));
  report.ctrlEnterSteer = { url: steerByKey.url(), matchedPrimary: '指导当前执行' };

  // Attachment disables steer radio
  await page.getByLabel('选择聊天图片', { exact: true }).setInputFiles({
    name: 'chat05-dot2.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await pane.locator('.wb-attachments button').waitFor({ timeout: 20000 });
  assert.equal(await steerRadio.isDisabled(), true, 'steer disabled with attachments');
  await queueRadio.check();
  assert.equal(await primary.innerText(), '排队追问');
  await pane.locator('.wb-attachments button').first().click();

  // --- stop-in-progress via real cancel API (emits SSE) ---
  const stopBtn = pane.locator(`[data-run-stop="${live.id}"]`);
  assert.equal(await stopBtn.isDisabled(), false);
  await Promise.all([
    page.waitForResponse((item) => item.url().includes(`/runs/${live.id}/cancel`) && item.request().method() === 'POST'),
    stopBtn.click(),
  ]);
  await page.waitForFunction(
    (runId) => {
      const btn = document.querySelector(`.wb-chat-pane [data-run-stop="${runId}"]`) as HTMLButtonElement | null;
      return Boolean(btn && btn.disabled && (btn.textContent || '').includes('正在停止'));
    },
    live.id,
    { timeout: 15000 },
  );
  assert.equal(await stopBtn.isDisabled(), true);
  assert.match(await stopBtn.innerText(), /正在停止/);
  const statusLine = await pane.locator(`.wb-chat-runs > [data-run-id="${live.id}"]`).innerText();
  assert.match(statusLine, /正在停止/);
  assert.equal(app.store.get<Run>('run', live.id).cancelRequested, true);
  report.stopInProgress = {
    runId: live.id,
    buttonDisabled: true,
    buttonText: await stopBtn.innerText(),
    statusMentionsStopping: /正在停止/.test(statusLine),
  };

  // Enter alone must not submit (newline). cancelRequested clears activeRun → primary becomes 发送.
  await input.fill('换行不应提交');
  const before = await input.inputValue();
  await input.press('Enter');
  const after = await input.inputValue();
  assert.ok(after.includes('\n'), 'Enter should insert newline, not submit');
  report.enterNewline = { beforeLen: before.length, afterLen: after.length, hasNewline: after.includes('\n') };

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat05-run-actions.png'), fullPage: true });
  writeFileSync(join(evidence, 'chat05-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat05-report.json') }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chat05-failure.png') }).catch(() => {});
  writeFileSync(join(evidence, 'chat05-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
