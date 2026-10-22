/**
 * CHAT-15 / CHV-23: minimal live DeepSeek via chat-ui candidate UI.
 * Key: PI_API_KEY or DEEPSEEK_API_KEY from env only — never written to evidence/logs.
 * Caps: CHAT15_MAX_CALLS (≤50), CHAT15_BUDGET_USD (default ~¥10 / 7.2), cumulative ledger.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import { loadPi } from '../../server/pi-adapter.js';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import type { Run } from '../../shared/contracts.js';
import type { ModelRequestReceipt } from '../../shared/pi-runtime.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
const ledgerPath = join(evidence, 'chat15-budget-ledger.json');
mkdirSync(evidence, { recursive: true });

const key = process.env.PI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
assert.ok(key, 'PI_API_KEY or DEEPSEEK_API_KEY required in environment (not written to files)');

const CNY_CAP = 10;
const USD_PER_CNY = 7.2;
const MAX_CALLS = Math.min(Number(process.env.CHAT15_MAX_CALLS || process.env.PI_MAX_CALLS || 50), 50);
const BUDGET_USD = Math.min(
  Number(process.env.CHAT15_BUDGET_USD || process.env.PI_BUDGET_USD || CNY_CAP / USD_PER_CNY),
  CNY_CAP / USD_PER_CNY,
);
const RESERVE = Math.min(Number(process.env.PI_CALL_RESERVE_USD || 0.05), 0.1);
const MODEL = process.env.PI_MODEL || 'deepseek-flash';
const PROVIDER = process.env.PI_PROVIDER || 'deepseek';
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

type Ledger = {
  at?: string;
  totalCalls: number;
  totalSpentUsd: number;
  totalSpentCnyApprox: number;
  sessions: unknown[];
};
function loadLedger(): Ledger {
  if (!existsSync(ledgerPath)) return { totalCalls: 0, totalSpentUsd: 0, totalSpentCnyApprox: 0, sessions: [] };
  try {
    return JSON.parse(readFileSync(ledgerPath, 'utf8')) as Ledger;
  } catch {
    return { totalCalls: 0, totalSpentUsd: 0, totalSpentCnyApprox: 0, sessions: [] };
  }
}
const ledger = loadLedger();
assert.ok(ledger.totalCalls < MAX_CALLS, `ledger already at call cap ${ledger.totalCalls}/${MAX_CALLS}`);
assert.ok(ledger.totalSpentUsd < BUDGET_USD, `ledger already at budget $${ledger.totalSpentUsd}/$${BUDGET_USD}`);

const remainingCalls = MAX_CALLS - ledger.totalCalls;
const remainingUsd = BUDGET_USD - ledger.totalSpentUsd;

Object.assign(config, {
  apiKey: key,
  provider: PROVIDER,
  model: MODEL,
  maxCalls: Math.min(remainingCalls, 20),
  budgetUsd: Math.min(remainingUsd, BUDGET_USD),
  reservePerCallUsd: RESERVE,
  maxOutputTokens: 2048,
  timeoutMs: 180000,
});

const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  chv: 'CHV-23',
  staticDir,
  provider: PROVIDER,
  model: MODEL,
  keyPresent: true,
  keyLength: key.length,
  caps: {
    maxCallsSession: config.maxCalls,
    budgetUsdSession: config.budgetUsd,
    cumulativeMaxCalls: MAX_CALLS,
    cumulativeBudgetUsd: BUDGET_USD,
    cnyCap: CNY_CAP,
    usdPerCny: USD_PER_CNY,
    ledgerBefore: { calls: ledger.totalCalls, spentUsd: ledger.totalSpentUsd },
  },
  stages: [] as unknown[],
  realModelRequests: 0,
};

function usage(app: ReturnType<typeof createApp>) {
  const runs = app.store.list<Run>('run');
  const calls = runs.reduce((n, r) => n + (r.calls || 0), 0);
  const spentUsd = runs.reduce((n, r) => n + (r.spentUsd || 0), 0);
  const reservedUsd = runs.reduce((n, r) => n + (r.reservedUsd || 0), 0);
  return { calls, spentUsd, reservedUsd, accountedUsd: spentUsd + reservedUsd };
}

async function waitRun(app: ReturnType<typeof createApp>, runId: string, deadlineMs: number) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    app.scheduler.tick();
    const u = usage(app);
    report.realModelRequests = (ledger.totalCalls || 0) + u.calls;
    if (u.calls >= config.maxCalls || u.accountedUsd >= config.budgetUsd) {
      const run = app.store.get<Run>('run', runId);
      if (!['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) {
        await app.service.requestCancel(runId).catch(() => undefined);
      }
      return { run: app.store.get<Run>('run', runId), stopped: 'cap' as const, ...u };
    }
    const run = app.store.get<Run>('run', runId);
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) {
      return { run, stopped: 'terminal' as const, ...u };
    }
    await delay(250);
  }
  const run = app.store.get<Run>('run', runId);
  await app.service.requestCancel(runId).catch(() => undefined);
  return { run: app.store.get<Run>('run', runId), stopped: 'timeout' as const, ...usage(app) };
}

const dataDir = mkdtempSync(join(tmpdir(), 'chat15-live-'));
const password = 'chat15-live-offline';
const app = createApp({ dataDir, staticDir, password, schedule: false });
const project = app.service.createProject('CHAT-15 DeepSeek 联调');
await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
const port = (app.server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;
config.origin = base;

const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(45000);
const pageErrors: string[] = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

try {
  // Catalog: vision?
  const pi = await loadPi();
  const runtime = await pi.ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  const catalogModel = runtime.getModel(PROVIDER, MODEL);
  const inputs = (catalogModel as { input?: string[] } | undefined)?.input || [];
  const visionSupported = inputs.includes('image');
  report.catalog = {
    modelId: catalogModel?.id,
    input: inputs,
    visionSupported,
  };

  await context.request.post(base + '/api/login', { data: { password } });
  await page.goto(base + '/workbench');
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  const input = page.getByLabel('对话输入', { exact: true });
  await input.waitFor();

  // --- Stage 1: tool closed loop (write_asset) via UI ---
  const marker = 'CHAT15_TOOL_OK';
  const goal1 = [
    `用 write_asset 保存 chat15-probe.md，内容必须严格为 ${marker}。`,
    '只完成此动作然后停止；不要调用其他工具，不要读取其他项目。',
  ].join('');
  await input.fill(goal1);
  await page.getByRole('button', { name: '发送 ↑', exact: true }).click();
  await delay(500);
  const run1 = app.store.list<Run>('run').at(-1);
  assert.ok(run1, 'run1 missing');
  const basic = await waitRun(app, run1.id, 180000);
  const asset = app.store
    .list<{ id: string; name: string; runId?: string; status: string }>('asset')
    .find((a) => a.runId === run1.id && a.name === 'chat15-probe.md' && a.status === 'ready');
  let content: string | undefined;
  if (asset) {
    const res = await context.request.get(base + `/api/assets/${asset.id}`);
    content = await res.text();
  }
  const toolOk = basic.run.status === 'completed' && content === marker;
  (report.stages as unknown[]).push({
    name: 'ui-tool-write_asset',
    status: basic.run.status,
    stopped: basic.stopped,
    calls: basic.run.calls,
    spentUsd: basic.run.spentUsd,
    toolOk,
    sessionBound: Boolean(basic.run.sessionId && basic.run.sessionPath),
    error: basic.run.error,
  });
  assert.ok(toolOk, `tool loop failed: ${JSON.stringify((report.stages as unknown[])[0])}`);
  await page.screenshot({ path: join(evidence, 'chat15-tool.png'), fullPage: true });

  // --- Stage 2: queue follow-up (追问) while a longer run is active ---
  let steerOk = false;
  let queueOk = false;
  if (usage(app).calls + 2 <= config.maxCalls && usage(app).accountedUsd + RESERVE * 2 <= config.budgetUsd) {
    const goal2 = [
      '先用 bash 执行: node -e "console.log(\'CHAT15_WAIT\');"',
      '然后再用 write_asset 保存 chat15-follow.md，内容严格为 CHAT15_FOLLOW_OK。',
      '分两步完成。',
    ].join('');
    await input.fill(goal2);
    await page.getByRole('button', { name: '发送 ↑', exact: true }).click();
    await delay(800);
    const run2 = app.store.list<Run>('run').find((r) => r.id !== run1.id && ['queued', 'running'].includes(r.status));
    if (run2) {
      // Try 排队追问 while running
      for (let i = 0; i < 40 && app.store.get<Run>('run', run2.id).status === 'queued'; i++) {
        app.scheduler.tick();
        await delay(100);
      }
      if (['running', 'queued'].includes(app.store.get<Run>('run', run2.id).status)) {
        await input.fill('CHAT15_QUEUE_FOLLOWUP：完成后额外确认 follow 文件已写。');
        const queueBtn = page.getByRole('button', { name: '排队追问', exact: true });
        if (await queueBtn.isVisible().catch(() => false)) {
          await page.getByLabel('排队追问').check().catch(() => undefined);
          // radiogroup
          await page.locator('input[value="queue"], input[name*="run-action"]').first().check().catch(async () => {
            await page.getByText('排队追问', { exact: true }).click().catch(() => undefined);
          });
          await page.getByRole('radio', { name: /排队/ }).check().catch(() => undefined);
          await input.fill('CHAT15_QUEUE_FOLLOWUP');
          const primary = page.locator('[data-chat-primary-action]');
          // select queue mode if radiogroup present
          const queueRadio = page.locator('.wb-chat-run-actions input[type=radio]').nth(0);
          if (await queueRadio.count()) await queueRadio.check();
          await primary.click();
          await delay(500);
          queueOk = app.store.list<Run>('run').some((r) => r.continueAfterRunId === run2.id);
        }
        // Try 指导
        const guideRadio = page.getByRole('radio', { name: /指导/ });
        if (await guideRadio.count()) {
          await guideRadio.check();
          await input.fill('CHAT15_GUIDANCE：优先写 chat15-follow.md');
          await page.locator('[data-chat-primary-action]').click();
          await delay(800);
          steerOk = app.store.list('run_input').length > 0 || (await page.getByText(/指导/).count()) > 0;
        }
      }
      const done2 = await waitRun(app, run2.id, 180000);
      // wait queued child if any
      const child = app.store.list<Run>('run').find((r) => r.continueAfterRunId === run2.id);
      if (child) await waitRun(app, child.id, 120000);
      (report.stages as unknown[]).push({
        name: 'ui-steer-or-queue',
        run2Status: done2.run.status,
        steerOk,
        queueOk: queueOk || Boolean(child),
        calls: done2.calls,
        spentUsd: done2.spentUsd,
      });
    } else {
      (report.stages as unknown[]).push({ name: 'ui-steer-or-queue', skipped: 'no-running-run2' });
    }
  } else {
    (report.stages as unknown[]).push({ name: 'ui-steer-or-queue', skipped: 'budget' });
  }

  // --- Stage 3: vision / image — skip honestly if unsupported ---
  if (!visionSupported) {
    (report.stages as unknown[]).push({
      name: 'ui-image',
      skipped: true,
      reason: `model ${MODEL} catalog input=${JSON.stringify(inputs)} has no image`,
    });
  } else if (usage(app).calls + 2 <= config.maxCalls) {
    // Minimal: attach via file input if present, ask digit — keep short
    const pngPath = join(dataDir, 'vision-digit.png');
    // reuse tiny 1x1 png bytes if drawing is heavy — prefer skip of full vision if budget tight
    writeFileSync(
      pngPath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    const fileInput = page.locator('input[type=file][accept*="image"]');
    if (await fileInput.count()) {
      await fileInput.setInputFiles(pngPath);
      await delay(500);
      await input.fill('若能看到图片请只回复 OK_IMAGE，否则说明无法识图。');
      await page.getByRole('button', { name: '发送 ↑', exact: true }).click();
      await delay(500);
      const runImg = app.store.list<Run>('run').at(-1)!;
      const img = await waitRun(app, runImg.id, 120000);
      (report.stages as unknown[]).push({
        name: 'ui-image',
        skipped: false,
        status: img.run.status,
        calls: img.run.calls,
        spentUsd: img.run.spentUsd,
        note: '1x1 png smoke; not digit recognition',
      });
    } else {
      (report.stages as unknown[]).push({ name: 'ui-image', skipped: true, reason: 'no-file-input' });
    }
  } else {
    (report.stages as unknown[]).push({ name: 'ui-image', skipped: true, reason: 'budget' });
  }

  // --- Stage 4: failure recovery — cancel mid-run then retry/new send ---
  if (usage(app).calls + 2 <= config.maxCalls) {
    await input.fill('请连续用 bash 执行: node -e "for(let i=0;i<1e9;i++){}" （会很长）；开始后可被停止。');
    await page.getByRole('button', { name: '发送 ↑', exact: true }).click();
    await delay(1000);
    for (let i = 0; i < 30; i++) {
      app.scheduler.tick();
      await delay(100);
    }
    const busy = app.store.list<Run>('run').find((r) => ['running', 'queued'].includes(r.status));
    if (busy) {
      const stop = page.getByRole('button', { name: /停止/ });
      if (await stop.count()) await stop.click();
      else await app.service.requestCancel(busy.id);
      await delay(1500);
      app.scheduler.tick();
      const afterCancel = app.store.get<Run>('run', busy.id);
      // recover: short successful send
      await input.fill(`用 write_asset 保存 chat15-recover.md，内容严格为 CHAT15_RECOVER_OK。`);
      await page.getByRole('button', { name: '发送 ↑', exact: true }).click();
      await delay(500);
      const recoverRun = app.store.list<Run>('run').at(-1)!;
      const recovered = await waitRun(app, recoverRun.id, 120000);
      const recoverAsset = app.store
        .list<{ name: string; runId?: string; status: string }>('asset')
        .some((a) => a.name === 'chat15-recover.md' && a.status === 'ready');
      (report.stages as unknown[]).push({
        name: 'ui-cancel-recover',
        cancelledStatus: afterCancel.status,
        recoverStatus: recovered.run.status,
        recoverOk: recovered.run.status === 'completed' && recoverAsset,
        calls: recovered.calls,
        spentUsd: recovered.spentUsd,
      });
    } else {
      (report.stages as unknown[]).push({ name: 'ui-cancel-recover', skipped: 'no-busy-run' });
    }
  }

  const sessionUsage = usage(app);
  const receipts = app.store.list<ModelRequestReceipt>('model_request');
  report.sessionUsage = sessionUsage;
  report.receipts = receipts.map((r) => ({
    runId: r.runId,
    callNumber: r.callNumber,
    state: r.state,
    purpose: r.purpose,
    costUsd: r.costUsd,
    tokens: r.usage?.totalTokens,
  }));
  report.pageErrors = pageErrors;
  report.steerOrQueue = { steerOk, queueOk };

  const sessionCalls = sessionUsage.calls;
  const sessionSpent = sessionUsage.spentUsd;
  ledger.totalCalls += sessionCalls;
  ledger.totalSpentUsd += sessionSpent;
  ledger.totalSpentCnyApprox = Number(((ledger.totalSpentUsd || 0) * USD_PER_CNY).toFixed(4));
  ledger.at = new Date().toISOString();
  ledger.sessions.push({
    at: report.at,
    calls: sessionCalls,
    spentUsd: sessionSpent,
    stages: (report.stages as { name: string }[]).map((s) => s.name),
  });
  // ledger has no secrets
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

  const stageTool = (report.stages as { name: string; toolOk?: boolean }[]).find((s) => s.name === 'ui-tool-write_asset');
  const stageRecover = (report.stages as { name: string; recoverOk?: boolean; skipped?: string }[]).find(
    (s) => s.name === 'ui-cancel-recover',
  );
  const passed =
    Boolean(stageTool?.toolOk) &&
    pageErrors.length === 0 &&
    (stageRecover?.skipped || stageRecover?.recoverOk !== false);
  report.passed = passed;
  report.cumulative = {
    calls: ledger.totalCalls,
    spentUsd: ledger.totalSpentUsd,
    spentCnyApprox: ledger.totalSpentCnyApprox,
  };
  writeFileSync(join(evidence, 'chat15-report.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: join(evidence, 'chat15-final.png'), fullPage: true });
  console.log(
    JSON.stringify(
      {
        ok: passed,
        evidence: join(evidence, 'chat15-report.json'),
        calls: sessionCalls,
        spentUsd: sessionSpent,
        cumulative: report.cumulative,
        visionSupported,
      },
      null,
      2,
    ),
  );
  assert.ok(passed, `CHAT-15 failed: ${JSON.stringify(report.stages)}`);
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  // still account usage
  try {
    const sessionUsage = usage(app);
    ledger.totalCalls += sessionUsage.calls;
    ledger.totalSpentUsd += sessionUsage.spentUsd;
    ledger.totalSpentCnyApprox = Number((ledger.totalSpentUsd * USD_PER_CNY).toFixed(4));
    ledger.at = new Date().toISOString();
    writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    report.sessionUsage = sessionUsage;
    report.cumulative = {
      calls: ledger.totalCalls,
      spentUsd: ledger.totalSpentUsd,
      spentCnyApprox: ledger.totalSpentCnyApprox,
    };
  } catch {
    /* */
  }
  writeFileSync(join(evidence, 'chat15-report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close().catch(() => undefined);
  await app.close();
}
