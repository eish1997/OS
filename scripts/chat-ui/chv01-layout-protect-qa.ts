/**
 * CHV-01 remainder: existing layout / float / draft must not be silently rearranged
 * when opening another chat via toolbar.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import type { LayoutRecord } from '../../shared/workbench-layout.js';

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

const dataDir = fs.mkdtempSync(join(tmpdir(), 'chat-ui-chv01-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHV-01 布局保护（离线）');

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

  // Demo window docks into a leaf
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /布局演示/ }).click();
  await page.locator('.wb-demo, [data-window]').first().waitFor();

  // First chat + draft, then float it
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  const chatPane = page.locator('.wb-chat-pane');
  await chatPane.waitFor();
  await chatPane.getByLabel('对话输入', { exact: true }).fill('CHV01 布局草稿 UNIQUE_LAYOUT_DRAFT');
  await page.locator('[data-window]').filter({ has: page.locator('.wb-chat-pane') }).getByLabel('悬浮', { exact: true }).click();
  await page.locator('.wb-floating .wb-chat-pane').waitFor();
  await page.waitForTimeout(900); // layout autosave

  const before = (await context.request.get(base + '/api/workbench/config').then((r) => r.json())) as LayoutRecord;
  const beforeWindowIds = Object.keys(before.layout.windows).sort();
  const beforeFloating = before.layout.floating.map((f) => f.windowId).sort();
  assert.ok(beforeWindowIds.length >= 2);
  assert.ok(beforeFloating.length >= 1);
  report.before = { windows: beforeWindowIds.length, floating: beforeFloating.length };

  // Open another chat via toolbar — must not wipe demo / float / draft
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.waitForTimeout(900);

  const after = (await context.request.get(base + '/api/workbench/config').then((r) => r.json())) as LayoutRecord;
  for (const id of beforeWindowIds) {
    assert.ok(after.layout.windows[id], `window ${id} must survive`);
  }
  for (const id of beforeFloating) {
    assert.ok(
      after.layout.floating.some((f) => f.windowId === id),
      `floating ${id} must survive`,
    );
  }
  const draftStill =
    (await page.locator('.wb-floating .wb-chat-pane [aria-label="对话输入"]').inputValue().catch(() => '')) ||
    '';
  // Floated pane may still be open or iconified; if open, draft must match
  if (await page.locator('.wb-floating .wb-chat-pane').count()) {
    assert.equal(draftStill, 'CHV01 布局草稿 UNIQUE_LAYOUT_DRAFT');
  }
  assert.ok(await page.locator('.wb-demo, [data-window]').count() >= 2);
  report.after = {
    windows: Object.keys(after.layout.windows).length,
    floating: after.layout.floating.length,
    preservedWindows: true,
    preservedFloating: true,
  };
  report.noSilentRearrange = true;

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chv01-layout-protect.png'), fullPage: true });
  fs.writeFileSync(join(evidence, 'chv01-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chv01-report.json'), report }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chv01-failure.png') }).catch(() => {});
  fs.writeFileSync(join(evidence, 'chv01-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
