import {readFileSync,writeFileSync} from 'node:fs';
const source=readFileSync('output/dev-evidence/observe-main-apply.ts','utf8');
writeFileSync('output/dev-evidence/observe-auth-lock.ts',source.replaceAll('main-apply','auth-lock'));
console.log('Prepared separate before/after evidence; prior update evidence preserved');
