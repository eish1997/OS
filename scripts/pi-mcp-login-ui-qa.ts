import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { recordMcpConnection } from '../server/mcp-diagnostics.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import { steeringTransport } from '../tests/helpers/steering-transport.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { McpProbeResult } from '../shared/mcp.js';
import type { ToolExecution } from '../shared/run-stream.js';

const evidence = 'output/dev-evidence/pi-parity/loop-151';
mkdirSync(evidence, { recursive: true });
Object.assign(config, { apiKey: 'offline-ui-only', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 5, budgetUsd: 100, reservePerCallUsd: 10 });

const readBody = (req: IncomingMessage) => new Promise<string>(resolve => { let body = ''; req.on('data', chunk => { body += String(chunk); }); req.on('end', () => resolve(body)); });

const challenges = new Map<string, string>();
const auth = createServer(async (req, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const origin = `http://127.0.0.1:${req.socket.localPort}`;
  if (url.pathname === '/.well-known/oauth-protected-resource') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: ['mcp'] }));
    return;
  }
  if (url.pathname === '/.well-known/oauth-authorization-server') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'] }));
    return;
  }
  if (url.pathname === '/register' && req.method === 'POST') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ client_id: 'owned-client', token_endpoint_auth_method: 'none', redirect_uris: JSON.parse(await readBody(req)).redirect_uris }));
    return;
  }
  if (url.pathname === '/authorize') {
    const code = 'owned-code';
    challenges.set(code, url.searchParams.get('code_challenge') ?? '');
    res.writeHead(302, { location: `${url.searchParams.get('redirect_uri')}?code=${code}&state=${url.searchParams.get('state')}` });
    res.end();
    return;
  }
  if (url.pathname === '/token' && req.method === 'POST') {
    const params = new URLSearchParams(await readBody(req));
    const challenge = createHash('sha256').update(params.get('code_verifier') ?? '').digest('base64url');
    if (challenge !== challenges.get(params.get('code') ?? '')) { res.writeHead(400).end('{"error":"invalid_grant"}'); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ access_token: 'owned-access-token', token_type: 'Bearer', expires_in: 3600, refresh_token: 'owned-refresh-token' }));
    return;
  }
  res.writeHead(404).end();
});
auth.listen(0, '127.0.0.1');
await once(auth, 'listening');
const authPort = (auth.address() as { port: number }).port;

const root = mkdtempSync(join(tmpdir(), 'pi-mcp-login-ui-'));
const localServer = join(root, 'local-mcp.mjs');
const calls = join(root, 'mcp.calls');
writeFileSync(localServer, `import {createInterface} from 'node:readline';import {appendFileSync} from 'node:fs';
  const lines=createInterface({input:process.stdin});
  lines.on('close',()=>process.exit(0));
  lines.on('line',line=>{const q=JSON.parse(line);if(q.id===undefined)return;let result;
  if(q.method==='initialize')result={protocolVersion:q.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned',version:'1'}};
  else if(q.method==='tools/list')result={tools:[{name:'echo',description:'Owned local',inputSchema:{type:'object',properties:{}}}]};
  else if(q.method==='tools/call'){appendFileSync(${JSON.stringify(calls)},'CALLED\\n');result={content:[{type:'text',text:'MCP_LOGIN_UI_CONFIRMED'}]};}
  else result={};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');});`);

