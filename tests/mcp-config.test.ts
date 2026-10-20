import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
import {McpConfigurations} from '../server/mcp-config.js';
import {backup,restore} from '../server/backup.js';
import {Store} from '../server/store.js';
import {assertMcpCompatible,mcpEnvironment} from '../server/mcp-runtime.js';

test('MCP preview and storage preserve native scope/overrides without executing or copying credentials',{timeout:15000},async()=>{
  const root=mkdtempSync(join(tmpdir(),'mcp-config-'));const data=join(root,'data');const marker=join(root,'must-not-exist');
  const app=createApp({dataDir:data,password:'mcp-config-password',schedule:false});
  try{
    const p=app.service.createProject('MCP配置');const other=app.service.createProject('其他项目');
    const json=JSON.stringify({mcpServers:{local:{command:process.execPath,args:['-e',`require('node:fs').writeFileSync(${JSON.stringify(marker)},'unsafe')`],exposure:'codemode-deferred'},docs:{url:'https://example.invalid/mcp',headers:{Authorization:'Bearer ${MCP_DOCS_TOKEN}'},exposure:'deferred'}}});
    const preview=await app.mcp.preview(json);assert.equal(preview.document.mcpServers.local.exposure,'codemode');assert.equal(app.store.list('mcp_config').length,0);assert(!existsSync(marker));
    const fields={revision:0,json,source:'用户导入 mcp.json',active:false,trusted:false,codemode:false,toolSearch:false};
    const saved=await app.mcp.update(fields);assert.equal(app.mcp.manifest(p.id).servers.length,0);
    await assert.rejects(app.mcp.update({...fields,revision:saved.revision,active:true}),/明确确认/);
    const enabled=await app.mcp.update({...fields,revision:saved.revision,active:true,trusted:true});assert.equal(app.mcp.manifest(p.id).servers.length,2);assert(!existsSync(marker));
    const projectJson=JSON.stringify({mcpServers:{local:{enabled:false},docs:{url:'https://project.invalid/mcp',exposure:'direct'}}});
    const project=await app.mcp.update({...fields,projectId:p.id,globalRevision:enabled.revision,json:projectJson,source:'项目导入',active:true,trusted:true});
    const frozen=app.mcp.manifest(p.id);assert.equal(frozen.servers.find(s=>s.name==='local')?.config.enabled,false);assert.equal(frozen.servers.find(s=>s.name==='local')?.override,'项目导入');assert.equal(frozen.servers.find(s=>s.name==='docs')?.scope,'project');assert.equal(app.mcp.manifest(other.id).servers.find(s=>s.name==='docs')?.scope,'global');
    await assert.rejects(app.mcp.update({...fields,projectId:p.id,revision:project.revision,globalRevision:0,json:projectJson,active:true,trusted:true}),/全局MCP配置已改变/);
    app.store.db.exec("CREATE TRIGGER reject_mcp BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='mcp.configuration_updated' BEGIN SELECT RAISE(ABORT,'controlled rollback'); END");
    await assert.rejects(app.mcp.update({...fields,revision:enabled.revision,json:'{"mcpServers":{}}'}),/controlled rollback/);assert.equal(app.mcp.configuration()?.revision,enabled.revision);app.store.db.exec('DROP TRIGGER reject_mcp');
    await app.mcp.update({...fields,revision:enabled.revision,active:true,trusted:true,json:JSON.stringify({mcpServers:{local:{command:process.execPath,args:['--version']}}})});
    assert.notEqual(app.mcp.manifest(p.id).signature,frozen.signature);assert.equal(frozen.servers.find(s=>s.name==='local')?.override,'项目导入','previous manifest object must remain unchanged');
    for(const document of [
      {mcpServers:{docs:{url:'https://example.invalid',headers:{Authorization:'secret-literal'}}}},
      {mcpServers:{docs:{url:'https://example.invalid',headers:{Authorization:'Bearer secret ${ENV}'}}}},
      {mcpServers:{docs:{url:'https://example.invalid/?token=secret'}}},
      {mcpServers:{local:{command:'node',env:{API_KEY:'secret'}}}},
      {mcpServers:{'a-b':{command:'node'},a_b:{command:'node'}}},
      {mcpServers:{docs:{url:'not a url'}}}
    ])await assert.rejects(app.mcp.preview(JSON.stringify(document)));
    await assert.rejects(app.mcp.preview(JSON.stringify({mcpServers:{docs:{url:'https://example.invalid',auth:{provider:'openai'}}}}),p.id),/不能选择/);
    assert(!JSON.stringify(app.store.list('mcp_config')).includes('secret-literal'));assert(!existsSync(marker));
    backup(app.store,data,join(root,'backup'));restore(join(root,'backup'),join(root,'restored'));const reopened=new Store(join(root,'restored','workbench.sqlite'));
    try{assert.equal(new McpConfigurations(reopened).manifest(p.id).signature,app.mcp.manifest(p.id).signature);}finally{reopened.close();}
  }finally{await app.close();}
});

