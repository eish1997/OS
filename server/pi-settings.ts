import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { clampThinkingLevel, getSupportedThinkingLevels } from '@earendil-works/pi-ai/compat';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { resolveModelScopeFromModels } from '../node_modules/@earendil-works/pi-coding-agent/dist/core/model-resolver.js';
import { enabledModelPatternsFrom, importedLocalPaths, modelThinkingLevelsFrom, requestedThinkingLevel, thinkingLevels, type PiExecutionConfiguration, type PiExecutionProfile, type PiExecutionSettingsSnapshot, type PiThinkingLevel } from '../shared/pi-runtime.js';
import type { Entity, ModelBinding } from '../shared/contracts.js';
import { AppError, type Store } from './store.js';
import { config } from './config.js';

interface Configuration extends Entity { schemaVersion: 1; thinkingLevel: PiThinkingLevel; executionMode?: 'standard' | 'long'; networkIdleTimeoutMs?: number; userWaitTimeoutMs?: number; maxOutputTokens?: number; apiModel?: string; modelThinkingLevels?: Record<string, PiThinkingLevel>; enabledModelPatterns?: string[]; importedSkillPaths?: string[]; importedPromptPaths?: string[] }
export class PiSettings {
  private runtime?: Promise<ModelRuntime>;
  constructor(private readonly store: Store) {}
  configuration(): PiExecutionConfiguration {
    const stored = this.store.list<Configuration>('pi_execution_config')[0];
    // Reading settings does not mutate an old database or rewrite old Run policies.
    return stored ? { schemaVersion: 1, revision: stored.revision, thinkingLevel: stored.thinkingLevel, executionMode: stored.executionMode ?? 'standard', networkIdleTimeoutMs: stored.networkIdleTimeoutMs ?? 180000, userWaitTimeoutMs:stored.userWaitTimeoutMs??300000, maxOutputTokens: stored.maxOutputTokens ?? config.maxOutputTokens, apiModel: stored.apiModel || config.model, modelThinkingLevels: modelThinkingLevelsFrom(stored.modelThinkingLevels), enabledModelPatterns: enabledModelPatternsFrom(stored.enabledModelPatterns), importedSkillPaths: importedLocalPaths(stored.importedSkillPaths), importedPromptPaths: importedLocalPaths(stored.importedPromptPaths) }
      : { schemaVersion: 1, revision: 0, thinkingLevel: 'medium', executionMode: 'standard', networkIdleTimeoutMs: 180000, userWaitTimeoutMs:300000, maxOutputTokens: config.maxOutputTokens, apiModel: config.model };
  }
  async snapshot(binding?: ModelBinding): Promise<PiExecutionSettingsSnapshot> {
    const configuration = this.configuration();
    const runtime = await (this.runtime ??= ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false }));
    let availableModels = binding?.kind === 'api' && binding.provider
      ? runtime.getModels(binding.provider).map(model => ({ id: model.id, supportsImages: model.input.includes('image') }))
      : undefined;
    if (availableModels && binding?.provider && configuration.enabledModelPatterns?.length) {
      const ids = new Set(resolveModelScopeFromModels(configuration.enabledModelPatterns, runtime.getModels(binding.provider)).scopedModels.map(item => item.model.id));
      if (ids.size) availableModels = availableModels.filter(model => ids.has(model.id) || model.id === binding.model);
    }
    if (!binding?.provider || !binding.model) return { configuration, model: null, authKind: binding?.kind, availableModels };
    const model = runtime.getModel(binding.provider, binding.model);
    if (!model) return { configuration, model: null, authKind: binding.kind, availableModels };
    const requested = requestedThinkingLevel(configuration, model.provider, model.id);
    return { configuration, model: { provider: model.provider, id: model.id, supportedThinkingLevels: getSupportedThinkingLevels(model), effectiveThinkingLevel: clampThinkingLevel(model, requested),supportsImages:model.input.includes('image') }, authKind: binding.kind, availableModels };
  }
  async patternsMatch(binding: ModelBinding | undefined, patterns: string[]) {
    if (!patterns.length || binding?.kind !== 'api' || !binding.provider) return false;
    const runtime = await (this.runtime ??= ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false }));
    return resolveModelScopeFromModels(patterns, runtime.getModels(binding.provider)).scopedModels.length > 0;
  }
  async patternThinkingLevels(binding: ModelBinding | undefined, patterns: string[] | undefined) {
    if (!patterns?.length || binding?.kind !== 'api' || !binding.provider) return {} as Record<string, PiThinkingLevel>;
    const runtime = await (this.runtime ??= ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false }));
    const levels: Record<string, PiThinkingLevel> = {};
    for (const item of resolveModelScopeFromModels(patterns, runtime.getModels(binding.provider)).scopedModels) {
      if (!thinkingLevels.includes(item.thinkingLevel as PiThinkingLevel)) continue;
      levels[`${binding.provider}/${item.model.id}`] = item.thinkingLevel as PiThinkingLevel;
    }
    return levels;
  }
  async patternThinking(binding: ModelBinding | undefined, modelId: string, patterns: string[] | undefined) {
    if (!patterns?.length || binding?.kind !== 'api' || !binding.provider) return undefined;
    const runtime = await (this.runtime ??= ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false }));
    return resolveModelScopeFromModels(patterns, runtime.getModels(binding.provider)).scopedModels.find(item => item.model.id === modelId)?.thinkingLevel as PiThinkingLevel | undefined;
  }
  async freeze(binding: ModelBinding): Promise<PiExecutionProfile> {
    const { configuration, model } = await this.snapshot(binding);
    if (!model) throw new AppError(400, '固定Pi版本不支持当前模型，请选择兼容模型');
    const requested = requestedThinkingLevel(configuration, binding.provider, binding.model);
    return { schemaVersion: 1, configurationRevision: configuration.revision, requestedThinkingLevel: requested, thinkingLevel: model.effectiveThinkingLevel, autoCompaction: true, autoRetry: true, executionMode: configuration.executionMode, networkIdleTimeoutMs: configuration.networkIdleTimeoutMs, userWaitTimeoutMs:configuration.userWaitTimeoutMs };
  }
  async update(revision: unknown, thinkingLevel: unknown, binding?: ModelBinding, executionMode?: unknown, networkIdleTimeoutMs?: unknown, userWaitTimeoutMs?:unknown, maxOutputTokens?:unknown, apiModel?:unknown, modelThinkingLevels?: unknown, enabledModelPatterns?: unknown, importedSkillPaths?: unknown, importedPromptPaths?: unknown) {
    if (!Number.isSafeInteger(revision) || Number(revision) < 0 || !thinkingLevels.includes(thinkingLevel as PiThinkingLevel)) throw new AppError(400, '思考设置无效');
    if (executionMode !== undefined && executionMode !== 'standard' && executionMode !== 'long') throw new AppError(400, '执行时长档位无效');
    if (networkIdleTimeoutMs !== undefined && (!Number.isSafeInteger(networkIdleTimeoutMs) || Number(networkIdleTimeoutMs) < 10000 || Number(networkIdleTimeoutMs) > 1800000)) throw new AppError(400, '模型无响应上限须为10至1800秒');
    if(userWaitTimeoutMs!==undefined&&(!Number.isSafeInteger(userWaitTimeoutMs)||Number(userWaitTimeoutMs)<1000||Number(userWaitTimeoutMs)>86400000))throw new AppError(400,'用户答复等待上限须为1至86400秒');
    if(maxOutputTokens!==undefined&&(!Number.isSafeInteger(maxOutputTokens)||Number(maxOutputTokens)<16||Number(maxOutputTokens)>200000))throw new AppError(400,'单次输出上限须为16至200000 tokens');
    if(maxOutputTokens!==undefined&&binding?.kind==='chatgpt')throw new AppError(400,'订阅连接不在此设置输出上限；请使用订阅侧限制');
    if(apiModel!==undefined&&binding?.kind==='chatgpt')throw new AppError(400,'订阅模型请在 ChatGPT 连接里选择');
    if(apiModel!==undefined&&(typeof apiModel!=='string'||!apiModel.trim()||apiModel.length>180))throw new AppError(400,'API模型无效');
    if(apiModel!==undefined&&(binding?.kind!=='api'||!binding.provider))throw new AppError(400,'当前不是 API 连接，不能保存 API 模型');
    const nextBinding = apiModel!==undefined && binding?.kind==='api' ? { ...binding, model: String(apiModel).trim() } : binding;
    if(apiModel!==undefined){
      const runtime = await (this.runtime ??= ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false }));
      if(!runtime.getModel(binding!.provider, nextBinding!.model))throw new AppError(400,'固定Pi版本不支持所选模型');
    }
    const snapshot = await this.snapshot(nextBinding);
    if (snapshot.model && !snapshot.model.supportedThinkingLevels.includes(thinkingLevel as PiThinkingLevel)) throw new AppError(400, '当前模型不支持此思考档位');
    if (modelThinkingLevels !== undefined && modelThinkingLevels !== null && !modelThinkingLevelsFrom(modelThinkingLevels) && !(typeof modelThinkingLevels === 'object' && modelThinkingLevels && !Object.keys(modelThinkingLevels).length)) throw new AppError(400, '按模型思考档位无效');
    if (enabledModelPatterns !== undefined && enabledModelPatterns !== null && !enabledModelPatternsFrom(enabledModelPatterns) && !(Array.isArray(enabledModelPatterns) && !enabledModelPatterns.length)) throw new AppError(400, '可用模型名单无效');
    this.store.transaction(() => {
      const current = this.configuration();
      if (current.revision !== revision) throw new AppError(409, '运行设置已被更新，请重新读取后再保存');
      const mode = executionMode === undefined ? current.executionMode : executionMode as 'standard' | 'long';
      const idle = networkIdleTimeoutMs === undefined ? current.networkIdleTimeoutMs : Number(networkIdleTimeoutMs);
      const wait=userWaitTimeoutMs===undefined?current.userWaitTimeoutMs:Number(userWaitTimeoutMs);
      const output=maxOutputTokens===undefined?current.maxOutputTokens:Number(maxOutputTokens);
      const selected=apiModel===undefined?current.apiModel:String(apiModel).trim();
      let levels = modelThinkingLevels === undefined ? current.modelThinkingLevels : modelThinkingLevelsFrom(modelThinkingLevels);
      const savedModel = nextBinding?.provider && nextBinding.model ? `${nextBinding.provider}/${nextBinding.model}` : undefined;
      if (levels && savedModel) levels = { ...levels, [savedModel]: thinkingLevel as PiThinkingLevel };
      const patterns = enabledModelPatterns === undefined ? current.enabledModelPatterns : enabledModelPatternsFrom(enabledModelPatterns);
      const skills = importedSkillPaths === undefined ? current.importedSkillPaths : importedLocalPaths(importedSkillPaths);
      const prompts = importedPromptPaths === undefined ? current.importedPromptPaths : importedLocalPaths(importedPromptPaths);
      const next = current.revision === 0
        ? this.store.create<Configuration>('pi_execution_config', { id: 'pi-execution-config', schemaVersion: 1, thinkingLevel: thinkingLevel as PiThinkingLevel, executionMode: mode, networkIdleTimeoutMs: idle, userWaitTimeoutMs:wait, maxOutputTokens:output, apiModel:selected, modelThinkingLevels: levels, enabledModelPatterns: patterns, importedSkillPaths: skills, importedPromptPaths: prompts })
        : this.store.update<Configuration>('pi_execution_config', 'pi-execution-config', current.revision, { thinkingLevel: thinkingLevel as PiThinkingLevel, executionMode: mode, networkIdleTimeoutMs: idle, userWaitTimeoutMs:wait, maxOutputTokens:output, apiModel:selected, modelThinkingLevels: levels, enabledModelPatterns: patterns, importedSkillPaths: skills, importedPromptPaths: prompts });
      this.store.event('pi.settings.updated', { revision: next.revision, thinkingLevel: next.thinkingLevel, executionMode: mode, networkIdleTimeoutMs: idle, userWaitTimeoutMs:wait, maxOutputTokens:output, apiModel:selected, modelThinkingLevels: levels, enabledModelPatterns: patterns });
    });
    return this.snapshot(nextBinding);
  }
}
