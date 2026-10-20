import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import type { Policy, Run } from '../shared/contracts.js';

const evidence = 'output/dev-evidence/pi-parity/loop-158';
mkdirSync(evidence, { recursive: true });
Object.assign(config, { apiKey: 'offline-budget-ui', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 4, reservePerCallUsd: 1 });
const dataDir = mkdtempSync(join(tmpdir(), 'pi-budget-ui-'));
const app = createApp({ dataDir, staticDir: 'output/pi-parity-build', password: 'budget-ui-password', schedule: false });
const project = app.service.createProject('预算页验收');
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await context.request.post(base + '/api/login', { data: { password: 'budget-ui-password' } });
  await page.goto(base);
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();

  // 429/503 路径：同一次执行内失败尝试也计入 calls，恢复后仍是同一任务额度。
  await page.getByLabel('对话输入').fill('临时故障恢复计入额度');
  await page.getByRole('button', { name: '发送 ↑', exact: true }).click();
  const recovered = app.store.list<Run>('run')[0];
  app.service.transition(recovered.id, 'running', { startedAt: new Date().toISOString() });
  app.service.reserveRequest(recovered.id, 'budget-429-a', undefined, 4);
  app.service.settleCall(recovered.id, undefined, undefined, 1);
  app.store.update<Run>('run', recovered.id, app.store.get<Run>('run', recovered.id).revision, {
    retryState: { phase: 'waiting', attempt: 1, maxAttempts: 3, delayMs: 1000 },
  });
  app.store.event('run.retry_state', {}, { projectId: recovered.projectId, runId: recovered.id });
  await page.getByLabel('执行时间', { exact: true }).getByText(/自动重试 1\/3：退避1秒/).waitFor();
  app.service.reserveRequest(recovered.id, 'budget-429-b', undefined, 4);
  app.service.settleCall(recovered.id, 0.02, { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, complete: true }, 2);
  app.store.update<Run>('run', recovered.id, app.store.get<Run>('run', recovered.id).revision, {
    retryState: { phase: 'succeeded', attempt: 1, maxAttempts: 3, delayMs: 1000 },
  });
  app.store.event('run.retry_state', {}, { projectId: recovered.projectId, runId: recovered.id });
  app.service.transition(recovered.id, 'completed');
  await page.getByText('模型请求 · 2 次', { exact: true }).click();
  await page.getByText(/第 1 次 · 回答 \/ 工具轮次 · 回执不完整/).waitFor();
  await page.getByText(/第 2 次 · 回答 \/ 工具轮次 · 已结算/).waitFor();
  await page.getByText('任务总额度与恢复', { exact: true }).click();
  await page.getByText(/请求：已用 2 \/ 4 次/).waitFor();
  const recoveredBudget = app.service.taskBudget(recovered.id);
  assert.equal(recoveredBudget.usedCalls, 2);
  assert.equal(recoveredBudget.remainingCalls, 2);
  await page.screenshot({ path: join(evidence, 'retry-counts.png') });

  // 401 路径：服务端受控创建独立话题，页面核对单次失败且无自动重试。
  const policy: Policy = {
    ...recovered.policy,
    maxCalls: 4,
    maxCostUsd: 4,
    reservePerCallUsd: 1,
  };
  const authConversation = app.service.createConversation(project.id, '认证失败验收', crypto.randomUUID());
  const auth = app.service.submit(project.id, '认证失败不自动重试', crypto.randomUUID(), 'pi', policy, [], undefined, { view: 'project' }, null, authConversation.id).run;
  app.service.transition(auth.id, 'running', { startedAt: new Date().toISOString() });
  app.service.reserveRequest(auth.id, 'budget-401', undefined, 4);
  app.service.settleCall(auth.id, undefined, undefined, 1);
  app.service.transition(auth.id, 'failed', { error: '模型认证失败（受控 401）' });
  assert.equal(app.store.get<Run>('run', auth.id).retryState, undefined);
  assert.equal(app.store.get<Run>('run', auth.id).calls, 1);

  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByLabel('已有对话', { exact: true }).click();
  await page.locator(`[role=option][data-value="${authConversation.id}"]`).click();
  await page.getByRole('button', { name: '打开对话', exact: true }).click();
  await page.getByText('认证失败不自动重试', { exact: true }).waitFor();
  const authDetails = page.locator('details.wb-plugin-run-details').filter({ has: page.locator(':scope > summary', { hasText: '模型请求 · 1 次' }) });
  await authDetails.locator(':scope > summary').click();
  await authDetails.getByText(/第 1 次 · 回答 \/ 工具轮次 · 回执不完整/).waitFor();
  const authPane = page.locator('.wb-chat-pane').filter({ has: page.getByText('认证失败不自动重试', { exact: true }) });
  const authTimeText = await authPane.getByLabel('执行时间', { exact: true }).innerText();
  assert.equal(app.store.get<Run>('run', auth.id).retryState, undefined);
  assert(!/自动重试/.test(authTimeText), `auth run time should not mention auto-retry: ${authTimeText}`);
  await authDetails.getByText('任务总额度与恢复', { exact: true }).click();
  await authDetails.getByText(/请求：已用 1 \/ 4 次/).waitFor();
  assert.equal(app.service.taskBudget(auth.id).usedCalls, 1);
  await page.screenshot({ path: join(evidence, 'auth-no-retry.png') });

  await authDetails.getByLabel('追加请求次数', { exact: true }).fill('1');
  await authDetails.getByLabel('追加费用上限（美元）', { exact: true }).fill('1');
  await authDetails.getByLabel('追加原因', { exact: true }).fill('401 后人工追加');
  await authDetails.getByRole('button', { name: '确认追加并恢复', exact: true }).click();
  await authDetails.getByText('追加授权已记录，原任务已加入恢复队列。', { exact: true }).waitFor();
  assert.equal(app.service.taskBudget(auth.id).usedCalls, 1);
  assert.equal(app.service.taskBudget(auth.id).maxCalls, 5);
  await page.reload();
  const authDetailsAgain = page.locator('details.wb-plugin-run-details').filter({ has: page.locator(':scope > summary', { hasText: '模型请求 · 1 次' }) });
  await authDetailsAgain.locator(':scope > summary').click();
  await authDetailsAgain.getByText('任务总额度与恢复', { exact: true }).click();
  await authDetailsAgain.getByText(/401 后人工追加：请求 4 → 5/).waitFor();
  await authDetailsAgain.getByText(/请求：已用 1 \/ 5 次/).waitFor();
  await page.screenshot({ path: join(evidence, 'budget-after-auth.png') });

  assert.deepEqual(errors, []);
  writeFileSync(join(evidence, 'report.json'), JSON.stringify({
    closed: '页面可见 429/503 恢复的两次请求与 401 单次失败；失败计入同一任务额度；401 无自动重试；追加后累计仍保留',
    realModelRequests: 0,
    recovered: { runId: recovered.id, calls: 2, usedCalls: recoveredBudget.usedCalls, retrySucceeded: true },
    auth: { runId: auth.id, calls: 1, usedCalls: 1, retryState: null, grantMaxCalls: 5 },
    engineeringProof: 'tests/pi-retry-worker.test.ts auth/429/503',
    pageErrors: errors,
  }, null, 2));
} finally {
  await browser.close();
  await app.close();
}