test('MCP configuration HTTP requires login and same origin and rejects stale revisions',async()=>{
  const app=createApp({dataDir:mkdtempSync(join(tmpdir(),'mcp-http-')),password:'mcp-http-password',schedule:false});await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try{
    assert.equal((await fetch(base+'/api/mcp/configuration')).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'mcp-http-password'})});const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0],'Content-Type':'application/json'};
    const data={revision:0,json:'{"mcpServers":{"local":{"command":"node"}}}',source:'HTTP导入',active:false,codemode:false,toolSearch:false};
    assert.equal((await fetch(base+'/api/mcp/preview',{method:'POST',headers,body:JSON.stringify({json:data.json})})).status,200);
    assert.equal(app.store.list('mcp_config').length,0);
    const put=(extra:Record<string,string>={})=>fetch(base+'/api/mcp/configuration',{method:'PUT',headers:{...headers,...extra},body:JSON.stringify(data)});
    assert.equal((await put({Origin:'https://untrusted.invalid'})).status,403);assert.equal((await put()).status,200);assert.equal((await put()).status,409);
    const current=await(await fetch(base+'/api/mcp/configuration',{headers})).json();assert.equal(current.global.active,false);assert.equal(current.effective.servers.length,0);
  }finally{await app.close();}
});

test('MCP snapshots distinguish explicit enablement, reject changed continuation and forward only referenced credentials',async()=>{
  const app=createApp({dataDir:mkdtempSync(join(tmpdir(),'mcp-snapshot-')),password:'mcp-snapshot-password',schedule:false});
  try{
    const initial=app.mcp.manifest();assert.equal(initial.enabled,false);
    const fields={revision:0,json:'{"mcpServers":{}}',source:'explicit settings',active:true,trusted:true,codemode:false,toolSearch:false};
    const saved=await app.mcp.update(fields);const enabled=app.mcp.manifest();assert.equal(enabled.enabled,true);assert.notEqual(enabled.signature,initial.signature);
    assertMcpCompatible({startedAt:'earlier'},initial);
    assert.throws(()=>assertMcpCompatible({startedAt:'earlier'},enabled),/运行环境已改变/);
    assertMcpCompatible({},enabled); // A failed preflight has never used an environment.
    assertMcpCompatible({sessionId:'native',mcpManifest:enabled},enabled);
    const revised=await app.mcp.update({...fields,revision:saved.revision,source:'renamed empty configuration'});
    assert.equal(app.mcp.manifest().signature,enabled.signature,'revision-only edits do not change the effective environment');
    await app.mcp.update({...fields,revision:revised.revision,json:JSON.stringify({mcpServers:{docs:{url:'https://example.invalid',headers:{Authorization:'Bearer ${MCP_TOKEN}'}},disabled:{command:'node',enabled:false,env:{TOKEN:'${UNAVAILABLE}'}}}})});
    const current=app.mcp.manifest();assert.throws(()=>assertMcpCompatible({sessionId:'native',mcpManifest:enabled},current),/运行环境已改变/);
    assert.throws(()=>mcpEnvironment(current,{}),/MCP_TOKEN/);
    assert.deepEqual(mcpEnvironment(current,{MCP_TOKEN:'ephemeral-secret',UNRELATED:'must-not-forward'}),{MCP_TOKEN:'ephemeral-secret'});
    assert(!JSON.stringify(current).includes('ephemeral-secret'));assert.deepEqual(mcpEnvironment(initial,{MCP_TOKEN:'secret'}),{});
    await assert.rejects(app.mcp.preview('{"mcpServers":{"bad":{"command":"node","timeout":1e309}}}'),/有限数值/);
  }finally{await app.close();}
});
