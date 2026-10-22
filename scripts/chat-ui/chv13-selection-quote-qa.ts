/**
 * CHV-13 remainder: in-page text selection quote (not OS clipboard).
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
import { persistTextChunk } from '../../server/run-stream.js';
import type { Run } from '../../shared/contracts.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
fs.mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1');

Object.assign(config, {
  apiKey: 'offline-chat-ui-only',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  maxCalls: 4,
  budgetUsd: 4,
  reservePerCallUsd: 1,
});

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv13-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-13 选文引用（离线）');
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
  note: 'Browser Selection API only; OS clipboard still external-blocked',
};

try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.getByLabel('对话输入', { exact: true }).fill('选文样例任务');
  const [taskResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/tasks') && r.request().method() === 'POST'),
    page.locator('[data-chat-primary-action]').click(),
  ]);
  assert.equal(taskResponse.ok(), true, await taskResponse.text());
  const run = app.store.list<Run>('run').at(-1)!;
  app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
  const cwd = join(dataDir, 'workspaces', project.id);
  const dir = join(dataDir, 'sessions', project.id);
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  const session = pi.SessionManager.create(cwd, dir);
  const fresh = app.store.get<Run>('run', run.id);
  app.store.update<Run>('run', run.id, fresh.revision, {
    sessionId: session.getSessionId(),
    sessionPath: session.getSessionFile(),
  });
  persistTextChunk(app.store, run.id, {
    messageId: 'chv13-sel',
    chunk: 0,
    text: '前缀 AAA_SELECT_ME 后缀不应整段进入引用',
    phase: 'final',
  });
  app.service.transition(run.id, 'completed', { endedAt: new Date().toISOString() });

  const pane = page.locator('.wb-chat-pane');
  await pane.getByText('AAA_SELECT_ME').waitFor();
  await page.evaluate(() => {
    const root = document.querySelector('.wb-message.assistant .wb-markdown, .wb-message.assistant');
    if (!root) throw new Error('message missing');
    const text = root.textContent || '';
    const start = text.indexOf('AAA_SELECT_ME');
    if (start < 0) throw new Error('marker missing');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = start;
    let node: Text | null = null;
    while (walker.nextNode()) {
      const current = walker.currentNode as Text;
      if (remaining < current.length) {
        node = current;
        break;
      }
      remaining -= current.length;
    }
    if (!node) throw new Error('text node missing');
    const range = document.createRange();
    range.setStart(node, remaining);
    range.setEnd(node, remaining + 'AAA_SELECT_ME'.length);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });
  await pane.locator('.wb-message.assistant [data-chat-quote-message]').click();
  const input = await page.getByLabel('对话输入', { exact: true }).inputValue();
  assert.match(input, /AAA_SELECT_ME/);
  assert.match(input, /引用来自/);
  assert.doesNotMatch(input, /前缀 AAA_SELECT_ME 后缀不应整段进入引用/);
  report.selectionQuote = true;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv13-selection-quote.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv13-selection-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv13-selection-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv13-selection-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv13-selection-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
