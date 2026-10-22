/**
 * CHV-14 remainder: deep history pagination + cancel in-flight search.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import type { Conversation, Run } from '../../shared/contracts.js';

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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv14-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-14 深历史（离线）');
const conversation = app.service.createConversation(project.id, 'CHV-14 话题', crypto.randomUUID());

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

  // >50 messages so olderThan appears (page size 50)
  for (let i = 0; i < 55; i += 1) {
    const goal = i === 0 ? 'CHV14 最早 UNIQUE_DEEP_FIRST' : `CHV14 消息 ${i} UNIQUE_DEEP_${i}`;
    const res = await context.request.post(base + '/api/tasks', {
      data: {
        projectId: project.id,
        conversationId: conversation.id,
        goal,
        commandId: crypto.randomUUID(),
        mode: 'pi',
        continueFromRunId: null,
      },
    });
    assert.equal(res.ok(), true, await res.text());
    const run = app.store.list<Run>('run').at(-1)!;
    app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
    app.service.transition(run.id, 'completed', { endedAt: new Date().toISOString() });
  }
  report.seededMessages = 55;

  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByLabel('已有对话', { exact: true }).click();
  await page.locator(`[role=option][data-value="${conversation.id}"]`).click();
  await page.getByRole('button', { name: '打开对话', exact: true }).click();
  const pane = page.locator('.wb-chat-pane');
  await pane.waitFor();

  assert.equal(await pane.getByText('UNIQUE_DEEP_FIRST').count(), 0);
  await pane.getByRole('button', { name: '更早的消息', exact: true }).waitFor();
  let pages = 0;
  while ((await pane.getByText('UNIQUE_DEEP_FIRST').count()) === 0 && pages < 5) {
    await pane.getByRole('button', { name: '更早的消息', exact: true }).click();
    await page.waitForTimeout(400);
    pages += 1;
  }
  await pane.getByText('UNIQUE_DEEP_FIRST').waitFor();
  report.deepPagination = { pages, foundOldest: true };

  // Cancel in-flight search
  await pane.locator('[data-chat-toggle-search]').click();
  await page.route('**/api/conversations/*/search**', async (route) => {
    await new Promise((r) => setTimeout(r, 5000));
    await route.continue();
  });
  await page.getByLabel('查找本话题全文', { exact: true }).fill('UNIQUE_DEEP_FIRST');
  await page.getByRole('button', { name: '查找', exact: true }).click();
  await page.getByRole('button', { name: '取消查找', exact: true }).click();
  await pane.getByText('已取消查找').waitFor({ timeout: 5000 });
  report.searchCancel = true;
  await page.unroute('**/api/conversations/*/search**');

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv14-deep-history.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv14-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv14-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv14-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv14-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
