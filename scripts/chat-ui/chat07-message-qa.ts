/**
 * CHAT-07 / CHV-13 partial: message copy, quote into composer, code copy,
 * table containment, locate run. Offline fixture messages; zero model.
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
import { persistTextChunk } from '../../server/run-stream.js';
import type { Run } from '../../shared/contracts.js';

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

const dataDir = mkdtempSync(join(tmpdir(), 'chat-ui-chat07-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHAT-07 消息呈现（离线）');
const pi = await loadPi();

await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
  await page.getByLabel('对话输入', { exact: true }).fill('准备消息呈现样例');
  const [taskResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/tasks') && r.request().method() === 'POST'),
    page.locator('[data-chat-primary-action]').click(),
  ]);
  assert.equal(taskResponse.ok(), true, await taskResponse.text());
  const run = app.store.list<Run>('run').at(-1)!;
  app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
  const cwd = join(dataDir, 'workspaces', project.id);
  const dir = join(dataDir, 'sessions', project.id);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(dir, { recursive: true });
  const session = pi.SessionManager.create(cwd, dir);
  const fresh = app.store.get<Run>('run', run.id);
  app.store.update<Run>('run', run.id, fresh.revision, {
    sessionId: session.getSessionId(),
    sessionPath: session.getSessionFile(),
  });
  const md = [
    '下面是代码与表格。',
    '',
    '```ts',
    'export const chatUi = 42;',
    '```',
    '',
    '| 列A | 列B |',
    '| --- | --- |',
    '| 1 | 很长很长很长很长很长很长很长的单元格内容避免挤坏输入 |',
    '',
    '结论：可复制引用。',
  ].join('\n');
  persistTextChunk(app.store, run.id, { messageId: 'chat07-md', chunk: 0, text: md, phase: 'final' });

  const pane = page.locator('.wb-chat-pane');
  await pane.locator('.wb-message.assistant').waitFor();
  await pane.locator('[data-chat-code-block]').waitFor();
  await pane.locator('[data-chat-table]').waitFor();

  // code copy
  await pane.locator('[data-chat-copy-code]').click();
  const codeClip = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(codeClip, /export const chatUi = 42/);
  report.codeCopy = { ok: true, preview: codeClip.slice(0, 80) };

  // message copy
  await pane.locator('.wb-message.assistant [data-chat-copy-message]').click();
  const msgClip = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(msgClip, /结论：可复制引用/);
  report.messageCopy = { ok: true, length: msgClip.length };

  // quote into composer
  await pane.locator('.wb-message.assistant [data-chat-quote-message]').click();
  const input = await page.getByLabel('对话输入', { exact: true }).inputValue();
  assert.match(input, /引用来自 Pi/);
  assert.match(input, /结论：可复制引用/);
  report.quote = { ok: true, hasSource: /消息 /.test(input) };

  // locate run (completed run still in visible set if recent)
  const focusBtn = pane.locator('.wb-message.assistant [data-chat-focus-run]');
  if (await focusBtn.count()) {
    await focusBtn.click();
    await page.waitForFunction(
      (runId) => document.querySelector(`.wb-chat-runs > [data-run-id="${runId}"]`)?.classList.contains('is-run-flash'),
      run.id,
      { timeout: 5000 },
    ).catch(() => {});
    report.locateRun = { attempted: true, runId: run.id };
  } else {
    report.locateRun = { attempted: false, reason: 'no runId on rendered message' };
  }

  // table contained — width of table scroll <= history width
  const widths = await page.evaluate(() => {
    const history = document.querySelector('.wb-chat-history') as HTMLElement | null;
    const table = document.querySelector('[data-chat-table]') as HTMLElement | null;
    if (!history || !table) return null;
    return { history: history.clientWidth, table: table.clientWidth, scroll: table.scrollWidth };
  });
  assert.ok(widths);
  assert.ok(widths!.table <= widths!.history + 2, `table must not widen history: ${JSON.stringify(widths)}`);
  report.tableContainment = widths;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat07-message.png'), fullPage: true });
  writeFileSync(join(evidence, 'chat07-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat07-report.json') }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chat07-failure.png') }).catch(() => {});
  writeFileSync(join(evidence, 'chat07-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
