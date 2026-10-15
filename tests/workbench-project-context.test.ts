import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultLayout,addWindow,createWindow,floatWindow} from '../shared/workbench-layout';
import {selectProject,updateProjectWindow} from '../src/workbench/project-context';
test('project switching preserves geometry and isolates conversation, drafts and assets',()=>{
  const w=createWindow('chat','Pi','A');w.binding.conversationId='conversation-A';w.view={input:'draft A',assetIds:['asset-A']};
  const a=floatWindow(addWindow(defaultLayout(),w),w.id,101,120);
  const b=selectProject(a,'B');assert.deepEqual(b.floating,a.floating);assert.deepEqual(b.workspaces,a.workspaces);
  assert.equal(b.windows[w.id].binding.conversationId,undefined);assert.equal(b.windows[w.id].view.input,undefined);
  updateProjectWindow(b.windows[w.id],'B',{input:'draft B'},'conversation-B');
  updateProjectWindow(b.windows[w.id],'A',{input:'late A'});
  assert.equal(b.windows[w.id].view.input,'draft B');
  const restored=selectProject(b,'A');assert.equal(restored.windows[w.id].view.input,'late A');assert.equal(restored.windows[w.id].binding.conversationId,'conversation-A');assert.deepEqual(restored.windows[w.id].view.assetIds,['asset-A']);
  const again=selectProject(restored,'B');assert.equal(again.windows[w.id].view.input,'draft B');assert.equal(again.windows[w.id].binding.conversationId,'conversation-B');
});
