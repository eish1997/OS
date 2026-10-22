/**
 * CHAT-12 / CHV-15: edit-resend + regenerate UI/API with tool-safe base.
 * Offline: no real model calls; versionConversation creates queued runs.
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
import { versionTargetsForRun } from '../../server/native-version-ops.js';
import { persistTextChunk } from '../../server/run-stream.js';

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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chat12-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHAT-12 版本操作（离线）');
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

  const conversation = app.service.createConversation(project.id, 'CHAT-12 来源话题', crypto.randomUUID());
  const seeded = await context.request.post(base + '/api/tasks', {
    data: {
      projectId: project.id,
      conversationId: conversation.id,
      goal: 'CHAT-12 版本样例：写文件后答复',
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
  const userId = session.appendMessage({
    role: 'user',
    content: 'CHAT-12 版本样例：写文件后答复',
    timestamp: Date.now(),
  });
  const callId = session.appendMessage({
    role: 'assistant',
    content: [{ type: 'toolCall', id: 'call-1', name: 'write_asset', arguments: { name: 'note.txt' } }],
    api: 'openai-responses',
    provider: 'openai',
    model: 'gpt-5.6-sol',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'toolUse',
    timestamp: Date.now(),
  });
  const toolId = session.appendMessage({
    role: 'toolResult',
    toolCallId: 'call-1',
    toolName: 'write_asset',
    content: [{ type: 'text', text: 'wrote' }],
    isError: false,
    timestamp: Date.now(),
  });
  void callId;
  void toolId;
  session.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: '旧答案：文件已写好' }],
    api: 'openai-responses',
    provider: 'openai',
    model: 'gpt-5.6-sol',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop',
    timestamp: Date.now(),
  });
  // Host transcript needs an assistant message for the regenerate action (native-only is not enough).
  persistTextChunk(app.store, run.id, {
    messageId: 'chat12-final',
    chunk: 0,
    text: '旧答案：文件已写好',
    phase: 'final',
  });
  const fresh = app.store.get<Run>('run', run.id);
  app.store.update<Run>('run', run.id, fresh.revision, {
    sessionId: session.getSessionId(),
    sessionPath: session.getSessionFile(),
  });
  app.service.transition(run.id, 'completed', { endedAt: new Date().toISOString() });

  const targets = versionTargetsForRun(app.store, app.store.get<Run>('run', run.id));
  assert.ok(targets.sourceHash);
  assert.equal(targets.editResend?.userEntryId, userId);
  assert.equal(targets.editResend?.firstMessage, true);
  assert.equal(targets.regenerate?.baseRole, 'toolResult');
  assert.ok((targets.regenerate?.keptToolResults || 0) >= 1);
  report.targets = {
    editBase: targets.editResend?.baseEntryId,
    regenBase: targets.regenerate?.baseEntryId,
    keptTools: targets.regenerate?.keptToolResults,
  };

  // API: regenerate creates independent conversation with sessionAction + tool base
  const regen = await context.request.post(base + `/api/runs/${run.id}/version`, {
    data: {
      projectId: project.id,
      kind: 'regenerate',
      sourceHash: targets.sourceHash,
      title: 'CHAT-12 重新生成副本',
      goal: '重新生成答复（保留已完成工具结果，排除旧答案）',
      commandId: crypto.randomUUID(),
    },
  });
  assert.equal(regen.ok(), true, await regen.text());
  const regenBody = (await regen.json()) as { conversation: Conversation; run: Run };
  assert.equal(regenBody.conversation.branch?.versionKind, 'regenerate');
  assert.equal(regenBody.run.sessionAction, 'regenerate');
  assert.equal(regenBody.run.continuation?.entryId, targets.regenerate?.baseEntryId);
  assert.notEqual(regenBody.conversation.id, conversation.id);
  report.regenerateApi = true;

  // API: edit-resend first message → no continuation (empty history)
  const edit = await context.request.post(base + `/api/runs/${run.id}/version`, {
    data: {
      projectId: project.id,
      kind: 'edit_resend',
      sourceHash: targets.sourceHash,
      title: 'CHAT-12 编辑重发副本',
      goal: 'CHAT-12 修改后的指令',
      commandId: crypto.randomUUID(),
      assetIds: [],
    },
  });
  assert.equal(edit.ok(), true, await edit.text());
  const editBody = (await edit.json()) as { conversation: Conversation; run: Run };
  assert.equal(editBody.conversation.branch?.versionKind, 'edit_resend');
  assert.equal(editBody.run.continuation, undefined);
  assert.equal(editBody.run.versionKind, 'edit_resend');
  report.editResendApi = true;

  // Idempotent replay
  const replayCmd = crypto.randomUUID();
  const payload = {
    projectId: project.id,
    kind: 'regenerate' as const,
    sourceHash: targets.sourceHash,
    title: 'CHAT-12 幂等重生',
    goal: '重新生成答复（保留已完成工具结果，排除旧答案）',
    commandId: replayCmd,
  };
  const first = await context.request.post(base + `/api/runs/${run.id}/version`, { data: payload });
  const second = await context.request.post(base + `/api/runs/${run.id}/version`, { data: payload });
  assert.equal(first.ok(), true);
  assert.equal(second.ok(), true);
  const a = (await first.json()) as { run: Run };
  const b = (await second.json()) as { run: Run };
  assert.equal(a.run.id, b.run.id);
  report.idempotent = true;

  // Browser: actions visible + form opens with tool base caption
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByLabel('已有对话', { exact: true }).click();
  await page.locator(`[role=option][data-value="${conversation.id}"]`).click();
  await page.getByRole('button', { name: '打开对话', exact: true }).click();
  const pane = page.locator('.wb-chat-pane');
  await pane.locator('[data-chat-edit-resend]').first().waitFor();
  await pane.locator('[data-chat-regenerate]').first().waitFor();
  report.actionsVisible = true;

  await pane.locator('[data-chat-regenerate]').first().click();
  await pane.locator('[data-chat-version-form]').waitFor();
  await pane.locator('[data-chat-version-tool-base]').waitFor();
  const toolBase = await pane.locator('[data-chat-version-tool-base]').innerText();
  assert.match(toolBase, /toolResult|保留/);
  report.regenerateForm = true;

  await pane.locator('[data-chat-edit-resend]').first().click();
  await pane.locator('[data-chat-version-edit-base]').waitFor();
  const editBase = await pane.locator('[data-chat-version-edit-base]').innerText();
  assert.match(editBase, /首条|空历史/);
  report.editResendForm = true;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat12-version.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chat12-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat12-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chat12-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chat12-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
