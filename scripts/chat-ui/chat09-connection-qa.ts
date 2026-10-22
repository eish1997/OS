/**
 * CHAT-09 / CHV-11: in-chat connect & next-settings (not legacy-only).
 * Offline uses controlled ChatGPT auth fixture — no real OAuth / account / model.
 * Covers: 取消、成功可发送、失败、断开(失效)、草稿保留、订阅额度与 API 分离。
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockedExternalConnects } from './block-external.ts';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';
import type { Conversation, Run } from '../../shared/contracts.js';

const evidence = resolve(process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001');
const staticDir = process.env.CHAT_UI_STATIC || 'output/chat-ui-build';
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(evidence, { recursive: true });
assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1');

const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  staticDir,
  realModelRequests: 0,
  realChatGptLogin: false,
  authorization: 'controlled offline fixture',
  blockedExternalConnectsBefore: blockedExternalConnects(),
};

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'chv11-offline', alg: 'RS256', use: 'sig' };
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

async function openChatPane(
  page: import('playwright-core').Page,
  base: string,
  projectId: string,
  password: string,
) {
  await page.context().request.post(base + '/api/login', { data: { password } });
  await page.goto(base + '/workbench');
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${projectId}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  const pane = page.locator('.wb-chat-pane');
  const input = page.getByLabel('对话输入', { exact: true });
  await input.waitFor();
  return { pane, input };
}

try {
  // --- A: API 未配置 → 打开连接 → 取消返回（草稿保留，不点真实 OAuth）---
  Object.assign(config, {
    apiKey: '',
    provider: 'openai',
    model: 'gpt-5.6-sol',
    maxCalls: 4,
    budgetUsd: 4,
    reservePerCallUsd: 1,
  });
  const dataA = mkdtempSync(join(tmpdir(), 'chat-ui-chat09a-'));
  const appA = createApp({ dataDir: dataA, staticDir, password: 'chat-ui-offline', schedule: false });
  const projectA = appA.service.createProject('CHAT-09 未连接（离线）');
  await new Promise<void>((done) => appA.server.listen(0, '127.0.0.1', done));
  const baseA = `http://127.0.0.1:${(appA.server.address() as { port: number }).port}`;
  config.origin = baseA;

  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const { pane, input } = await openChatPane(page, baseA, projectA.id, 'chat-ui-offline');
  const draft = 'CHAT-09 草稿应在连接面板关闭后保留';
  await input.fill(draft);

  await pane.locator('[data-chat-connect-prompt]').waitFor();
  await pane.getByRole('button', { name: '打开连接设置', exact: true }).click();
  const panel = page.locator('[data-chat-connection-panel]');
  await panel.waitFor();
  await panel.getByRole('heading', { name: '用你的 ChatGPT 额度', exact: true }).waitFor();
  await panel.getByRole('group', { name: 'Pi运行设置' }).waitFor();
  assert.match(await panel.locator('[data-chat-connection-status]').innerText(), /尚未就绪/);
  await panel.locator('[data-chat-connection-return]').click();
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await input.inputValue(), draft);
  report.connectFlow = { draftPreserved: true, legacyOnly: false, oauthClicked: false, path: 'return-without-login' };

  await browser.close();
  await appA.close();

  // --- B: API 已配置 → 下次配置 + 旧 Run 冻结摘要 ---
  Object.assign(config, {
    apiKey: 'offline-chat-ui-only',
    provider: 'openai',
    model: 'gpt-5.6-sol',
    maxCalls: 4,
    budgetUsd: 4,
    reservePerCallUsd: 1,
  });
  const dataB = mkdtempSync(join(tmpdir(), 'chat-ui-chat09b-'));
  const appB = createApp({ dataDir: dataB, staticDir, password: 'chat-ui-offline', schedule: false });
  const projectB = appB.service.createProject('CHAT-09 下次配置（离线）');
  await new Promise<void>((done) => appB.server.listen(0, '127.0.0.1', done));
  const baseB = `http://127.0.0.1:${(appB.server.address() as { port: number }).port}`;
  config.origin = baseB;

  const browserB = await chromium.launch({ headless: true, executablePath: chrome });
  const contextB = await browserB.newContext({ viewport: { width: 1366, height: 900 } });
  const pageB = await contextB.newPage();
  pageB.setDefaultTimeout(25000);
  pageB.on('pageerror', (e) => errors.push(e.message));

  const { pane: paneB, input: inputB } = await openChatPane(pageB, baseB, projectB.id, 'chat-ui-offline');
  const draftB = 'CHAT-09 下次配置草稿';
  await inputB.fill(draftB);

  const conversation = appB.store.list<Conversation>('conversation').find((c) => c.projectId === projectB.id)!;
  const created = await contextB.request.post(baseB + '/api/tasks', {
    data: {
      projectId: projectB.id,
      conversationId: conversation.id,
      goal: 'CHAT-09 冻结样例',
      commandId: crypto.randomUUID(),
      mode: 'pi',
      continueFromRunId: null,
    },
  });
  assert.equal(created.ok(), true, await created.text());
  const run = appB.store.list<Run>('run').at(-1)!;
  appB.service.transition(run.id, 'running', { startedAt: new Date().toISOString() });
  appB.service.transition(run.id, 'completed', { endedAt: new Date().toISOString() });

  await paneB.getByRole('button', { name: '下次配置与额度', exact: true }).click();
  const nextPanel = pageB.locator('[data-chat-connection-panel]');
  await nextPanel.waitFor();
  assert.match(await nextPanel.locator('[data-chat-connection-status]').innerText(), /当前可对话/);
  await nextPanel.getByLabel('思考强度').waitFor();
  await nextPanel.getByLabel('执行时长').waitFor();
  await nextPanel.locator('[data-chat-connection-return]').click();
  await nextPanel.waitFor({ state: 'hidden' });
  assert.equal(await inputB.inputValue(), draftB);

  await pageB.waitForFunction(() => document.querySelector('[data-chat-run-frozen]'));
  const frozen = await paneB.locator('[data-chat-run-frozen]').first().innerText();
  assert.match(frozen, /本次冻结/);
  assert.match(frozen, /gpt-5\.6-sol|API/);
  report.nextSettings = { draftPreserved: true, frozen };

  await browserB.close();
  await appB.close();

  // --- C: 受控订阅 — 取消 / 失败 / 成功可发送 / 断开失效；不发起真实账户登录 ---
  Object.assign(config, {
    apiKey: '',
    provider: 'openai',
    model: '',
    maxCalls: 0,
    budgetUsd: 0,
    reservePerCallUsd: 0,
  });
  const live = { authUrl: undefined as URL | undefined, failToken: false };
  const liveFetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://auth.openai.com/.well-known/jwks.json') return Response.json({ keys: [jwk] });
    if (url === 'https://auth.openai.com/api/accounts/oauth/token') {
      if (live.failToken) {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
          headers: { 'content-type': 'application/json', 'x-request-id': 'chv11-fail' },
        });
      }
      assert.ok(live.authUrl, 'authorization URL missing');
      const body =
        encode({ alg: 'RS256', kid: jwk.kid }) +
        '.' +
        encode({
          iss: 'https://auth.openai.com',
          aud: 'oaiapp-chv11-offline',
          sub: 'chv11-offline-user',
          email: 'chv11@example.invalid',
          exp: Math.floor(Date.now() / 1000) + 3600,
          nonce: live.authUrl.searchParams.get('nonce'),
        });
      return Response.json({
        access_token: 'chv11-offline-access',
        refresh_token: 'chv11-offline-refresh',
        id_token: body + '.' + sign('RSA-SHA256', Buffer.from(body), keys.privateKey).toString('base64url'),
        scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
        token_type: 'Bearer',
        expires_in: 3600,
      });
    }
    if (url === 'https://api.openai.com/v1/models') {
      return Response.json({
        models: [{ slug: 'gpt-6.1-sol', display_name: 'CHV-11 Offline Sol', visibility: 'list' }],
      });
    }
    if (url === 'https://auth.openai.com/api/accounts/oauth/revoke') return new Response('', { status: 200 });
    throw new Error(`Offline CHV-11 fixture blocked unexpected network: ${url}`);
  };

  const dataC = mkdtempSync(join(tmpdir(), 'chat-ui-chat09c-'));
  const appC = createApp({
    dataDir: dataC,
    staticDir,
    password: 'chat-ui-offline',
    schedule: false,
    chatgpt: { fetch: liveFetcher, loginTimeoutMs: 20_000 },
  });
  const projectC = appC.service.createProject('CHAT-09 受控订阅（离线）');
  await new Promise<void>((done) => appC.server.listen(0, '127.0.0.1', done));
  const baseC = `http://127.0.0.1:${(appC.server.address() as { port: number }).port}`;
  config.origin = baseC;

  const browserC = await chromium.launch({ headless: true, executablePath: chrome });
  const contextC = await browserC.newContext({ viewport: { width: 1366, height: 900 } });
  await contextC.route('https://auth.openai.com/**', async (route) => {
    live.authUrl = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body>CHV-11 offline authorization fixture. No real account.</body></html>',
    });
  });
  const pageC = await contextC.newPage();
  pageC.setDefaultTimeout(30000);
  pageC.on('pageerror', (e) => errors.push(e.message));

  const { pane: paneC, input: inputC } = await openChatPane(pageC, baseC, projectC.id, 'chat-ui-offline');
  const draftC = 'CHV-11 受控订阅草稿 UNIQUE';
  await inputC.fill(draftC);
  await paneC.getByRole('button', { name: '打开连接设置', exact: true }).click();
  const panelC = pageC.locator('[data-chat-connection-panel]');
  await panelC.waitFor();

  // C1 取消登录
  const popup1 = contextC.waitForEvent('page');
  await panelC.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click();
  const p1 = await popup1;
  await p1.waitForURL('https://auth.openai.com/**');
  await panelC.getByRole('button', { name: '取消登录', exact: true }).click();
  await panelC.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).waitFor();
  assert.equal(appC.chatgpt.status().connected, false);
  assert.equal(appC.chatgpt.status().pending, false);
  await p1.close().catch(() => undefined);
  report.controlledCancel = { ok: true, draftStill: await inputC.inputValue() };
  assert.equal(await inputC.inputValue(), draftC);

  // C2 失败回调（token 交换失败）
  live.failToken = true;
  const popupFail = contextC.waitForEvent('page');
  await panelC.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click();
  const pf = await popupFail;
  await pf.waitForURL('https://auth.openai.com/**');
  assert.ok(live.authUrl);
  const failCb = new URL(live.authUrl!.searchParams.get('redirect_uri')!);
  failCb.search = new URLSearchParams({
    code: 'chv11-fail-code',
    state: live.authUrl!.searchParams.get('state')!,
    client_id: 'oaiapp-chv11-offline',
  }).toString();
  await pf.goto(failCb.toString());
  await pageC.getByRole('alert').first().waitFor({ timeout: 15000 });
  assert.equal(appC.chatgpt.status().connected, false);
  assert.equal(await inputC.inputValue(), draftC);
  report.controlledFailure = {
    ok: true,
    alert: await pageC.getByRole('alert').first().innerText(),
    draftPreserved: true,
  };
  await pf.close().catch(() => undefined);
  // Clear pending if any
  if (appC.chatgpt.status().pending) {
    await panelC.getByRole('button', { name: '取消登录', exact: true }).click().catch(() => undefined);
  }
  live.failToken = false;

  // C3 成功 → 欢迎 → 返回话题 → 可发送（主按钮可用）
  const popupOk = contextC.waitForEvent('page');
  await panelC.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click();
  const po = await popupOk;
  await po.waitForURL('https://auth.openai.com/**');
  assert.ok(live.authUrl);
  const okCb = new URL(live.authUrl!.searchParams.get('redirect_uri')!);
  okCb.search = new URLSearchParams({
    code: 'chv11-ok-code',
    state: live.authUrl!.searchParams.get('state')!,
    client_id: 'oaiapp-chv11-offline',
  }).toString();
  await po.goto(okCb.toString());
  await pageC.getByRole('dialog', { name: '正在使用你的 ChatGPT 额度' }).waitFor({ timeout: 20000 });
  assert.equal(appC.chatgpt.ready(), true);
  await pageC.getByRole('button', { name: '知道了，开始使用', exact: true }).click();
  await pageC.getByRole('dialog', { name: '正在使用你的 ChatGPT 额度' }).waitFor({ state: 'hidden' });
  assert.match(await panelC.locator('[data-chat-connection-status]').innerText(), /当前可对话.*ChatGPT/);
  // 订阅不展示 API 费用预算
  assert.equal(appC.snapshot().config.budgetUsd, 0);
  assert.equal(appC.snapshot().config.authMode, 'chatgpt');
  await panelC.locator('[data-chat-connection-return]').click();
  await panelC.waitFor({ state: 'hidden' });
  assert.equal(await inputC.inputValue(), draftC);
  await inputC.fill(draftC + ' 可发送');
  const primary = paneC.locator('[data-chat-primary-action]');
  await primary.waitFor();
  assert.equal(await primary.isDisabled(), false, 'after controlled success primary should be enabled');
  report.controlledSuccess = {
    ok: true,
    ready: true,
    authMode: 'chatgpt',
    budgetUsd: 0,
    primaryEnabled: true,
    draftPreserved: true,
    status: await paneC.getByRole('button', { name: '下次配置与额度', exact: true }).innerText().catch(() => '下次配置与额度'),
  };

  // C4 断开 = 连接失效 → 再次出现连接提示，草稿仍在
  await paneC.getByRole('button', { name: '下次配置与额度', exact: true }).click();
  await panelC.waitFor();
  await panelC.getByRole('button', { name: '断开 ChatGPT', exact: true }).click();
  await panelC.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).waitFor();
  assert.equal(appC.chatgpt.ready(), false);
  assert.equal(appC.snapshot().config.modelConfigured, false);
  // 断开后不回落到 API（无密钥）
  assert.equal(appC.snapshot().config.authMode, 'chatgpt');
  await panelC.locator('[data-chat-connection-return]').click();
  await panelC.waitFor({ state: 'hidden' });
  await paneC.locator('[data-chat-connect-prompt]').waitFor();
  assert.match(await inputC.inputValue(), /可发送/);
  report.controlledDisconnect = {
    ok: true,
    ready: false,
    modelConfigured: false,
    authModeStaysChatgpt: true,
    connectPromptVisible: true,
    draftPreserved: true,
  };

  await pageC.screenshot({ path: join(evidence, 'chat09-controlled-auth.png'), fullPage: true });
  await browserC.close();
  await appC.close();

  report.pageErrors = errors;
  assert.deepEqual(errors, []);
  report.blockedExternalConnectsAfter = blockedExternalConnects();
  report.passed = true;
  report.chv11 = {
    cancel: true,
    failure: true,
    successThenSendEnabled: true,
    disconnectInvalidates: true,
    draftPreservedAcross: true,
    subscriptionApiLimitsSeparated: true,
    realOAuth: false,
  };
  writeFileSync(join(evidence, 'chat09-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'chat09-report.json'), chv11: report.chv11 }));
} catch (error) {
  report.passed = false;
  report.failure = String(error);
  writeFileSync(join(evidence, 'chat09-report.json'), JSON.stringify(report, null, 2));
  throw error;
}
