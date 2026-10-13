import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateCryptConfig} from '../server/offsite-backup.js';
import {Store} from '../server/store.js';
import {Assets} from '../server/assets.js';
import {Service} from '../server/service.js';
import {backup,restore} from '../server/backup.js';
const config='[workbench-offsite]\ntype = crypt\nremote = remote:private/prefix\nfilename_encryption = standard\ndirectory_name_encryption = true\npassword = obscured-fixture\npassword2 = different-obscured-fixture\n';

test('offsite transfer rejects plaintext, unencrypted names, missing recovery keys and duplicate crypt sections',()=>{
 assert.doesNotThrow(()=>validateCryptConfig(config));
 for(const bad of [config.replace('type = crypt','type = s3'),config.replace('standard','off'),config.replace('true','false'),config.replace('password2 = different-obscured-fixture','password2 ='),config+'no_data_encryption = true\n',config+config,config+'password = other\n','[other]\ntype = crypt\n'])assert.throws(()=>validateCryptConfig(bad));
});

test('restore establishes private destination before copying snapshot contents',()=>{
 const root=mkdtempSync(join(tmpdir(),'offsite private restore ')),source=join(root,'source'),store=new Store(join(source,'workbench.sqlite'));
 try{const assets=new Assets(store,source),service=new Service(store,assets),p=service.createProject('backup'),a=assets.write(p.id,'file.md','text/markdown','CONFIRMED_RESTORE_BYTES');const pack=join(root,'pack'),target=join(root,'recovered');backup(store,source,pack);let called=false;restore(pack,target,path=>{called=true;assert.equal(path,target);assert.deepEqual(readdirSync(path),[]);});assert(called);assert.equal(readFileSync(join(target,'assets',a.locator),'utf8'),'CONFIRMED_RESTORE_BYTES');}finally{store.close();}
});
