/**
 * CHAT-10 / CHV-14 partial: distinctive titles, rename, switch, server-side
 * in-topic search with locate. Zero model.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chat10-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHAT-10 话题管理（离线）');
const other = app.service.createProject('CHAT-10 其他项目');

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

  const a = app.service.createConversation(project.id, '阿尔法话题', crypto.randomUUID());
  app.service.createConversation(project.id, '贝塔话题', crypto.randomUUID());
  const foreign = app.service.createConversation(other.id, '阿尔法话题', crypto.randomUUID());
  const renamed = app.service.renameConversation(a.id, a.revision, '阿尔法已改名');
  assert.equal(renamed.title, '阿尔法已改名');
  const listed = app.service.listConversations(project.id, '阿尔法');
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.id, a.id);
  assert.ok(!listed.some((c) => c.id === foreign.id));

  const seed = await context.request.post(base + '/api/tasks', {
    data: {
      projectId: project.id,
      conversationId: a.id,
      goal: 'CHAT10-UNIQUE-MARKER 请记住这个标记',
      commandId: crypto.randomUUID(),
      mode: 'pi',
      continueFromRunId: null,
    },
  });
  assert.equal(seed.ok(), true, await seed.text());
  const run = app.store.list<Run>('run').at(-1)!;
  app.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
  app.service.transition(run.id, 'completed', { endedAt: new Date().toISOString() });

  const search = app.service.searchConversation(project.id, a.id, 'CHAT10-UNIQUE-MARKER');
  assert.ok(search.hits.length >= 1, JSON.stringify(search));
  report.api = { renamed: renamed.title, listed: listed.map((c) => c.title), hitCount: search.hits.length };

  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  const pane = page.locator('.wb-chat-pane');
  await pane.locator('[data-chat-topics]').waitFor();

  const title = await pane.locator('[data-chat-topic-title]').innerText();
  assert.match(title, /对话 ·/);
  report.autoTitle = title;

  await pane.locator('[data-chat-overflow-toggle]').click();
  await pane.locator('[data-chat-rename-topic]').click();
  await page.getByLabel('话题名称', { exact: true }).fill('CHAT-10 主话题');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await pane.locator('[data-chat-topic-title]').filter({ hasText: 'CHAT-10 主话题' }).waitFor();

  await page.getByLabel('切换话题', { exact: true }).selectOption({ label: '阿尔法已改名' });
  await pane.locator('[data-chat-topic-title]').filter({ hasText: '阿尔法已改名' }).waitFor();

  await pane.locator('[data-chat-toggle-search]').click();
  await page.getByLabel('查找本话题全文', { exact: true }).fill('CHAT10-UNIQUE-MARKER');
  await page.getByRole('button', { name: '查找', exact: true }).click();
  await pane.locator('[data-chat-search-hits]').waitFor();
  await pane.locator('[data-chat-search-hit]').first().click();
  await page.waitForFunction(() => document.querySelector('.wb-chat-pane [data-message-id].is-message-flash'));
  report.ui = { renamed: true, switched: true, searchLocated: true };

  await pane.locator('[data-chat-overflow-toggle]').click();
  await page.getByLabel('筛选话题', { exact: true }).fill('阿尔法');
  await page.waitForTimeout(300);
  const options = await page.getByLabel('切换话题', { exact: true }).locator('option').allTextContents();
  assert.ok(options.every((label) => !label.includes('其他')), options.join('|'));
  assert.ok(options.some((label) => label.includes('阿尔法已改名')), options.join('|'));

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat10-topics.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chat10-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat10-report.json') }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chat10-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chat10-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
