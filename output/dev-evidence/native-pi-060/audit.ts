import { Store } from '../../../server/store.js';
import { config } from '../../../server/config.js';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
const store = new Store(join(config.dataDir, 'workbench.sqlite'), { readOnly: true });
try {
 const active = store.list<any>('run').filter(r => ['queued','running','waiting_user','waiting_node'].includes(r.status));
 if(active.length) throw new Error('Active tasks exist; do not restart');
 const types = ['project','asset','draft','memory','task','run','summary'];
 const records = types.map(kind => [kind, store.list<any>(kind).sort((a,b) => a.id.localeCompare(b.id))] as const);
 const summary = { counts: Object.fromEntries(records.map(([kind,values]) => [kind,values.length])), sha256: createHash('sha256').update(JSON.stringify(records)).digest('hex') };
 const mode = process.argv[2];
 if(mode === 'after') { const before = JSON.parse(readFileSync('output/dev-evidence/native-pi-060/before.json','utf8')); if(before.sha256 !== summary.sha256) throw new Error('Business data changed; inspect before claiming preservation'); }
 writeFileSync(`output/dev-evidence/native-pi-060/${mode}.json`, JSON.stringify(summary,null,2)); console.log(JSON.stringify({stage:mode,...summary}));
} finally { store.close(); }
