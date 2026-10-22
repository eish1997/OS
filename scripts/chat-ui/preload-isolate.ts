/**
 * Must load before server/config.ts. Sets a complete offline test environment so
 * local .env cannot refill billing credentials or production paths.
 * Usage: node --import ./scripts/chat-ui/preload-isolate.ts --import tsx <script>
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.env.CHAT_UI_DATA_ROOT || mkdtempSync(join(tmpdir(), 'chat-ui-isolate-'));
const apply = (key: string, value: string) => {
  process.env[key] = value;
};

apply('WORKBENCH_SKIP_DOTENV', '1');
apply('DATA_DIR', join(root, 'data'));
apply('BACKUP_DIR', join(root, 'backup'));
apply('OFFSITE_BINARY', '');
apply('OFFSITE_CONFIG', '');
apply('OFFSITE_WORK_DIR', '');
delete process.env.OFFSITE_BINARY;
delete process.env.OFFSITE_CONFIG;
delete process.env.OFFSITE_WORK_DIR;
apply('CANVAS_ENABLED', '0');
delete process.env.CANVAS_PACKAGE_DIR;
apply('PORT', '0');
apply('PUBLIC_ORIGIN', 'http://127.0.0.1:0');
apply('WORKBENCH_PASSWORD', process.env.CHAT_UI_PASSWORD || 'chat-ui-offline');
apply('PI_PROVIDER', 'openai');
// Use a model id accepted by the pinned Pi SDK; value is still a non-billing offline key.
apply('PI_MODEL', 'gpt-5.6-sol');
apply('PI_API_KEY', 'offline-chat-ui-only');
apply('PI_MAX_CALLS', '4');
apply('PI_BUDGET_USD', '4');
apply('PI_CALL_RESERVE_USD', '1');
apply('PI_MAX_OUTPUT_TOKENS', '2048');
apply('PI_TIMEOUT_MS', '120000');
apply('CHAT_UI_ISOLATED', '1');
apply('CHAT_UI_DATA_ROOT', root);
apply('WORKBENCH_PROXY_MODE', 'direct');

for (const key of [
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'PI_PRIOR_CALLS',
  'PI_PRIOR_USD',
]) {
  delete process.env[key];
}
