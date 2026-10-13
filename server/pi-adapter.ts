import * as pi from '@earendil-works/pi-coding-agent';
export type PiSession = pi.AgentSession;
export type PiModule = typeof pi;
export async function loadPi(): Promise<PiModule> {
  if (typeof pi.createAgentSession !== 'function' || typeof pi.SessionManager.create !== 'function') throw new Error('Pi 版本接口不兼容');
  return pi;
}
export async function workbenchResources(module: PiModule, cwd: string, agentDir: string, prompt: string) {
  // Model retries/compaction stay host-accounted; native tools are selected by each Run.
  const settings = module.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false, provider: { maxRetries: 0 } }, cacheWarming: 'off', packages: [] });
  const loader = new module.DefaultResourceLoader({
    cwd, agentDir, settingsManager: settings,
    // Third-party executable extensions require a separate, reviewed activation path.
    noExtensions: true, noThemes: true,
    appendSystemPrompt: [prompt]
  });
  await loader.reload();
  return { settings, loader };
}
