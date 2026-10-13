import { mkdirSync, writeFileSync } from 'node:fs';
import { config } from '../server/config.js';
import type { Snapshot, Run } from '../shared/contracts.js';
mkdirSync('output/dev-evidence', { recursive: true });
const base = `http://127.0.0.1:${config.port}`;
const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: config.password }) }); if (!login.ok) throw new Error('探针本机登录失败'); const cookie = login.headers.get('set-cookie')!.split(';')[0];
async function api(path: string, value?: unknown) { const response = await fetch(base + '/api' + path, value === undefined ? { headers: { Cookie: cookie } } : { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); if (!response.ok) throw new Error(`探针接口 ${response.status}`); return response.json(); }
try {
  const connection:Snapshot=await api('/snapshot');
  if(!connection.config.modelConfigured||connection.config.callsRemaining<2){writeFileSync('output/dev-evidence/pi-real-probe.json',JSON.stringify({status:'blocked',realModelCall:false,reason:'Requires enabled model connection and at least two authorized requests',at:new Date().toISOString()},null,2));console.log('真实Pi探针等待模型连接及至少2次获准调用；未调用模型。');}
  else {
  const project = await api('/projects', { name: 'Pi 真实接口探针', description: '非敏感固定输入；只允许write_asset，不读取其他项目或网络。' });
  const submitted = await api('/tasks', { projectId: project.id, goal: '用 write_asset 保存 pi-probe.md，内容必须严格为 PI_PROBE_OK。只完成此动作，然后停止；不要调用其他工具。', commandId: crypto.randomUUID(), mode: 'pi', requestedTools: ['write_asset'], maxCalls: 2 });
  let snapshot: Snapshot; let run: Run; const start = Date.now();
  do { await new Promise(r => setTimeout(r, 500)); snapshot = await api('/snapshot'); run = snapshot.runs.find(r => r.id === submitted.run.id)!; } while (['queued', 'running'].includes(run.status) && Date.now() - start < submitted.run.policy.timeoutMs + 10000);
  if(['queued','running','waiting_user'].includes(run.status))await api(`/runs/${run.id}/cancel`,{});
  const asset = snapshot.assets.find(a => a.runId === run.id && a.name === 'pi-probe.md'); const response = asset ? await fetch(base + `/api/assets/${asset.id}`, { headers: { Cookie: cookie } }) : undefined; const content = response?.ok ? await response.text() : undefined;
  const passed = run.status === 'completed' && content === 'PI_PROBE_OK' && Boolean(run.sessionId && run.sessionPath);
  const report = { at: new Date().toISOString(), status: passed ? 'passed-basic-tool-roundtrip' : 'failed', realModelCall: run.calls>0, authKind:run.policy.modelBinding?.kind ?? 'api',provider:run.policy.modelBinding?.provider ?? config.provider, model:run.policy.modelBinding?.model ?? config.model, projectId: project.id, runId: run.id, runtime: process.version, calls: run.calls, costUsd:run.policy.modelBinding?.kind==='chatgpt'?undefined:run.spentUsd,subscriptionUsage:run.usage, assetVerified: content === 'PI_PROBE_OK', sessionBound: Boolean(run.sessionId && run.sessionPath), elapsedMs: Date.now() - start, remaining: ['real cancellation', 'native-session restoration with model', 'timeout and provider failures'] };
  writeFileSync('output/dev-evidence/pi-real-probe.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); if (!passed) process.exitCode = 1;
  }
} finally { await api('/logout', {}); }
