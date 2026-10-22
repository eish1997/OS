/**
 * CHV-15：压缩边界 — appendCompaction 后 version-targets.afterCompaction=true，
 * 且重新生成基点落在压缩之后的用户/工具节点；UI 可见「位于压缩之后」。
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
import { versionTargetsForRun } from '../../server/native-version-ops.js';
import { persistTextChunk } from '../../server/run-stream.js';
import {
  resolveVersionTargets,
  type ChatVersionNativeMessage,
} from '../../shared/chat-version-ops.js';
import type { Run } from '../../shared/contracts.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
fs.mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1');

// Unit: summaryKind on owned path marks afterCompaction
{
  const messages: ChatVersionNativeMessage[] = [
    { id: 'u0', parentId: null, role: 'user', content: 'before' },
    {
      id: 'a0',
      parentId: 'u0',
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: 'old' }],
      summaryKind: 'compaction',
    },
    { id: 'u1', parentId: 'a0', role: 'user', content: 'after' },
    {
      id: 'a1',
      parentId: 'u1',
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: 'new' }],
    },
  ];
  const targets = resolveVersionTargets(messages);
  assert.equal(targets.regenerate?.afterCompaction, true);
  assert.equal(targets.regenerate?.targetEntryId, 'a1');
  assert.equal(targets.editResend?.userEntryId, 'u0');
}

Object.assign(config, {
  apiKey: 'offline-chat-ui-only',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  maxCalls: 8,
  budgetUsd: 8,
  reservePerCallUsd: 1,
});

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv15-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-15 压缩边界（离线）');
const pi = await loadPi();

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

  const conversation = app.service.createConversation(project.id, 'CHV-15 压缩话题', crypto.randomUUID());
  const seeded = await context.request.post(base + '/api/tasks', {
    data: {
      projectId: project.id,
      conversationId: conversation.id,
      goal: 'CHV15 before compaction UNIQUE_PRE',
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
  const userBefore = session.appendMessage({
    role: 'user',
    content: 'CHV15 before compaction UNIQUE_PRE',
    timestamp: Date.now(),
  });
  session.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'old answer before compact' }],
    api: 'openai-responses',
    provider: 'openai',
    model: 'gpt-5.6-sol',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop',
    timestamp: Date.now(),
  });
  session.appendCompaction('Preserve UNIQUE_PRE objective; earlier material summarized.', userBefore, 9000);
  session.appendMessage({
    role: 'user',
    content: 'CHV15 after compaction UNIQUE_POST',
    timestamp: Date.now(),
  });
  session.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'new answer after compact' }],
    api: 'openai-responses',
    provider: 'openai',
    model: 'gpt-5.6-sol',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop',
    timestamp: Date.now(),
  });

  persistTextChunk(app.store, run.id, {
    messageId: 'chv15-final',
    chunk: 0,
    text: 'new answer after compact',
    phase: 'final',
  });
  const fresh = app.store.get<Run>('run', run.id);
  app.store.update<Run>('run', run.id, fresh.revision, {
    sessionId: session.getSessionId(),
    sessionPath: session.getSessionFile(),
  });
  app.service.transition(run.id, 'completed', { endedAt: new Date().toISOString() });

  const targets = versionTargetsForRun(app.store, app.store.get<Run>('run', run.id));
  assert.ok(targets.regenerate, `expected regenerate: ${JSON.stringify(targets)}`);
  assert.equal(targets.regenerate.afterCompaction, true, JSON.stringify(targets.regenerate));
  assert.ok(targets.sourceHash);
  report.targets = {
    afterCompaction: targets.regenerate.afterCompaction,
    regenBase: targets.regenerate.baseEntryId,
    regenTarget: targets.regenerate.targetEntryId,
    editUser: targets.editResend?.userEntryId,
  };

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

  await pane.locator('[data-chat-regenerate]').first().waitFor();
  await pane.locator('[data-chat-regenerate]').first().click();
  await pane.locator('[data-chat-version-form]').waitFor();
  await pane.locator('[data-chat-version-tool-base]').waitFor();
  const toolBase = await pane.locator('[data-chat-version-tool-base]').innerText();
  assert.match(toolBase, /位于压缩之后/);
  report.uiAfterCompactionLabel = true;
  report.toolBaseCaption = toolBase;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv15-compaction.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv15-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv15-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv15-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv15-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
