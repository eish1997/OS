import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

export function useWorkbenchDialog(){
  const [pending,setPending]=useState<{title:string;value?:string;resolve:(value:string|null)=>void}>();
  const element=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(pending&&!element.current?.open)element.current?.showModal();},[pending]);
  const finish=(value:string|null)=>{element.current?.close();pending?.resolve(value);setPending(undefined);};
  const ask=(title:string,value?:string)=>new Promise<string|null>(resolve=>setPending({title,value,resolve}));
  const dialog=pending?<dialog ref={element} className="wb-modal wb-prompt" aria-label={pending.title} onCancel={e=>{e.preventDefault();finish(null);}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)finish(null);}}}>
    <form onSubmit={e=>{e.preventDefault();finish(pending.value===undefined?'confirmed':String(new FormData(e.currentTarget).get('value')||'').trim());}}>
      <header><h2>{pending.value===undefined?'确认操作':pending.title}</h2><button type="button" aria-label="关闭对话框" onClick={()=>finish(null)}><Icon name="close"/></button></header>
      {pending.value===undefined?<p>{pending.title}</p>:<input name="value" aria-label={pending.title} defaultValue={pending.value} required autoFocus onFocus={e=>e.target.select()}/>}
      <footer><button type="button" autoFocus={pending.value===undefined} onClick={()=>finish(null)}>取消</button><button className="wb-primary" type="submit">确定</button></footer>
    </form>
  </dialog>:null;
  return {dialog,open:Boolean(pending),prompt:(title:string,value='')=>ask(title,value),confirm:async(title:string)=>Boolean(await ask(title))};
}

/** A themed select. Focus stays on the combobox while the list is open. */
export function Select({children,value,onValueChange,'aria-label':label}: {
  children:React.ReactNode;value:string;onValueChange:(value:string)=>void;'aria-label':string;
}) {
  const options=React.Children.toArray(children).filter(React.isValidElement).map(child=>{
    const props=(child as React.ReactElement<{value:string;children:React.ReactNode}>).props;
    return {value:props.value,label:String(props.children)};
  });
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),list=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false),[active,setActive]=useState(0);
  const [rect,setRect]=useState({left:0,top:0,width:220,maxHeight:280});
  const search=useRef({text:'',time:0});
  const selected=options.findIndex(o=>o.value===value);
  function place(){
    const r=trigger.current!.getBoundingClientRect(),below=innerHeight-r.bottom-12,above=r.top-12;
    const height=Math.min(280,Math.max(below,above));
    setRect({left:Math.max(8,Math.min(r.left,innerWidth-Math.max(220,r.width)-8)),top:below>=Math.min(280,options.length*36+8)?r.bottom+4:Math.max(8,r.top-Math.min(height,options.length*36+8)-4),width:Math.min(innerWidth-16,Math.max(220,r.width)),maxHeight:height});
  }
  function show(){place();setActive(Math.max(0,selected));setOpen(true);}
  useEffect(()=>{
    if(!open)return;
    const outside=(e:PointerEvent)=>{if(!trigger.current?.contains(e.target as Node)&&!list.current?.contains(e.target as Node))setOpen(false);};
    const dismiss=()=>setOpen(false);
    const scroll=(e:Event)=>{if(!list.current?.contains(e.target as Node))place();};
    document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);
    document.addEventListener('scroll',scroll,true);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);document.removeEventListener('scroll',scroll,true);};
  },[open]);
  useEffect(()=>{if(open)list.current?.children[active]?.scrollIntoView({block:'nearest'});},[open,active]);
  const choose=(index:number)=>{if(options[index])onValueChange(options[index].value);setOpen(false);trigger.current?.focus();};
  return <><button ref={trigger} type="button" className="wb-select" role="combobox" aria-label={label} aria-expanded={open} aria-controls={open?id:undefined} aria-haspopup="listbox" aria-activedescendant={open?`${id}-${active}`:undefined}
    onClick={()=>open?setOpen(false):show()} onBlur={()=>setOpen(false)} onKeyDown={e=>{
      if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);return;}
      if(e.key==='Tab'){setOpen(false);return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(!open){show();return;}setActive(i=>e.key==='Home'?0:e.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,i+(e.key==='ArrowDown'?1:-1))));}
      else if((e.key==='Enter'||e.key===' ')&&open){e.preventDefault();choose(active);}
      else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){const now=Date.now();search.current={text:(now-search.current.time<700?search.current.text:'')+e.key.toLocaleLowerCase(),time:now};const found=options.findIndex(o=>o.label.toLocaleLowerCase().startsWith(search.current.text));if(found>=0){if(!open)show();setActive(found);}}
    }}><span>{options[selected]?.label||'请选择'}</span><span aria-hidden="true">⌄</span></button>
    {open&&createPortal(<div ref={list} id={id} className="wb-select-list" role="listbox" aria-label={label} style={rect} onMouseDown={e=>e.preventDefault()}>{options.map((o,i)=><div key={o.value} id={`${id}-${i}`} role="option" data-value={o.value} aria-selected={o.value===value} className={i===active?'is-active':''} onPointerMove={()=>setActive(i)} onClick={()=>choose(i)}><span>{o.label}</span><span aria-hidden="true">{o.value===value?'✓':''}</span></div>)}</div>,trigger.current?.closest('.wb-root')||document.body)}
  </>;
}

/** Shared dismissal behavior for toolbar popovers, including exclusive open state. */
export function useToolbarOverlays(modalOpen:boolean){
  useEffect(()=>{
    const details=document.querySelector<HTMLDetailsElement>('.wb-toolbar details');
    const windows=document.querySelector<HTMLElement>('.wb-window-list');
    if(modalOpen&&details)details.open=false;
    const outside=(e:PointerEvent)=>{if(details&&!details.contains(e.target as Node))details.open=false;};
    const escape=(e:KeyboardEvent)=>{
      if(e.key==='Escape'&&details?.open){details.open=false;details.querySelector('summary')?.focus();return;}
      if(!details||!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
      const target=e.target as HTMLElement;
      if(!details.contains(target))return;
      e.preventDefault();details.open=true;
      const items=[...details.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index=items.indexOf(target as HTMLButtonElement);
      const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowUp'?-1:1)+items.length)%items.length;
      items[next]?.focus();
    };
    const select=(e:MouseEvent)=>{if((e.target as HTMLElement).closest('.wb-menu button')&&details)details.open=false;};
    if(windows&&details)details.open=false;
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);document.addEventListener('click',select);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);document.removeEventListener('click',select);};
  });
}
