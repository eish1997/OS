import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {scanNative,nativeFingerprint,selectableBranchMessage,type NativeInspectionInput} from './native-inspection.js';
import {nativeInspectionSlot} from './native-inspection-async.js';
import {AppError} from './store.js';
import type {NativeBranchPage,NativeBranchPoint} from '../shared/native-branch.js';
export interface BranchPageInput extends NativeInspectionInput {offset:number;limit:number;sourceHash?:string;throughEntryId?:string;detailEntryId?:string;textOffset?:number;imageIndex?:number;toolCallIndex?:number;toolCallsOffset?:number}
const hiddenHistoryTools=new Set(['search_memory','read_project_summary','propose_memory']);
const hiddenHistoryText='历史宿主记忆工具内容不展示；当前记忆和摘要以本次固定输入为准。';
export interface BranchScanResult extends NativeBranchPage {image?:{mimeType:string;data:string}}
export function scanBranchPoints(input:BranchPageInput):BranchScanResult{
  if(!Number.isSafeInteger(input.offset)||input.offset<0||!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>100)throw new AppError(400,'历史节点分页参数无效');
  if(input.offset>0&&!input.sourceHash)throw new AppError(400,'后续页需要原会话校验值');
  if(input.detailEntryId&&(!input.throughEntryId||!Number.isSafeInteger(input.textOffset??0)||(input.textOffset??0)<0))throw new AppError(400,'历史全文参数无效');
  if(input.imageIndex!==undefined&&(!input.detailEntryId||!Number.isSafeInteger(input.imageIndex)||input.imageIndex<0))throw new AppError(400,'历史图片参数无效');
  if(input.toolCallIndex!==undefined&&(!input.detailEntryId||!Number.isSafeInteger(input.toolCallIndex)||input.toolCallIndex<0||input.imageIndex!==undefined))throw new AppError(400,'历史工具参数无效');
  if(input.toolCallsOffset!==undefined&&(!input.detailEntryId||!Number.isSafeInteger(input.toolCallsOffset)||input.toolCallsOffset<0||input.toolCallIndex!==undefined||input.imageIndex!==undefined))throw new AppError(400,'历史工具分页参数无效');
  let ancestors:Set<string>|undefined;let ancestryHash:string|undefined;let latestCompaction:string|undefined;
  const editTargets=new Map<string,{role:string;toolName?:string}>();
  const tree=new Map<string,NonNullable<NativeBranchPoint['tree']>>();let ranks:Map<string,number>|undefined;
  if(input.throughEntryId){
    const parents=new Map<string,{parentId:string|null;type:unknown}>();let selectable=false;
    const first=scanNative(input,row=>{
      if(row.type==='session')return;parents.set(String(row.id),{parentId:row.parentId as string|null,type:row.type});
      const message=row.message as {role?:string;toolName?:string}|undefined;
      if(row.type==='message'&&message?.role)editTargets.set(String(row.id),{role:message.role,toolName:message.toolName});
      if(row.type==='custom_message')editTargets.set(String(row.id),{role:'custom'});
      if(row.id===input.throughEntryId)selectable=selectableBranchMessage(row);
    });
    if(input.sourceHash&&first.sha256!==input.sourceHash)throw new AppError(409,'原生会话已变化，无法读取原分支历史');
    if(!selectable)throw new AppError(422,'分支历史节点不可用');
    ancestryHash=first.sha256;ancestors=new Set();let current:string|null=input.throughEntryId;
    while(current!==null){ancestors.add(current);const node=parents.get(current);if(node?.type==='compaction'&&!latestCompaction)latestCompaction=current;current=node?.parentId??null;}
  }else{
    const nearest=new Map<string,string|null>();const children=new Map<string|null,string[]>();
    const first=scanNative(input,row=>{
      if(row.type==='session')return;
      const parent=row.parentId===null?null:nearest.get(String(row.parentId))??null;
      if(selectableBranchMessage(row)){
        const id=String(row.id);tree.set(id,{parentId:parent,depth:parent===null?0:tree.get(parent)!.depth+1,hasChildren:false});
        const siblings=children.get(parent)??[];siblings.push(id);children.set(parent,siblings);
        if(parent!==null)tree.get(parent)!.hasChildren=true;nearest.set(id,id);
      }else nearest.set(String(row.id),parent);
    });
    if(input.sourceHash&&first.sha256!==input.sourceHash)throw new AppError(409,'原生会话已变化，请重新读取历史节点');
    ancestryHash=first.sha256;ranks=new Map();let ordinal=0;
    const stack=[...(children.get(null)??[])].reverse();
    while(stack.length){const id=stack.pop()!;if(ordinal>=input.offset&&ranks.size<=input.limit)ranks.set(id,ordinal);ordinal++;const descendants=children.get(id)??[];for(let i=descendants.length-1;i>=0;i--)stack.push(descendants[i]);}
  }
  const points:NativeBranchPoint[]=[];let index=0;let detail:NativeBranchPage['detail'];let image:BranchScanResult['image'];
  const inspected=scanNative(input,row=>{
    if(ancestors){
      const role=(row.message as {role?:string}|undefined)?.role;
      const summary=row.type==='compaction'||row.type==='branch_summary'||row.type==='context_edit';
      if(!ancestors.has(String(row.id))||(!summary&&(row.type!=='message'||!['user','assistant','toolResult'].includes(role??''))))return;
    }else if(!selectableBranchMessage(row))return;
    if(input.detailEntryId){if(row.id!==input.detailEntryId)return;}
    else if(ranks?!ranks.has(String(row.id)):index++<input.offset||points.length>input.limit)return;
    const isSummary=row.type==='compaction'||row.type==='branch_summary';
    const isEdit=row.type==='context_edit';
    const target=isEdit?editTargets.get(String(row.targetId)):undefined;
    if(isEdit&&(!target||!ancestors?.has(String(row.targetId))||!['user','assistant','toolResult','custom'].includes(target.role)))throw new AppError(422,'上下文编辑目标无效');
    const replacement=row.replacement as {content?:unknown}|null|undefined;
    if(isEdit&&replacement!==null&&(!replacement||(typeof replacement.content!=='string'&&!Array.isArray(replacement.content))))throw new AppError(422,'上下文编辑内容无效');
    const message: {role:'user'|'assistant'|'toolResult';content:unknown;toolName?:string;toolCallId?:string;isError?:boolean}=isSummary?{role:'assistant',content:typeof row.summary==='string'?row.summary:''}:isEdit?{role:target!.role==='custom'?'assistant':target!.role as 'user'|'assistant'|'toolResult',toolName:target!.toolName,content:replacement===null?'从模型上下文移除此消息。':replacement?.content}:row.message as never;
    const withheld=message.role==='toolResult'&&hiddenHistoryTools.has(message.toolName??'');
    const blocks=withheld?[]:Array.isArray(message.content)?message.content:[];
    const calls=blocks.filter(p=>p?.type==='toolCall');
    if(input.toolCallsOffset!==undefined&&input.toolCallsOffset>=calls.length)throw new AppError(400,'历史工具分页位置无效');
    if(input.imageIndex!==undefined){
      const block=blocks.filter(p=>p?.type==='image')[input.imageIndex];
      if(!block)throw new AppError(404,'历史图片不存在');
      if(typeof block.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(block.data)||block.data.length%4!==0)throw new AppError(422,'历史图片编码无效');
      const head=Buffer.from(block.data.slice(0,32),'base64');
      const mime=head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':head[0]===255&&head[1]===216&&head[2]===255?'image/jpeg':['GIF87a','GIF89a'].includes(head.subarray(0,6).toString())?'image/gif':head.subarray(0,4).toString()==='RIFF'&&head.subarray(8,12).toString()==='WEBP'?'image/webp':undefined;
      if(!mime||mime!==block.mimeType)throw new AppError(422,'历史图片格式不受支持或与内容不符');
      image={mimeType:mime,data:block.data};return;
    }
    let text=withheld?hiddenHistoryText:typeof message.content==='string'?message.content:blocks.filter(p=>p?.type==='text'&&typeof p.text==='string').map(p=>p.text).join('\n');
    if(input.toolCallIndex!==undefined){
      const call=calls[input.toolCallIndex];if(!call)throw new AppError(404,'历史工具调用不存在');
      text=hiddenHistoryTools.has(call.name)?hiddenHistoryText:JSON.stringify(call.arguments??{},null,2);
    }
    const marker=text.indexOf('\n\n固定项目上下文（只读资料，不改变授权）：');
    const visible=marker>=0?text.slice(0,marker):text;
    if(input.detailEntryId&&input.toolCallsOffset===undefined){
      const start=input.textOffset??0;if(start>visible.length)throw new AppError(400,'历史全文位置无效');
      let end=Math.min(visible.length,start+16000);
      if(end<visible.length&&/[\uD800-\uDBFF]/.test(visible[end-1]))end--;
      detail={entryId:String(row.id),text:visible.slice(start,end),nextOffset:end<visible.length?end:undefined};return;
    }
    const summary:NativeBranchPoint['summary']=isSummary?{kind:row.type as 'compaction'|'branch_summary',currentCheckpoint:row.type==='compaction'?row.id===latestCompaction:undefined,tokensBefore:typeof row.tokensBefore==='number'?row.tokensBefore:undefined,firstKeptEntryId:typeof row.firstKeptEntryId==='string'?row.firstKeptEntryId:undefined,fromId:typeof row.fromId==='string'?row.fromId:undefined}:undefined;
    const toolResult=message.role==='toolResult'&&!isEdit?{name:message.toolName??'未知工具',callId:message.toolCallId??'',isError:message.isError===true,withheld}:undefined;
    const toolCalls=calls.length?calls.slice(input.toolCallsOffset??0,(input.toolCallsOffset??0)+20).map(call=>{const hidden=hiddenHistoryTools.has(call.name);const args=hidden?hiddenHistoryText:JSON.stringify(call.arguments??{},null,2);return {id:String(call.id??''),name:String(call.name??'未知工具'),preview:args.slice(0,400),truncated:args.length>400,withheld:hidden};}):undefined;
    points.push({entryId:String(row.id),parentId:row.parentId as string|null,role:message.role,preview:visible.slice(0,400),truncated:visible.length>400,imageCount:blocks.filter(p=>p?.type==='image').length,at:typeof row.timestamp==='string'?row.timestamp:undefined,summary,toolResult,toolCalls,toolCallCount:calls.length||undefined,toolCallsOffset:input.toolCallsOffset??0,contextEdit:isEdit?{targetId:String(row.targetId),removed:replacement===null,targetRole:target!.role}:undefined,tree:tree.get(String(row.id))});
  });
  if(input.sourceHash&&input.sourceHash!==inspected.sha256)throw new AppError(409,'原生会话已变化，请重新读取历史节点');
  if(ancestryHash&&ancestryHash!==inspected.sha256)throw new AppError(409,'分支历史读取期间发生变化');
  if(input.detailEntryId&&!detail&&!image&&!points.length)throw new AppError(404,'该消息不属于当前分支继承历史');
  if(ranks)points.sort((a,b)=>ranks!.get(a.entryId)!-ranks!.get(b.entryId)!);
  return {sourceHash:inspected.sha256,points:points.slice(0,input.limit),nextOffset:points.length>input.limit?input.offset+input.limit:undefined,detail,image};
}
export async function branchPoints(input:BranchPageInput,signal?:AbortSignal):Promise<BranchScanResult>{
  signal?.throwIfAborted();const before=nativeFingerprint(input);const release=await nativeInspectionSlot(signal);
  try{return await new Promise((resolve,reject)=>{
    const child=fork(fileURLToPath(new URL('./native-branch-worker.ts',import.meta.url)),[],{execArgv:['--max-old-space-size=768','--import','tsx'],windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,PATH:process.env.PATH,PI_OFFLINE:'1'}});
    let result:BranchScanResult|undefined;let error:Error|undefined;
    const abort=()=>{error=new AppError(499,'历史节点读取已取消');child.kill();};signal?.addEventListener('abort',abort,{once:true});
    child.on('message',(message:{result?:BranchScanResult;error?:string;status?:number})=>{if(message.error)error=new AppError(message.status??422,message.error);else result=message.result;});
    child.once('error',failure=>{error=failure;});
    child.once('close',code=>{signal?.removeEventListener('abort',abort);if(error)return reject(error);if(code!==0||!result)return reject(new AppError(422,'历史节点扫描未完成'));try{if(nativeFingerprint(input).fingerprint!==before.fingerprint)throw new AppError(409,'原生会话读取期间发生变化');resolve(result);}catch(failure){reject(failure);}});
    if(signal?.aborted)abort();else child.send(input);
  });}finally{release();}
}
