import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from '../server/config.js';
import { NodeStorage } from '../server/node-storage.js';
import { StorageCapacity } from '../server/storage.js';
const origin = process.env.NODE_SERVER || 'http://127.0.0.1:4310';
if (!origin.startsWith('https://') && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw new Error('远程节点必须使用 HTTPS');
const id = process.env.NODE_ID; const token = process.env.NODE_TOKEN; if (!id || !token) throw new Error('先在工作台配对，再配置 NODE_ID 与 NODE_TOKEN');
const directory = resolve(process.env.NODE_ALLOWED_DIR || 'data/node-workspace'); mkdirSync(directory, { recursive: true }); const realDirectory = realpathSync(directory);
const hostCapacity = realDirectory.startsWith(config.dataDir + (process.platform === 'win32' ? '\\' : '/')) && existsSync(join(config.dataDir,'workbench.sqlite')) ? new StorageCapacity(config.dataDir,config.storageLimits) : undefined;
const storage = new NodeStorage(realDirectory,Number(process.env.NODE_STORAGE_MAX_BYTES ?? 64*1024**2),hostCapacity);
function allowedFile(name: string) { const path = join(realDirectory, name); if (existsSync(path) && !realpathSync(path).startsWith(realDirectory + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('节点文件越出许可目录'); return path; }
const ledgerPath = allowedFile('node-ledger.json'); let ledger: Record<string, { content: string; sent: boolean }> = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : {};
let running = ''; let stopped = false;
process.on('SIGINT', () => { stopped = true; }); process.on('SIGTERM', () => { stopped = true; });
async function request(path: string, body: unknown) {
  const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Node-Id': id!, Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`节点接口 ${response.status}`); return response.json();
}
const save = () => { storage.write(ledgerPath, JSON.stringify(ledger, null, 2),false,true); };
let lastFailure = '';
let emittedErrorBytes = 0;
console.log('电脑节点已启动，仅允许 trusted_note；不执行任意命令。');
while (!stopped) {
  try {
    // Reconcile retained receipts first, never recreate an operation after reconnect.
    for (const [runId, receipt] of Object.entries(ledger).filter(([, r]) => !r.sent)) { await request('/api/node/result', { runId, content: receipt.content }); receipt.sent = true; save(); }
    const { run } = await request('/api/node/poll', { runId: running || undefined });
    if (run?.cancelRequested) { await request('/api/node/stopped', { runId: run.id }); running = ''; continue; }
    if (run && !run.cancelRequested && run.leaseUntil > Date.now() && run.operation === 'trusted_note') {
      running = run.id;
      if (!/^[a-zA-Z0-9-]+$/.test(run.id)) throw new Error('Run 标识无效');
      if (!ledger[run.id]) {
        if (realpathSync(directory) !== realDirectory) throw new Error('许可目录被替换');
        const file = allowedFile(`${run.id}.md`);
        let content = `# 电脑节点验证\n\nRun：${run.id}\n项目：${run.projectId}\n时间：${new Date().toISOString()}\n\n这是电脑本地可信文件操作的实际产物，不是 AI 输出。\n`;
        if (existsSync(file)) { content = readFileSync(file, 'utf8'); if (!content.includes(`Run：${run.id}\n项目：${run.projectId}\n`)) throw new Error('已有节点文件需要人工对账'); }
        else storage.write(file, content,true); ledger[run.id] = { content, sent: false }; save();
      }
      await request('/api/node/result', { runId: run.id, content: ledger[run.id].content }); ledger[run.id].sent = true; save(); running = '';
    }
    lastFailure = '';
  } catch (error) { const failure = (error instanceof Error ? error.message : '连接失败').slice(0,300); const bytes=Buffer.byteLength(failure); if (failure !== lastFailure && emittedErrorBytes+bytes <= 1024*1024) { console.error(failure); emittedErrorBytes+=bytes; } lastFailure = failure; }
  await new Promise(resolve => setTimeout(resolve, 2500));
}
