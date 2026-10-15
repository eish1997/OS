export type RunStatus = 'queued' | 'running' | 'waiting_node' | 'waiting_user' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type Acceptance = 'pending' | 'passed' | 'failed' | 'needs_review';
export interface Entity { id: string; revision: number; createdAt: string; updatedAt: string; projectId?: string }
export interface Project extends Entity { name: string; description: string; archived: boolean }
export interface Conversation extends Entity { projectId: string; title: string }
export interface ResearchRequest { url: string; purpose: string }
export interface Task extends Entity { projectId: string; conversationId?: string; goal: string; acceptance: Acceptance; acceptanceNote?: string; acceptanceSourceIds?: string[]; context: { research?: ResearchRequest; projectId: string; assetIds: string[]; view: string; selectedAssetId?: string; selectedDraftId?: string; selectedDraftRevision?: number; selectedDraft?: Draft; summary?: ProjectSummary }; commandId: string }
export interface ProjectSummary extends Entity { projectId: string; goal: string; progress: string; decisions: string; nextStep: string; sourceIds: string[]; confirmed: boolean; sourceRunId?: string }
export interface ConversationMessage { id: string; sequence: number; role: 'user' | 'assistant'; text: string; at: string; runId?: string }
export interface ConversationPage { messages: ConversationMessage[]; olderThan?: number }
export interface NativeContinuation { runId:string; sessionId:string; sha256:string }
export interface SessionBinding extends Entity { projectId:string; runId:string;taskId:string;sessionId:string;sessionPath:string;cwd:string;piVersion:string;policyVersion:number;model:string;authKind:string;worker?:string;pid?:number;node?:string;reconstructed?:boolean }
export interface Run extends Entity { projectId: string; conversationId?: string; taskId: string; status: RunStatus; mode: 'pi' | 'fixture' | 'node'; attempt: number; parentRunId?: string; continuation?:NativeContinuation; continueAfterRunId?:string;cancelRequested: boolean; cancelRequestedAt?: string; timedOutAt?: string; leaseOwner?: string; leaseUntil?: number; startedAt?: string; endedAt?: string; error?: string; sessionPath?: string; sessionId?: string; workerPid?: number; workerStartedAt?: string; nodeId?: string; resultAssetIds: string[]; resultDraftIds?: string[]; policy: Policy; calls: number; modelCallsSettled?: number; modelCallsReported?: number; reservedUsd: number; spentUsd: number; usage?: ModelUsage }
export interface ModelBinding { kind: 'api' | 'chatgpt'; provider: string; model: string; connectionId?: string }
export interface ModelUsage { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; complete: boolean }
export interface ChatGPTConnection { selected: boolean; connected: boolean; enabled: boolean; account: string; connectionId?: string; model: string; maxCalls: number; timeoutMs: number; pending: boolean; limitsMode?: 'automatic' | 'custom'; limitScope?: 'task' | 'connection'; welcomePending?: boolean; error?: string; diagnostic?: {stage: 'code_exchange' | 'refresh' | 'identity_keys' | 'model_catalog'; httpStatus: number; bodyShape: 'json' | 'html' | 'other' | 'empty'; errorCode?: string; requestId?: string; at: string} }
export interface Policy { version: number; projectId: string; toolNames: string[]; allowedHosts?: string[]; allowModel: boolean; maxCalls: number; maxCostUsd: number; reservePerCallUsd: number; maxOutputTokens: number; timeoutMs: number; modelBinding?: ModelBinding }
export interface Asset extends Entity { kind?: 'research'; projectId: string; name: string; tags?: string[]; mime: string; hash: string; size: number; version: number; parentVersionId?: string; runId?: string; sourceIds: string[]; status: 'ready' | 'deleted'; deletedAt?: string; contentRemoved?: boolean; locator: string }
export interface AssetSearchPage { items: { asset: Asset; snippet: string; matched: 'name' | 'tags' | 'content' }[]; issues: { assetId: string; name: string; error: string }[]; total: number; nextOffset?: number }
export interface Memory extends Entity { projectId?: string; kind: 'preference' | 'project' | 'method' | 'temporary' | 'inference'; text: string; source: string; sourceIds?: string[]; sourceRunId?: string; confirmed: boolean; active: boolean; deleted: boolean; supersedes?: string }
export interface Draft extends Entity { projectId: string; title: string; body: string; sourceIds: string[] }
export interface InboxItem extends Entity { text: string; status: 'new' | 'linked' | 'done'; linkedProjectId?: string }
export interface LocalNode extends Entity { name: string; projectIds: string[]; capabilities: string[]; lastSeen: number; revoked: boolean }
export interface Operation extends Entity { projectId: string; runId: string; name: string; digest: string; state: 'started' | 'completed' | 'failed' | 'unknown'; result?: unknown; error?: string }
export interface WorkbenchEvent { eventId: string; sequence: number; schemaVersion: number; type: string; projectId?: string; runId?: string; revision?: number; at: string; data: unknown }
export interface Snapshot { projects: Project[]; summaries: ProjectSummary[]; tasks: Task[]; runs: Run[]; assets: Asset[]; memories: Memory[]; drafts: Draft[]; inbox: InboxItem[]; nodes: LocalNode[]; operations: Pick<Operation, 'id' | 'revision' | 'runId' | 'projectId' | 'name' | 'state' | 'error'>[]; cursor: number; config: { modelConfigured: boolean; model: string; callsRemaining: number; limitScope?: 'task' | 'connection'; budgetUsd: number; concurrentLimit: number; deployment: 'local' | 'remote'; authMode?: 'api' | 'chatgpt' } }
const transitions: Record<RunStatus, RunStatus[]> = {
  queued: ['running', 'waiting_node', 'waiting_user', 'cancelled', 'failed'],
  waiting_node: ['queued', 'running', 'cancelled'], waiting_user: ['queued', 'cancelled'],
  running: ['completed', 'failed', 'cancelled', 'interrupted'],
  completed: [], failed: [], cancelled: [], interrupted: []
};
export function canTransition(from: RunStatus, to: RunStatus) { return transitions[from].includes(to); }
