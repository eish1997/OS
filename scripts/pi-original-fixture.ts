import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {loadPi} from '../server/pi-adapter.js';
const dir=join('tests','fixtures','pi-1.0.3');mkdirSync(dir,{recursive:true});
const pi=await loadPi();const manager=pi.SessionManager.create(process.cwd(),dir);
const user=manager.appendMessage({role:'user',content:'ORIGINAL_USER',timestamp:1});
manager.appendMessage({role:'assistant',content:[{type:'text',text:'ORIGINAL_ASSISTANT'}],api:'openai-completions',provider:'fixture',model:'fixture',usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:2});
manager.appendCompaction('ORIGINAL_SUMMARY',user,4);manager.branch(user);manager.appendMessage({role:'user',content:'SIBLING',timestamp:3});
console.log(JSON.stringify({file:manager.getSessionFile(),id:manager.getSessionId(),entries:manager.getEntries().length}));
