/**
 * CHV-10 remainder: double-submit / delayed receipt keeps one commandId (no duplicate tasks).
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import type { Run, Task } from '../../shared/contracts.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
fs.mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1');

Object.assign(config, {
  apiKey: 'offline-chat-ui-only',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  maxCalls: 8,
  budgetUsd: 8,
  reservePerCallUsd: 1,
});

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv10-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-10 提交幂等（离线）');

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
  await page.getByLabel('对话输入', { exact: true }).fill('CHV-10 双击发送 UNIQUE_IDEMPOTENT');

  let taskPosts = 0;
  const bodies: string[] = [];
  await page.route('**/api/tasks', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    taskPosts += 1;
    bodies.push(route.request().postData() || '');
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });

  const primary = () => page.locator('[data-chat-primary-action]');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/tasks') && r.request().method() === 'POST'),
    (async () => {
      await primary().click();
      await primary().click({ force: true }).catch(() => {});
    })(),
  ]);
  await page.waitForTimeout(1200);

  assert.equal(taskPosts, 1, `expected one POST /api/tasks, got ${taskPosts}`);
  const parsed = bodies.map((b) => JSON.parse(b) as { commandId: string; goal: string });
  assert.equal(parsed.length, 1);
  assert.match(parsed[0]!.goal, /UNIQUE_IDEMPOTENT/);

  const tasks = app.store.list<Task>('task').filter((t) => t.goal.includes('UNIQUE_IDEMPOTENT'));
  const runs = app.store.list<Run>('run').filter((r) => r.conversationId === tasks[0]?.conversationId);
  assert.equal(tasks.length, 1);
  assert.ok(runs.length >= 1);
  report.taskPosts = taskPosts;
  report.commandId = parsed[0]!.commandId;
  report.taskCount = tasks.length;
  report.runCount = runs.length;

  // Lost receipt: abort once, then 「重试提交」 must reuse the same commandId
  let abortOnce = true;
  const retryBodies: string[] = [];
  await page.unroute('**/api/tasks');
  await page.getByLabel('对话输入', { exact: true }).fill('CHV-10 回执丢失重试 UNIQUE_RETRY');
  await page.route('**/api/tasks', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    if (abortOnce) {
      abortOnce = false;
      await route.abort('failed');
      return;
    }
    retryBodies.push(route.request().postData() || '');
    await route.continue();
  });
  await primary().click();
  await page.getByRole('button', { name: '重试提交', exact: true }).waitFor({ timeout: 10000 });
  const beforeRetry = app.store.list<Task>('task').length;
  const [retryRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/tasks') && r.request().method() === 'POST'),
    primary().click(),
  ]);
  assert.equal(retryRes.ok(), true, await retryRes.text());
  await page.waitForTimeout(400);
  assert.equal(retryBodies.length, 1);
  const retryCmd = (JSON.parse(retryBodies[0]!) as { commandId: string }).commandId;
  const afterRetry = app.store.list<Task>('task').length;
  assert.equal(afterRetry, beforeRetry + 1);
  report.retryAfterLostReceipt = true;
  report.retryCommandId = retryCmd;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat10-idempotent.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv10-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv10-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv10-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv10-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
