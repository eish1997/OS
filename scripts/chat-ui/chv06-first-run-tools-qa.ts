/**
 * CHV-06 remainder: expand all-history to first failed run and open tool process details.
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
import { persistToolProgress } from '../../server/tool-progress.js';
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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv06-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-06 首轮工具（离线）');

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

  let firstFailedId = '';
  for (let i = 0; i < 4; i += 1) {
    const res = await context.request.post(base + '/api/tasks', {
      data: {
        projectId: project.id,
        conversationId: conversation.id,
        goal: i === 0 ? 'CHV06 首轮失败 UNIQUE_FIRST_FAIL' : `CHV06 后续 ${i}`,
        commandId: crypto.randomUUID(),
        mode: 'pi',
        continueFromRunId: null,
      },
    });
    assert.equal(res.ok(), true, await res.text());
    const run = app.store.list<Run>('run').at(-1)!;
    app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
    if (i === 0) {
      firstFailedId = run.id;
      persistToolProgress(app.store, run.id, {
        callId: 'chv06-call',
        name: 'read_asset',
        source: '工作台/原生工具',
        sequence: 0,
        phase: 'running',
        preview: 'CHV06_TOOL_PREVIEW_RUNNING',
      });
      const result = JSON.stringify({ content: [{ type: 'text', text: 'CHV06_TOOL_RESULT_BODY' }] });
      persistTextChunk(app.store, run.id, {
        messageId: 'chv06-tool-result',
        chunk: 0,
        channel: 'tool_result',
        text: result,
        phase: 'partial',
      });
      persistTextChunk(app.store, run.id, {
        messageId: 'chv06-tool-result',
        chunk: 1,
        channel: 'tool_result',
        text: '',
        phase: 'final',
      });
      persistToolProgress(app.store, run.id, {
        callId: 'chv06-call',
        name: 'read_asset',
        source: '工作台/原生工具',
        sequence: 1,
        phase: 'failed',
        preview: 'CHV06_TOOL_PREVIEW_FAILED',
        resultMessageId: `${run.id}:chv06-tool-result`,
      });
      app.service.transition(run.id, 'failed', {
        endedAt: new Date().toISOString(),
        error: 'CHV06 离线失败样例',
      });
    } else {
      app.service.transition(run.id, 'completed', { endedAt: new Date().toISOString() });
    }
  }

  await pane.locator('[data-chat-overflow-toggle]').click();
  await pane.locator('[data-chat-overflow-menu] [data-chat-all-runs]').click();
  const failed = pane.locator(`.wb-chat-runs > [data-run-id="${firstFailedId}"]`);
  await failed.waitFor();
  assert.equal(await failed.getAttribute('data-run-status'), 'failed');
  // Goal text lives in message history; card exposes tool process entry.
  await pane.getByText('UNIQUE_FIRST_FAIL').waitFor();
  const details = failed.locator('details').filter({ hasText: '本轮工具过程' });
  await details.locator('summary').click();
  await details.getByText('read_asset').waitFor();
  await details.getByText(/CHV06_TOOL_PREVIEW_FAILED|失败/).waitFor();
  report.firstRunToolExpand = { runId: firstFailedId, opened: true };

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv06-first-run-tools.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv06-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv06-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv06-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv06-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
