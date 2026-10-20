import React,{useEffect,useState,useRef} from 'react';
import type {Run} from '../../shared/contracts';
import type {PluginInteraction,PluginInteractionAnswer,PluginNotice} from '../../shared/plugin-interaction';
import {request} from './client';

function Dialog({item,refresh}:{item:PluginInteraction;refresh:()=>void}){
  const [value,setValue]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const command=useRef<string|undefined>(undefined);
  const answer=async(answer:PluginInteractionAnswer)=>{
    if(busy)return;setBusy(true);setError('');command.current??=crypto.randomUUID();
    try{await request(`/runs/${item.runId}/interactions/${item.id}/answer`,{revision:item.revision,commandId:command.current,answer});setValue('');refresh();}
    catch(e){setValue('');setError(`${String(e)}。先刷新状态核对是否已接收；同一答复标识不会重复发送。`);refresh();}
    finally{setBusy(false);}
  };
  return <fieldset disabled={busy||item.state!=='pending'}><legend>{item.title}</legend><p>插件来源：{item.source}</p>{item.message&&<p>{item.message}</p>}
    {item.state==='pending'?<><p>等待至 {new Date(item.expiresAt).toLocaleTimeString()}。关闭页面不会自动同意。</p>
    {item.kind==='confirm'?<><button onClick={()=>void answer(true)}>同意</button><button onClick={()=>void answer(false)}>拒绝</button></>:<>
    {item.kind==='input'?<label>答复<input aria-label={`答复：${item.title}`} type="password" autoComplete="off" value={value} maxLength={16000} onChange={e=>setValue(e.target.value)}/></label>:<label>选择<select aria-label={`选择：${item.title}`} value={value} onChange={e=>setValue(e.target.value)}><option value="">请选择</option>{item.options?.map(option=><option key={option}>{option}</option>)}</select></label>}
    <button disabled={item.kind==='select'&&!value} onClick={()=>void answer(value)}>提交答复</button></>}
    <button onClick={()=>void answer(null)}>取消此问题</button></>:<p>{{answered:'答复已接收，等待进程回执',delivered:'答复已送达原执行',closed:'等待已关闭',expired:'等待已到期',pending:'等待答复'}[item.state]}</p>}
    {error&&<p role="alert">{error}</p>}
  </fieldset>;
}
export function PluginInteractions({run}:{run:Run}){
  const [items,setItems]=useState<PluginInteraction[]>([]);const [notices,setNotices]=useState<PluginNotice[]>([]);const [version,setVersion]=useState(0);const [error,setError]=useState('');
  useEffect(()=>{if(run.mode!=='pi')return;const controller=new AbortController();
    void request<{interactions:PluginInteraction[];notices:PluginNotice[]}>(`/runs/${run.id}/interactions`,undefined,'GET',controller.signal).then(result=>{setItems(result.interactions);setNotices(result.notices);setError('');}).catch(e=>{if(!controller.signal.aborted)setError(String(e));});
    return()=>controller.abort();
  },[run,version]);
  if(!items.length&&!notices.length&&!error)return null;
  const pendingCount=items.filter(item=>item.state==='pending').length;
  const deliveringCount=items.filter(item=>item.state==='answered').length;
  const active=items.filter(item=>item.state==='pending'||item.state==='answered');
  const history=items.filter(item=>item.state!=='pending'&&item.state!=='answered');
  const renderDialog=(item:PluginInteraction)=><Dialog key={item.id} item={item} refresh={()=>setVersion(n=>n+1)}/>;
  return <section className="wb-plugin-run-details" data-workbench-interactive aria-label="插件交互">
    {items.length>0&&<><h4>插件交互记录</h4><p role="status">待答问题：{pendingCount} 项 · 等待送达回执：{deliveringCount} 项</p>
      {pendingCount>0&&<p>运行状态为「等待用户答复」（与模型连接用的「等待配置」不同）。其他工具可能仍在执行；可逐项处理，或用停止按钮取消整个任务。任务总时限仍在计时。</p>}
      {active.map(renderDialog)}
      <p>输入值不会保存到普通交互记录；插件收到后如何使用，取决于该插件。</p>
      {history.map(renderDialog)}</>}
    {notices.length>0&&<details open><summary>插件通知 · {notices.length} 条</summary><ul>{notices.map(item=><li key={item.id}><strong>{{info:'提示',warning:'警告',error:'错误'}[item.level]}</strong> · {new Date(item.createdAt).toLocaleTimeString()}<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{item.message}</p><small>来源：{item.source}</small></li>)}</ul></details>}
    {error&&<p role="alert">{error}</p>}<button onClick={()=>setVersion(n=>n+1)}>刷新答复状态</button>
  </section>;
}
