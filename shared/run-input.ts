import type {Entity} from './contracts.js';
export type RunInputState='accepted'|'queued'|'applied'|'handled'|'not_applied'|'unknown';
export interface RunInput extends Entity {schemaVersion:1;runId:string;conversationId:string;commandId:string;text:string;state:RunInputState;reason?:string}
