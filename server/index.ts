import { createApp } from './app.js';
import { config } from './config.js';
import { initializeNetwork } from './network.js';
import { ensureWindowsLocalPermissions } from './local-permissions.js';
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('请使用 Node.js 24+');
ensureWindowsLocalPermissions(config.dataDir);
initializeNetwork();
const marker = process.argv.indexOf('--service-instance');
let stopping = false;
const stop = async () => { if (stopping) return; stopping = true; await app.close(); process.exit(0); };
const app = createApp({ canvasPackageDir: config.canvasPackageDir, launchId: marker >= 0 ? process.argv[marker + 1] : '', onShutdown: () => void stop() });
// Local only. Remote serving requires an authenticated TLS reverse proxy.
app.server.listen(config.port, '127.0.0.1', () => console.log(`工作台 http://127.0.0.1:${config.port} / ${app.auth.configured() ? '登录已配置' : '需要设置 WORKBENCH_PASSWORD'}`));
process.on('SIGINT', stop); process.on('SIGTERM', stop);
