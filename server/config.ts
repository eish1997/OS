import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultStorageLimits } from './storage.js';
// Explicit local .env only. No global credential discovery.
// Chat UI offline runners set WORKBENCH_SKIP_DOTENV=1 before import to prove isolation.
if (process.env.WORKBENCH_SKIP_DOTENV !== '1' && existsSync('.env')) for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
const number = (name: string, fallback: number) => {
  const n = Number(process.env[name] ?? fallback); if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${name}`); return n;
};
const storageEnv: Record<keyof typeof defaultStorageLimits, string> = { totalBytes:'DATA_MAX_BYTES', databaseBytes:'DATABASE_MAX_BYTES', assetsBytes:'ASSET_MAX_BYTES', uploadsBytes:'UPLOAD_TEMP_MAX_BYTES', sessionsBytes:'SESSION_MAX_BYTES', workspacesBytes:'WORKSPACE_MAX_BYTES', logsBytes:'LOG_MAX_BYTES', pluginsBytes:'PLUGIN_MAX_BYTES', canvasBytes:'CANVAS_MAX_BYTES', minFreeBytes:'STORAGE_MIN_FREE_BYTES', controlReserveBytes:'STORAGE_CONTROL_RESERVE_BYTES' };
const storageLimits = { ...defaultStorageLimits };
if (process.env.CANVAS_ENABLED !== undefined && !['0','1'].includes(process.env.CANVAS_ENABLED)) throw new Error('CANVAS_ENABLED must be 0 or 1');
if (process.env.CANVAS_ENABLED === '1' && !process.env.CANVAS_PACKAGE_DIR) throw new Error('CANVAS_PACKAGE_DIR is required when canvas is enabled');
const offsitePaths=[process.env.OFFSITE_BINARY,process.env.OFFSITE_CONFIG,process.env.OFFSITE_WORK_DIR];
if(offsitePaths.some(Boolean)&&!offsitePaths.every(Boolean))throw new Error('Offsite deployment paths must be configured together');
for (const key of Object.keys(storageLimits) as (keyof typeof storageLimits)[]) storageLimits[key] = number(storageEnv[key], storageLimits[key]);
export const config = {
  canvasPackageDir: process.env.CANVAS_ENABLED === '1' ? resolve(process.env.CANVAS_PACKAGE_DIR!) : undefined,
  port: number('PORT', 4310), dataDir: resolve(process.env.DATA_DIR || 'data'), backupDir:process.env.BACKUP_DIR||undefined,
  offsite:offsitePaths.every(Boolean)?{binary:resolve(offsitePaths[0]!),configFile:resolve(offsitePaths[1]!),workRoot:resolve(offsitePaths[2]!)}:undefined,
  password: process.env.WORKBENCH_PASSWORD || '', origin: process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:4310',
  provider: process.env.PI_PROVIDER || 'anthropic', model: process.env.PI_MODEL || '', apiKey: process.env.PI_API_KEY || '',
  maxCalls: number('PI_MAX_CALLS', 0), maxOutputTokens: number('PI_MAX_OUTPUT_TOKENS', 2048),
  budgetUsd: number('PI_BUDGET_USD', 0), reservePerCallUsd: number('PI_CALL_RESERVE_USD', 1), timeoutMs: number('PI_TIMEOUT_MS', 120000), storageLimits
};
export const modelConfigured = () => Boolean(config.apiKey && config.model && config.maxCalls > 0 && config.budgetUsd > 0 && config.reservePerCallUsd > 0);
