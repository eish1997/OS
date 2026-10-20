import {openSync,readSync,closeSync} from 'node:fs';
import {TextDecoder} from 'node:util';
import {nativeFingerprint,scanNative,type NativeInspectionInput} from './native-inspection.js';
import {AppError} from './store.js';

const entryTypes=new Set(['message','thinking_level_change','model_change','usage','compaction','branch_summary','custom','custom_message','label','session_info','context_edit']);
const string=(value:unknown)=>typeof value==='string';
const fail=()=>{throw new AppError(422,'原生会话条目格式或引用不兼容');};
function content(value:unknown){
  if(string(value))return;
  if(!Array.isArray(value))fail();
  for(const block of value as Record<string,unknown>[]){
    if(!block||typeof block!=='object')fail();
    if(block.type==='text'){if(!string(block.text))fail();}
    else if(block.type==='image'){if(!string(block.mimeType)||!string(block.data))fail();}
    else if(block.type==='thinking'){if(!string(block.thinking))fail();}
    else if(block.type==='toolCall'){if(!string(block.id)||!string(block.name)||!block.arguments||typeof block.arguments!=='object'||Array.isArray(block.arguments))fail();}
    else fail();
  }
}
function headerId(input:Omit<NativeInspectionInput,'sessionId'>){
  nativeFingerprint({...input,sessionId:''});const fd=openSync(input.path,'r');
  try{
    // Same 1 MiB header discovery bound as the pinned Pi SessionManager.
    const bytes=Buffer.alloc(1024*1024);let used=0;
    while(used<bytes.length){const count=readSync(fd,bytes,used,Math.min(65536,bytes.length-used),used);if(!count)break;const newline=bytes.indexOf(10,used);used+=count;if(newline>=0&&newline<used){used=newline;break;}}
    if(used===bytes.length)throw new AppError(422,'原生会话头超过固定Pi版本支持的1 MiB范围');
    let row:Record<string,unknown>;try{row=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,used)));}catch{throw new AppError(422,'原生会话头损坏');}
    if(!row||row.type!=='session'||row.version!==3||typeof row.id!=='string'||!row.id||row.id.length>128)throw new AppError(422,'仅支持固定Pi版本的v3原生会话');
    return row.id;
  }finally{closeSync(fd);}
}

/** Structural preview only. Never load extensions, follow embedded paths, or authorize execution. */
export function inspectNativeImport(input:Omit<NativeInspectionInput,'sessionId'>){
  const sessionId=headerId(input);const nodes=new Map<string,{parent:string|null;editable:boolean}>();const children=new Map<string|null,string[]>();
  const references:{source:string;target:string;ancestor:boolean;editable?:boolean}[]=[];
  let messageCount=0,imageCount=0,toolCallCount=0,compactionCount=0,contextEditCount=0,customEntryCount=0;
  let lastRecordedModel:{provider:string;model:string}|undefined;
  let headerSeen=false;
  const result=scanNative({...input,sessionId},row=>{
    if(row.type==='session'){if(headerSeen)fail();headerSeen=true;if(!string(row.cwd)||!string(row.timestamp))fail();return;}if(!entryTypes.has(String(row.type)))fail();
    if(!row.id||!string(row.timestamp))fail();
    const id=String(row.id),parent=row.parentId as string|null;let editable=false;
    if(row.type==='message'){
      const message=row.message as Record<string,unknown>;if(!message||typeof message!=='object')fail();messageCount++;
      if(['user','assistant','toolResult','system','custom'].includes(String(message.role))){content(message.content);editable=['user','assistant','toolResult'].includes(String(message.role));}
      else if(message.role==='bashExecution'){if(!string(message.command)||!string(message.output))fail();}
      else if(['branchSummary','compactionSummary'].includes(String(message.role))){if(!string(message.summary))fail();}
      else fail();
      if(Array.isArray(message.content)){imageCount+=message.content.filter(b=>b?.type==='image').length;toolCallCount+=message.content.filter(b=>b?.type==='toolCall').length;}
    }
    if(row.type==='custom'||row.type==='custom_message'){if(!string(row.customType))fail();customEntryCount++;if(row.type==='custom_message'){content(row.content);editable=true;}}
    if(row.type==='model_change'){if(!string(row.provider)||!string(row.modelId))fail();lastRecordedModel={provider:row.provider as string,model:row.modelId as string};}
    if(row.type==='thinking_level_change'&&!string(row.thinkingLevel))fail();
    if(row.type==='compaction'){
      if(!string(row.summary)||!string(row.firstKeptEntryId)||typeof row.tokensBefore!=='number'||!Number.isFinite(row.tokensBefore)||row.tokensBefore<0)fail();
      compactionCount++;references.push({source:id,target:row.firstKeptEntryId as string,ancestor:true});
    }
    if(row.type==='branch_summary'){if(!string(row.summary)||!string(row.fromId))fail();references.push({source:id,target:row.fromId as string,ancestor:false});}
    if(row.type==='label'){if(!string(row.targetId))fail();references.push({source:id,target:row.targetId as string,ancestor:false});}
    if(row.type==='context_edit'){
      if(!string(row.targetId))fail();contextEditCount++;const replacement=row.replacement as {content?:unknown}|null;
      if(replacement!==null){if(!replacement||typeof replacement!=='object')fail();content(replacement.content);}
      references.push({source:id,target:row.targetId as string,ancestor:true,editable:true});
    }
    nodes.set(id,{parent,editable});const siblings=children.get(parent)??[];siblings.push(id);children.set(parent,siblings);
  });
  // Iterative DFS intervals validate ancestry in linear time, including deep histories.
  let clock=0;const intervals=new Map<string,{start:number;end:number}>();const stack=(children.get(null)??[]).map(id=>({id,exit:false})).reverse();
  while(stack.length){const frame=stack.pop()!;if(frame.exit){intervals.get(frame.id)!.end=clock++;continue;}intervals.set(frame.id,{start:clock++,end:0});stack.push({id:frame.id,exit:true});const descendants=children.get(frame.id)??[];for(let i=descendants.length-1;i>=0;i--)stack.push({id:descendants[i],exit:false});}
  for(const ref of references){const target=nodes.get(ref.target);if(!target)fail();if(ref.editable&&(!target!.editable||ref.source===ref.target))fail();if(ref.ancestor){const a=intervals.get(ref.target)!,b=intervals.get(ref.source)!;if(!(a.start<=b.start&&a.end>=b.end))fail();}}
  return {sessionId,sha256:result.sha256,bytes:result.bytes,entryCount:result.entryCount,messageCount,imageCount,toolCallCount,compactionCount,contextEditCount,customEntryCount,...(lastRecordedModel?{lastRecordedModel}:{}),environmentVerified:false as const};
}
