import type {Entity} from './contracts.js';

export type PluginInteractionKind='confirm'|'input'|'select';
export type PluginInteractionState='pending'|'answered'|'delivered'|'closed'|'expired';
export interface PluginInteraction extends Entity {
  schemaVersion:1;runId:string;source:string;kind:PluginInteractionKind;
  title:string;message?:string;options?:string[];expiresAt:string;
  state:PluginInteractionState;answerCommandId?:string;answeredAt?:string;
  deliveredAt?:string;closedReason?:string;
}
export interface PluginInteractionRequest {
  id:string;source:string;kind:PluginInteractionKind;title:string;
  message?:string;options?:string[];timeoutMs:number;
}
export type PluginInteractionAnswer=boolean|string|null;
export interface PluginNotice extends Entity {schemaVersion:1;runId:string;source:string;level:'info'|'warning'|'error';message:string;truncated?:boolean}
