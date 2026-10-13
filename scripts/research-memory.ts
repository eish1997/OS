import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const repository = 'TencentCloud/TencentDB-Agent-Memory'; const destination = 'output/dev-evidence/memory-source'; mkdirSync(destination, { recursive: true });
async function get(url: string) { const response = await fetch(url, { headers: { 'User-Agent': 'personal-workbench-source-review' }, signal: AbortSignal.timeout(20000), redirect: 'error' }); if (!response.ok) throw new Error(`Source fetch ${response.status}`); return response; }
try {
  const commit = await (await get(`https://api.github.com/repos/${repository}/commits/HEAD`)).json() as { sha: string };
  if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Source revision invalid');
  const sources = [];
  for (const name of ['README_CN.md', 'INSTALL_CN.md', 'LICENSE', 'deploy/global-images/.env.example', 'deploy/global-images/start-all.sh']) {
    const url = `https://raw.githubusercontent.com/${repository}/${commit.sha}/${name}`;
    const response = await get(url); const content = await response.text(); const file = name.replaceAll('/', '__'); writeFileSync(`${destination}/${file}`, content);
    sources.push({ path: name, file, url, sha256: createHash('sha256').update(content).digest('hex') });
  }
  const result = { repository, commit: commit.sha, capturedAt: new Date().toISOString(), executedCode: false, sources };
  writeFileSync(`${destination}/manifest.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} catch (error) { const result = { repository, capturedAt: new Date().toISOString(), status: 'blocked_source_download', error: error instanceof Error ? error.message : 'download failed', executedCode: false }; writeFileSync(`${destination}/download-status.json`, JSON.stringify(result, null, 2)); console.error(result); process.exitCode = 1; }
