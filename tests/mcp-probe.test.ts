import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import type { McpProbeResult } from '../shared/mcp.js';

test('mcp probe connects to saved stdio server once and reports missing programs', { timeout: 30000 }, async () => {
  const before = { ...config };
  const root = mkdtempSync(join(tmpdir(), 'mcp-probe-'));
  const server = join(root, 'mcp.mjs');
  writeFileSync(server, `import { createInterface } from 'node:readline';
    const lines = createInterface({ input: process.stdin });
    lines.on('close', () => process.exit(0));
    lines.on('line', line => {
      const q = JSON.parse(line); if (q.id === undefined) return; let result;
      if (q.method === 'initialize') result = { protocolVersion: q.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'probe', version: '1' } };
      else if (q.method === 'tools/list') result = { tools: [{ name: 'ping', description: 'Probe', inputSchema: { type: 'object', properties: {} } }] };
      else result = {};
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: q.id, result }) + '\\n');
    });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'mcp-probe-password', schedule: false });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  config.origin = base;
  try {
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ password: 'mcp-probe-password' }) });
    assert.equal(login.status, 200, await login.text());
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const headers = { 'content-type': 'application/json', origin: base, cookie };
    assert.equal((await fetch(base + '/api/mcp/probe', { method: 'POST', headers, body: JSON.stringify({ name: 'fixture' }) })).status, 409);
    await app.mcp.update({
      revision: 0,
      json: JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: [server], exposure: 'direct', timeout: 3 }, missing: { command: join(root, 'no-such-mcp-binary.exe'), args: [], exposure: 'direct', timeout: 3 } } }),
      source: 'probe test',
      active: true,
      trusted: true,
      codemode: false,
      toolSearch: false
    });
    const ok = await (await fetch(base + '/api/mcp/probe', { method: 'POST', headers, body: JSON.stringify({ name: 'fixture' }) })).json() as McpProbeResult;
    assert.equal(ok.ok, true);
    assert.equal(ok.server, 'fixture');
    assert.equal(ok.toolCount, 1);
    assert(ok.note.includes('单次探测'));
    const bad = await (await fetch(base + '/api/mcp/probe', { method: 'POST', headers, body: JSON.stringify({ name: 'missing' }) })).json() as McpProbeResult;
    assert.equal(bad.ok, false);
    assert.ok(bad.code === 'program_missing' || bad.code === 'connection_failed', `missing binary code=${bad.code}`);
    mkdirSync('output/dev-evidence/pi-parity/loop-116', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-116', 'report.json'), JSON.stringify({ ok, bad, oauthNotImplemented: true }, null, 2));
  } finally {
    await app.close();
    Object.assign(config, before);
  }
});