const app = createApp({ dataDir: join(root, 'data'), staticDir: 'output/pi-parity-build', password: 'mcp-login-ui-password', schedule: false });
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
config.origin = base;

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await context.request.post(base + '/api/login', { data: { password: 'mcp-login-ui-password' } });
  await app.mcp.update({
    revision: 0,
    json: JSON.stringify({
      mcpServers: {
        remote: { url: `http://127.0.0.1:${authPort}/mcp`, exposure: 'direct', timeout: 3 },
        local: { command: process.execPath, args: [localServer], exposure: 'direct', timeout: 3 },
      },
    }),
    source: 'login ui',
    active: true,
    trusted: true,
    codemode: false,
    toolSearch: false,
  });

  await page.goto(base);
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /插件管理/ }).click();
  await page.getByText('MCP 外部工具配置', { exact: true }).click();
  const probe = page.getByLabel('MCP连接探测');
  await probe.getByLabel('探测的MCP服务').selectOption('remote');
  await probe.getByRole('button', { name: '探测连接', exact: true }).click();
  await page.getByText('需要登录或更新凭据', { exact: false }).waitFor();
  await probe.getByRole('button', { name: '开始登录', exact: true }).click();
  const loginLink = page.getByRole('link').filter({ hasText: '127.0.0.1' });
  await loginLink.waitFor();
  const authorizationUrl = await loginLink.getAttribute('href');
  assert.ok(authorizationUrl?.includes('127.0.0.1'));
  const body = await page.locator('body').innerText();
  assert.equal(body.includes('owned-access-token'), false);
  assert.equal(body.includes('owned-refresh-token'), false);
  await page.screenshot({ path: join(evidence, 'oauth-login.png'), fullPage: true });

  const redirected = await fetch(authorizationUrl!);
  assert.equal(redirected.ok, true);
  const tokenFile = join(root, 'data', 'private-model', 'mcp-oauth.json');
  let saved = '';
  for (let i = 0; i < 50 && !saved.includes('owned-access-token'); i++) {
    await delay(50);
    try { saved = readFileSync(tokenFile, 'utf8'); } catch { /* waiting */ }
  }
  assert.match(saved, /owned-access-token/);
  assert.equal((await page.locator('body').innerText()).includes('owned-access-token'), false);

  const apiLocal = await (await context.request.post(base + '/api/mcp/probe', { data: { name: 'local' } })).json() as McpProbeResult;
  assert.equal(apiLocal.ok, true, JSON.stringify(apiLocal));
  assert.equal(apiLocal.toolCount, 1);
  await probe.getByLabel('探测的MCP服务').selectOption('local');
  await probe.getByRole('button', { name: '探测连接', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '探测成功：local，工具 1 个' }).waitFor();
  await probe.getByText(/成功 · 工具 1 个/).waitFor();
  await page.screenshot({ path: join(evidence, 'local-probe.png'), fullPage: true });

  const project = app.service.createProject('MCP登录验收');
  await page.getByLabel('当前项目', { exact: true }).click();
  await page.locator(`[role=option][data-value="${project.id}"]`).click();
  await page.getByRole('button', { name: '＋ 窗口', exact: true }).click();
  await page.getByRole('button', { name: /Pi 对话/ }).click();
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  await page.getByLabel('对话输入').fill('查看传输状态');
  await page.getByRole('button', { name: '发送 ↑', exact: true }).click();
  const run = app.store.list<Run>('run')[0];
  const manifest = {
    schemaVersion: 1 as const,
    signature: 'login-ui',
    enabled: true,
    globalRevision: 1,
    projectRevision: 0,
    servers: [{ name: 'local', scope: 'global' as const, source: 'login ui', config: { command: process.execPath, args: [localServer], exposure: 'direct' as const, timeout: 3 } }],
    autoEnableCodemode: false,
    codemode: false,
    toolSearch: false,
  };
  app.store.update<Run>('run', run.id, run.revision, { mcpManifest: manifest });
  recordMcpConnection(app.store, run.id, 'local', 'connected');
  await page.getByText('MCP 当前传输 · 1 项', { exact: true }).waitFor();
  await page.getByText('local：传输已连通', { exact: true }).waitFor();
  await page.screenshot({ path: join(evidence, 'transport-connected.png') });
  recordMcpConnection(app.store, run.id, 'local', 'disconnected');
  await page.getByText('local：传输已断开', { exact: true }).waitFor();
  await page.screenshot({ path: join(evidence, 'transport-disconnected.png') });
  const uiRun = app.store.get<Run>('run', run.id);
  if (!['completed', 'failed', 'cancelled', 'interrupted'].includes(uiRun.status)) app.service.cancel(run.id);

  const probeAgain = await (await context.request.post(base + '/api/mcp/probe', { data: { name: 'remote' } })).json() as McpProbeResult;
  assert.notEqual(probeAgain.code, 'needs_auth');
  assert.equal(JSON.stringify(probeAgain).includes('owned-access-token'), false);
  assert.deepEqual(errors, []);
  writeFileSync(join(evidence, 'browser-report.json'), JSON.stringify({
    oauthLoginButton: true,
    authorizationUrlShown: true,
    tokenAbsentFromPage: true,
    tokenInPrivateFile: true,
    localProbeToolCount: 1,
    transportConnectedThenDisconnected: true,
  }, null, 2));
} finally {
  await browser.close();
  await app.close();
  auth.close();
}

