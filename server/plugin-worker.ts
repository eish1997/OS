import { mkdirSync } from 'node:fs';
import { DefaultPackageManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { inspectPlugin, pluginEnvironmentFingerprint } from './plugin-packages.js';
import type { PluginOperation, PluginPackage } from '../shared/plugins.js';
import { protectPluginProcessTree } from './plugin-job.js';
import { assertPluginPrerequisites } from './plugin-prerequisites.js';

let finished = false;
let disconnected = false;
const send = (message: unknown) => { if (process.connected) process.send?.(message, () => {}); };
process.on('disconnect', () => {
  if (finished) return;
  disconnected = true;
  // The management host is gone. Do not leave npm/git descendants mutating files.
  if (process.platform === 'win32') process.exit(1); // Native job guardian reaps descendants even on abrupt exit.
  else { try { process.kill(-process.pid, 'SIGKILL'); } catch { process.exit(1); } }
});

process.once('message', async (input: { operation: PluginOperation; agentDir: string; packages: PluginPackage[] }) => {
  let mutationStarted = false;
  try {
    assertPluginPrerequisites(input.operation.source);
    await protectPluginProcessTree();
    const { operation, agentDir } = input; mkdirSync(agentDir, { recursive: true });
    const sources = input.packages.map(p => p.source);
    const settingsManager = SettingsManager.inMemory({ packages: sources });
    const manager = new DefaultPackageManager({ cwd: agentDir, agentDir, settingsManager });
    manager.setProgressCallback(event => send({ type: 'progress', action: event.action, phase: event.type }));
    mutationStarted = true;
    if (operation.action === 'remove') await manager.remove(operation.source);
    else if (operation.action === 'update' && sources.includes(operation.source)) await manager.update(operation.source);
    else await manager.install(operation.action === 'repair' ? input.packages.find(p => p.id === operation.packageId)?.lockedSource ?? operation.source : operation.source);
    const targets = input.packages.filter(p => p.id !== operation.packageId).map(p => p.source);
    if (operation.action !== 'remove') targets.push(operation.source);
    const packages: PluginPackage[] = [];
    for (const source of targets) packages.push(await inspectPlugin(source, agentDir));
    send({ type: 'result', packages, environmentFingerprint: pluginEnvironmentFingerprint(agentDir) });
  } catch (error) {
    // No raw npm stdout/stderr: registry URLs and shell output may contain credentials.
    const message = error instanceof Error ? error.message : '插件操作失败';
    send({ type: 'error', unchanged: !mutationStarted, error: message.replace(/https?:\/\/\S+/g, '[来源地址]').slice(0, 1500) });
  } finally { if (!disconnected) { finished = true; if (process.connected) process.disconnect?.(); } }
});
