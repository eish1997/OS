import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { Store } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import { loadPi, workbenchResources } from '../server/pi-adapter.js';
import { recordMcpConnection } from '../server/mcp-diagnostics.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { McpConnectionCode, McpManifest } from '../shared/mcp.js';

test('a dropped stdio transport moves from connected to disconnected and the run keeps the latest state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-mcp-live-'));
  const agentDir = join(root, 'agent');
  mkdirSync(agentDir);
  const serverPath = join(root, 'server.mjs');
  writeFileSync(serverPath, `import {createInterface} from 'node:readline';
    const lines=createInterface({input:process.stdin});
    lines.on('line',line=>{const request=JSON.parse(line);if(request.id===undefined)return;let result;
      if(request.method==='initialize')result={protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'drop',version:'1'}};
      else if(request.method==='tools/list')result={tools:[{name:'echo',description:'drop',inputSchema:{type:'object',properties:{}}}]};
      else result={};
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
      if(request.method==='tools/list')setTimeout(()=>process.exit(0),30);
    });`);
  const seen: McpConnectionCode[] = [];
  const pi = await loadPi();
  const resources = await workbenchResources(pi, root, agentDir, 'live transport', {}, {
    mcp: { servers: [{ name: 'fixture', scope: 'global', source: 'workbench-test', config: { command: process.execPath, args: [serverPath], exposure: 'direct', timeout: 3 } }], errors: [], autoEnableCodemode: false },
  }, { mcpConnection: (_server, code) => { seen.push(code); } });
  const runtime = await pi.ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false });
  const model = runtime.getModel('openai', 'gpt-5.6-sol');
  assert(model);
  await runtime.setRuntimeApiKey('openai', 'offline-mcp-live');
  const { session } = await pi.createAgentSession({ cwd: root, agentDir, modelRuntime: runtime, model, sessionManager: pi.SessionManager.inMemory(root), settingsManager: resources.settings, resourceLoader: resources.loader });
  const store = new Store(join(root, 'workbench.sqlite'));
  const service = new Service(store, new Assets(store, root));
  try {
    await session.bindExtensions({});
    const deadline = Date.now() + 8000;
    while ((!seen.includes('connected') || !seen.includes('disconnected')) && Date.now() < deadline) await delay(20);
    assert.deepEqual(seen.filter(code => code === 'connected' || code === 'disconnected'), ['connected', 'disconnected']);
    const project = service.createProject('Live');
    const policy: Policy = { version: 5, projectId: project.id, modelBinding: { kind: 'chatgpt', provider: 'openai', model: 'gpt-5.6-sol', connectionId: 'offline' }, allowModel: true, maxCalls: 1, maxCostUsd: 0, reservePerCallUsd: 0, maxOutputTokens: 16, timeoutMs: 30000, toolNames: [] };
    const run = service.submit(project.id, 'live', 'live', 'pi', policy).run;
    const manifest = { schemaVersion: 1, signature: 'live', enabled: true, globalRevision: 1, projectRevision: 0, servers: [{ name: 'fixture', scope: 'global', source: 'workbench-test', config: { command: 'node', args: ['server.mjs'] } }], autoEnableCodemode: false, codemode: false, toolSearch: false } as McpManifest;
    store.update<Run>('run', run.id, run.revision, { mcpManifest: manifest });
    recordMcpConnection(store, run.id, 'fixture', 'connected');
    recordMcpConnection(store, run.id, 'fixture', 'disconnected');
    const saved = store.get<Run>('run', run.id);
    assert.deepEqual(saved.mcpConnections?.map(item => item.code), ['disconnected']);
    assert.equal(store.events(0).filter(event => event.type === 'run.mcp_connection' && event.runId === run.id).length, 2);
    assert.throws(() => recordMcpConnection(store, run.id, 'other', 'connected'), /来源无效/);
  } finally {
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
    session.dispose();
    await service.assets.searchIndex.close();
    store.close();
  }
});
