import React,{useEffect,useState} from 'react';
import type { Conversation } from '../../shared/contracts';
import type { WindowContentProps } from './window-contract';
import { request } from './client';
import { ChatPane } from './panes';
import { Select } from './controls';

export function ChatWindow(props:WindowContentProps&{
  onBind:(conversationId:string)=>void;
  onOpen:(conversation:Conversation)=>void;
  onSwitch?:(conversation:Conversation)=>void;
  onTitle?:(title:string)=>void;
  onFocusChat?:()=>void;
  onRestoreChat?:()=>void;
  chatFocused?:boolean;
}){
  const projectId=props.window.binding.projectId;
  const [list,setList]=useState<Conversation[]>([]),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!projectId)return;let cancelled=false;request<Conversation[]>(`/conversations?projectId=${encodeURIComponent(projectId)}`).then(all=>{if(!cancelled)setList(all);}).catch(e=>{if(!cancelled)setError(String(e));});return()=>{cancelled=true;};},[projectId,props.snapshot?.cursor]);
  if(props.window.binding.conversationId)return <ChatPane {...props} conversation={list.find(c=>c.id===props.window.binding.conversationId)} onOpen={props.onOpen} onSwitch={props.onSwitch} onTitle={props.onTitle} onFocusChat={props.onFocusChat} onRestoreChat={props.onRestoreChat} chatFocused={props.chatFocused}/>;
  if(!projectId)return <div className="wb-empty"><p>在顶部选择项目后，即可开始 Pi 对话。</p></div>;
  if(!props.snapshot?.projects.some(p=>p.id===projectId&&!p.archived))return <div className="wb-empty"><p>当前项目不可用，请在顶部选择其他项目。</p></div>;
  return <div className="wb-empty"><p>为当前项目开始或继续一段对话。</p><button className="wb-primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const c=await request<Conversation>('/conversations',{projectId,commandId:crypto.randomUUID()});props.onBind(c.id);props.onTitle?.(c.title);await props.refresh();}catch(e){setError(String(e));}finally{setBusy(false);}}}>{busy?'创建中…':'新建对话'}</button>
    <Select aria-label="已有对话" value={selected} onValueChange={setSelected}><option value="">选择对话</option>{list.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</Select>
    <button disabled={busy||!list.some(c=>c.id===selected)} onClick={()=>{const c=list.find(item=>item.id===selected);if(!c)return;props.onBind(c.id);props.onTitle?.(c.title);}}>打开对话</button>{error&&<p role="alert">{error}</p>}</div>;
}
