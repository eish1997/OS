/**
 * CHV-12 remainder: unknown tool side-effect blocks plain retry until reconciled.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import { persistTextChunk } from '../../server/run-stream.js';
import { persistToolProgress, toolExecutions } from '../../server/tool-progress.js';
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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv12-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-12 未知副作用（离线）');

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
  const pane = page.locator('.wb-chat-pane');
  await pane.waitFor();
  const conversation = app.store.list<Conversation>('conversation').find((c) => c.projectId === project.id)!;

  const res = await context.request.post(base + '/api/tasks', {
    data: {
      projectId: project.id,
      conversationId: conversation.id,
      goal: 'CHV12 未知副作用 UNIQUE_UNKNOWN',
      commandId: crypto.randomUUID(),
      mode: 'pi',
      continueFromRunId: null,
    },
  });
  assert.equal(res.ok(), true, await res.text());
  const run = app.store.list<Run>('run').at(-1)!;
  app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
  persistToolProgress(app.store, run.id, {
    callId: 'chv12-mcp',
    name: 'mcp__fixture__echo',
    source: 'builtin:mcp',
    sequence: 0,
    phase: 'running',
    preview: 'mcp running',
  });
  const result = JSON.stringify({ content: [{ type: 'text', text: 'maybe' }] });
  persistTextChunk(app.store, run.id, {
    messageId: 'chv12-tool-result',
    chunk: 0,
    channel: 'tool_result',
    text: result,
    phase: 'partial',
  });
  persistTextChunk(app.store, run.id, {
    messageId: 'chv12-tool-result',
    chunk: 1,
    channel: 'tool_result',
    text: '',
    phase: 'final',
  });
  persistToolProgress(app.store, run.id, {
    callId: 'chv12-mcp',
    name: 'mcp__fixture__echo',
    source: 'builtin:mcp',
    sequence: 1,
    phase: 'failed',
    preview: 'unknown outcome',
    resultMessageId: `${run.id}:chv12-tool-result`,
    outcomeUnknown: true,
  });
  app.service.transition(run.id, 'interrupted', {
    endedAt: new Date().toISOString(),
    error: '中断，待核对未知工具结果',
  });
  const tool = toolExecutions(app.store, run.id).items[0]!;
  assert.equal(tool.outcomeUnknown, true);
  report.toolSeeded = { id: tool.id, outcomeUnknown: true };

  await pane.getByText('UNIQUE_UNKNOWN').waitFor();
  const card = pane.locator(`.wb-chat-runs > [data-run-id="${run.id}"]`);
  await card.waitFor();
  await pane.locator('[data-chat-recovery-hint]').waitFor();
  assert.match(await pane.locator('[data-chat-recovery-hint]').innerText(), /本轮工具过程.*核对/);
  report.recoveryHint = true;

  const details = card.locator('details').filter({ hasText: '本轮工具过程' });
  await details.locator('summary').click();
  await details.getByText('mcp__fixture__echo').waitFor();

  // Reconcile via API then refresh — hint should clear path for recovery entries
  const recon = await context.request.post(
    base + `/api/runs/${run.id}/tools/${encodeURIComponent(tool.id)}/reconcile`,
    {
      data: {
        revision: tool.revision,
        outcome: 'not_performed',
        evidence: 'offline fixture: no side effect observed',
      },
    },
  );
  assert.equal(recon.ok(), true, await recon.text());
  await pane.getByRole('button', { name: '刷新答复状态', exact: true }).click().catch(() => {});
  await page.waitForTimeout(500);
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
  await page.locator('.wb-chat-pane').getByText('UNIQUE_UNKNOWN').waitFor();
  report.reconciled = true;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv12-unknown-reconcile.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv12-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv12-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv12-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv12-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
