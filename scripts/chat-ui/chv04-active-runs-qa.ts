/**
 * CHV-04 / CHAT-01: waiting interaction + three queued follow-ups keep answer/stop reachable.
 * Uses isolated staticDir (CHAT_UI_STATIC or output/chat-ui-build). Zero model requests.
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
import { createInteraction } from '../../server/plugin-interaction.js';
import type { Run } from '../../shared/contracts.js';

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

const dataDir = mkdtempSync(join(tmpdir(), 'chat-ui-chv04-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHAT-01 活动操作可达（离线）');
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

await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));

const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  staticDir,
  evidence,
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
  await page.getByLabel('对话输入', { exact: true }).waitFor();
  const sendButton = page.getByRole('button', { name: '发送 ↑', exact: true });
  await sendButton.waitFor({ state: 'visible' });
  await page.getByLabel('对话输入', { exact: true }).fill('保持运行，检查排队追问是否遮掉当前执行');
  assert.equal(await sendButton.isDisabled(), false, 'send must be enabled after input when model is configured');
  const [taskResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/tasks') && response.request().method() === 'POST'),
    sendButton.click(),
  ]);
  const taskBody = await taskResponse.text();
  assert.equal(taskResponse.ok(), true, `create task failed: ${taskResponse.status()} ${taskBody}`);
  report.taskCreate = { status: taskResponse.status(), body: taskBody.slice(0, 500) };

  const live = app.store.list<Run>('run').at(-1);
  assert(live, `expected a run after task create; tasks=${app.store.list('task').length} runs=${app.store.list('run').length}`);
  app.service.transition(live.id, 'running', { startedAt: new Date().toISOString() });
  saveSession(live);
  const latest = app.store.get<Run>('run', live.id);
  app.store.update<Run>('run', live.id, latest.revision, {
    mcpManifest: {
      schemaVersion: 1,
      signature: 'offline-chat-ui',
      enabled: true,
      globalRevision: 0,
      projectRevision: 0,
      servers: [],
      autoEnableCodemode: true,
      codemode: true,
      toolSearch: false,
    },
  });
  createInteraction(app.store, live.id, {
    id: 'chat-ui-confirm',
    source: 'builtin:mcp',
    kind: 'confirm',
    title: '当前执行等待确认',
    message: '这个问题应该一直能回答',
    timeoutMs: 60000,
  });
  await page.getByRole('group', { name: '当前执行等待确认', exact: true }).waitFor();

  for (let i = 0; i < 3; i += 1) {
    await page.getByLabel('对话输入', { exact: true }).fill(`排队追问 ${i + 1}`);
    const [response] = await Promise.all([
      page.waitForResponse((item) => item.url().endsWith('/api/tasks') && item.request().method() === 'POST'),
      page.getByRole('button', { name: '排队追问', exact: true }).click(),
    ]);
    assert.equal(response.ok(), true, await response.text());
  }

  const pane = page.locator('.wb-chat-pane');
  // fieldset legend exposes accessible name; do not require aria-label attribute.
  await pane.getByRole('group', { name: '当前执行等待确认', exact: true }).waitFor({ timeout: 20000 });
  await pane.locator(`[data-run-stop="${live.id}"]`).waitFor({ timeout: 20000 });
  await page.waitForFunction(() => {
    const root = document.querySelector('.wb-chat-pane');
    if (!root) return false;
    const cards = root.querySelectorAll('.wb-chat-runs > [data-run-id]');
    const queued = root.querySelectorAll('.wb-chat-runs > [data-run-status="queued"]');
    return cards.length >= 4 && queued.length >= 3;
  }, undefined, { timeout: 20000 });

  const renderedCards = await pane.locator('.wb-chat-runs > [data-run-id]').count();
  const pendingConfirmation = await pane.getByRole('group', { name: '当前执行等待确认', exact: true }).count();
  const activeStop = await pane.locator(`[data-run-stop="${live.id}"]`).count();
  const queuedStops = await pane.locator('[data-run-status="queued"] [data-run-stop]').count();
  const answerButtons = await pane.getByRole('group', { name: '当前执行等待确认', exact: true }).getByRole('button', { name: '同意' }).count();
  const statuses = app.store
    .list<Run>('run')
    .filter((run) => run.conversationId === live.conversationId)
    .map((run) => ({ id: run.id, status: run.status }));

  assert.equal(app.store.get<Run>('run', live.id).status, 'waiting_interaction');
  assert.ok(renderedCards >= 4, `expected >=4 cards, got ${renderedCards}`);
  assert.equal(pendingConfirmation, 1);
  assert.equal(activeStop, 1);
  assert.equal(queuedStops, 3);
  assert.equal(answerButtons, 1, 'pending confirm must remain answerable');
  assert.deepEqual(errors, []);
  const turnCount = await pane.locator('.wb-chat-turn[data-turn-id]').count();
  const anchoredMessages = await pane.locator('.wb-message[data-host-sequence]').count();
  assert.ok(turnCount >= 1, 'CHAT-03 turns must render');
  assert.ok(anchoredMessages >= 1, 'CHAT-03 host anchors must render');

  report.scenario = {
    actualActiveRunStatus: 'waiting_interaction',
    runStatuses: statuses,
    renderedCards,
    pendingConfirmationRendered: pendingConfirmation,
    activeStopVisible: activeStop === 1,
    queuedStopCount: queuedStops,
    turnCount,
    anchoredMessages,
    composerButtons: await pane.locator('.wb-chat-composer button').allTextContents(),
    visibleRunText: await pane.locator('.wb-chat-runs').innerText(),
  };
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv04-active-runs-visible.png'), fullPage: true });
  writeFileSync(join(evidence, 'chv04-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv04-report.json'), renderedCards, pendingConfirmation, activeStop }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv04-failure.png') }).catch(() => {});
  writeFileSync(join(evidence, 'chv04-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
