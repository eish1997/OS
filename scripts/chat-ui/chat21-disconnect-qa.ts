/**
 * CHV-21: disconnect reconnect, service recovery, legacy/missing fields.
 * Isolated offline: no real model, no daily service.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Server } from 'node:http';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chat21-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHAT-21 断线恢复（离线）');
const conversation = app.service.createConversation(project.id, 'CHAT-21 话题', crypto.randomUUID());

await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const port = (app.server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;
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

async function seed(goal: string) {
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
  const body = (await res.json()) as { run: Run };
  app.service.transition(body.run.id, 'running', { startedAt: new Date().toISOString() });
  app.service.transition(body.run.id, 'completed', { endedAt: new Date().toISOString() });
}

async function openChat() {
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByLabel('已有对话', { exact: true }).click();
  await page.locator(`[role=option][data-value="${conversation.id}"]`).click();
  await page.getByRole('button', { name: '打开对话', exact: true }).click();
  await page.locator('.wb-chat-pane').waitFor();
}

async function statusText() {
  return (await page.locator('.wb-status').innerText().catch(() => '')) || '';
}

async function waitStatus(re: RegExp, ms = 25000) {
  await page.waitForFunction(
    (pattern) => {
      const el = document.querySelector('.wb-status');
      return el ? new RegExp(pattern).test(el.textContent || '') : false;
    },
    re.source,
    { timeout: ms },
  );
}

async function stopListening(server: Server) {
  // SSE keeps sockets open; close() alone will not drop them.
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise<void>((done, fail) => server.close((err) => (err ? fail(err) : done())));
}

try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });
  await seed('CHAT-21 历史标记 UNIQUE_DISCONNECT_OK');

  const run = app.store.list<Run>('run').at(-1)!;
  app.store.update<Run>('run', run.id, run.revision, {
    sessionPath: undefined,
    workerPid: undefined,
    leaseOwner: undefined,
  });
  report.legacyRunStripped = true;

  await openChat();
  await page.getByText('UNIQUE_DISCONNECT_OK').waitFor();
  await waitStatus(/已连接/);
  report.initialConnected = true;
  report.statusBeforeDrop = await statusText();

  await stopListening(app.server);
  try {
    await waitStatus(/正在重连|重连/);
  } catch (error) {
    report.statusAfterDrop = await statusText();
    throw error;
  }
  assert.equal(await page.getByText('UNIQUE_DISCONNECT_OK').count(), 1);
  report.serviceDownUi = true;
  report.historyWhileDisconnected = true;

  const runsBefore = app.store.list<Run>('run').filter((r) => r.conversationId === conversation.id).length;
  const input = page.getByLabel('对话输入', { exact: true });
  await input.fill('CHAT-21 断线中勿重复 UNIQUE_NO_DUP');
  await page.getByRole('button', { name: /发送/ }).click();
  await page.waitForTimeout(1000);
  // History must stay (not fake-empty); no new persisted run while the service is down.
  assert.equal(await page.locator('.wb-chat-history').getByText('UNIQUE_DISCONNECT_OK').count(), 1);
  const runsWhileDown = app.store.list<Run>('run').filter((r) => r.conversationId === conversation.id).length;
  assert.equal(runsWhileDown, runsBefore);
  report.noFakeEmptyOrDupWhileDown = true;
  report.runsWhileDown = runsWhileDown;

  await new Promise<void>((done) => app.server.listen(port, '127.0.0.1', done));
  await waitStatus(/已连接/, 35000);
  await page.getByText('UNIQUE_DISCONNECT_OK').waitFor();
  assert.equal(
    app.store.list<Run>('run').filter((r) => r.conversationId === conversation.id).length,
    runsBefore,
  );
  report.serviceRecovered = true;

  await page.reload();
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  if ((await page.locator('.wb-chat-pane').count()) === 0) {
    await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
    await page.getByRole('button', { name: /Pi 对话/ }).click();
    await page.getByLabel('已有对话', { exact: true }).click();
    await page.locator(`[role=option][data-value="${conversation.id}"]`).click();
    await page.getByRole('button', { name: '打开对话', exact: true }).click();
  }
  await page.getByText('UNIQUE_DISCONNECT_OK').waitFor();
  report.legacyReadableAfterReload = true;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat21-disconnect.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chat21-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat21-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  report.statusAtFailure = await statusText();
  await page.screenshot({ path: join(evidence, 'chat21-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chat21-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close().catch(() => {});
}
