import React,{useEffect,useRef,useState} from 'react';
import type {Project} from '../../shared/contracts';
import type {McpConfiguration,McpManifest,McpProbeResult} from '../../shared/mcp';
import {mcpDiagnosticLabels} from '../../shared/mcp';
import {request} from './client';
import {McpServerForm} from './mcp-server-form';
import {McpCredentialSettings} from './mcp-credentials';

type Snapshot={global?:McpConfiguration;project?:McpConfiguration;effective?:McpManifest;diagnostic?:string};
type Preview={effective:Omit<McpManifest,'signature'|'schemaVersion'>;warnings:string[]};
export function McpSettings({projects}:{projects:Project[]}){
  const [scope,setScope]=useState('');const [dirty,setDirty]=useState(false);
  return <details className="wb-mcp-settings"><summary>MCP 外部工具配置</summary>
    <p>配置供之后开始的执行使用。运行中的任务保留原配置；环境改变后，旧会话需要恢复原配置或另开话题。</p>
    <label>配置范围 <select aria-label="MCP配置范围" disabled={dirty} value={scope} onChange={e=>setScope(e.target.value)}><option value="">全局</option>{projects.filter(p=>!p.archived).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {dirty&&<p className="wb-caption">有未保存修改，请保存或放弃修改后切换范围。</p>}
    <McpEditor key={scope} projectId={scope||undefined} onDirty={setDirty}/>
  </details>;
}
function McpEditor({projectId,onDirty}:{projectId?:string;onDirty:(dirty:boolean)=>void}){
  const [data,setData]=useState<Snapshot>();const [json,setJson]=useState('');const [source,setSource]=useState('手动配置');
  const [active,setActive]=useState(false);const [codemode,setCodemode]=useState(false);const [toolSearch,setToolSearch]=useState(false);
  const [trusted,setTrusted]=useState(false);const [preview,setPreview]=useState<Preview>();const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  const [probe,setProbe]=useState<McpProbeResult>();const [probeName,setProbeName]=useState('');const [loginUrl,setLoginUrl]=useState('');
  const alive=useRef(true);
  const receive=(next:Snapshot)=>{setData(next);const current=projectId?next.project:next.global;setJson(JSON.stringify(current?.document??{mcpServers:{}},null,2));setSource(current?.source??'手动配置');setActive(current?.active??false);setCodemode(current?.codemode??false);setToolSearch(current?.toolSearch??false);setPreview(undefined);setTrusted(false);setProbe(undefined);const enabled=next.effective?.servers.filter(s=>s.config.enabled!==false).map(s=>s.name)??[];setProbeName(enabled[0]??'');onDirty(false);};
  const runProbe=async()=>{if(!probeName.trim()||busy)return;setBusy(true);setError('');setProbe(undefined);try{const next=await request<McpProbeResult>('/mcp/probe',{name:probeName.trim(),projectId});if(alive.current){setProbe(next);setMessage(next.ok?`探测成功：${next.server}，工具 ${next.toolCount??0} 个`:`探测未通过：${next.server}`);}}catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}};
  const reload=async()=>{setBusy(true);setError('');try{const next=await request<Snapshot>(`/mcp/configuration${projectId?`?projectId=${encodeURIComponent(projectId)}`:''}`);if(alive.current){receive(next);setMessage('已读取服务端配置');}}catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}};
  useEffect(()=>{alive.current=true;void reload();return()=>{alive.current=false;};},[]);
  const changed=()=>{onDirty(true);setPreview(undefined);setTrusted(false);setMessage('');};
  const check=async()=>{setBusy(true);setError('');setPreview(undefined);try{const next=await request<Preview>('/mcp/preview',{json,projectId});if(alive.current){setPreview(next);setMessage('预览完成，尚未保存或连接服务');}}catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}};
  const save=async()=>{
    if(!data||!preview||busy)return;setBusy(true);setError('');
    try{
      await request('/mcp/configuration',{projectId,revision:(projectId?data.project:data.global)?.revision??0,globalRevision:data.global?.revision??0,json,source,active,trusted,codemode,toolSearch},'PUT');
      if(alive.current){await reload();setMessage(active?'已保存并允许后续执行加载；实际连接结果以执行记录为准':'已保存，本范围配置未启用');}
    }catch(e){if(alive.current){setError(`${String(e)}。内容已保留；可重新读取核对服务端状态。`);setPreview(undefined);setTrusted(false);}}
    finally{if(alive.current)setBusy(false);}
  };
  const importFile=async(file?:File)=>{
    if(!file)return;setError('');if(file.size>512000){setError('配置文件超过允许大小');return;}setBusy(true);
    try{const text=await file.text();if(alive.current){setJson(text);setSource(`导入文件：${file.name}`);changed();setMessage('已读取文件，请预览检查。文件路径中的相对位置不会自动转换。');}}
    catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}
  };
  return <section aria-label="MCP配置编辑器">
    <McpCredentialSettings projectId={projectId}/>
    <p className="wb-caption">{projectId?'项目同名服务覆盖全局定义；也可只覆盖 enabled、exposure、toolExposure。':'全局定义对所有项目生效，项目配置可覆盖同名服务。'}未启用本范围配置时，已有其他范围的配置仍可能生效。</p>
    <McpServerForm disabled={busy||!data} onAdd={(name,definition)=>{
      let document;try{document=JSON.parse(json);}catch{throw new Error('当前JSON无效，请先修复，已有内容不会被覆盖');}
      if(!document||typeof document!=='object'||Array.isArray(document)||!document.mcpServers||typeof document.mcpServers!=='object'||Array.isArray(document.mcpServers))throw new Error('当前配置需要mcpServers对象，已有内容不会被覆盖');
      if(Object.hasOwn(document.mcpServers,name))throw new Error('已有同名服务，请在JSON中编辑，避免意外覆盖');
      setJson(JSON.stringify({...document,mcpServers:{...document.mcpServers,[name]:definition}},null,2));changed();setMessage('服务已加入编辑内容，请预览并保存后生效');
    }}/>
    <label>导入 mcp.json <input aria-label="导入MCP配置文件" type="file" accept=".json,application/json" disabled={busy||!data} onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>
    <label>配置来源 <input aria-label="MCP配置来源" maxLength={500} disabled={busy||!data} value={source} onChange={e=>{setSource(e.target.value);changed();}}/></label>
    <label>配置 JSON <textarea aria-label="MCP配置JSON" rows={10} spellCheck={false} disabled={busy||!data} value={json} onChange={e=>{setJson(e.target.value);changed();}}/></label>
    <p className="wb-caption">命令、路径和环境变量均属于服务端机器。凭据请使用环境引用，例如 {'${MCP_TOKEN}'}；不要粘贴密钥。保存与预览不会启动程序。</p>
    <label><input type="checkbox" checked={active} disabled={busy||!data} onChange={e=>{setActive(e.target.checked);changed();}}/>启用本范围配置</label>
    <label><input type="checkbox" checked={codemode} disabled={busy||!data} onChange={e=>{setCodemode(e.target.checked);changed();}}/>启用 codemode 工具编排</label>
    <label><input type="checkbox" checked={toolSearch} disabled={busy||!data} onChange={e=>{setToolSearch(e.target.checked);changed();}}/>启用 tool_search 工具搜索</label>
    <div className="wb-plugin-actions"><button disabled={busy||!data} onClick={()=>void check()}>预览MCP配置</button><button disabled={busy} onClick={()=>void reload()}>放弃修改并重新读取</button></div>
    {preview&&<div aria-label="MCP配置预览"><h4>启用后的合并预览 · {preview.effective.servers.length} 个服务</h4>
      <ul>{preview.effective.servers.map(server=><li key={server.name}><strong>{server.name}</strong> · {server.config.enabled===false?'已禁用':server.config.exposure??'codemode'} · {server.scope==='project'?'项目':'全局'}<small>定义来源：{server.source}{server.override&&`；覆盖来源：${server.override}`}</small></li>)}</ul>
      {preview.warnings.map(w=><p key={w}>{w}</p>)}
      {active&&<label><input aria-label="确认MCP来源可信" type="checkbox" checked={trusted} disabled={busy} onChange={e=>setTrusted(e.target.checked)}/>我信任这些服务，允许执行本地程序及连接外部服务</label>}
      <button disabled={busy||!source.trim()||(active&&!trusted)} onClick={()=>void save()}>保存MCP配置</button>
    </div>}
    {data?.diagnostic&&<p role="alert" className="wb-inline-error">当前配置无法用于执行：{data.diagnostic}。原配置可继续编辑，修复后重新预览并保存。</p>}
    {data?.effective&&<p className="wb-caption">当前已保存的有效配置：{data.effective.servers.filter(s=>s.config.enabled!==false).length} 个启用服务；全局版本 {data.global?.revision??0}，项目版本 {data.project?.revision??0}。这不代表连接已成功。</p>}
    {data?.effective&&data.effective.enabled&&data.effective.servers.some(s=>s.config.enabled!==false)&&<fieldset disabled={busy} aria-label="MCP连接探测">
      <legend>单次连接探测</legend>
      <p className="wb-caption">对已保存并启用的服务做一次 initialize/tools.list；会短暂启动本地程序或访问 HTTP。不是持续状态面板。需要登录时给出授权地址，由你自行打开，工作台不自动打开浏览器。</p>
      <label>服务 <select aria-label="探测的MCP服务" value={probeName} onChange={e=>setProbeName(e.target.value)}>{data.effective.servers.filter(s=>s.config.enabled!==false).map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</select></label>
      <button disabled={!probeName} onClick={()=>void runProbe()}>探测连接</button>
      {probe&&<p role="status">{probe.ok?`成功 · 工具 ${probe.toolCount??0} 个`:`失败 · ${probe.code?mcpDiagnosticLabels[probe.code]:'未知原因'}`} · {new Date(probe.at).toLocaleTimeString()}<br/><small>{probe.note}</small></p>}
      {probe?.code==='needs_auth'&&<button onClick={async()=>{setBusy(true);setError('');setLoginUrl('');try{const next=await request<{authorized:boolean;authorizationUrl?:string}>('/mcp/oauth',{name:probeName,projectId});if(alive.current){if(next.authorized)setMessage('登录已完成，可再次探测');else setLoginUrl(next.authorizationUrl??'');}}catch(e){if(alive.current)setError(String(e));}finally{if(alive.current)setBusy(false);}}}>开始登录</button>}
      {loginUrl&&<p>请在浏览器中打开此授权地址。令牌只保存在本机私有文件，这里不显示令牌。<br/><a href={loginUrl} target="_blank" rel="noreferrer">{loginUrl}</a></p>}
    </fieldset>}
    {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="wb-inline-error">{error}</p>}
  </section>;
}
