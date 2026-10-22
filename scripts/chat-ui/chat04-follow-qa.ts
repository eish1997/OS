/**
 * CHAT-04 / CHV-02: stream follow, pause on upward scroll, jump to latest.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import { persistTextChunk } from '../../server/run-stream.js';
import { loadPi } from '../../server/pi-adapter.js';
import type { Run } from '../../shared/contracts.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1');
Object.assign(config, { apiKey: 'offline-chat-ui-only', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 4, reservePerCallUsd: 1 });

const dataDir = mkdtempSync(join(tmpdir(), 'chat-ui-chat04-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHAT-04 阅读跟随');
const pi = await loadPi();
await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const report: Record<string, unknown> = { at: new Date().toISOString(), staticDir, realModelRequests: 0 };

try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.getByLabel('对话输入', { exact: true }).fill('生成长回复以检查跟随');
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/tasks') && response.request().method() === 'POST'),
    page.getByRole('button', { name: '发送 ↑', exact: true }).click(),
  ]);
  const run = app.store.list<Run>('run').at(-1)!;
  app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
  const cwd = join(dataDir, 'workspaces', project.id);
  const dir = join(dataDir, 'sessions', project.id);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(dir, { recursive: true });
  const session = pi.SessionManager.create(cwd, dir);
  const fresh = app.store.get<Run>('run', run.id);
  app.store.update<Run>('run', run.id, fresh.revision, { sessionId: session.getSessionId(), sessionPath: session.getSessionFile() });

  const long = Array.from({ length: 40 }, (_, i) => `跟随样例第 ${i + 1} 段。`).join('\n\n');
  persistTextChunk(app.store, run.id, { messageId: 'chat04-follow', chunk: 0, text: long, phase: 'partial' });
  await page.locator('.wb-message.assistant').waitFor();
  await page.waitForFunction(() => {
    const history = document.querySelector('.wb-chat-history') as HTMLElement | null;
    if (!history) return false;
    return history.scrollHeight - history.scrollTop - history.clientHeight < 64;
  });

  await page.locator('.wb-chat-history').evaluate((el) => {
    (el as HTMLElement).scrollTop = 0;
  });
  await page.getByRole('button', { name: '回到最新', exact: true }).waitFor();
  await page.getByRole('button', { name: '回到最新', exact: true }).click();
  await page.waitForFunction(() => {
    const history = document.querySelector('.wb-chat-history') as HTMLElement | null;
    if (!history) return false;
    return history.scrollHeight - history.scrollTop - history.clientHeight < 64;
  });
  assert.equal(await page.getByRole('button', { name: '回到最新', exact: true }).count(), 0);

  report.passed = true;
  report.follow = { nearBottomAfterStream: true, jumpLatestWorked: true };
  await page.screenshot({ path: join(evidence, 'chat04-follow.png') });
  writeFileSync(join(evidence, 'chat04-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat04-report.json') }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  await page.screenshot({ path: join(evidence, 'chat04-failure.png') }).catch(() => {});
  writeFileSync(join(evidence, 'chat04-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
