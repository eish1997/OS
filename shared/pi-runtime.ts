import type { Entity } from './contracts.js';
export const thinkingLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type PiThinkingLevel = typeof thinkingLevels[number];
export type ModelRequestPurpose = 'agent' | 'compaction' | 'branch_summary';
export interface TaskBudgetAddition { calls: number; costUsd: number; reason: string }
export interface TaskBudgetGrant extends Entity {
  schemaVersion: 1;
  taskId: string;
  sourceRunId: string;
  resumedRunId: string;
  commandId: string;
  addition: TaskBudgetAddition;
  before: { maxCalls: number; maxCostUsd: number };
  after: { maxCalls: number; maxCostUsd: number };
}
export interface TaskBudgetSnapshot {
  latestRunId: string;
  maxCalls: number;
  maxCostUsd: number;
  usedCalls: number;
  accountedUsd: number;
  remainingCalls: number;
  remainingUsd: number;
  grants: TaskBudgetGrant[];
}
export interface ModelRequestReceipt extends Entity {
  schemaVersion: 1;
  runId: string;
  taskId: string;
  callNumber: number;
  purpose: ModelRequestPurpose;
  state: 'reserved' | 'settled' | 'unknown';
  reservedUsd: number;
  costUsd?: number;
  usage?: import('./contracts.js').ModelUsage;
  settledAt?: string;
}
export interface PiExecutionConfiguration {
  schemaVersion: 1;
  revision: number;
  thinkingLevel: PiThinkingLevel;
  executionMode: 'standard' | 'long';
  networkIdleTimeoutMs: number;
  userWaitTimeoutMs: number;
  /** Host cap for API completions. Shown only for API bindings; subscription runs still honor it as a host clamp. */
  maxOutputTokens: number;
  /** Selected API model id when not using ChatGPT; falls back to PI_MODEL. */
  apiModel: string;
  /** Exact `provider/modelId` thinking levels. Absent keys use `thinkingLevel`. */
  modelThinkingLevels?: Record<string, PiThinkingLevel>;
  /** Original enabledModels patterns. An empty filter is not stored. */
  enabledModelPatterns?: string[];
  /** Local skill files chosen by an explicit settings import. Packages are never included. */
  importedSkillPaths?: string[];
  /** Local prompt files chosen by an explicit settings import. */
  importedPromptPaths?: string[];
}
export function importedLocalPaths(value: unknown): string[] | undefined {
  const absolute = (item: string) => item.startsWith('/') || item.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(item);
  if (!Array.isArray(value) || value.length > 40 || value.some(item => typeof item !== 'string' || item.length > 500 || !absolute(item))) return undefined;
  return value;
}
export function modelThinkingLevelsFrom(value: unknown): Record<string, PiThinkingLevel> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const levels: Record<string, PiThinkingLevel> = {};
  for (const [key, level] of Object.entries(value)) {
    if (!/^[^/\s]{1,80}\/\S{1,180}$/.test(key) || /key|token|secret|password|credential|authorization/i.test(key)) continue;
    if (!thinkingLevels.includes(level as PiThinkingLevel)) continue;
    levels[key] = level as PiThinkingLevel;
    if (Object.keys(levels).length >= 40) break;
  }
  return Object.keys(levels).length ? levels : undefined;
}
export function enabledModelPatternsFrom(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 40 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 200 || /[\r\n]/.test(item))) return undefined;
  return value;
}
export function requestedThinkingLevel(configuration: Pick<PiExecutionConfiguration, 'thinkingLevel' | 'modelThinkingLevels'>, provider?: string, modelId?: string) {
  if (!provider || !modelId) return configuration.thinkingLevel;
  return configuration.modelThinkingLevels?.[`${provider}/${modelId}`] ?? configuration.thinkingLevel;
}
export interface PiExecutionProfile {
  schemaVersion: 1;
  configurationRevision: number;
  requestedThinkingLevel: PiThinkingLevel;
  thinkingLevel: PiThinkingLevel;
  autoCompaction?: boolean;
  autoRetry?: boolean;
  executionMode?: 'standard' | 'long';
  networkIdleTimeoutMs?: number;
  userWaitTimeoutMs?: number;
}
export interface PiCompactionState {
  phase: 'running' | 'completed' | 'cancelled' | 'failed';
  reason: 'manual' | 'threshold' | 'overflow';
  tokensBefore?: number;
  estimatedTokensAfter?: number;
}
export interface PiRetryState {
  phase: 'waiting' | 'retrying' | 'finished' | 'succeeded' | 'failed';
  source?: 'agent' | 'compaction' | 'branch_summary';
  attempt: number;
  maxAttempts: number;
  delayMs: number;
}
export interface PiExecutionSettingsSnapshot {
  configuration: PiExecutionConfiguration;
  model: { provider: string; id: string; supportedThinkingLevels: PiThinkingLevel[]; effectiveThinkingLevel: PiThinkingLevel; supportsImages?:boolean } | null;
  authKind?: 'api' | 'chatgpt';
  availableModels?: { id: string; supportsImages: boolean }[];
}
export interface PiSettingsPreview {
  schemaVersion: 1;
  kind: 'agent-directory' | 'project';
  applied: false;
  notes: string[];
  sessionDir?: string;
  skills: string[];
  prompts: string[];
  extensions: string[];
  themes: string[];
  packageCount: number;
  defaultTools: string[];
  defaultThinkingLevel?: string;
  defaultProvider?: string;
  defaultModel?: string;
  defaultProjectTrust?: string;
  modelThinkingLevels: Record<string, PiThinkingLevel>;
  enabledModelPatterns: string[];
  contextFiles: string[];
  resourceDirectories: string[];
  ignoredKeys: string[];
  withheld: string[];
}
export interface PiSettingsImport {
  schemaVersion: 1;
  sourceUnchanged: true;
  appliedThinkingLevel?: PiThinkingLevel;
  appliedModel?: string;
  refused: string[];
  snapshot: PiExecutionSettingsSnapshot;
}
