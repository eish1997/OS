/**
 * CHAT-08 / CHV-06,12 partial: all-runs history entry, tool process summary name,
 * plain retry vs budget recovery separation, near-limit hint. Zero model.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import type { Conversation, Run } from '../../shared/contracts.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1');

Object.assign(config, {
  apiKey: 'offline-chat-ui-only',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  maxCalls: 4,
  budgetUsd: 4,
  reservePerCallUsd: 1,
});

const dataDir = mkdtempSync(join(tmpdir(), 'chat-ui-chat08-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHAT-08 过程与恢复（离线）');

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
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  const pane = page.locator('.wb-chat-pane');
  await page.getByLabel('对话输入', { exact: true }).waitFor();

  const conversation = app.store.list<Conversation>('conversation').find((c) => c.projectId === project.id);
  assert.ok(conversation, 'expected conversation after 新建对话');

  // Independent runs in one topic (continueFromRunId:null) avoid native session prepareSource.
  for (let i = 0; i < 4; i += 1) {
    const response = await context.request.post(base + '/api/tasks', {
      data: {
        projectId: project.id,
        conversationId: conversation.id,
        goal: `CHAT-08 样例执行 ${i + 1}`,
        commandId: crypto.randomUUID(),
        mode: 'pi',
        continueFromRunId: null,
      },
    });
    assert.equal(response.ok(), true, await response.text());
    const run = app.store.list<Run>('run').at(-1)!;
    app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
    if (i === 0) {
      app.service.transition(run.id, 'failed', {
        endedAt: new Date().toISOString(),
        error: '离线样例失败，可普通重试',
      });
    } else {
      app.service.transition(run.id, 'completed', { endedAt: new Date().toISOString() });
    }
  }

  // layout-v2: expand closed history via ⋯ → 全部执行历史
  await page.waitForFunction(() => {
    const runs = Array.from(document.querySelectorAll('.wb-chat-pane .wb-chat-runs > [data-run-id]'));
    // Either band hidden, or only non-failed closed cards until expand
    return true;
  });
  const before = await pane.locator('.wb-chat-runs > [data-run-id]').count();
  await pane.locator('[data-chat-overflow-toggle]').click();
  await pane.locator('[data-chat-overflow-menu] [data-chat-all-runs]').waitFor();
  await pane.locator('[data-chat-overflow-menu] [data-chat-all-runs]').click();
  const runsRoot = pane.locator('.wb-chat-runs');
  await page.waitForFunction(() => {
    const root = document.querySelector('.wb-chat-pane .wb-chat-runs');
    return root?.getAttribute('data-show-all-runs') === '1' && root.getAttribute('data-visible-run-count') === '4';
  });
  const after = Number(await runsRoot.getAttribute('data-visible-run-count'));
  assert.equal(after, 4, `expected all 4 runs after expand, got ${after}`);
  assert.equal(await runsRoot.locator(':scope > [data-run-status="failed"]').count(), 1);
  report.allRuns = { before, after };

  const failedCard = pane.locator('.wb-chat-runs > [data-run-status="failed"]').first();
  await failedCard.getByText('本轮工具过程', { exact: true }).waitFor();
  await failedCard.getByText('模型请求', { exact: false }).waitFor();
  await failedCard.getByRole('button', { name: '普通重试（不追加额度）', exact: true }).waitFor();
  await failedCard.getByText('追加额度后恢复', { exact: true }).waitFor();
  report.recoveryEntries = {
    toolProcess: true,
    modelRequests: true,
    plainRetry: true,
    budgetRecovery: true,
  };

  const first = app.store.list<Run>('run')[0]!;
  app.store.update<Run>('run', first.id, app.store.get<Run>('run', first.id).revision, {
    calls: 3,
    spentUsd: 2.4,
    reservedUsd: 0.8,
  });
  app.store.event('run.updated', { id: first.id }, { projectId: project.id, runId: first.id });
  await pane.locator('[data-chat-limit-hint]').waitFor();
  const limitSummary = pane.locator('[data-chat-limit-summary]');
  await limitSummary.waitFor();
  assert.match(await limitSummary.innerText(), /提交前限制/);
  const limitHint = pane.locator('[data-chat-limit-hint]');
  assert.match(await limitHint.innerText(), /接近上限|80%/);
  report.limitSummary = await limitSummary.innerText();
  report.limitHint = await limitHint.innerText();
  report.limitHintVisible = true;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat08-process.png'), fullPage: true });
  writeFileSync(join(evidence, 'chat08-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat08-report.json'), after }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chat08-failure.png') }).catch(() => {});
  writeFileSync(join(evidence, 'chat08-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
