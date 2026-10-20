import test from 'node:test';
import assert from 'node:assert/strict';
import { addWindow, createWindow, defaultLayout, duplicateWorkspace, appendLayoutCopy, validateLayout } from '../shared/workbench-layout.js';

test('copy/import keeps one project-independent plugin manager and valid layout', () => {
  const initial = addWindow(defaultLayout(), createWindow('plugins', '插件管理', 'accidental-project'));
  const copied = duplicateWorkspace(initial, '复制'); validateLayout(copied);
  const imported = appendLayoutCopy(copied, initial); validateLayout(imported);
  const managers = Object.values(imported.windows).filter(w => w.type === 'plugins');
  assert.equal(managers.length, 1); assert.deepEqual(managers[0].binding, {});
});
