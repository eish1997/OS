/**
 * CHV-05: multi-question reverse answer, expiry, and idempotent double-answer.
 * Offline: no real model.
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
import { answerInteraction, createInteraction } from '../../server/plugin-interaction.js';
import type { PluginInteraction } from '../../shared/plugin-interaction.js';
import type { Run } from '../../shared/contracts.js';

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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv05-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-05 多题答复（离线）');
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

function saveSession(run: Run) {
  const cwd = join(dataDir, 'workspaces', project.id);
  const dir = join(dataDir, 'sessions', project.id);
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  const session = pi.SessionManager.create(cwd, dir);
  session.appendMessage({ role: 'user', content: 'CHV-05', timestamp: Date.now() });
  const fresh = app.store.get<Run>('run', run.id);
  app.store.update<Run>('run', run.id, fresh.revision, {
    sessionId: session.getSessionId(),
    sessionPath: session.getSessionFile(),
  });
}

try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });

  const conversation = app.service.createConversation(project.id, 'CHV-05 话题', crypto.randomUUID());
  const seeded = await context.request.post(base + '/api/tasks', {
    data: {
      projectId: project.id,
      conversationId: conversation.id,
      goal: 'CHV-05 多题样例',
      commandId: crypto.randomUUID(),
      mode: 'pi',
    },
  });
  assert.equal(seeded.ok(), true, await seeded.text());
  const live = app.store.list<Run>('run').at(-1)!;
  app.service.transition(live.id, 'running', { startedAt: new Date().toISOString() });
  saveSession(live);
  const withManifest = app.store.get<Run>('run', live.id);
  app.store.update<Run>('run', live.id, withManifest.revision, {
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

  const q1 = createInteraction(app.store, live.id, {
    id: 'chv05-q1',
    source: 'builtin:mcp',
    kind: 'confirm',
    title: '题目甲 UNIQUE_Q1',
    message: '先创建的甲题',
    timeoutMs: 120_000,
  });
  const q2 = createInteraction(app.store, live.id, {
    id: 'chv05-q2',
    source: 'builtin:mcp',
    kind: 'confirm',
    title: '题目乙 UNIQUE_Q2',
    message: '后创建的乙题',
    timeoutMs: 120_000,
  });
  const expired = createInteraction(
    app.store,
    live.id,
    {
      id: 'chv05-expired',
      source: 'builtin:mcp',
      kind: 'confirm',
      title: '已到期 UNIQUE_EXPIRED',
      message: '应显示到期且不可自动同意',
      timeoutMs: 1,
    },
    Date.now() - 5_000,
  );
  report.seeded = { q1: q1.id, q2: q2.id, expired: expired.id };

  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByLabel('已有对话', { exact: true }).click();
  await page.locator(`[role=option][data-value="${conversation.id}"]`).click();
  await page.getByRole('button', { name: '打开对话', exact: true }).click();

  const pane = page.locator('.wb-chat-pane');
  await pane.getByRole('group', { name: '题目甲 UNIQUE_Q1', exact: true }).waitFor();
  await pane.getByRole('group', { name: '题目乙 UNIQUE_Q2', exact: true }).waitFor();
  assert.equal(
    await pane.getByRole('group', { name: '题目乙 UNIQUE_Q2', exact: true }).getByRole('button', { name: '同意' }).count(),
    1,
  );
  report.bothQuestionsVisible = true;

  // Without a live worker, HTTP answer must NOT auto-apply (scheduler requires connected child).
  const [blocked] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/interactions/') && r.url().includes('/answer')),
    pane.getByRole('group', { name: '题目乙 UNIQUE_Q2', exact: true }).getByRole('button', { name: '同意' }).click(),
  ]);
  assert.equal(blocked.ok(), false);
  assert.equal(app.store.get<PluginInteraction>('plugin_interaction', q2.id).state, 'pending');
  report.uiAnswerBlockedWithoutWorker = true;

  // Reverse-order + idempotent receipts via store (CHAT-14 offline; no worker).
  const q2First = answerInteraction(app.store, live.id, q2.id, q2.revision, 'cmd-q2', true);
  assert.equal(q2First.fresh, true);
  assert.equal(q2First.interaction.state, 'answered');
  report.answeredQ2First = true;

  const q1Second = answerInteraction(app.store, live.id, q1.id, q1.revision, 'cmd-q1', true);
  assert.equal(q1Second.fresh, true);
  report.answeredQ1Second = true;

  const again = answerInteraction(app.store, live.id, q2.id, q2First.interaction.revision, 'cmd-q2', true);
  assert.equal(again.fresh, false);
  let conflicted = false;
  try {
    answerInteraction(app.store, live.id, q2.id, q2First.interaction.revision, 'other-cmd-must-fail', false);
  } catch {
    conflicted = true;
  }
  assert.equal(conflicted, true);
  report.doubleAnswerRejected = true;

  // Expired: not auto-accepted
  const expiredView = app.store.get<PluginInteraction>('plugin_interaction', expired.id);
  assert.notEqual(expiredView.state, 'answered');
  const expiredUi = await pane.getByText(/UNIQUE_EXPIRED|已到期|到期/).count();
  report.expiredVisible = expiredUi > 0;
  report.expiredState = expiredView.state;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv05-multi-question.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv05-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv05-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv05-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv05-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
