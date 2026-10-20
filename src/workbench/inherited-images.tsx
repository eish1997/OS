import React,{useState} from 'react';
export function InheritedImages({conversationId,entryId,count}:{conversationId:string;entryId:string;count:number}){
  const [open,setOpen]=useState(false),[index,setIndex]=useState(0),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  const url=`/api/conversations/${encodeURIComponent(conversationId)}/inherited-history?entryId=${encodeURIComponent(entryId)}&imageIndex=${index}&attempt=${attempt}`;
  function select(next:number){setIndex(next);setFailed(false);}
  return <div><small>{count} 张历史图片</small><button aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'收起历史图片':'查看历史图片'}</button>{open&&<figure className="wb-message-image">
    {failed?<><p role="alert">历史图片无法读取，来源可能已变化。</p><button onClick={()=>{setFailed(false);setAttempt(attempt+1);}}>重试历史图片</button></>:<img key={url} src={url} alt={`继承历史图片 ${index+1}`} onError={()=>setFailed(true)}/>}
    <figcaption>会话保存的图片可能已缩放。<a href={url} download={`history-image-${index+1}`}>下载会话图片</a></figcaption>
    <span>第 {index+1} / {count} 张</span>{index>0&&<button onClick={()=>select(index-1)}>上一张</button>}{index+1<count&&<button onClick={()=>select(index+1)}>下一张</button>}
  </figure>}</div>;
}
