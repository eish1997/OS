import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
import {McpCredentials} from '../server/mcp-credentials.js';
import {assertMcpCompatible} from '../server/mcp-runtime.js';
import {backup,restore} from '../server/backup.js';

test('private MCP credential scopes, rotation, metadata-only HTTP and secret-free backups',async()=>{
  const root=mkdtempSync(join(tmpdir(),'mcp-credentials-'));const app=createApp({dataDir:join(root,'data'),password:'mcp-private-password',schedule:false});
  await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try{
    const p=app.service.createProject('Private MCP');const other=app.service.createProject('Other MCP');const credentials=new McpCredentials(app.store);
    await app.mcp.update({revision:0,json:'{"mcpServers":{"docs":{"url":"https://example.invalid","headers":{"Authorization":"Bearer ${MCP_DOCS_TOKEN}"}}}}',source:'test',active:true,trusted:true,codemode:false,toolSearch:false});
    assert.equal((await fetch(base+'/api/mcp/credentials')).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'mcp-private-password'})});const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0],'Content-Type':'application/json'};
    const put=(extra:Record<string,string>={})=>fetch(base+'/api/mcp/credentials',{method:'PUT',headers:{...headers,...extra},body:JSON.stringify({revision:0,name:'MCP_DOCS_TOKEN',value:'private-global-value'})});
    assert.equal((await put({Origin:'https://untrusted.invalid'})).status,403);assert.equal((await put()).status,200);assert.equal((await put()).status,409);
    const visible=await(await fetch(base+'/api/mcp/credentials',{headers})).text();assert(!visible.includes('private-global-value'));assert(visible.includes('MCP_DOCS_TOKEN'));
    credentials.update(p.id,0,'MCP_DOCS_TOKEN','private-project-value');const manifest=app.mcp.manifest(p.id);const frozen=credentials.resolve(manifest,p.id,{});
    assert.deepEqual(frozen.environment,{MCP_DOCS_TOKEN:'private-project-value'});assert.deepEqual(credentials.resolve(app.mcp.manifest(other.id),other.id,{}).environment,{MCP_DOCS_TOKEN:'private-global-value'});
    credentials.update(p.id,1,'MCP_UNUSED','unrelated-value');assert.equal(credentials.resolve(manifest,p.id,{}).manifest.signature,frozen.manifest.signature);
    credentials.update(p.id,2,'MCP_DOCS_TOKEN','rotated-project-value');assert.throws(()=>assertMcpCompatible({startedAt:'earlier',mcpManifest:frozen.manifest},credentials.resolve(manifest,p.id,{}).manifest),/环境已改变/);
    credentials.update(p.id,3,'MCP_DOCS_TOKEN',null);assert.equal(credentials.resolve(manifest,p.id,{}).environment.MCP_DOCS_TOKEN,'private-global-value','removing a project override reveals the global credential');
    for(const table of ['entities','events'])assert(!JSON.stringify(app.store.db.prepare(`SELECT body FROM ${table}`).all()).includes('private-global-value'));
    backup(app.store,join(root,'data'),join(root,'backup'));restore(join(root,'backup'),join(root,'restored'));assert(!existsSync(join(root,'restored','private-model')));
    const restored=createApp({dataDir:join(root,'restored'),password:'mcp-restored-password',schedule:false});try{assert.throws(()=>new McpCredentials(restored.store).resolve(restored.mcp.manifest(p.id),p.id,{}),/尚未配置/);}finally{await restored.close();}
  }finally{await app.close();}
});
