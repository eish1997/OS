import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { request } from './client';
import { CanvasController } from './canvas-controller';
import { isCanvasEnvelope, type CanvasDocumentState, type CanvasContext, type CanvasTheme } from '../../shared/canvas-bridge';

export function useCanvasAvailability(authenticated: boolean) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!authenticated) { setEnabled(false); return; }
    const abort = new AbortController();
    request<{enabled:boolean}>('/canvas/status', undefined, 'GET', abort.signal)
      .then(result => { if (!abort.signal.aborted) setEnabled(result.enabled); })
      .catch(() => { if (!abort.signal.aborted) setEnabled(false); });
    return () => abort.abort();
  }, [authenticated]);
  return enabled;
}

/** One persistent editor below the transparent dock; workspace switches don't remount it. */
export function CanvasLayer({children, enabled=false, blocked=false, theme,onInteraction,onState,onController,onContext}:{children?:React.ReactNode;enabled?:boolean;blocked?:boolean;theme?:CanvasTheme;onInteraction?:()=>void;onState?:(state:CanvasDocumentState)=>void;onController?:(controller:CanvasController|null)=>void;onContext?:(context:CanvasContext)=>void}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const controller=useRef<CanvasController|null>(null);
  const loaded=useRef(false),reset=useRef(()=>{});
  const handshakeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const callbacks=useRef({onInteraction,onState,onController,onContext,blocked,theme});callbacks.current={onInteraction,onState,onController,onContext,blocked,theme};
  const [failure,setFailure]=useState('');
  const [operationFailure,setOperationFailure]=useState('');
  const fail=(error:unknown)=>{const message=error instanceof Error?error.message:'画板连接失败';setFailure(message);callbacks.current.onState?.({state:'offline',revision:0,dirty:true,error:message});};
  useEffect(()=>{if(controller.current)void controller.current.setInteraction(blocked).catch(fail);},[blocked]);
  const themeKey=JSON.stringify(theme);
  useEffect(()=>{if(controller.current&&theme)void controller.current.endpoint.request('THEME',{...theme}).catch(fail);},[themeKey]);
  useLayoutEffect(() => {
    if(!enabled)return;
    const retired=new Set<string>();
    const clear=()=>{clearTimeout(handshakeTimer.current);if(controller.current){retired.add(controller.current.instanceId);controller.current.dispose();}controller.current=null;callbacks.current.onController?.(null);};
    reset.current=()=>{clear();loaded.current=true;setFailure('');callbacks.current.onState?.({state:'loading',revision:0,dirty:false});handshakeTimer.current=setTimeout(()=>fail(new Error('画板握手超时，请重试连接')),15000);};
    const receive=(event:MessageEvent)=>{
      if(event.source!==frame.current?.contentWindow||event.origin!==location.origin||!loaded.current)return;
      if(!controller.current){
        if(event.data?.type==='READY'&&event.data?.protocolVersion!==1){fail(new Error('工作台与画板协议版本不兼容'));return;}
        if(!isCanvasEnvelope(event.data)||event.data.type!=='READY'||retired.has(event.data.instanceId))return;
        const message=event.data;
        if(message.contextEpoch!==0||message.projectId!==null||message.canvasId===null)return;
        const next=new CanvasController(message.instanceId,{contextEpoch:0,projectId:null,canvasId:message.canvasId},{origin:location.origin,
          peer:()=>frame.current?.contentWindow??null,onState:state=>{setOperationFailure('');callbacks.current.onState?.(state);},onInteraction:()=>callbacks.current.onInteraction?.(),onContext:context=>callbacks.current.onContext?.(context),onError:error=>setOperationFailure(error instanceof Error?error.message:'画板操作未完成，原内容已保留')});
        controller.current=next;
        void next.initialize().then(async()=>{if(controller.current!==next)return;clearTimeout(handshakeTimer.current);setFailure('');await next.setInteraction(callbacks.current.blocked);if(callbacks.current.theme)await next.endpoint.request('THEME',{...callbacks.current.theme});callbacks.current.onController?.(next);}).catch(error=>{if(controller.current===next)fail(error);});
      }else controller.current.receive(event);
    };
    window.addEventListener('message',receive);
    return ()=>{loaded.current=false;clear();reset.current=()=>{};window.removeEventListener('message',receive);};
  },[enabled]);
  return <div className="wb-canvas-layer" data-workbench-layer="canvas" aria-label="画板工作区">{enabled&&<><iframe
    ref={frame} title="画板编辑器" className="wb-canvas-frame" src="/canvas/?os-canvas&os-embed&no-rulers"
    tabIndex={blocked?-1:0} aria-hidden={blocked||undefined} onLoad={()=>reset.current()}
  />{failure&&<div className="wb-canvas-error" role="alert">{failure}<button onClick={()=>{
      // Reconnect to the same editor; never reload and discard an unconfirmed draft.
      setFailure('');
      const current=controller.current;
      if(current)void current.initialize().then(async()=>{if(controller.current!==current)return;clearTimeout(handshakeTimer.current);await current.setInteraction(callbacks.current.blocked);callbacks.current.onController?.(current);}).catch(fail);
      else reset.current();
    }}>重试连接</button></div>}{!failure&&operationFailure&&<div className="wb-canvas-error" role="alert">{operationFailure}<button onClick={()=>setOperationFailure('')}>关闭</button></div>}</>}{children}</div>;
}
