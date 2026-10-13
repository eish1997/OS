import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import { config } from '../server/config.js';
import { ensureWindowsLocalPermissions } from '../server/local-permissions.js';
ensureWindowsLocalPermissions(config.dataDir);
if (!existsSync('.env')) {
 const example = readFileSync('.env.example', 'utf8');
 // Stage on the same filesystem inside the already-protected runtime folder.
 const staged=process.platform==='win32'?join('.runtime','setup-'+randomBytes(12).toString('hex')+'.env'):'.env';
 writeFileSync(staged, example.replace('WORKBENCH_PASSWORD=', 'WORKBENCH_PASSWORD=' + randomBytes(18).toString('base64url')), { mode: 0o600,flag:'wx' });
 if(staged!=='.env')renameSync(staged,'.env');
 ensureWindowsLocalPermissions(config.dataDir);
 console.log('已生成本机 .env。首次登录密码只保存在该文件，没有上传或输出。');
}
const store = new Store(join(config.dataDir, 'workbench.sqlite')); const service = new Service(store, new Assets(store, config.dataDir));
try {
  if (!store.list('project').length) {
    const project = service.createProject('腾讯 Memory 验证', '验证 Pi 助手的长期记忆：准确召回、来源追溯、纠正与隔离，形成报告和文章。');
    service.assets.write(project.id, '验证任务.md', 'text/markdown', readFileSync('doc/首个验证项目-TencentDB-Agent-Memory.md', 'utf8'));
    service.memory({ kind: 'project', projectId: project.id, text: '腾讯 Memory 是候选组件，运行验证通过后才决定采用。', source: '主开发文档第24节', confirmed: true });
    service.inbox('首个真实项目：https://github.com/TencentCloud/TencentDB-Agent-Memory');
    console.log('已创建腾讯 Memory 验证项目与真实文档资产。未生成虚构任务或结论。');
  }
} finally { store.close(); }
