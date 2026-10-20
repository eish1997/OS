import {randomUUID} from 'node:crypto';
import type {ExtensionContext,ExtensionUIDialogOptions,LoadExtensionsResult,RegisteredTool,RegisteredCommand} from '@earendil-works/pi-coding-agent';
import type {PluginInteractionAnswer,PluginInteractionRequest} from '../shared/plugin-interaction.js';

/** One worker owns these promises. Persisted receipts cannot recreate or replay them. */
export class PiDialogs {
  private pending=new Map<string,{kind:PluginInteractionRequest['kind'];resolve:(value:PluginInteractionAnswer)=>void;reject:(error:unknown)=>void}>();
  private stopped=false;
  private secrets=new Set<string>();private noticeCount=0;private noticeQueue:Promise<unknown>=Promise.resolve();private noticeError:unknown;
  constructor(private rpc:(type:string,extra:Record<string,unknown>)=>Promise<unknown>,private waitTimeoutMs=300000){}
  protect(values:(string|undefined)[]){for(const value of values)if(value)this.secrets.add(value);}
  async flush(){await this.noticeQueue;if(this.noticeError)throw this.noticeError;}
  private notify(source:string,message:string,level:'info'|'warning'|'error'='info'){
    if(this.noticeCount>100)return;
    let truncated=false;
    if(this.noticeCount++===100){message='本次运行的插件通知已达100条，后续通知不再保存。';level='warning';truncated=true;}
    if(typeof message!=='string')throw new Error('插件通知必须是文本');
    if(message.length>65536){message='插件通知过长，未保存原文；请在插件中缩短通知内容。';truncated=true;}
    else for(const secret of [...this.secrets].sort((a,b)=>b.length-a.length))message=message.split(secret).join('[已隐藏]');
    if(message.length>8000){message=message.slice(0,7980)+'\n[通知已缩短]';truncated=true;}
    if(!message.trim())return;
    const notice={id:randomUUID(),source,level,message,...(truncated?{truncated:true}:{} )};
    this.noticeQueue=this.noticeQueue.then(()=>this.rpc('plugin_notice',{notice})).catch(error=>{this.noticeError=error;});
  }
  async answer(id:string,value:PluginInteractionAnswer){
    const pending=this.pending.get(id);if(!pending)return;
    if(pending.kind==='input'&&typeof value==='string')this.protect([value]);
    this.pending.delete(id);
    try{await this.rpc('interaction_delivered',{id});pending.resolve(value);}catch(error){pending.reject(error);}
  }
  stop(){this.stopped=true;for(const pending of this.pending.values())pending.resolve(null);this.pending.clear();}
  private async ask(source:string,kind:PluginInteractionRequest['kind'],title:string,message?:string,options?:string[],opts?:ExtensionUIDialogOptions){
    if(this.stopped||opts?.signal?.aborted)return null;
    const timeoutMs=opts?.timeout??this.waitTimeoutMs;
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>86400000)throw new Error('插件等待时间须为1毫秒至24小时');
    const id=randomUUID();let timer:ReturnType<typeof setTimeout>|undefined;
    const aborted=()=>{this.pending.get(id)?.resolve(null);this.pending.delete(id);};
    const result=new Promise<PluginInteractionAnswer>((resolve,reject)=>this.pending.set(id,{kind,resolve,reject}));
    // Attach rejection handler while opening the durable request.
    void result.catch(()=>{});
    try{
      opts?.signal?.addEventListener('abort',aborted,{once:true});
      const opened=await this.rpc('interaction_open',{request:{id,source,kind,title,message,options,timeoutMs}}) as {expiresAt:string};
      const deadline=Date.parse(opened.expiresAt);if(!Number.isFinite(deadline))throw new Error('用户等待期限回执无效');
      timer=setTimeout(aborted,Math.max(0,deadline-Date.now()));
      return await result;
    }finally{
      clearTimeout(timer);opts?.signal?.removeEventListener('abort',aborted);this.pending.delete(id);
      await this.rpc('interaction_close',{id});
    }
  }
  attach(loaded:LoadExtensionsResult){
    const context=<T extends ExtensionContext>(ctx:T,source:string):T=>new Proxy(ctx,{get:(target,key,receiver)=>{
      if(key in target&&['newSession','fork','navigateTree','switchSession','reload'].includes(String(key)))return async()=>{
        const names:Record<string,string>={newSession:'新建会话',fork:'从历史分支',navigateTree:'切换历史节点',switchSession:'切换会话文件',reload:'重载扩展'};
        const message=`插件请求${names[String(key)]}，但该命令尚未接入工作台的会话及环境管理；当前会话保持不变。`;
        this.notify(source,message,'error');throw new Error(message);
      };
      if(key==='hasUI')return true;
      if(key!=='ui')return Reflect.get(target,key,receiver);
      return {...target.ui,
        notify:(message:string,level?:'info'|'warning'|'error')=>this.notify(source,message,level),
        confirm:async(title:string,message:string,opts?:ExtensionUIDialogOptions)=>(await this.ask(source,'confirm',title,message,undefined,opts))===true,
        input:async(title:string,placeholder?:string,opts?:ExtensionUIDialogOptions)=>(await this.ask(source,'input',title,placeholder,undefined,opts))??undefined,
        select:async(title:string,options:string[],opts?:ExtensionUIDialogOptions)=>(await this.ask(source,'select',title,undefined,options,opts))??undefined,
        custom:async()=>{throw new Error('此插件需要终端自定义界面，工作台尚不支持');},
        editor:async()=>{throw new Error('此插件需要终端编辑器，工作台尚不支持');}
      };
    }});
    for(const extension of loaded.extensions){
      for(const [event,handlers] of extension.handlers)extension.handlers.set(event,handlers.map(handler=>async(...args:unknown[])=>handler(args[0],context(args[1] as ExtensionContext,extension.path),...args.slice(2))));
      const tool=(value:RegisteredTool)=>{const execute=value.definition.execute;value.definition.execute=(...args)=>execute(args[0],args[1],args[2],args[3],context(args[4],extension.path));};
      const command=(value:RegisteredCommand)=>{const handler=value.handler;value.handler=(args,ctx)=>handler(args,context(ctx,extension.path));};
      for(const value of extension.tools.values())tool(value);for(const value of extension.commands.values())command(value);
      const setTool=extension.tools.set.bind(extension.tools);extension.tools.set=(name,value)=>{tool(value);return setTool(name,value);};
      const setCommand=extension.commands.set.bind(extension.commands);extension.commands.set=(name,value)=>{command(value);return setCommand(name,value);};
    }
  }
}
