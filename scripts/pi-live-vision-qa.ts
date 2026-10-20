/**
 * F13 live vision acceptance via workbench UI (Pi 1.0.3 + deepseek-flash).
 * Key only from PI_API_KEY / DEEPSEEK_API_KEY. Never logs or writes the key.
 * Filename/prompt/attached text must not leak the fixed visual answer.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { loadPi } from '../server/pi-adapter.js';
import type { Run, Task, Asset } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';

const evidence = 'output/dev-evidence/pi-parity/loop-170';
mkdirSync(evidence, { recursive: true });

const key = process.env.PI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
assert(key, 'PI_API_KEY or DEEPSEEK_API_KEY required');

/** Prior cumulative usage (loop-165 + vision-probe). Do not reset. */
const PRIOR_CALLS = Number(process.env.PI_PRIOR_CALLS || 54);
const PRIOR_USD = Number(process.env.PI_PRIOR_USD || 0.02023);
const CAP_CALLS = Number(process.env.PI_CAP_CALLS || 120);
const CAP_USD = Number(process.env.PI_CAP_USD || 0.65);
const REMAINING_CALLS = CAP_CALLS - PRIOR_CALLS;
const REMAINING_USD = CAP_USD - PRIOR_USD;

const PROVIDER = 'deepseek';
const MODEL = 'deepseek-flash';
const NON_VISION_MODEL = 'deepseek-v4-pro';
/** Shared tangible level supported by both flash and v4-pro. */
const THINKING = 'high' as const;
const PASSWORD = 'live-vision-qa';

/** Fixed acceptance answer — must not appear in filename, prompt, or user-visible attachment text. */
const EXPECTED = '4';
const FILE_NAME = 'canvas-probe.png';
const PROMPT = 'Look at the attached image. Reply with only the single large digit you see. No other words.';
const CONTINUE_PROMPT = 'Without relying on any new attachment, what digit did the earlier image show? Reply with only that digit.';

assert(!PROMPT.includes(EXPECTED), 'prompt must not leak answer');
assert(!FILE_NAME.includes(EXPECTED), 'filename must not leak answer');
assert(!CONTINUE_PROMPT.includes(EXPECTED), 'continue prompt must not leak answer');
assert(REMAINING_CALLS >= 4, `insufficient remaining calls: ${REMAINING_CALLS}`);
assert(REMAINING_USD >= 0.05, `insufficient remaining usd: ${REMAINING_USD}`);

Object.assign(config, {
  apiKey: key,
  provider: PROVIDER,
  model: MODEL,
  maxCalls: Math.min(REMAINING_CALLS, 12),
  budgetUsd: Math.min(REMAINING_USD, 0.2),
  reservePerCallUsd: 0.02,
  maxOutputTokens: 64,
  timeoutMs: 180000,
});

function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, checksum]);
}

function pngDigit(digit: string, width = 96, height = 128): Buffer {
  const pixels = Buffer.alloc(width * height * 3, 255);
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
  };
  const fillRect = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, 20, 20, 20);
  };
  if (digit === '4') {
    fillRect(18, 16, 14, 70);
    fillRect(18, 70, 60, 14);
    fillRect(64, 16, 14, 96);
  } else throw new Error('unsupported digit');
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    pixels.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const bytes = pngDigit(EXPECTED);
writeFileSync(join(evidence, FILE_NAME), bytes);

const report: Record<string, unknown> = {
  purpose: 'F13 real vision workbench UI acceptance',
  provider: PROVIDER,
  model: MODEL,
  nonVisionModel: NON_VISION_MODEL,
  thinking: THINKING,
  prior: { calls: PRIOR_CALLS, usd: PRIOR_USD },
  caps: { calls: CAP_CALLS, usd: CAP_USD },
  sessionCaps: { maxCalls: config.maxCalls, budgetUsd: config.budgetUsd },
  expectedDigit: EXPECTED,
  fileName: FILE_NAME,
  prompt: PROMPT,
  stages: [] as unknown[],
};

const root = mkdtempSync(join(tmpdir(), 'pi-live-vision-'));
const app = createApp({
  dataDir: join(root, 'data'),
  staticDir: 'output/pi-parity-build',
  password: PASSWORD,
  schedule: false,
});
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const project = app.service.createProject('识图验收');
const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: PASSWORD }) });
const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };

const current = await (await fetch(base + '/api/pi/settings', { headers })).json() as { configuration: { revision: number } };
const saved = await fetch(base + '/api/pi/settings', {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    revision: current.configuration.revision,
    thinkingLevel: THINKING,
    executionMode: 'standard',
    maxOutputTokens: 64,
    apiModel: MODEL,
  }),
});
const savedText = await saved.text();
assert.equal(saved.status, 200, savedText);
const frozen = JSON.parse(savedText) as { model?: { supportsImages?: boolean; id?: string } };
assert.equal(frozen.model?.id, MODEL);
assert.equal(frozen.model?.supportsImages, true);

