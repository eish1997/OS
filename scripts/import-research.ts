import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../server/config.js';
import type { Project, Snapshot, Asset } from '../shared/contracts.js';
const base = `http://127.0.0.1:${config.port}`;
const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: config.password }) });
if (!login.ok) throw new Error('本机登录失败'); const cookie = login.headers.get('set-cookie')!.split(';')[0];
async function api(path: string, value?: unknown) { const response = await fetch(base + '/api' + path, value === undefined ? { headers: { Cookie: cookie } } : { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); if (!response.ok) throw new Error(`导入接口 ${response.status}`); return response.json(); }
try {
  const snapshot = await api('/snapshot') as Snapshot; const project = snapshot.projects.find(p => p.name === '腾讯 Memory 验证') as Project; if (!project) throw new Error('先运行 setup');
  const files = ['doc/adr/002-tencent-memory-source-review.md', 'doc/dev/tencent-memory-experiment.md', 'tests/fixtures/memory-suite.json'];
  const manifest = JSON.parse(readFileSync('output/dev-evidence/memory-source/manifest.json', 'utf8'));
  for (const source of manifest.sources) if (['README_CN.md', 'INSTALL_CN.md', 'LICENSE'].includes(source.path)) files.push(join('output/dev-evidence/memory-source', source.file));
  const ids: string[] = [];
  for (const file of files) {
    const name = file.split(/[\\/]/).at(-1)!; const existing = snapshot.assets.find(a => a.projectId === project.id && a.name === name); if (existing) { ids.push(existing.id); continue; }
    const data = readFileSync(file); const upload = await api('/uploads', { projectId: project.id, name, mime: 'text/plain' });
    const response = await fetch(base + `/api/uploads/${upload.id}`, { method: 'PUT', headers: { Cookie: cookie }, body: data }); if (!response.ok) throw new Error('来源上传失败'); ids.push((await response.json() as Asset).id);
  }
  if (!snapshot.drafts.some(d => d.projectId === project.id && d.title === '腾讯 Memory：资料审阅与验证计划')) await api('/drafts', { projectId: project.id, title: '腾讯 Memory：资料审阅与验证计划', body: readFileSync('doc/dev/腾讯Memory文章初稿.md', 'utf8'), sourceIds: ids });
  console.log(JSON.stringify({ importedSources: ids.length, candidateRuntimeExecuted: false, articleStatus: 'source-review-draft' }));
} finally { await api('/logout', {}); }
