import { join } from 'node:path';
import { Store, AppError } from '../../server/store.js';
import { Service } from '../../server/service.js';
import { Assets } from '../../server/assets.js';
const [dir, id] = process.argv.slice(2);
const store = new Store(join(dir, 'workbench.sqlite'));
const service = new Service(store, new Assets(store, dir));
console.log('ready');
await new Promise<void>(resolve => process.stdin.once('data', () => resolve()));
try { service.reserveCall(id, undefined, 0); console.log(200); }
catch (e) { if (e instanceof AppError && e.status === 429) console.log(429); else throw e; }
finally { store.close(); }
