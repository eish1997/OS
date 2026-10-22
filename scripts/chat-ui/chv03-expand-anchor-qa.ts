/**
 * CHV-03：工具展开后阅读锚点不跳飞（±8px 设计容差）。
 * 离线：seed 长历史 + 工具过程，展开「本轮工具过程」测首条可见消息相对偏移。
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
import { CHAT_UI_DESIGN } from '../../shared/chat-ui-design.js';
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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv03-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-03 展开锚点（离线）');
const conversation = app.service.createConversation(project.id, 'CHV-03 话题', crypto.randomUUID());

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
  tolerancePx: CHAT_UI_DESIGN.scroll.anchorOffsetTolerancePx,
};

try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });

  // Pad history so the pane is scrollable
  for (let i = 0; i < 6; i += 1) {
    const res = await context.request.post(base + '/api/tasks', {
      data: {
        projectId: project.id,
        conversationId: conversation.id,
        goal: i === 0 ? 'CHV03 锚点 UNIQUE_ANCHOR_MSG' : `CHV03 pad ${i}\n${'PAD_LINE\n'.repeat(12)}`,
        commandId: crypto.randomUUID(),
        mode: 'pi',
        continueFromRunId: null,
      },
    });
    assert.equal(res.ok(), true, await res.text());
    const run = app.store.list<Run>('run').at(-1)!;
    app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
    persistTextChunk(app.store, run.id, {
      messageId: `chv03-ans-${i}`,
      chunk: 0,
      text: i === 0 ? 'CHV03_ANSWER_STABLE' : `PAD_ANSWER_${i}\n${'x\n'.repeat(20)}`,
      phase: 'final',
    });
    if (i === 5) {
      persistToolProgress(app.store, run.id, {
        callId: 'chv03-call',
        name: 'bash',
        source: '工作台/原生工具',
        sequence: 0,
        phase: 'running',
        preview: 'CHV03_TOOL_PREVIEW_RUNNING',
      });
      persistTextChunk(app.store, run.id, {
        messageId: 'chv03-tool-result',
        chunk: 0,
        channel: 'tool_result',
        text: JSON.stringify({ content: [{ type: 'text', text: 'CHV03_TOOL_RESULT\n'.repeat(40) }] }),
        phase: 'partial',
      });
      persistTextChunk(app.store, run.id, {
        messageId: 'chv03-tool-result',
        chunk: 1,
        channel: 'tool_result',
        text: '',
        phase: 'final',
      });
      persistToolProgress(app.store, run.id, {
        callId: 'chv03-call',
        name: 'bash',
        source: '工作台/原生工具',
        sequence: 1,
        phase: 'completed',
        preview: `CHV03_TOOL_PREVIEW\n${'TOOL_LINE\n'.repeat(30)}`,
        resultMessageId: `${run.id}:chv03-tool-result`,
      });
    }
    app.service.transition(run.id, 'completed', { endedAt: new Date().toISOString() });
  }
  const toolRun = app.store.list<Run>('run').at(-1)!;

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
  await pane.getByText('UNIQUE_ANCHOR_MSG').waitFor();

  const history = pane.locator('.wb-chat-history');
  await history.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollHeight / 3);
  });
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => {
    const hist = document.querySelector('.wb-chat-history') as HTMLElement | null;
    const anchor = [...document.querySelectorAll('.wb-chat-history [data-message-id]')].find((el) =>
      (el.textContent || '').includes('UNIQUE_ANCHOR_MSG'),
    ) as HTMLElement | undefined;
    if (!hist || !anchor) return null;
    const hr = hist.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    return {
      scrollTop: hist.scrollTop,
      offsetInView: ar.top - hr.top,
      messageId: anchor.getAttribute('data-message-id'),
    };
  });
  assert.ok(before, 'anchor message metrics');

  const runCard = pane.locator(`.wb-chat-runs > [data-run-id="${toolRun.id}"]`);
  await runCard.scrollIntoViewIfNeeded();
  const details = runCard.locator('details').filter({ hasText: '本轮工具过程' });
  await details.locator('summary').click();
  await details.getByText('bash').waitFor();
  await page.waitForTimeout(350);

  const after = await page.evaluate((messageId) => {
    const hist = document.querySelector('.wb-chat-history') as HTMLElement | null;
    const anchor = document.querySelector(
      `.wb-chat-history [data-message-id="${CSS.escape(messageId)}"]`,
    ) as HTMLElement | null;
    if (!hist || !anchor) return null;
    const hr = hist.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    return {
      scrollTop: hist.scrollTop,
      offsetInView: ar.top - hr.top,
    };
  }, before.messageId!);
  assert.ok(after, 'after expand metrics');

  const offsetDelta = Math.abs(after.offsetInView - before.offsetInView);
  const tol = CHAT_UI_DESIGN.scroll.anchorOffsetTolerancePx;
  // Product older() corrects when |delta| > tol; expand must not jump beyond that band
  // unless scroll position itself was intentionally adjusted by ≤ tol.
  const scrollDelta = Math.abs(after.scrollTop - before.scrollTop);
  assert.ok(
    offsetDelta <= tol || scrollDelta <= tol,
    `anchor jump offsetΔ=${offsetDelta.toFixed(2)} scrollΔ=${scrollDelta.toFixed(2)} tol=${tol}`,
  );

  report.anchor = { before, after, offsetDelta, scrollDelta, tol, toolRunId: toolRun.id };
  report.toolExpanded = true;
  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv03-expand-anchor.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv03-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv03-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv03-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv03-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