// --- Non-vision model prompt accuracy BEFORE browser (no UI race on settings) ---
{
  const rev1 = await (await fetch(base + '/api/pi/settings', { headers })).json() as { configuration: { revision: number } };
  const toTextOnly = await fetch(base + '/api/pi/settings', {
    method: 'PUT', headers,
    body: JSON.stringify({ revision: rev1.configuration.revision, thinkingLevel: THINKING, executionMode: 'standard', maxOutputTokens: 64, apiModel: NON_VISION_MODEL }),
  });
  const toTextOnlyText = await toTextOnly.text();
  assert.equal(toTextOnly.status, 200, toTextOnlyText);
  const textOnlySnap = JSON.parse(toTextOnlyText) as { model?: { supportsImages?: boolean; id?: string } };
  assert.equal(textOnlySnap.model?.id, NON_VISION_MODEL);
  assert.equal(textOnlySnap.model?.supportsImages, false);

  const preAsset = app.assets.commit(app.assets.begin(project.id, FILE_NAME, 'image/png').id, bytes);
  const rejected = await fetch(base + '/api/tasks', {
    method: 'POST', headers,
    body: JSON.stringify({
      projectId: project.id,
      goal: PROMPT,
      mode: 'pi',
      commandId: 'non-vision-reject',
      assetIds: [preAsset.id],
    }),
  });
  const rejectedText = await rejected.text();
  assert.equal(rejected.status, 400, rejectedText);
  assert.match(rejectedText, /不支持图片/);
  assert.equal(app.store.list<Run>('run').length, 0, 'non-vision rejection must not create a run');
  (report.stages as unknown[]).push({
    name: 'non-vision-reject',
    model: NON_VISION_MODEL,
    status: rejected.status,
    bodySnippet: rejectedText.slice(0, 200),
    pass: true,
  });

  const rev2 = await (await fetch(base + '/api/pi/settings', { headers })).json() as { configuration: { revision: number } };
  const back = await fetch(base + '/api/pi/settings', {
    method: 'PUT', headers,
    body: JSON.stringify({ revision: rev2.configuration.revision, thinkingLevel: THINKING, executionMode: 'standard', maxOutputTokens: 64, apiModel: MODEL }),
  });
  const backText = await back.text();
  assert.equal(back.status, 200, backText);
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
let page = await context.newPage();
page.setDefaultTimeout(30000);
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));

const wait = async (check: () => boolean, message: string, ms = 180000) => {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) {
    app.scheduler.tick();
    await delay(100);
  }
  assert(check(), message);
};

