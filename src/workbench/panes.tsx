import { Select } from './controls';
import React,{useEffect,useRef,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Asset, Snapshot } from '../../shared/contracts';
import type { WindowInstance } from '../../shared/workbench-layout';
import type { ViewPatch, WindowContentProps } from './window-contract';
export { ChatPane } from './chat-pane';
type Common={window:WindowInstance;snapshot?:Snapshot;patch:(value:ViewPatch)=>void};
export function DemoPane({window:w,patch}:WindowContentProps){return <div className="wb-demo"><span className="wb-caption">布局验证窗口 · 内容自动保存</span><textarea aria-label={`${w.title}内容`} placeholder="在这里输入一些文字，然后拖动、收起或切换空间…" value={String(w.view.text||'')} onChange={e=>patch({text:e.target.value})}/><p>这是骨架演示窗口，便签等业务功能将在后续单独接入。</p></div>;}
export function AssetsPane({window:w,snapshot,patch,targets,onSend}:Common&{targets:WindowInstance[];onSend:(target:string,asset:Asset)=>void}){
  const [preview,setPreview]=useState('');const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [target,setTarget]=useState('');
  const project=snapshot?.projects.find(p=>p.id===w.binding.projectId);const assets=snapshot?.assets.filter(a=>a.projectId===w.binding.projectId)||[];
  const selected=assets.find(a=>a.id===w.view.assetId);const query=String(w.view.query||'');
  const previewScroll=useRef<HTMLDivElement>(null);
  const restoringPreview=useRef(true);
  useEffect(()=>{
    restoringPreview.current=true;
    if(loading||!previewScroll.current||!selected)return;
    if((selected.mime.startsWith('text/')||selected.mime==='application/json')&&!preview)return;
    previewScroll.current.scrollTop=Number(w.view.previewScroll)||0;
    const frame=requestAnimationFrame(()=>{restoringPreview.current=false;});
    return()=>cancelAnimationFrame(frame);
  },[loading,selected?.id,preview]);
  const scroll=useRef<HTMLDivElement>(null);useEffect(()=>{if(scroll.current)scroll.current.scrollTop=Number(w.view.scroll)||0;},[]);
  useEffect(()=>{setPreview('');setError('');setLoading(false);if(!selected||!(selected.mime.startsWith('text/')||selected.mime==='application/json'))return;
    const controller=new AbortController();setLoading(true);fetch(`/api/assets/${selected.id}`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error('文件读取失败');return r.text();}).then(setPreview).catch(e=>{if(!controller.signal.aborted)setError(String(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
  },[selected?.id,selected?.version]);
  if(!project)return <div className="wb-empty"><p>在顶部选择项目后，即可浏览对应资产。</p></div>;
  return <div className="wb-assets-pane"><div className="wb-pane-context">{project.name}</div><input aria-label="筛选资产" placeholder="按文件名或标签筛选" value={query} onChange={e=>patch({query:e.target.value})}/><div className="wb-assets-content"><div className="wb-files" ref={scroll} onScroll={e=>patch({scroll:e.currentTarget.scrollTop})}>{assets.filter(a=>(a.name+' '+(a.tags||[]).join(' ')).toLowerCase().includes(query.toLowerCase())).map(a=><button key={a.id} className={selected?.id===a.id?'selected':''} onClick={()=>patch({assetId:a.id,previewScroll:0})}>{a.name}<small>{a.mime} · {a.size} B</small></button>)}{!assets.length&&<p>此项目还没有资产。可从旧版上传，或由 Pi 任务保存成果。</p>}</div><div className="wb-preview" ref={previewScroll} onScroll={e=>{if(!loading&&!restoringPreview.current)patch({previewScroll:e.currentTarget.scrollTop});}}>{selected?<><div className="wb-preview-tools"><strong>{selected.name}</strong><button className="wb-reading-toggle" aria-label="深色阅读" aria-pressed={Boolean(w.view.darkReading)} onClick={()=>patch({darkReading:!w.view.darkReading})}>{w.view.darkReading?'浅色':'深色'}</button><a href={`/api/assets/${selected.id}`} download>下载 ↗</a></div>{loading?<p>读取中…</p>:error?<p role="alert">{error}</p>:selected.mime.startsWith('image/')?<img src={`/api/assets/${selected.id}`} alt={selected.name}/>:selected.mime==='application/pdf'?<iframe title={selected.name} src={`/api/assets/${selected.id}`}/>:selected.mime.startsWith('text/')||selected.mime==='application/json'?<div className={`wb-markdown wb-reading ${w.view.darkReading?'is-dark':'is-paper'}`}><ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown></div>:<p>此格式可下载后查看。</p>}<div className="wb-send-asset"><Select aria-label="目标聊天" value={target} onValueChange={setTarget}><option value="">发送到指定聊天…</option>{targets.filter(t=>t.binding.projectId===w.binding.projectId).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</Select><button disabled={!targets.some(t=>t.id===target&&t.binding.projectId===w.binding.projectId)} onClick={()=>onSend(target,selected)}>添加资料</button></div><span className="wb-caption">v{selected.version} · {selected.hash.slice(0,12)}</span></>:<div className="wb-empty"><p>{w.view.assetId?'原选中文件已不可用，请选择其他文件。':'选择文件查看内容'}</p></div>}</div></div></div>;
}
