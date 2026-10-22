/**
 * CHAT-15 supplement: live 指导/排队 via candidate UI (DeepSeek).
 * Key from env only. Appends to chat15-budget-ledger.json.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import type { Run } from '../../shared/contracts.js';
import type { RunInput } from '../../shared/run-input.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
const ledgerPath = join(evidence, 'chat15-budget-ledger.json');
mkdirSync(evidence, { recursive: true });

const key = process.env.PI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
assert.ok(key, 'API key required in env');

const MAX_CALLS = 50;
const BUDGET_USD = 1.35;
const ledger = existsSync(ledgerPath)
  ? (JSON.parse(readFileSync(ledgerPath, 'utf8')) as {
      totalCalls: number;
      totalSpentUsd: number;
      totalSpentCnyApprox: number;
      sessions: unknown[];
    })
  : { totalCalls: 0, totalSpentUsd: 0, totalSpentCnyApprox: 0, sessions: [] };

assert.ok(ledger.totalCalls < MAX_CALLS && ledger.totalSpentUsd < BUDGET_USD, 'budget exhausted');

Object.assign(config, {
  apiKey: key,
  provider: process.env.PI_PROVIDER || 'deepseek',
  model: process.env.PI_MODEL || 'deepseek-flash',
  maxCalls: Math.min(12, MAX_CALLS - ledger.totalCalls),
  budgetUsd: Math.min(0.5, BUDGET_USD - ledger.totalSpentUsd),
  reservePerCallUsd: 0.05,
  maxOutputTokens: 1024,
  timeoutMs: 180000,
});

const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  purpose: 'CHAT-15 steer+queue live supplement',
  model: config.model,
  keyPresent: true,
};

const dataDir = mkdtempSync(join(tmpdir(), 'chat15-steer-'));
const password = 'chat15-steer';
const app = createApp({ dataDir, staticDir, password, schedule: false });
const project = app.service.createProject('CHAT-15 指导追问');
await new Promise<void>((d) => app.server.listen(0, '127.0.0.1', d));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);

function usage() {
  const runs = app.store.list<Run>('run');
  return {
    calls: runs.reduce((n, r) => n + r.calls, 0),
    spentUsd: runs.reduce((n, r) => n + r.spentUsd, 0),
  };
}

try {
  await context.request.post(base + '/api/login', { data: { password } });
  await page.goto(base + '/workbench');
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  const input = page.getByLabel('对话输入', { exact: true });
  await input.waitFor();

  // Long enough for steer/queue UI: sleep then write
  await input.fill(
    '用 bash 执行: node -e "require(\'fs\').writeFileSync(\'chat15-wait.txt\',\'WAIT\'); console.log(\'WAIT_MARK\'); for(let i=0;i<8e8;i++){}"; 然后用 write_asset 保存 chat15-steer-done.md，内容为 STEER_DONE。',
  );
  await page.getByRole('button', { name: '发送 ↑', exact: true }).click();

  const deadline = Date.now() + 90000;
  let first: Run | undefined;
  while (Date.now() < deadline) {
    app.scheduler.tick();
    first = app.store.list<Run>('run')[0];
    if (first && first.status === 'running') break;
    await delay(150);
  }
  assert.ok(first && first.status === 'running', `expected running, got ${first?.status}`);
  report.runStarted = { id: first.id, status: first.status, calls: first.calls };

  // 指导
  await page.getByRole('radio', { name: '指导当前执行', exact: true }).check();
  await input.fill('CHAT15_GUIDANCE_LIVE：请尽快写完 chat15-steer-done.md');
  await page.getByRole('button', { name: '指导当前执行', exact: true }).click();
  await page.getByText(/指导当前执行/).first().waitFor({ timeout: 20000 });
  const inputs = app.store.list<RunInput>('run_input');
  report.steer = {
    ok: inputs.some((i) => i.runId === first!.id && /CHAT15_GUIDANCE_LIVE/.test(i.text || '')),
    count: inputs.length,
    uiVisible: true,
  };
  assert.ok(report.steer.ok, 'steer instruction not stored');

  // 排队追问
  await page.getByRole('radio', { name: '排队追问', exact: true }).check();
  await input.fill('CHAT15_QUEUE_LIVE：确认 STEER_DONE 已写入');
  await page.getByRole('button', { name: '排队追问', exact: true }).click();
  await page.getByText(/排队追问/).first().waitFor({ timeout: 20000 });
  await delay(1000);
  const child = app.store.list<Run>('run').find((r) => r.continueAfterRunId === first!.id);
  report.queue = { ok: Boolean(child), childId: child?.id, childStatus: child?.status };
  assert.ok(child, 'queued follow-up run missing');

  // Finish first + child
  const finishDeadline = Date.now() + 180000;
  while (Date.now() < finishDeadline) {
    app.scheduler.tick();
    const a = app.store.get<Run>('run', first.id);
    const b = child ? app.store.get<Run>('run', child.id) : undefined;
    if (
      ['completed', 'failed', 'cancelled', 'interrupted'].includes(a.status) &&
      (!b || ['completed', 'failed', 'cancelled', 'interrupted'].includes(b.status))
    ) {
      break;
    }
    await delay(300);
  }
  report.firstFinal = app.store.get<Run>('run', first.id).status;
  report.childFinal = child ? app.store.get<Run>('run', child.id).status : null;
  report.usage = usage();
  report.passed = Boolean(report.steer.ok && report.queue.ok);

  const u = usage();
  ledger.totalCalls += u.calls;
  ledger.totalSpentUsd += u.spentUsd;
  ledger.totalSpentCnyApprox = Number((ledger.totalSpentUsd * 7.2).toFixed(4));
  ledger.sessions.push({ at: report.at, kind: 'steer-queue', calls: u.calls, spentUsd: u.spentUsd });
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  writeFileSync(join(evidence, 'chat15-steer-queue-report.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: join(evidence, 'chat15-steer-queue.png'), fullPage: true });
  console.log(JSON.stringify({ ok: report.passed, usage: u, cumulative: { calls: ledger.totalCalls, spentUsd: ledger.totalSpentUsd } }, null, 2));
  assert.ok(report.passed);
} catch (e) {
  report.passed = false;
  report.failure = String(e);
  try {
    const u = usage();
    ledger.totalCalls += u.calls;
    ledger.totalSpentUsd += u.spentUsd;
    ledger.totalSpentCnyApprox = Number((ledger.totalSpentUsd * 7.2).toFixed(4));
    writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    report.usage = u;
  } catch {
    /* */
  }
  writeFileSync(join(evidence, 'chat15-steer-queue-report.json'), JSON.stringify(report, null, 2));
  throw e;
} finally {
  await browser.close().catch(() => undefined);
  await app.close();
}
