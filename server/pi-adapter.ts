import * as pi from '@earendil-works/pi-coding-agent';
import { validateRuntimePaths, type PluginResourcePaths } from './plugin-runtime.js';
export type PiSession = pi.AgentSession;
export type PiModule = typeof pi;
export async function loadPi(): Promise<PiModule> {
  if (typeof pi.createAgentSession !== 'function' || typeof pi.SessionManager.create !== 'function') throw new Error('Pi 版本接口不兼容');
  return pi;
}
export async function workbenchResources(module: PiModule, cwd: string, agentDir: string, prompt: string, resources: PluginResourcePaths = {}) {
  const paths = validateRuntimePaths(resources);
  // Model retries/compaction stay host-accounted; native tools are selected by each Run.
  const settings = module.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false, provider: { maxRetries: 0 } }, cacheWarming: 'off', packages: [] });
  const loader = new module.DefaultResourceLoader({
    cwd, agentDir, settingsManager: settings,
    // Keep automatic executable discovery off. Explicit local files are still loaded by Pi.
    // Empty in-memory packages + file-only paths cannot invoke package installation.
    noExtensions: true, noThemes: true,
    additionalExtensionPaths: paths.extensions,
    additionalSkillPaths: paths.skills,
    additionalPromptTemplatePaths: paths.prompts,
    appendSystemPrompt: [prompt]
  });
  await loader.reload();
  if (loader.getExtensions().errors.length) throw new Error(`插件加载失败：${loader.getExtensions().errors.map(e => `${e.path}: ${e.error}`).join('; ')}`);
  return { settings, loader };
}
