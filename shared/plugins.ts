import type { Entity } from './contracts.js';

export type PluginResourceKind = 'extensions' | 'skills' | 'prompts' | 'themes';
export interface PluginResource { id: string; kind: PluginResourceKind; path: string; enabled: boolean }
export interface PluginPackage {
  id: string; identity: string; source: string; kind: 'npm' | 'git' | 'local'; name: string;
  version?: string; commit?: string; lockedSource?: string; root: string; enabled: boolean; resources: PluginResource[];
  fingerprint: string; installedAt: string;
  installationState?: 'ready' | 'missing';
  lastLoad?: { runId: string; projectId: string; at: string; environmentRevision: number; error?: string };
}
export interface PluginConfiguration extends Entity {
  schemaVersion: 1; environmentRevision: number; packages: PluginPackage[];
  environmentFingerprint?: string;
  health: 'ready' | 'reconcile_required'; error?: string;
}
export type PluginAction = 'install' | 'update' | 'remove' | 'repair';
export type PluginOperationPhase = 'queued' | 'waiting_for_environment' | 'preparing' | 'applying' | 'committing' | 'completed' | 'failed' | 'reconcile_required';
export interface PluginOperation extends Entity {
  action: PluginAction; source: string; packageId: string; phase: PluginOperationPhase;
  expectedRevision: number; error?: string; progress: string; workerPid?: number; workerBirth?: string;
  startedAt?: string; endedAt?: string;
}
export interface PluginRunManifest {
  configurationRevision: number; environmentRevision: number;
  packages: { id: string; source: string; fingerprint: string; version?: string; commit?: string }[];
  resources: PluginResource[]; signature: string;
  environmentFingerprint?: string;
}
export interface DiscoveredPluginResource { kind: 'skills' | 'prompts'; name: string; path: string; source: string; managed: boolean }
export interface PluginDiscovery extends Entity { runId: string; projectId: string; resources: DiscoveredPluginResource[]; diagnostics: {type:string;message:string;path?:string}[] }
export interface PluginSnapshot { configuration: PluginConfiguration; operations: PluginOperation[]; discoveries?: PluginDiscovery[] }
