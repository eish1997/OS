import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isFinalAssistantMessage,
  isRegenerateBaseMessage,
  resolveVersionTargets,
  type ChatVersionNativeMessage,
} from '../shared/chat-version-ops.js';

test('final assistant excludes toolCall turns', () => {
  assert.equal(
    isFinalAssistantMessage({
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: 'done' }],
    }),
    true,
  );
  assert.equal(
    isFinalAssistantMessage({
      role: 'assistant',
      stopReason: 'toolUse',
      content: [{ type: 'toolCall', id: '1', name: 'write_asset' }],
    }),
    false,
  );
});

test('regenerate base allows user and completed toolResult only', () => {
  assert.equal(isRegenerateBaseMessage({ role: 'user' }), true);
  assert.equal(isRegenerateBaseMessage({ role: 'toolResult', isError: false }), true);
  assert.equal(isRegenerateBaseMessage({ role: 'toolResult', isError: true }), false);
  assert.equal(isRegenerateBaseMessage({ role: 'assistant' }), false);
});

test('edit-resend first message uses empty history base', () => {
  const messages: ChatVersionNativeMessage[] = [
    { id: 'u1', parentId: null, role: 'user', content: 'hello' },
    {
      id: 'a1',
      parentId: 'u1',
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: 'hi' }],
    },
  ];
  const targets = resolveVersionTargets(messages);
  assert.equal(targets.editResend?.firstMessage, true);
  assert.equal(targets.editResend?.baseEntryId, null);
  assert.equal(targets.editResend?.userEntryId, 'u1');
  assert.equal(targets.regenerate?.baseEntryId, 'u1');
  assert.equal(targets.regenerate?.baseRole, 'user');
  assert.equal(targets.regenerate?.keptToolResults, 0);
});

test('regenerate after tools keeps toolResult base and does not fall back to user', () => {
  const messages: ChatVersionNativeMessage[] = [
    { id: 'u1', parentId: null, role: 'user', content: 'write file' },
    {
      id: 'a-call',
      parentId: 'u1',
      role: 'assistant',
      stopReason: 'toolUse',
      content: [{ type: 'toolCall', id: 'c1', name: 'write_asset' }],
    },
    { id: 'tr1', parentId: 'a-call', role: 'toolResult', toolName: 'write_asset', isError: false, content: 'ok' },
    {
      id: 'a-final',
      parentId: 'tr1',
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: 'wrote it' }],
    },
  ];
  const targets = resolveVersionTargets(messages);
  assert.equal(targets.regenerate?.baseEntryId, 'tr1');
  assert.equal(targets.regenerate?.baseRole, 'toolResult');
  assert.equal(targets.regenerate?.keptToolResults, 1);
  assert.equal(targets.regenerate?.targetEntryId, 'a-final');
  assert.equal(targets.editResend?.baseEntryId, null);
});

test('owned slice after continuation ignores prior turns', () => {
  const messages: ChatVersionNativeMessage[] = [
    { id: 'u0', parentId: null, role: 'user', content: 'old' },
    {
      id: 'a0',
      parentId: 'u0',
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: 'old answer' }],
    },
    { id: 'u1', parentId: 'a0', role: 'user', content: 'new', imageCount: 0 } as ChatVersionNativeMessage,
    {
      id: 'a1',
      parentId: 'u1',
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: 'new answer' }],
    },
  ];
  const targets = resolveVersionTargets(messages, 'a0');
  assert.equal(targets.editResend?.userEntryId, 'u1');
  assert.equal(targets.editResend?.baseEntryId, 'a0');
  assert.equal(targets.editResend?.firstMessage, false);
  assert.equal(targets.regenerate?.targetEntryId, 'a1');
});

test('regenerate afterCompaction when owned path carries summaryKind', () => {
  const messages: ChatVersionNativeMessage[] = [
    { id: 'u0', parentId: null, role: 'user', content: 'before' },
    {
      id: 'a0',
      parentId: 'u0',
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: 'old' }],
      summaryKind: 'compaction',
    },
    { id: 'u1', parentId: 'a0', role: 'user', content: 'after' },
    {
      id: 'a1',
      parentId: 'u1',
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: 'new' }],
    },
  ];
  const targets = resolveVersionTargets(messages);
  assert.equal(targets.regenerate?.afterCompaction, true);
  assert.equal(targets.regenerate?.targetEntryId, 'a1');
  assert.equal(targets.regenerate?.baseEntryId, 'u1');
});
