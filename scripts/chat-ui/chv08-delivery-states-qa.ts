/**
 * CHV-08 remainder: answered (接收) vs delivered (送达) interaction states in UI.
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
import {
  acknowledgeInteraction,
  answerInteraction,
  createInteraction,
} from '../../server/plugin-interaction.js';
import type { PluginInteraction } from '../../shared/plugin-interaction.js';
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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv08-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-08 送达态（离线）');
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
};

try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });
  const conversation = app.service.createConversation(project.id, 'CHV-08 话题', crypto.randomUUID());
  const seeded = await context.request.post(base + '/api/tasks', {
    data: {
      projectId: project.id,
      conversationId: conversation.id,
      goal: 'CHV-08 送达样例',
      commandId: crypto.randomUUID(),
      mode: 'pi',
    },
  });
  assert.equal(seeded.ok(), true, await seeded.text());
  const live = app.store.list<Run>('run').at(-1)!;
  app.service.transition(live.id, 'running', { startedAt: new Date().toISOString() });
  const cwd = join(dataDir, 'workspaces', project.id);
  const dir = join(dataDir, 'sessions', project.id);
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  const session = pi.SessionManager.create(cwd, dir);
  const fresh = app.store.get<Run>('run', live.id);
  app.store.update<Run>('run', live.id, fresh.revision, {
    sessionId: session.getSessionId(),
    sessionPath: session.getSessionFile(),
    mcpManifest: {
      schemaVersion: 1,
      signature: 'offline-chat-ui',
      enabled: true,
      globalRevision: 0,
      projectRevision: 0,
      servers: [],
      autoEnableCodemode: true,
      codemode: true,
      toolSearch: false,
    },
  });

  const answered = createInteraction(app.store, live.id, {
    id: 'chv08-answered',
    source: 'builtin:mcp',
    kind: 'confirm',
    title: '已接收 UNIQUE_ANSWERED',
    message: '应显示答复已接收',
    timeoutMs: 120_000,
  });
  const delivered = createInteraction(app.store, live.id, {
    id: 'chv08-delivered',
    source: 'builtin:mcp',
    kind: 'confirm',
    title: '已送达 UNIQUE_DELIVERED',
    message: '应显示答复已送达',
    timeoutMs: 120_000,
  });
  answerInteraction(app.store, live.id, answered.id, answered.revision, 'cmd-answered', true);
  const d = answerInteraction(app.store, live.id, delivered.id, delivered.revision, 'cmd-delivered', true);
  acknowledgeInteraction(app.store, live.id, delivered.id);
  assert.equal(app.store.get<PluginInteraction>('plugin_interaction', answered.id).state, 'answered');
  assert.equal(app.store.get<PluginInteraction>('plugin_interaction', delivered.id).state, 'delivered');
  report.storeStates = { answered: 'answered', delivered: 'delivered', revision: d.interaction.revision };

  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByLabel('已有对话', { exact: true }).click();
  await page.locator(`[role=option][data-value="${conversation.id}"]`).click();
  await page.getByRole('button', { name: '打开对话', exact: true }).click();
  const pane = page.locator('.wb-chat-pane');
  await pane.getByText('UNIQUE_ANSWERED').waitFor();
  await pane.getByText('UNIQUE_DELIVERED').waitFor();
  await pane.getByText('答复已接收，等待进程回执').waitFor();
  await pane.getByText('答复已送达原执行').waitFor();
  assert.match(await pane.locator('[aria-label="插件交互"]').innerText(), /等待送达回执：\s*1/);
  report.uiAnswered = true;
  report.uiDelivered = true;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv08-delivery.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv08-delivery-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv08-delivery-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv08-delivery-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv08-delivery-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
