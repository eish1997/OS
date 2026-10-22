/**
 * CHV-16：导出 → 导入校验 → prepare/restore 建话题 → UI 重开矩阵（零真实模型完成）。
 * 手动压缩入口可发现性沿用 chat11；本脚本补完整重开链。
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import { loadPi } from '../../server/pi-adapter.js';
import { NativeImports } from '../../server/native-imports.js';
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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv16-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-16 导入重开（离线）');
const pi = await loadPi();

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

  // Source conversation + native session for export
  const source = app.service.createConversation(project.id, 'CHV-16 导出源', crypto.randomUUID());
  const seeded = await context.request.post(base + '/api/tasks', {
    data: {
      projectId: project.id,
      conversationId: source.id,
      goal: 'CHV16 EXPORT UNIQUE_EXPORT_BODY',
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
  const entryId = session.appendMessage({
    role: 'user',
    content: 'CHV16 EXPORT UNIQUE_EXPORT_BODY',
    timestamp: Date.now(),
  });
  session.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'CHV16 exported answer' }],
    api: 'openai-responses',
    provider: 'openai',
    model: 'gpt-5.6-sol',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop',
    timestamp: Date.now(),
  });
  const sessionFile = session.getSessionFile()!;
  const originalBytes = fs.readFileSync(sessionFile);
  const sha256 = createHash('sha256').update(originalBytes).digest('hex');
  const fresh = app.store.get<Run>('run', run.id);
  app.store.update<Run>('run', run.id, fresh.revision, {
    sessionId: session.getSessionId(),
    sessionPath: sessionFile,
  });
  app.service.transition(run.id, 'completed', { endedAt: new Date().toISOString() });

  // 1) Export byte-exact
  const exportRes = await context.request.get(
    `${base}/api/runs/${run.id}/native-export?projectId=${project.id}`,
  );
  assert.equal(exportRes.ok(), true, await exportRes.text());
  const exported = Buffer.from(await exportRes.body());
  assert.deepEqual(exported, originalBytes);
  assert.equal(exportRes.headers()['x-content-sha256'], sha256);
  report.exportExact = true;

  // 2) Import via API (same bytes the UI would upload), then UI preview/restore/reopen
  const imports = new NativeImports(app.store, dataDir);
  const item = imports.begin(project.id, 'chv16-export.jsonl', exported.length, sha256, 'upload');
  imports.write(project.id, item.id, 0, exported);
  report.importStored = true;

  const previewRes = await context.request.get(
    `${base}/api/native-imports/${item.id}/preview?projectId=${project.id}`,
  );
  assert.equal(previewRes.ok(), true, await previewRes.text());
  const preview = (await previewRes.json()) as { preview: { entryCount: number; messageCount: number } };
  assert.ok(preview.preview.entryCount >= 2);
  report.preview = preview.preview;

  const prepareRes = await context.request.post(`${base}/api/native-imports/${item.id}/prepare`, {
    data: { projectId: project.id, sha256, entryId },
  });
  assert.equal(prepareRes.ok(), true, await prepareRes.text());
  const confirmation = (await prepareRes.json()) as { id: string };

  const restoreRes = await context.request.post(`${base}/api/native-imports/${item.id}/restore`, {
    data: {
      projectId: project.id,
      confirmationId: confirmation.id,
      title: 'CHV-16 恢复话题 UNIQUE_REOPEN',
      goal: 'Continue after import UNIQUE_REOPEN_GOAL',
      commandId: crypto.randomUUID(),
      acceptCurrentEnvironment: true,
      externalEffectsReview: '离线样例无外部操作',
    },
  });
  assert.equal(restoreRes.ok(), true, await restoreRes.text());
  const restored = (await restoreRes.json()) as { conversation: Conversation; run?: Run };
  assert.ok(restored.conversation?.id);
  report.restoredConversationId = restored.conversation.id;
  // Cancel any queued model work — CHV-16 reopen matrix must not depend on real model
  if (restored.run?.id) {
    try {
      app.service.cancel(restored.run.id);
    } catch {
      /* already terminal */
    }
  }
  const queued = app.store.list<Run>('run').filter((r) => r.conversationId === restored.conversation.id);
  for (const r of queued) {
    if (['queued', 'running'].includes(r.status)) {
      try {
        app.service.cancel(r.id);
      } catch {
        /* */
      }
    }
  }
  report.restoreCreated = true;

  // 3) UI: open source first (topics bar needs a bound conversation), then import/compact + reopen
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByLabel('已有对话', { exact: true }).click();
  await page.locator(`[role=option][data-value="${source.id}"]`).click();
  await page.getByRole('button', { name: '打开对话', exact: true }).click();
  const pane = page.locator('.wb-chat-pane');
  await pane.locator('[data-chat-topics]').waitFor();
  await pane.getByText('UNIQUE_EXPORT_BODY').waitFor();
  report.sourcePreserved = true;

  await pane.locator('[data-chat-overflow-toggle]').click();
  await pane.locator('[data-chat-topic-import]').click();
  await pane.locator('[data-chat-import-toggle][aria-expanded="true"]').waitFor();
  await pane.locator('[data-chat-import-panel]').waitFor();
  report.importUiReachable = true;

  await pane.locator('[data-chat-overflow-toggle]').click();
  await pane.locator('[data-chat-topic-compact]').click();
  await pane.locator('[data-chat-compact-run]').waitFor();
  report.compactEntryReachable = true;

  // Reopen restored conversation via in-pane 切换话题 (bound chat no longer shows empty-state 已有对话)
  await page.getByLabel('切换话题', { exact: true }).selectOption(restored.conversation.id);
  await pane.locator('[data-chat-topic-title]').filter({ hasText: /UNIQUE_REOPEN|恢复/ }).waitFor();
  report.reopenedViaTopicSwitch = true;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv16-import-reopen.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv16-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv16-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv16-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv16-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
