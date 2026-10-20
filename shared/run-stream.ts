import type { Entity } from './contracts.js';
export type MessagePhase = 'partial' | 'final' | 'error' | 'cancelled';
export interface TextChunk { messageId: string; chunk: number; text: string; phase: MessagePhase; channel?: 'assistant' | 'tool_result' }
export interface RunMessage extends Entity {
  schemaVersion: 1;
  runId: string;
  nextChunk: number;
  preview: string;
  characters: number;
  phase: MessagePhase;
  channel?: 'assistant' | 'tool_result';
}
export interface ToolProgress {
  callId: string;
  name: string;
  source: string;
  sequence: number;
  phase: 'running' | 'completed' | 'failed';
  preview: string;
  resultMessageId?: string;
  outputMessageId?: string;
  outcomeUnknown?: boolean;
}
export interface ToolReconciliation { outcome: 'performed' | 'not_performed' | 'partial'; evidence: string; confirmedAt: string }
export interface ToolExecution extends Entity, ToolProgress { schemaVersion: 1; runId: string; reconciliation?: ToolReconciliation }
