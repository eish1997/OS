import {dirname,join} from 'node:path';
import type {Conversation,Run} from '../shared/contracts.js';
import {Store,AppError} from './store.js';
import {sourceInspection} from './native-session.js';
import {NativeImports} from './native-imports.js';

/** Resolve only the durable conversation origin, never a client supplied path/checkpoint. */
export async function inheritedSource(store:Store,conversation:Conversation,signal?:AbortSignal){
  if(conversation.branch&&conversation.importedFrom)throw new AppError(422,'历史来源记录冲突');
  if(conversation.importedFrom){
    const origin=conversation.importedFrom;const root=dirname(store.path);const imports=new NativeImports(store,root);
    const record=await imports.preview(conversation.projectId,origin.importId,signal);
    if(record.sha256!==origin.sourceHash)throw new AppError(409,'导入原件与话题记录不一致');
    return {input:{root,projectId:conversation.projectId,path:join(root,'sessions',conversation.projectId,`import-${record.id}.jsonl`),sessionId:record.preview.sessionId},sourceHash:origin.sourceHash,entryId:origin.sourceEntryId,
      validate:()=>{const current=imports.get(conversation.projectId,record.id);if(current.revoked||current.revision!==record.revision)throw new AppError(409,'导入来源已变化，请重新读取');}};
  }
  const branch=conversation.branch;if(!branch)throw new AppError(404,'此话题没有继承历史');
  const source=store.get<Run>('run',branch.sourceRunId);
  if(source.projectId!==conversation.projectId)throw new AppError(403,'历史不属于当前项目');
  const input=sourceInspection(store,source);if(!input||source.mode!=='pi')throw new AppError(422,'来源历史不可用');
  if(branch.sourceConversationId!==source.conversationId)throw new AppError(422,'分支来源话题不一致');
  return {input,sourceHash:branch.sourceHash,entryId:branch.sourceEntryId,validate:()=>{if(store.get<Run>('run',source.id).revision!==source.revision)throw new AppError(409,'分支来源已变化，请重新读取');}};
}
