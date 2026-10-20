import {buildSessionContext,type SessionEntry} from '@earendil-works/pi-coding-agent';
import {scanNative,selectableBranchMessage,type NativeInspectionInput} from './native-inspection.js';
import {AppError} from './store.js';
import {validateNativeImage} from './native-image-validation.js';

export async function validateContextImages(messages:readonly unknown[]){
  for(const value of messages){const message=value as {role?:string;toolName?:string;content?:{type?:string;data?:unknown;mimeType?:unknown}[]};
    if(message.role==='toolResult'&&['search_memory','read_project_summary','propose_memory'].includes(message.toolName??''))continue;
    if(Array.isArray(message.content))for(const block of message.content)if(block.type==='image')await validateNativeImage(block.data,block.mimeType);
  }
}

/** Count only effective content. Host memory tool payloads are removed by forkNative. */
export function contextImageCount(messages:readonly unknown[]){
  let count=0;
  for(const value of messages){
    const message=value as {role?:string;toolName?:string;content?:{type?:string}[]};
    if(message.role==='toolResult'&&['search_memory','read_project_summary','propose_memory'].includes(message.toolName??''))continue;
    if(Array.isArray(message.content))count+=message.content.filter(block=>block.type==='image').length;
  }
  return count;
}
/** Worker-only SDK projection. Do not open or rewrite the imported session file. */
export async function importedContextImages(input:NativeInspectionInput,entryId:string,sha256:string){
  const entries:SessionEntry[]=[];let selectable=false;
  const result=scanNative(input,row=>{if(row.type==='session')return;entries.push(row as unknown as SessionEntry);if(row.id===entryId)selectable=selectableBranchMessage(row);});
  if(result.sha256!==sha256)throw new AppError(409,'导入上下文校验期间原件变化');
  if(!selectable)throw new AppError(422,'恢复历史节点不可用');
  const messages=buildSessionContext(entries,entryId).messages;await validateContextImages(messages);return contextImageCount(messages);
}
