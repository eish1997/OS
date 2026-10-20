import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { McpManifest } from '../shared/mcp.js';

function unusedPid() {
  for (let pid = 2_100_000_000; pid > 2_100_000_000 - 50; pid -= 1) {
    try { process.kill(pid, 0); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return pid; }
  }
  throw new Error('没有找到已经不存在的进程号');
}

test('a lost execution marks its still-connected MCP transports disconnected', async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-mcp-lost', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 1, budgetUsd: 0, reservePerCallUsd: 0 });
  const app = createApp({ dataDir: mkdtempSync(join(tmpdir(), 'mcp-lost-')), password: 'mcp-lost', schedule: false });
  try {
    const project = app.service.createProject('失联传输');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 1, maxCostUsd: 0, reservePerCallUsd: 0, maxOutputTokens: 16, timeoutMs: 30000 };
    const run = app.service.submit(project.id, 'lost-mcp', 'lost-mcp', 'pi', policy, [], undefined, { view: 'project' }).run;
    app.service.transition(run.id, 'running');
    const running = app.store.get<Run>('run', run.id);
    const manifest: McpManifest = { schemaVersion: 1, signature: 'sig', enabled: true, globalRevision: 1, projectRevision: 1, servers: [], autoEnableCodemode: false, codemode: false, toolSearch: false };
    const closedAt = '2026-01-01T00:00:00.000Z';
    app.store.update<Run>('run', running.id, running.revision, {
      startedAt: new Date().toISOString(), leaseUntil: 0, workerPid: unusedPid(), calls: 0, reservedUsd: 0, spentUsd: 0, mcpManifest: manifest,
      mcpConnections: [
        { server: 'live', code: 'connected', at: closedAt },
        { server: 'also-live', code: 'connected', at: closedAt },
        { server: 'done', code: 'closed', at: closedAt },
      ],
    });
    app.scheduler.tick();
    const current = app.store.get<Run>('run', run.id);
    assert.equal(current.status, 'interrupted');
    const byServer = new Map((current.mcpConnections ?? []).map(item => [item.server, item]));
    assert.equal(byServer.get('live')?.code, 'disconnected');
    assert.equal(byServer.get('also-live')?.code, 'disconnected');
    assert.notEqual(byServer.get('live')?.at, closedAt);
    assert.equal(byServer.get('done')?.code, 'closed');
    assert.equal(byServer.get('done')?.at, closedAt);
    const events = app.store.events(0).filter(event => event.type === 'run.mcp_connection');
    assert.deepEqual(events.map(event => (event.data as { server: string }).server).sort(), ['also-live', 'live']);
    app.scheduler.tick();
    assert.equal(app.store.events(0).filter(event => event.type === 'run.mcp_connection').length, 2);
  } finally { await app.close(); Object.assign(config, before); }
});
