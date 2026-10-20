import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import type { McpProbeResult } from '../shared/mcp.js';

const readBody = (req: IncomingMessage) => new Promise<string>(resolve => { let body = ''; req.on('data', chunk => { body += String(chunk); }); req.on('end', () => resolve(body)); });

test('MCP OAuth login returns an address and stores the token only in the private file', { timeout: 30000 }, async () => {
  const challenges = new Map<string, string>();
  const auth = createServer(async (req, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const origin = `http://127.0.0.1:${(req.socket.localPort)}`;
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
  const port = (auth.address() as { port: number }).port;
  const before = { ...config };
  const root = mkdtempSync(join(tmpdir(), 'mcp-oauth-'));
  const app = createApp({ dataDir: join(root, 'data'), password: 'mcp-oauth-password', schedule: false });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  config.origin = base;
  try {
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ password: 'mcp-oauth-password' }) });
    const headers = { 'content-type': 'application/json', origin: base, cookie: login.headers.get('set-cookie')!.split(';')[0] };
    await app.mcp.update({ revision: 0, json: JSON.stringify({ mcpServers: { remote: { url: `http://127.0.0.1:${port}/mcp`, exposure: 'direct', timeout: 3 } } }), source: 'oauth test', active: true, trusted: true, codemode: false, toolSearch: false });
    const denied = await (await fetch(base + '/api/mcp/probe', { method: 'POST', headers, body: JSON.stringify({ name: 'remote' }) })).json() as McpProbeResult;
    assert.equal(denied.code, 'needs_auth');
    const started = await (await fetch(base + '/api/mcp/oauth', { method: 'POST', headers, body: JSON.stringify({ name: 'remote' }) })).json() as { authorized: boolean; authorizationUrl?: string; error?: string };
    assert.equal(started.error, undefined, started.error ?? 'oauth start');
    assert.equal(started.authorized, false);
    assert.ok(started.authorizationUrl?.includes('127.0.0.1'));
    assert.equal(JSON.stringify(started).includes('owned-access-token'), false);
    const browser = await fetch(started.authorizationUrl!);
    assert.equal(browser.ok, true);
    const file = join(root, 'data', 'private-model', 'mcp-oauth.json');
    let saved = '';
    for (let i = 0; i < 50 && !saved.includes('owned-access-token'); i++) { await new Promise(resolve => setTimeout(resolve, 50)); try { saved = readFileSync(file, 'utf8'); } catch { /* not written yet */ } }
    assert.match(saved, /owned-access-token/);
    const again = await (await fetch(base + '/api/mcp/probe', { method: 'POST', headers, body: JSON.stringify({ name: 'remote' }) })).json() as McpProbeResult;
    assert.notEqual(again.code, 'needs_auth');
    assert.equal(JSON.stringify(again).includes('owned-access-token'), false);
  } finally {
    await app.close();
    auth.close();
    Object.assign(config, before);
  }
});
