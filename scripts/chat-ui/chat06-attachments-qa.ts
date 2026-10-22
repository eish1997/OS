/**
 * CHAT-06 / CHV-09 partial: image picker + synthetic paste/drop, thumbnail preview,
 * pure-image gate, non-image rejection, AssetsPane→chat 资料附加.
 * System clipboard deferred to CHAT-13/14.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import { CHAT_UI_DESIGN } from '../../shared/chat-ui-design.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1', 'must launch with preload-isolate');

Object.assign(config, {
  apiKey: 'offline-chat-ui-only',
  provider: 'openai',
  model: 'gpt-5.6-sol',
  maxCalls: 4,
  budgetUsd: 4,
  reservePerCallUsd: 1,
});

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_1X1 = Buffer.from(PNG_B64, 'base64');

const dataDir = mkdtempSync(join(tmpdir(), 'chat-ui-chat06-'));
const app = createApp({ dataDir, staticDir, password: 'chat-ui-offline', schedule: false });
const project = app.service.createProject('CHAT-06 附件闭环（离线）');

await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));

const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  staticDir,
  evidence,
  designVersion: CHAT_UI_DESIGN.version,
  realModelRequests: 0,
  blockedExternalConnectsBefore: blockedExternalConnects(),
  note: 'paste/drop use in-page DataTransfer; not OS clipboard',
};

async function waitAttachmentCount(n: number) {
  await page.waitForFunction(
    (count) => document.querySelectorAll('.wb-chat-pane .wb-attachment-chip').length >= count,
    n,
    { timeout: 20000 },
  );
}

async function clearAttachments() {
  while ((await page.locator('.wb-chat-pane .wb-attachment-chip').count()) > 0) {
    await page.locator('.wb-chat-pane .wb-attachment-chip button').first().click();
  }
}

try {
  await context.request.post(base + '/api/login', { data: { password: 'chat-ui-offline' } });
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  const pane = page.locator('.wb-chat-pane');
  const input = page.getByLabel('对话输入', { exact: true });
  await input.waitFor();

  // --- Entry 1: file picker ---
  await page.getByLabel('选择聊天图片', { exact: true }).setInputFiles({
    name: 'chat06-picker.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await waitAttachmentCount(1);
  const chip = pane.locator('.wb-attachment-chip').first();
  assert.ok(await chip.locator('img').count(), 'picker attach must show thumbnail');
  assert.match(await chip.innerText(), /chat06-picker\.png/);
  const libraryAssetId = await chip.getAttribute('data-attachment-id');
  assert.ok(libraryAssetId);
  await pane.locator('[data-chat-pure-image-hint]').waitFor();
  assert.equal(await pane.locator('[data-chat-pure-image-hint]').innerText(), CHAT_UI_DESIGN.pureImagePrompt);
  assert.equal(await pane.locator('[data-chat-primary-action]').isDisabled(), true);
  report.picker = { thumbnail: true, pureImageHint: true, primaryDisabled: true, assetId: libraryAssetId };
  await clearAttachments();

  // --- Entry 2: synthetic paste ---
  await input.evaluate((el, b64) => {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const file = new File([bytes], 'chat06-paste.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: dt });
    el.dispatchEvent(event);
  }, PNG_B64);
  await waitAttachmentCount(1);
  assert.match(await pane.locator('.wb-attachment-chip').first().innerText(), /chat06-paste\.png/);
  report.pasteSynthetic = { attached: true };
  await clearAttachments();

  // --- Entry 3: synthetic drop ---
  await pane.locator('[data-chat-dropzone]').evaluate((el, b64) => {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const file = new File([bytes], 'chat06-drop.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    for (const type of ['dragenter', 'dragover', 'drop'] as const) {
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
  }, PNG_B64);
  await waitAttachmentCount(1);
  assert.match(await pane.locator('.wb-attachment-chip').first().innerText(), /chat06-drop\.png/);
  report.dropSynthetic = { attached: true };
  await clearAttachments();

  // --- Non-image rejection ---
  await input.evaluate((el) => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'notes.txt', { type: 'text/plain' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: dt });
    el.dispatchEvent(event);
  });
  await pane.getByRole('alert').waitFor({ timeout: 10000 });
  assert.match(await pane.getByRole('alert').innerText(), /仅支持/);
  assert.equal(await pane.locator('.wb-attachment-chip').count(), 0);
  report.nonImageRejected = { alert: await pane.getByRole('alert').innerText(), chips: 0 };

  // --- 资料附加: AssetsPane → current chat ---
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  const chooser = page.locator('.wb-modal');
  await chooser.waitFor({ state: 'visible' });
  await chooser.getByRole('button', { name: /资产浏览/ }).click();
  await page.getByLabel('筛选资产').waitFor();
  await page.getByRole('button', { name: /chat06-picker\.png/ }).click();
  await page.getByLabel('目标聊天').click();
  const chatOption = page.locator('[role=option]').filter({ hasText: /Pi|对话/ }).first();
  if (await chatOption.count()) await chatOption.click();
  else await page.locator('[role=option]').nth(1).click();
  await page.getByRole('button', { name: '添加资料', exact: true }).click();
  await page.locator(`.wb-chat-pane .wb-attachment-chip[data-attachment-id="${libraryAssetId}"]`).waitFor({ timeout: 15000 });
  report.libraryAttach = { assetId: libraryAssetId, chipVisible: true };

  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  await page.screenshot({ path: join(evidence, 'chat06-attachments.png'), fullPage: true });
  writeFileSync(join(evidence, 'chat06-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat06-report.json') }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  report.pageErrors = errors;
  await page.screenshot({ path: join(evidence, 'chat06-failure.png') }).catch(() => {});
  writeFileSync(join(evidence, 'chat06-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await app.close();
}