{
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-mcp', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 5, budgetUsd: 100, reservePerCallUsd: 10 });
  const callRoot = mkdtempSync(join(tmpdir(), 'pi-mcp-login-call-'));
  const transport = steeringTransport(callRoot);
  const file = join(transport.source, 'transport.mjs');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace("name:'wait_control',arguments:'{}'", "name:'mcp__fixture__echo',arguments:'{}'")
    .replace("delta:'{}'", "delta:'{}'"));
  const server = join(callRoot, 'mcp.mjs');
  const callLog = join(callRoot, 'mcp.calls');
  writeFileSync(server, `import {createInterface} from 'node:readline';import {appendFileSync} from 'node:fs';
    const lines=createInterface({input:process.stdin});
    lines.on('close',()=>process.exit(0));
    lines.on('line',line=>{const q=JSON.parse(line);if(q.id===undefined)return;let result;
    if(q.method==='initialize')result={protocolVersion:q.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned',version:'1'}};
    else if(q.method==='tools/list')result={tools:[{name:'echo',description:'Owned test',inputSchema:{type:'object',properties:{}}}]};
    else if(q.method==='tools/call'){appendFileSync(${JSON.stringify(callLog)},'CALLED\\n');result={content:[{type:'text',text:'MCP_LOGIN_UI_CONFIRMED'}]};}
    else result={};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');});`);
  const callApp = createApp({ dataDir: join(callRoot, 'data'), password: 'mcp-login-call', schedule: false });
  try {
    const state = callApp.plugins.state;
    const op = state.enqueue({ action: 'install', source: transport.source, revision: state.configuration().revision, commandId: 'transport', trusted: true });
    const pkg = await inspectPlugin(transport.source, callApp.plugins.agentDir);
    state.phase(op.id, 'committing', 'Local fixture');
    state.commit(op.id, [pkg]);
    state.configure(state.configuration().revision, pkg.id, true);
    await callApp.mcp.update({ revision: 0, json: JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: [server], exposure: 'direct', timeout: 3 } } }), source: 'owned test', active: true, trusted: true, codemode: false, toolSearch: false });
    const project = callApp.service.createProject('MCP call');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: callApp.modelAccess.settings().binding, maxCalls: 5, maxCostUsd: 100, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 20000 };
    const workerRun = callApp.service.submit(project.id, 'Call MCP fixture', 'mcp-login-call', 'pi', policy, [], undefined, { view: 'project' }).run;
    const deadline = Date.now() + 23000;
    let final = workerRun;
    while (Date.now() < deadline) {
      callApp.scheduler.tick();
      final = callApp.store.get<Run>('run', workerRun.id);
      if (['completed', 'failed', 'interrupted'].includes(final.status) && !callApp.scheduler.pluginMaintenanceBlocked()) break;
      await delay(20);
    }
    assert.equal(final.status, 'completed', final.error ?? 'local MCP call');
    assert.equal(existsSync(callLog), true);
    assert.equal(readFileSync(callLog, 'utf8').trim(), 'CALLED');
    const tools = callApp.store.list<ToolExecution>('tool_execution').filter(item => item.runId === workerRun.id && item.name === 'mcp__fixture__echo');
    assert.equal(tools.length, 1);
    assert.equal(tools[0].phase, 'completed');
    writeFileSync(join(evidence, 'report.json'), JSON.stringify({
      closed: 'MCP 登录按钮给出授权地址且令牌不出现在页面；本地服务探测到工具并可在执行中调用；页面显示传输已连通后变为已断开',
      browserClicked: true,
      oauthLoginButton: true,
      authorizationUrlShown: true,
      tokenAbsentFromPage: true,
      tokenInPrivateFile: true,
      localProbeToolCount: 1,
      localToolCalled: true,
      transportConnectedThenDisconnected: true,
      realModels: 0,
      delivery: false,
      pivMatrix: false,
    }, null, 2));
  } finally {
    await callApp.close();
    Object.assign(config, before);
  }
}
