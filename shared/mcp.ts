import type {Entity} from './contracts.js';
import type {McpExposure,McpServerConfig,McpServerEntry} from '@earendil-works/pi-coding-agent';
export type McpOverride=Pick<McpServerConfig,'enabled'|'exposure'|'toolExposure'>;
export interface McpDocument {mcpServers:Record<string,McpServerConfig|McpOverride>;autoEnableCodemode?:boolean}
export interface McpConfiguration extends Entity {schemaVersion:1;active:boolean;document:McpDocument;source:string;codemode:boolean;toolSearch:boolean}
export interface McpManifest {schemaVersion:1;signature:string;enabled:boolean;globalRevision:number;projectRevision:number;servers:McpServerEntry[];autoEnableCodemode:boolean;codemode:boolean;toolSearch:boolean}
export const mcpExposures:readonly McpExposure[]=['direct','deferred','codemode','hidden'];
export type McpDiagnosticCode='needs_auth'|'program_missing'|'permission_denied'|'connection_failed'|'startup_pending'|'tools_unreachable';
export interface McpDiagnostic {server?:string;code:McpDiagnosticCode}
export type McpConnectionCode='connected'|'disconnected'|'closed';
export interface McpConnectionStatus {server:string;code:McpConnectionCode;at:string}
export const mcpConnectionLabels:Record<McpConnectionCode,string>={connected:'传输已连通',disconnected:'传输已断开',closed:'本次执行已关闭该连接'};
export const mcpDiagnosticLabels:Record<McpDiagnosticCode,string>={needs_auth:'需要登录或更新凭据',program_missing:'找不到服务程序，请检查程序路径',permission_denied:'访问被拒绝，请检查凭据或服务权限',connection_failed:'连接失败，请检查服务地址、程序及网络',startup_pending:'启动时仍在连接，工具可能稍后出现',tools_unreachable:'工具已配置，但没有启用可访问它的发现或执行工具'};
/** One-shot probe of a saved server. Not live connection state. */
export interface McpProbeResult {server:string;ok:boolean;code?:McpDiagnosticCode;toolCount?:number;at:string;note:string}
