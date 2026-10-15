import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLayout, activeWorkspace, leaves, addWindow, createWindow, splitRegion, floatWindow, dockWindow, collectWindows, mutateLayout, duplicateWorkspace, resetWorkspace, deleteWorkspace, validateLayout } from '../shared/workbench-layout.js';
import { defaultAppearance } from '../shared/workbench-appearance.js';

test('appearance accepts legacy layouts and survives workspace edits while rejecting invalid settings',()=>{
  const legacy=defaultLayout();validateLayout(legacy);
  let layout=mutateLayout(legacy,n=>{n.appearance={...defaultAppearance,theme:'light',lineWidth:3};});
  layout=duplicateWorkspace(layout,'另一个空间');layout=resetWorkspace(layout);
  assert.deepEqual(layout.appearance,{...defaultAppearance,theme:'light',lineWidth:3});
  for(const value of [0,4,NaN,1.2,'2'])assert.throws(()=>validateLayout({...layout,appearance:{...layout.appearance,lineWidth:value}}));
  assert.throws(()=>validateLayout({...layout,appearance:{...layout.appearance,theme:'unknown'}}));
});

test('layout moves preserve instance/view and collection restores only collected windows',()=>{
  let l=defaultLayout();const a=createWindow('demo','A'),b=createWindow('demo','B');a.view={input:'未发送',scroll:80};
  l=addWindow(addWindow(l,a),b);l=splitRegion(l,leaves(activeWorkspace(l).root)[0].id,'y');
  l=floatWindow(l,a.id,110,130);l=floatWindow(l,b.id,210,230);
  l=mutateLayout(l,n=>{n.floating[0].pinned=true;n.floating[1].mode='icon';});
  l=collectWindows(l);assert.deepEqual(l.floating.map(w=>w.mode),['collected','icon']);
  l=collectWindows(l);assert.deepEqual(l.floating.map(w=>w.mode),['open','icon']);assert.equal(l.floating[0].x,110);assert.equal(l.floating[0].pinned,true);
  l=dockWindow(l,a.id,leaves(activeWorkspace(l).root)[0].id);
  assert.deepEqual(l.windows[a.id].view,{input:'未发送',scroll:80});assert.equal(l.floating.length,1);
  validateLayout(JSON.parse(JSON.stringify(l)));
});
test('workspace copy/reset/delete preserve global floats without creating business identities',()=>{
  let l=defaultLayout();const a=createWindow('chat','chat','p');a.binding.conversationId='conversation';l=addWindow(l,a);
  const b=createWindow('demo','float');l=addWindow(l,b);l=floatWindow(l,b.id);
  l=duplicateWorkspace(l,'副本');assert.equal(l.workspaces.length,2);assert.equal(l.floating.length,1);
  const copy=Object.values(l.windows).find(w=>w.id!==a.id&&w.type==='chat')!;assert.equal(copy.binding.conversationId,'conversation');
  l=resetWorkspace(l);assert.ok(l.windows[a.id]);assert.ok(l.windows[b.id]);assert.ok(!l.windows[copy.id]);
  for(const s of [...l.workspaces])l=deleteWorkspace(l,s.id);assert.equal(l.workspaces.length,1);assert.ok(l.windows[b.id]);
});
test('corrupt layout rejects duplicate references, bad graphs and oversized state',()=>{
  let l=addWindow(defaultLayout(),createWindow('demo','A'));const id=Object.keys(l.windows)[0];
  const duplicate=structuredClone(l);leaves(activeWorkspace(duplicate).root)[1].windowId=id;assert.throws(()=>validateLayout(duplicate));
  const bad=structuredClone(l);bad.windows[id].view={text:'x'.repeat(190000)};assert.throws(()=>validateLayout(bad));
  const badRatio=structuredClone(l);if(badRatio.workspaces[0].root.kind==='split')badRatio.workspaces[0].root.ratio=NaN;assert.throws(()=>validateLayout(badRatio));
  assert.throws(()=>dockWindow(l,id,'missing'));validateLayout(l);
});
test('100 cross-container operations do not duplicate or lose windows',()=>{
  let l=defaultLayout();for(let i=0;i<12;i++)l=addWindow(l,createWindow('demo',`W${i}`));
  const ids=Object.keys(l.windows);for(let i=0;i<100;i++){const id=ids[i%ids.length];l=floatWindow(l,id,i*2,i);if(i%3===0)l=dockWindow(l,id,leaves(activeWorkspace(l).root)[0].id,'right');validateLayout(l);}
  assert.equal(Object.keys(l.windows).length,12);
});
