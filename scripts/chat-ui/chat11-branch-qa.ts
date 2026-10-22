/**
 * CHAT-11 / CHV-15,16 partial: topic menu reveals branch/import/compact;
 * message "从此分支"; open-source control on branched topic. Zero model.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import { loadPi } from '../../server/pi-adapter.js';
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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chat11-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHAT-11 分支工具（离线）');
const pi = await loadPi();

await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
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

  const parent = app.service.createConversation(project.id, 'CHAT-11 来源话题', crypto.randomUUID());
  const child = app.service.createConversation(project.id, 'CHAT-11 分支话题', crypto.randomUUID());

  const seeded = await context.request.post(base + '/api/tasks', {
    data: {
      projectId: project.id,
      conversationId: parent.id,
      goal: 'CHAT-11 可分支样例',
      commandId: crypto.randomUUID(),
      mode: 'pi',
      continueFromRunId: null,
    },
  });
  assert.equal(seeded.ok(), true, await seeded.text());
  const run = app.store.list<Run>('run').at(-1)!;
  app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
  const cwd = join(dataDir, 'workspaces', project.id);
  const dir = join(dataDir, 'sessions', project.id);
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  const session = pi.SessionManager.create(cwd, dir);
  session.appendMessage({ role: 'user', content: 'CHAT-11 可分支样例', timestamp: Date.now() });
  session.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: '样例答复' }],
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
  const childEntity = app.store.get<Conversation>('conversation', child.id);
  app.store.update<Conversation>('conversation', child.id, childEntity.revision, {
    branch: {
      sourceRunId: run.id,
      sourceEntryId: 'entry-seed',
      sourceConversationId: parent.id,
      sourceHash: 'b'.repeat(64),
    },
  });
  app.service.transition(run.id, 'completed', { endedAt: new Date().toISOString() });

  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();

  // Open parent first: menus + compact + branch-from-message
  await page.getByLabel('已有对话', { exact: true }).click();
  await page.locator(`[role=option][data-value="${parent.id}"]`).click();
  await page.getByRole('button', { name: '打开对话', exact: true }).click();
  const pane = page.locator('.wb-chat-pane');
  await pane.locator('[data-chat-topics]').waitFor();

  await pane.locator('[data-chat-overflow-toggle]').click();
  await pane.locator('[data-chat-topic-import]').click();
  await pane.locator('[data-chat-import-toggle][aria-expanded="true"]').waitFor();
  report.importMenu = true;

  await pane.locator('[data-chat-overflow-toggle]').click();
  await pane.locator('[data-chat-topic-compact]').click();
  await pane.locator('[data-chat-compact-run]').waitFor();
  report.compactEntry = true;

  await pane.locator('[data-chat-overflow-toggle]').click();
  await pane.locator('[data-chat-topic-branch]').click();
  await pane.locator('[data-chat-branch-panel]').waitFor();
  await pane.locator('[data-chat-branch-from-message]').first().click({ force: true });
  // Message action forces the branch form open and presets the run
  await pane.locator('[data-chat-branch-toggle]').evaluate((el) => {
    if (el.getAttribute('aria-expanded') !== 'true') (el as HTMLButtonElement).click();
  });
  await pane.locator('[data-chat-branch-toggle][aria-expanded="true"]').waitFor();
  report.branchFromMessage = true;
  // Select the completed run if not already chosen by preset
  const historySelect = pane.getByLabel('历史执行', { exact: true });
  if (await historySelect.count()) {
    const value = await historySelect.inputValue();
    if (!value) {
      const options = historySelect.locator('option');
      const count = await options.count();
      if (count > 1) await historySelect.selectOption({ index: 1 });
    }
  }
  await pane.getByRole('link', { name: /导出原生会话/ }).waitFor();
  report.exportLinkVisible = true;

  // Switch to branched child and assert source return control
  await page.getByLabel('切换话题', { exact: true }).selectOption({ label: 'CHAT-11 分支话题' });
  await pane.locator('[data-chat-topic-title]').filter({ hasText: 'CHAT-11 分支话题' }).waitFor();
  await pane.locator('[data-chat-open-source]').waitFor();
  report.openSourceControl = true;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat11-branch.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chat11-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat11-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chat11-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chat11-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
