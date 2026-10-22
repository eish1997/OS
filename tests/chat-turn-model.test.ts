import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChatTurns, messageAnchor, shouldApplyHistoryPage } from '../shared/chat-turn-model.js';
import type { ConversationMessage, Run } from '../shared/contracts.js';

function message(partial: Partial<ConversationMessage> & Pick<ConversationMessage, 'id' | 'sequence' | 'role' | 'text'>): ConversationMessage {
  return { at: '2026-10-21T00:00:00.000Z', ...partial };
}

function run(partial: Partial<Run> & Pick<Run, 'id' | 'status'>): Run {
  return {
    projectId: 'p',
    taskId: 't',
    mode: 'pi',
    attempt: 1,
    cancelRequested: false,
    resultAssetIds: [],
    policy: { version: 8, projectId: 'p', toolNames: [], allowModel: true, maxCalls: 4, maxCostUsd: 4, reservePerCallUsd: 1, maxOutputTokens: 2048, timeoutMs: 120000 },
    calls: 0,
    reservedUsd: 0,
    spentUsd: 0,
    revision: 1,
    createdAt: '2026-10-21T00:00:00.000Z',
    updatedAt: '2026-10-21T00:00:00.000Z',
    ...partial,
  } as Run;
}

test('buildChatTurns groups follow-ups under the source turn id', () => {
  const active = run({ id: 'active', status: 'waiting_interaction', continuation: { runId: 'active', sessionId: 's', sha256: 'h', entryId: 'entry-1' } });
  const queued = run({ id: 'queued', status: 'queued', continueAfterRunId: 'active' });
  const messages = [
    message({ id: 'u1', sequence: 1, role: 'user', text: 'goal', runId: 'active' }),
    message({ id: 'a1', sequence: 2, role: 'assistant', text: 'partial', runId: 'active' }),
    message({ id: 'u2', sequence: 3, role: 'user', text: 'follow', runId: 'queued' }),
  ];
  const turns = buildChatTurns(messages, [active, queued]);
  assert.equal(turns.length, 1);
  assert.equal(turns[0].turnId, 'active');
  assert.equal(turns[0].messages.length, 3);
  assert.equal(turns[0].operational, true);
  assert.equal(turns[0].nativeEntryState, 'bound');
  assert.equal(turns[0].nativeEntryId, 'entry-1');
});

test('messageAnchor never invents a native entry id', () => {
  const pending = run({ id: 'r1', status: 'running', sessionId: 's' });
  const anchor = messageAnchor(message({ id: 'm1', sequence: 1, role: 'user', text: 'x', runId: 'r1' }), [pending], true);
  assert.equal(anchor.nativeEntryState, 'pending');
  assert.equal(anchor.nativeEntryId, undefined);
  assert.equal(anchor.hostMessageId, 'm1');
  assert.equal(anchor.turnId, 'r1');
});

test('history generation ignores stale pages', () => {
  assert.equal(shouldApplyHistoryPage(3, 2), true);
  assert.equal(shouldApplyHistoryPage(2, 2), true);
  assert.equal(shouldApplyHistoryPage(1, 2), false);
});
