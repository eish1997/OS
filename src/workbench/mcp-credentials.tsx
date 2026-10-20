import React,{useEffect,useState} from 'react';
import {request} from './client';
type Status={revision:number;entries:{name:string;version:number}[]};
export function McpCredentialSettings({projectId}:{projectId?:string}){
  const [status,setStatus]=useState<Status>();const [name,setName]=useState('MCP_TOKEN');const [value,setValue]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const read=async()=>{setBusy(true);try{setStatus(await request(`/mcp/credentials${projectId?`?projectId=${encodeURIComponent(projectId)}`:''}`));}catch(e){setMessage(String(e));}finally{setBusy(false);}};
  useEffect(()=>{void read();},[projectId]);
  const save=async(key:string,secret:string|null)=>{
    if(!status||busy)return;setBusy(true);setMessage('');
    try{setStatus(await request('/mcp/credentials',{projectId,revision:status.revision,name:key,value:secret},'PUT'));setMessage(secret===null?'已移除本范围凭据':'凭据已保存，后续开始的执行可引用；旧会话可能需要重新开始');}
    catch(e){setMessage(`${String(e)}。请重新读取状态后重试；密钥不会回显。`);}finally{setValue('');setBusy(false);}
  };
  return <details><summary>MCP 凭据</summary><section aria-label="MCP凭据设置">
    <p className="wb-caption">保存到服务端仅宿主用户可访问的私有目录，不加入普通备份，也不在此回显。配置中用 {'${MCP_TOKEN}'} 引用；换机器或恢复备份后需重新填写。{projectId?'项目同名凭据优先；移除后可能改用全局凭据或环境变量。':'全局同名凭据优先于服务端环境变量。'}已运行任务保留启动时的值。</p>
    <label>凭据名称<input aria-label="MCP凭据名称" value={name} maxLength={84} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="MCP_TOKEN"/></label>
    <label>新的凭据值<input aria-label="新的MCP凭据值" type="password" autoComplete="new-password" value={value} maxLength={4096} disabled={busy} onChange={e=>setValue(e.target.value)}/></label>
    <div className="wb-plugin-actions"><button disabled={busy||!status||!value} onClick={()=>void save(name,value)}>保存MCP凭据</button><button disabled={busy} onClick={()=>void read()}>重新读取凭据状态</button></div>
    <ul>{status?.entries.map(entry=><li key={entry.name}>{entry.name} · 版本 {entry.version} <button disabled={busy} onClick={()=>void save(entry.name,null)} aria-label={`移除凭据 ${entry.name}`}>移除凭据</button></li>)}</ul>
    {status&&!status.entries.length&&<p>本范围尚无已保存凭据。</p>}{message&&<p role="status">{message}</p>}
  </section></details>;
}
