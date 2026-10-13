import { join } from 'node:path';
import { Store } from '../server/store.js';
import { backup, restore } from '../server/backup.js';
import { config } from '../server/config.js';
const [command, destination, restoreTarget] = process.argv.slice(2);
if (command === 'restore' && destination && restoreTarget) console.log(restore(destination, restoreTarget));
else if (command === 'create' && destination) { const store = new Store(join(config.dataDir, 'workbench.sqlite')); try { console.log(backup(store, config.dataDir, destination)); } finally { store.close(); } }
else throw new Error('Usage: npm run backup -- create <new-backup-dir> | restore <backup-dir> <new-data-dir>');
