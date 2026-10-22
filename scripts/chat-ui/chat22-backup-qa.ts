/**
 * CHV-22: backup + clean-dir restore; credentials excluded; chat history readable.
 * Isolated offline: no real model, no daily service.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { backup, restore } from '../../server/backup.js';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
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

const root = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chat22-'));
const dataDir = join(root, 'data');
const backupDir = join(root, 'backup-pack');
const restoredDir = join(root, 'restored');
fs.mkdirSync(dataDir, { recursive: true });

// Plant secret-like files that must NEVER enter a normal backup
fs.mkdirSync(join(dataDir, 'credentials'), { recursive: true });
fs.writeFileSync(join(dataDir, 'credentials', 'auth.json'), JSON.stringify({ token: 'SECRET_MUST_NOT_BACKUP' }));
fs.writeFileSync(join(dataDir, 'auth.json'), JSON.stringify({ cookie: 'SECRET_COOKIE' }));
fs.writeFileSync(join(dataDir, 'secret-note.txt'), 'SECRET_FILE_OUTSIDE_ALLOWLIST');

const sourceApp = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = sourceApp.service.createProject('CHAT-22 备份还原（离线）');
const conversation = sourceApp.service.createConversation(project.id, 'CHAT-22 话题', crypto.randomUUID());

await new Promise<void>((done) => sourceApp.server.listen(0, '127.0.0.1', done));
const sourceBase = `http://127.0.0.1:${(sourceApp.server.address() as { port: number }).port}`;
config.origin = sourceBase;

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
  await context.request.post(sourceBase + '/api/login', { data: { password: 'chat-ui-offline' } });
  const seeded = await context.request.post(sourceBase + '/api/tasks', {
    data: {
      projectId: project.id,
      conversationId: conversation.id,
      goal: 'CHAT-22 备份标记 UNIQUE_BACKUP_RESTORE',
      commandId: crypto.randomUUID(),
      mode: 'pi',
      continueFromRunId: null,
    },
  });
  assert.equal(seeded.ok(), true, await seeded.text());
  const body = (await seeded.json()) as { run: Run };
  sourceApp.service.transition(body.run.id, 'running', { startedAt: new Date().toISOString() });
  sourceApp.service.transition(body.run.id, 'completed', { endedAt: new Date().toISOString() });

  const manifest = backup(sourceApp.store, dataDir, backupDir);
  assert.equal(manifest.includesSecrets, false);
  const files = (manifest.files as { path: string }[]).map((f) => f.path);
  assert.ok(files.includes('workbench.sqlite'));
  assert.ok(!files.some((p) => /auth\.json|credentials|secret-note/i.test(p)));
  const backupTree = fs.readdirSync(backupDir, { recursive: true }).map(String);
  assert.ok(!backupTree.some((p) => /auth\.json|credentials|SECRET/i.test(p)));
  const packed = JSON.stringify(manifest) + backupTree.join('\n');
  assert.doesNotMatch(packed, /SECRET_MUST_NOT_BACKUP|SECRET_COOKIE|SECRET_FILE/);
  report.backup = {
    includesSecrets: manifest.includesSecrets,
    fileCount: files.length,
    secretsExcluded: true,
  };

  await sourceApp.close();

  const restoredMeta = restore(backupDir, restoredDir);
  assert.equal(restoredMeta.restored, true);
  assert.equal(restoredMeta.credentialsMustBeConfigured, true);
  assert.ok(!fs.existsSync(join(restoredDir, 'auth.json')));
  assert.ok(!fs.existsSync(join(restoredDir, 'credentials')));
  report.restore = restoredMeta;

  const restoredApp = createApp({
    dataDir: restoredDir,
    staticDir,
    password: 'chat-ui-offline',
    schedule: false,
  });
  await new Promise<void>((done) => restoredApp.server.listen(0, '127.0.0.1', done));
  const restoredBase = `http://127.0.0.1:${(restoredApp.server.address() as { port: number }).port}`;
  config.origin = restoredBase;

  const convs = restoredApp.service.listConversations(project.id);
  assert.ok(convs.some((c: Conversation) => c.id === conversation.id));

  await context.request.post(restoredBase + '/api/login', { data: { password: 'chat-ui-offline' } });
  const messages = await context.request.get(
    restoredBase + `/api/conversations/${conversation.id}/messages`,
  );
  assert.equal(messages.ok(), true, await messages.text());
  const messageText = JSON.stringify(await messages.json());
  assert.match(messageText, /UNIQUE_BACKUP_RESTORE/);
  report.restoredApiHistory = true;

  await page.goto(restoredBase);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByLabel('已有对话', { exact: true }).click();
  await page.locator(`[role=option][data-value="${conversation.id}"]`).click();
  await page.getByRole('button', { name: '打开对话', exact: true }).click();
  await page.getByText('UNIQUE_BACKUP_RESTORE').waitFor();
  report.restoredUiHistory = true;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat22-backup.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chat22-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat22-report.json'), report }));
  await restoredApp.close();
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chat22-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chat22-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await sourceApp.close().catch(() => {});
}
