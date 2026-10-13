import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../server/config.js';
import { Store } from '../server/store.js';
import { Assets } from '../server/assets.js';
const store = new Store(join(config.dataDir, 'workbench.sqlite')); const owner = `cleanup-${randomUUID()}`;
try {
  if (!store.lease('scheduler', owner, 60000)) throw new Error('请停止服务后运行离线清理');
  console.log(JSON.stringify(new Assets(store, config.dataDir).purgeExpired(process.argv.includes('--commit')), null, 2));
} finally { store.release('scheduler', owner); store.close(); }
