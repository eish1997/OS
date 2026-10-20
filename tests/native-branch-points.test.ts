import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,appendFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {branchPoints,scanBranchPoints} from '../server/native-branch-points.js';
import {nativeInspectionSlot} from '../server/native-inspection-async.js';
import {createApp} from '../server/app.js';
import type {Run,Conversation} from '../shared/contracts.js';
import {loadPi} from '../server/pi-adapter.js';

function history(root:string,projectId:string){
  const dir=join(root,'sessions',projectId);mkdirSync(dir,{recursive:true});const path=join(dir,'owned.jsonl');
  const messages=[
    {role:'user',content:'Visible\n\n固定项目上下文（只读资料，不改变授权）：PRIVATE_CONTEXT'},
    {role:'assistant',stopReason:'toolUse',content:[{type:'toolCall',id:'call',name:'read',arguments:{}}]},
    {role:'toolResult',content:[{type:'text',text:'TOOL_BODY'}]},
    {role:'assistant',stopReason:'error',content:[{type:'text',text:'PARTIAL'}]},
    {role:'user',content:[{type:'text',text:'Image '+ 'x'.repeat(500)},{type:'image',mimeType:'image/png',data:'PRIVATE_BASE64'}]},
    {role:'assistant',stopReason:'stop',content:[{type:'text',text:'Finished'}]},
  ];
  const rows=[{type:'session',version:3,id:'owned-session'},...messages.map((message,i)=>({type:'message',id:`entry-${i}`,parentId:i?`entry-${i-1}`:null,message}))];
  writeFileSync(path,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
  return {root,projectId,path,sessionId:'owned-session',offset:0,limit:2};
}

test('branch pages select safe messages, hide context/image bodies and bind pagination to exact history',async()=>{
  const input=history(mkdtempSync(join(tmpdir(),'branch-page-')),'project');const original=readFileSync(input.path);
  const first=await branchPoints(input);assert.equal(first.nextOffset,2);
  assert.deepEqual(first.points.map(p=>p.entryId),['entry-0','entry-4']);assert.equal(first.points[0].preview,'Visible');
  assert.equal(first.points[1].preview.length,400);assert.equal(first.points[1].imageCount,1);assert(!JSON.stringify(first).includes('PRIVATE'));
  const second=await branchPoints({...input,offset:first.nextOffset!,sourceHash:first.sourceHash});assert.deepEqual(second.points.map(p=>p.entryId),['entry-5']);assert.equal(second.nextOffset,undefined);
  assert.deepEqual(readFileSync(input.path),original);
  assert.throws(()=>scanBranchPoints({...input,offset:1}),/校验值/);
  for(const values of [{offset:-1},{limit:101},{offset:0.5},{limit:0}])assert.throws(()=>scanBranchPoints({...input,...values}),/分页/);
  appendFileSync(input.path,JSON.stringify({type:'message',id:'new',parentId:'entry-5',message:{role:'user',content:'changed'}})+'\n');
  await assert.rejects(branchPoints({...input,offset:2,sourceHash:first.sourceHash}),/已变化/);
  await assert.rejects(branchPoints({...input,projectId:'another'}),/范围/);
});

test('queued and running branch scans cancel and release shared inspection slots',async()=>{
  const input=history(mkdtempSync(join(tmpdir(),'branch-abort-')),'project');
  const a=await nativeInspectionSlot(),b=await nativeInspectionSlot();
  try{const controller=new AbortController();const pending=branchPoints(input,controller.signal);controller.abort();await assert.rejects(pending,/取消/);}finally{a();b();}
  const controller=new AbortController();const pending=branchPoints(input,controller.signal);
  // Yield once so the acquired slot starts its child before cancellation.
  await new Promise(resolve=>setTimeout(resolve,20));controller.abort();await assert.rejects(pending,/取消/);
  assert.equal((await branchPoints(input)).points.length,2);
});

test('inherited history follows ancestors rather than file order and includes partial assistant text',async()=>{
  const input=history(mkdtempSync(join(tmpdir(),'branch-ancestry-')),'project');
  appendFileSync(input.path,JSON.stringify({type:'message',id:'side',parentId:'entry-0',message:{role:'user',content:'SIBLING_BRANCH'}})+'\n');
  appendFileSync(input.path,JSON.stringify({type:'message',id:'selected',parentId:'entry-4',message:{role:'user',content:'SELECTED'}})+'\n');
  appendFileSync(input.path,JSON.stringify({type:'message',id:'later',parentId:'selected',message:{role:'user',content:'LATER_UNSELECTED'}})+'\n');
  const before=readFileSync(input.path);const sourceHash=scanBranchPoints(input).sourceHash;
  const first=await branchPoints({...input,throughEntryId:'selected',sourceHash,limit:3});
  assert.deepEqual(first.points.map(p=>p.entryId),['entry-0','entry-1','entry-2']);assert.equal(first.points[2].preview,'TOOL_BODY');
  const last=await branchPoints({...input,throughEntryId:'selected',sourceHash,offset:first.nextOffset!,limit:3});
  assert.deepEqual(last.points.map(p=>p.entryId),['entry-3','entry-4','selected']);assert.equal(last.points[0].preview,'PARTIAL');assert.equal(last.nextOffset,undefined);
  const content=JSON.stringify([first,last]);assert(!content.includes('SIBLING_BRANCH'));assert(!content.includes('LATER_UNSELECTED'));assert(!content.includes('Finished'));assert(content.includes('TOOL_BODY'));
  await assert.rejects(branchPoints({...input,throughEntryId:'missing',sourceHash}),/节点不可用/);
  assert.deepEqual(readFileSync(input.path),before);
});

test('inherited full text is bounded, preserves unicode and refuses sibling or later nodes',async()=>{
  const input=history(mkdtempSync(join(tmpdir(),'branch-fulltext-')),'project');
  const full='A'.repeat(15999)+'😀'+'B'.repeat(20000)+'END';
  appendFileSync(input.path,JSON.stringify({type:'message',id:'long',parentId:'entry-4',message:{role:'user',content:full+'\n\n固定项目上下文（只读资料，不改变授权）：PRIVATE'}})+'\n');
  const sourceHash=scanBranchPoints(input).sourceHash;const base={...input,sourceHash,throughEntryId:'long',detailEntryId:'long'};
  const first=await branchPoints(base);assert.equal(first.points.length,0);assert.equal(first.detail!.text.length,15999);
  const second=await branchPoints({...base,textOffset:first.detail!.nextOffset});assert(second.detail!.text.startsWith('😀'));assert(second.detail!.text.length<=16000);
  const last=await branchPoints({...base,textOffset:second.detail!.nextOffset});assert.equal(last.detail!.nextOffset,undefined);
  assert.equal(first.detail!.text+second.detail!.text+last.detail!.text,full);
  await assert.rejects(branchPoints({...base,detailEntryId:'entry-5'}),/不属于/);
  await assert.rejects(branchPoints({...base,textOffset:full.length+1}),/位置无效/);
  await assert.rejects(branchPoints({...base,textOffset:-1}),/参数无效/);
});

test('inherited image access selects exact ancestor image and rejects invalid indices and active formats',async()=>{
  const input=history(mkdtempSync(join(tmpdir(),'branch-images-')),'project');
  const bytes=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
  appendFileSync(input.path,JSON.stringify({type:'message',id:'images',parentId:'entry-0',message:{role:'user',content:[{type:'image',mimeType:'image/png',data:bytes.toString('base64')},{type:'image',mimeType:'image/svg+xml',data:Buffer.from('<svg/>').toString('base64')}]}})+'\n');
  const sourceHash=scanBranchPoints(input).sourceHash;const base={...input,sourceHash,throughEntryId:'images',detailEntryId:'images',imageIndex:0};
  const result=await branchPoints(base);assert.equal(result.image?.mimeType,'image/png');assert.deepEqual(Buffer.from(result.image!.data,'base64'),bytes);assert.equal(result.detail,undefined);
  await assert.rejects(branchPoints({...base,imageIndex:1}),/格式/);
  await assert.rejects(branchPoints({...base,imageIndex:2}),/不存在/);
  await assert.rejects(branchPoints({...base,imageIndex:-1}),/参数/);
  await assert.rejects(branchPoints({...base,detailEntryId:'entry-4'}),/不属于/);
});

test('inherited summary records stay on the selected path and latest checkpoint agrees with pinned Pi',async()=>{
  const input=history(mkdtempSync(join(tmpdir(),'branch-summaries-')),'project');
  const summary='CHECKPOINT_TWO '+ 'summary '.repeat(80);
  const additions=[
    {type:'compaction',id:'compact-one',parentId:'entry-5',summary:'CHECKPOINT_ONE',firstKeptEntryId:'entry-4',tokensBefore:1200},
    {type:'branch_summary',id:'branch-summary',parentId:'compact-one',summary:'BRANCH_SUMMARY',fromId:'entry-5'},
    {type:'message',id:'keep',parentId:'branch-summary',message:{role:'user',content:'KEEP'}},
    {type:'compaction',id:'compact-two',parentId:'keep',summary,firstKeptEntryId:'keep',tokensBefore:2400},
    {type:'message',id:'selected',parentId:'compact-two',message:{role:'user',content:'SELECTED'}},
    {type:'compaction',id:'outside',parentId:'entry-5',summary:'OUTSIDE_BRANCH',firstKeptEntryId:'entry-4',tokensBefore:3000},
  ];
  appendFileSync(input.path,additions.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const base={...input,limit:30,throughEntryId:'selected',sourceHash:scanBranchPoints(input).sourceHash};
  const page=await branchPoints(base);const summaries=page.points.filter(p=>p.summary);
  assert.deepEqual(summaries.map(p=>p.entryId),['compact-one','branch-summary','compact-two']);
  assert.equal(summaries[0].summary?.currentCheckpoint,false);assert.equal(summaries[2].summary?.currentCheckpoint,true);assert.equal(summaries[2].summary?.tokensBefore,2400);assert.equal(summaries[2].truncated,true);
  const full=await branchPoints({...base,detailEntryId:'compact-two'});assert.equal(full.detail?.text,summary);
  const pi=await loadPi();const entries=readFileSync(input.path,'utf8').trim().split('\n').slice(1).map(line=>JSON.parse(line));
  const context=pi.buildContextEntries(entries,'selected');assert.deepEqual(context.map(row=>row.id),['compact-two','keep','selected']);
  assert.equal(context[0].id,summaries.find(p=>p.summary?.currentCheckpoint)?.entryId);
  assert(!JSON.stringify(page).includes('OUTSIDE_BRANCH'));
  assert.equal(scanBranchPoints({...input,limit:30}).points.some(p=>p.summary),false,'summaries are displayed as history, not offered as branchable messages');
});

test('historical tools expose read-only arguments/results but suppress old host memory payloads',async()=>{
  const input=history(mkdtempSync(join(tmpdir(),'branch-tools-')),'project');
  const args={command:'owned '+ 'x'.repeat(500)};
  const rows=[
    {type:'message',id:'calls',parentId:'entry-5',message:{role:'assistant',stopReason:'toolUse',content:[{type:'toolCall',id:'normal',name:'bash',arguments:args},{type:'toolCall',id:'memory',name:'propose_memory',arguments:{text:'DELETED_MEMORY'}}]}},
    {type:'message',id:'result',parentId:'calls',message:{role:'toolResult',toolName:'bash',toolCallId:'normal',isError:true,content:[{type:'text',text:'OWNED_ERROR'}]}},
    {type:'message',id:'memory-result',parentId:'result',message:{role:'toolResult',toolName:'search_memory',toolCallId:'memory',content:[{type:'text',text:'DELETED_MEMORY'},{type:'image',mimeType:'image/png',data:'SECRET_IMAGE'}]}},
    {type:'message',id:'selected',parentId:'memory-result',message:{role:'user',content:'SELECTED'}},
  ];appendFileSync(input.path,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const base={...input,limit:30,throughEntryId:'selected',sourceHash:scanBranchPoints(input).sourceHash};const page=await branchPoints(base);
  const calls=page.points.find(p=>p.entryId==='calls')!;assert.equal(calls.toolCalls?.[0].name,'bash');assert.equal(calls.toolCalls?.[0].truncated,true);assert.equal(calls.toolCalls?.[1].withheld,true);
  const result=page.points.find(p=>p.entryId==='result')!;assert.equal(result.toolResult?.callId,'normal');assert.equal(result.toolResult?.isError,true);assert.equal(result.preview,'OWNED_ERROR');
  assert(!JSON.stringify(page).includes('DELETED_MEMORY'));assert.equal(page.points.find(p=>p.entryId==='memory-result')?.imageCount,0);
  assert.equal((await branchPoints({...base,detailEntryId:'calls',toolCallIndex:0})).detail?.text,JSON.stringify(args,null,2));
  assert(!(await branchPoints({...base,detailEntryId:'calls',toolCallIndex:1})).detail?.text.includes('DELETED_MEMORY'));
  assert(!(await branchPoints({...base,detailEntryId:'memory-result'})).detail?.text.includes('DELETED_MEMORY'));
  await assert.rejects(branchPoints({...base,detailEntryId:'memory-result',imageIndex:0}),/不存在/);
  await assert.rejects(branchPoints({...base,detailEntryId:'calls',toolCallIndex:2}),/不存在/);
});

test('tool history pagination is complete and full arguments use the absolute call index',async()=>{
  const input=history(mkdtempSync(join(tmpdir(),'branch-tool-pages-')),'project');
  const calls=Array.from({length:43},(_,i)=>({type:'toolCall',id:`call-${i}`,name:i===21?'search_memory':'read',arguments:{path:`owned-${i}-`+'x'.repeat(500)}}));
  appendFileSync(input.path,[{type:'message',id:'calls',parentId:'entry-5',message:{role:'assistant',stopReason:'toolUse',content:calls}},{type:'message',id:'selected',parentId:'calls',message:{role:'user',content:'SELECTED'}}].map(r=>JSON.stringify(r)).join('\n')+'\n');
  const base={...input,limit:30,throughEntryId:'selected',detailEntryId:'calls',sourceHash:scanBranchPoints(input).sourceHash};
  const ids:string[]=[];
  for(const offset of [0,20,40]){const result=await branchPoints({...base,toolCallsOffset:offset});const point=result.points[0];assert.equal(point.toolCallsOffset,offset);assert.equal(point.toolCallCount,43);assert(point.toolCalls!.length<=20);ids.push(...point.toolCalls!.map(c=>c.id));if(offset===20)assert.equal(point.toolCalls![1].withheld,true);}
  assert.deepEqual(ids,calls.map(c=>c.id));
  assert.equal((await branchPoints({...base,toolCallIndex:42})).detail?.text,JSON.stringify(calls[42].arguments,null,2));
  assert(!(await branchPoints({...base,toolCallIndex:21})).detail?.text.includes('owned-21'));
  for(const offset of [-1,43,1.5])await assert.rejects(branchPoints({...base,toolCallsOffset:offset}),/分页/);
  await assert.rejects(branchPoints({...base,toolCallsOffset:20,toolCallIndex:0}),/分页/);
});

test('context edit history shows replacement and removal while hiding old host memory',async()=>{
  const input=history(mkdtempSync(join(tmpdir(),'branch-edit-view-')),'project');
  const rows=[
    {type:'context_edit',id:'replace',parentId:'entry-5',targetId:'entry-0',replacement:{content:'EDITED_USER\n\n固定项目上下文（只读资料，不改变授权）：HIDDEN_EDIT_CONTEXT'}},
    {type:'context_edit',id:'remove',parentId:'replace',targetId:'entry-3',replacement:null},
    {type:'message',id:'memory',parentId:'remove',message:{role:'toolResult',toolName:'search_memory',content:[]}},
    {type:'context_edit',id:'memory-edit',parentId:'memory',targetId:'memory',replacement:{content:[{type:'text',text:'HIDDEN_EDIT_MEMORY'},{type:'image',mimeType:'image/png',data:'HIDDEN_IMAGE'}]}},
    {type:'message',id:'selected',parentId:'memory-edit',message:{role:'user',content:'SELECTED'}},
  ];appendFileSync(input.path,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const base={...input,limit:30,throughEntryId:'selected',sourceHash:scanBranchPoints(input).sourceHash};const page=await branchPoints(base);
  const edit=page.points.find(p=>p.entryId==='replace')!;assert.deepEqual(edit.contextEdit,{targetId:'entry-0',targetRole:'user',removed:false});assert.equal(edit.preview,'EDITED_USER');
  assert.equal(page.points.find(p=>p.entryId==='remove')?.contextEdit?.removed,true);assert(!JSON.stringify(page).includes('HIDDEN_'));
  assert.equal((await branchPoints({...base,detailEntryId:'replace'})).detail?.text,'EDITED_USER');
  await assert.rejects(branchPoints({...base,detailEntryId:'memory-edit',imageIndex:0}),/不存在/);
  assert(!(await branchPoints({...base,detailEntryId:'memory-edit'})).detail?.text.includes('HIDDEN_'));
  const pi=await loadPi();const entries=readFileSync(input.path,'utf8').trim().split('\n').slice(1).map(line=>JSON.parse(line));const context=JSON.stringify(pi.buildSessionContext(entries,'selected').messages);
  assert(context.includes('EDITED_USER'));assert(!context.includes('PARTIAL'));
});

test('branch choices use depth-first tree order across pages and collapse nonselectable parents',async()=>{
  const input=history(mkdtempSync(join(tmpdir(),'branch-tree-')),'project');
  const rows=[
    {type:'message',id:'sibling',parentId:'entry-0',message:{role:'user',content:'SIBLING'}},
    {type:'custom',id:'bridge',parentId:'entry-5',customType:'owned',data:{}},
    {type:'message',id:'late-child',parentId:'bridge',message:{role:'user',content:'LATE_CHILD'}},
    {type:'message',id:'sibling-child',parentId:'sibling',message:{role:'user',content:'SIBLING_CHILD'}},
  ];appendFileSync(input.path,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  let offset=0;let hash:string|undefined;const points=[];
  for(;;){const page=await branchPoints({...input,offset,sourceHash:hash});hash=page.sourceHash;points.push(...page.points);if(page.nextOffset===undefined)break;offset=page.nextOffset;}
  assert.deepEqual(points.map(p=>p.entryId),['entry-0','entry-4','entry-5','late-child','sibling','sibling-child']);
  assert.deepEqual(points.map(p=>p.tree?.depth),[0,1,2,3,1,2]);
  assert.equal(points[1].parentId,'entry-3');assert.equal(points[1].tree?.parentId,'entry-0');
  assert.deepEqual(points[3].tree,{parentId:'entry-5',depth:3,hasChildren:false});assert.equal(points[0].tree?.hasChildren,true);
});

test('branch point HTTP endpoint requires authentication and project scope, refuses active histories',async()=>{
  const root=mkdtempSync(join(tmpdir(),'branch-http-'));const app=createApp({dataDir:root,password:'branch-password',schedule:false});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try{
    const project=app.service.createProject('Branch');const other=app.service.createProject('Other');const input=history(root,project.id);
    const run=app.service.submit(project.id,'owned','owned','pi',{version:5,projectId:project.id,allowModel:false,maxCalls:1,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:256,timeoutMs:1000,toolNames:[]}).run;
    app.store.update<Run>('run',run.id,run.revision,{sessionId:input.sessionId,sessionPath:input.path,status:'completed'});
    const path=`/api/runs/${run.id}/branch-points?projectId=${project.id}`;
    assert.equal((await fetch(base+path)).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'branch-password'})});const headers={cookie:login.headers.get('set-cookie')!.split(';')[0]};
    const response=await fetch(base+path+'&limit=2',{headers});assert.equal(response.status,200);const page=await response.json();assert.equal(page.points.length,2);
    assert.equal((await fetch(base+path+'&offset=2',{headers})).status,400);
    assert.equal((await fetch(base+path+'&offset=2&sourceHash='+page.sourceHash,{headers})).status,200);
    assert.equal((await fetch(base+path.replace(project.id,other.id),{headers})).status,403);
    const conversation=app.service.createConversation(project.id,'Owned branch','owned-branch');
    app.store.update<Conversation>('conversation',conversation.id,conversation.revision,{branch:{sourceRunId:run.id,sourceEntryId:'entry-0',sourceHash:page.sourceHash}});
    const inherited=`/api/conversations/${conversation.id}/inherited-history`;
    assert.equal((await fetch(base+inherited)).status,401);
    const inheritedResponse=await fetch(base+inherited,{headers});assert.equal(inheritedResponse.status,200);const inheritedPage=await inheritedResponse.json();assert.deepEqual(inheritedPage.points.map((p:{entryId:string})=>p.entryId),['entry-0']);
    const fullResponse=await fetch(base+inherited+'?entryId=entry-0',{headers});assert.equal(fullResponse.status,200);assert.equal((await fullResponse.json()).detail.text,'Visible');
    assert.equal((await fetch(base+inherited+'?entryId=entry-4',{headers})).status,404);
    // A large image remains in the scanner process; HTTP returns metadata only.
    appendFileSync(input.path,JSON.stringify({type:'message',id:'large-image',parentId:'entry-5',message:{role:'user',content:[{type:'image',mimeType:'image/png',data:'x'.repeat(32*1024*1024)}]}})+'\n');
    assert.equal((await fetch(base+inherited,{headers})).status,409,'inherited history never silently changes its frozen source');
    let finished=false;const scan=fetch(base+path,{headers}).then(async response=>{const body=await response.text();finished=true;return {status:response.status,body};});
    await new Promise(resolve=>setTimeout(resolve,15));
    const start=performance.now();const health=await fetch(base+'/api/health');assert.equal(health.status,200);assert(performance.now()-start<2000,'health responds while history is scanned');assert.equal(finished,false,'large scan is still outstanding when health returns');
    const large=await scan;assert.equal(large.status,200);assert(large.body.length<3000,'image data never enters page response');assert.equal(JSON.parse(large.body).points.at(-1).imageCount,1);
    const current=app.store.get<Run>('run',run.id);app.store.update<Run>('run',run.id,current.revision,{status:'running'});
    assert.equal((await fetch(base+path,{headers})).status,409);
  }finally{await app.close();}
});
