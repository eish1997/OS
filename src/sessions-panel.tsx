import { useEffect, useState } from 'react';
interface DeviceSession { hash:string; created:number; expires:number; current:boolean }
export function SessionsPanel() {
  const [sessions,setSessions]=useState<DeviceSession[]>([]); const [error,setError]=useState(''); const [busy,setBusy]=useState('');
  const refresh=async()=>{const response=await fetch('/api/sessions');if(!response.ok)throw new Error('设备会话读取失败');setSessions(await response.json());};
  useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
  const revoke=async(hash:string)=>{setBusy(hash);setError('');try{const response=await fetch('/api/sessions/revoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash})});if(!response.ok)throw new Error('撤销未成功，请重试');await refresh();}catch(e){setError(e instanceof Error?e.message:'撤销失败');}finally{setBusy('');}};
  return <section className="settings-section"><h2>登录设备</h2><p className="muted">可撤销其他浏览器的登录会话，当前浏览器可从侧栏退出。最多32个有效会话，已过期会话不占此上限。</p>{error&&<p role="alert">{error}</p>}{sessions.filter(s=>s.expires>Date.now()).map(s=><div className="node-row session-row" data-session-id={s.hash} key={s.hash}><span>{s.current?'当前浏览器':'其他会话'} · {new Date(s.created).toLocaleString('zh-CN')}</span><button disabled={s.current||Boolean(busy)} onClick={()=>void revoke(s.hash)}>{busy===s.hash?'正在撤销…':'撤销会话'}</button></div>)}<button onClick={()=>void refresh().catch(e=>setError(e.message))}>刷新设备会话</button></section>;
}