try {
  await context.request.post(base + '/api/login', { data: { password: PASSWORD } });
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '添加图片', exact: true }).click();
  await (await chooserPromise).setFiles({ name: FILE_NAME, mimeType: 'image/png', buffer: bytes });
  await page.getByRole('button', { name: `${FILE_NAME} ×`, exact: true }).waitFor();
  await wait(() => app.store.list<Asset>('asset').filter(a => a.name === FILE_NAME).length >= 2, 'UI upload created a second asset', 30000);
  const asset = [...app.store.list<Asset>('asset')].reverse().find(a => a.name === FILE_NAME)!;
  assert(asset, 'uploaded asset present');
  assert.equal(asset.projectId, project.id);
  assert.deepEqual(app.assets.read(asset), bytes);

  await page.getByLabel('对话输入').fill(PROMPT);
  await page.getByRole('button', { name: '发送 ↑', exact: true }).click();
  await wait(() => app.store.list<Run>('run').length === 1, 'browser submitted vision task');
  const run = app.store.list<Run>('run')[0];
  assert.deepEqual(app.store.get<Task>('task', run.taskId).context.assetIds, [asset.id]);
  assert.equal(run.policy.modelBinding?.model, MODEL);

  const historyImage = page.getByRole('img', { name: `附带图片：${FILE_NAME}`, exact: true });
  await historyImage.waitFor();
  await historyImage.scrollIntoViewIfNeeded();
  await historyImage.evaluate((img: HTMLImageElement) => img.decode());

  app.scheduler.start();
  await wait(() => ['completed', 'failed', 'interrupted', 'cancelled'].includes(app.store.get<Run>('run', run.id).status), 'vision run finished', 240000);
  const final = app.store.get<Run>('run', run.id);
  assert.equal(final.status, 'completed', final.error ?? 'vision run failed');
  assert(final.calls >= 1, 'at least one real model call');

  const history = app.service.conversation(project.id, undefined, 50, final.conversationId!);
  const assistant = [...history.messages].reverse().find(m => m.role === 'assistant');
  assert(assistant, 'assistant message present');
  assert(assistant!.text.includes(EXPECTED), `assistant must contain digit ${EXPECTED}, got: ${assistant!.text.slice(0, 200)}`);
  await page.getByText(EXPECTED, { exact: false }).first().waitFor();

  // Prove image entered native session (real bytes), not just UI thumbnail
  assert(final.sessionPath && existsSync(final.sessionPath), 'session path exists');
  const sessionText = readFileSync(final.sessionPath!, 'utf8');
  assert(sessionText.includes(bytes.toString('base64')), 'native session contains original image bytes');
  assert(sessionText.includes(asset.id) || sessionText.includes(asset.hash), 'session retains image provenance');

  const receipts = app.store.list<ModelRequestReceipt>('model_request').filter(r => r.runId === final.id);
  (report.stages as unknown[]).push({
    name: 'workbench-vision-upload-send',
    status: final.status,
    calls: final.calls,
    spentUsd: final.spentUsd,
    assistantText: assistant!.text.slice(0, 200),
    matchesExpected: true,
    sessionHasImageBytes: true,
    receipts: receipts.map(r => ({ callNumber: r.callNumber, state: r.state, costUsd: r.costUsd, tokens: r.usage?.totalTokens })),
    pass: true,
  });

  // Refresh + reopen: image and source remain
  await page.reload();
  await historyImage.waitFor();
  await historyImage.scrollIntoViewIfNeeded();
  await historyImage.evaluate((img: HTMLImageElement) => img.decode());
  const download = page.getByRole('link', { name: `${FILE_NAME} · 下载原图`, exact: true });
  assert.equal(await download.getAttribute('href'), `/api/assets/${asset.id}`);
  const original = await context.request.get(base + `/api/assets/${asset.id}`);
  assert.equal(original.status(), 200);
  assert.deepEqual(await original.body(), bytes);
  await page.getByText(EXPECTED, { exact: false }).first().waitFor();
  await page.screenshot({ path: join(evidence, 'vision-history-small.png') });
  (report.stages as unknown[]).push({ name: 'refresh-history-image', pass: true });

  // Close and reopen chat window from layout
  await page.close();
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.getByRole('img', { name: `附带图片：${FILE_NAME}`, exact: true }).waitFor();
  await page.getByText(EXPECTED, { exact: false }).first().waitFor();
  (report.stages as unknown[]).push({ name: 'reopen-window-history', pass: true });

  // Continuation without re-attaching — image must remain in model context
  await page.getByLabel('对话输入').fill(CONTINUE_PROMPT);
  await page.getByRole('button', { name: '发送 ↑', exact: true }).click();
  await wait(() => app.store.list<Run>('run').length === 2, 'continuation submitted');
  const cont = app.store.list<Run>('run').find(r => r.id !== final.id)!;
  await wait(() => ['completed', 'failed', 'interrupted', 'cancelled'].includes(app.store.get<Run>('run', cont.id).status), 'continuation finished', 240000);
  const contFinal = app.store.get<Run>('run', cont.id);
  assert.equal(contFinal.status, 'completed', contFinal.error ?? 'continuation failed');
  assert.equal(app.store.get<Task>('task', contFinal.taskId).context.assetIds?.length ?? 0, 0, 'no new attachment on continue');
  const contHistory = app.service.conversation(project.id, undefined, 50, contFinal.conversationId!);
  const contAssistant = [...contHistory.messages].reverse().find(m => m.role === 'assistant' && m.runId === contFinal.id);
  assert(contAssistant, 'continuation assistant present');
  assert(contAssistant!.text.includes(EXPECTED), `continuation must recall digit, got: ${contAssistant!.text.slice(0, 200)}`);
  assert(contFinal.sessionPath && readFileSync(contFinal.sessionPath, 'utf8').includes(bytes.toString('base64')), 'continued session still has image');
  (report.stages as unknown[]).push({
    name: 'continuation-without-reattach',
    status: contFinal.status,
    calls: contFinal.calls,
    spentUsd: contFinal.spentUsd,
    assistantText: contAssistant!.text.slice(0, 200),
    pass: true,
  });

  assert.deepEqual(errors, []);
  const usedCalls = app.store.list<Run>('run').reduce((n, r) => n + r.calls, 0);
  const usedUsd = app.store.list<Run>('run').reduce((n, r) => n + (r.spentUsd || 0), 0);
  report.sessionUsage = { calls: usedCalls, spentUsd: usedUsd };
  report.cumulativeAfter = { calls: PRIOR_CALLS + usedCalls, usd: PRIOR_USD + usedUsd, remaining: { calls: CAP_CALLS - PRIOR_CALLS - usedCalls, usd: CAP_USD - PRIOR_USD - usedUsd } };
  report.pass = true;
  writeFileSync(join(evidence, 'vision-ui-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    pass: true,
    stages: (report.stages as { name: string; pass?: boolean }[]).map(s => s.name),
    sessionUsage: report.sessionUsage,
    cumulativeAfter: report.cumulativeAfter,
  }, null, 2));
} catch (error) {
  const usedCalls = app.store.list<Run>('run').reduce((n, r) => n + r.calls, 0);
  const usedUsd = app.store.list<Run>('run').reduce((n, r) => n + (r.spentUsd || 0), 0);
  report.pass = false;
  report.error = error instanceof Error ? error.message : String(error);
  report.sessionUsage = { calls: usedCalls, spentUsd: usedUsd };
  report.cumulativeAfter = { calls: PRIOR_CALLS + usedCalls, usd: PRIOR_USD + usedUsd };
  writeFileSync(join(evidence, 'vision-ui-report.json'), JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ pass: false, error: report.error, sessionUsage: report.sessionUsage }, null, 2));
  throw error;
} finally {
  await browser.close().catch(() => undefined);
  await app.scheduler.stop().catch(() => undefined);
  app.server.close();
}
