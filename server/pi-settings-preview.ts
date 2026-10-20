import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import type { ModelBinding } from '../shared/contracts.js';
import type { PiSettingsImport, PiSettingsPreview, PiThinkingLevel } from '../shared/pi-runtime.js';
import { enabledModelPatternsFrom, modelThinkingLevelsFrom, thinkingLevels } from '../shared/pi-runtime.js';
import type { PiSettings } from './pi-settings.js';
import { AppError } from './store.js';

const contextNames = new Set(['agents.override.md', 'agents.md', 'claude.md', 'system.md', 'append_system.md']);
const resourceNames = new Set(['extensions', 'skills', 'prompts', 'themes']);
const recognized = new Set(['defaultProvider', 'defaultModel', 'defaultThinkingLevel', 'modelThinkingLevels', 'thinkingBudgets', 'enabledModels', 'hideThinkingBlock', 'showCacheMissNotices', 'cacheWarming', 'steeringMode', 'followUpMode', 'externalEditor', 'doubleEscapeAction', 'treeFilterMode', 'defaultProjectTrust', 'defaultTools', 'sessionDir', 'compaction', 'branchSummary', 'theme', 'quietStartup', 'tuiMode', 'fullscreenExitOutput', 'fullscreenScrollbar', 'fullscreenCopyOnSelect', 'fullscreenWheelScrollLines', 'editorPaddingX', 'outputPad', 'autocompleteMaxVisible', 'showHardwareCursor', 'terminal', 'images', 'markdown', 'transport', 'httpProxy', 'httpIdleTimeoutMs', 'websocketConnectTimeoutMs', 'retry', 'shellPath', 'shellCommandPrefix', 'npmCommand', 'packages', 'extensions', 'skills', 'prompts', 'themes', 'enableSkillCommands']);

function textList(value: unknown, label: string, notes: string[]) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50 || value.some(item => typeof item !== 'string' || item.length > 300)) {
    notes.push(`${label}不是最多 50 条、每条不超过 300 字的字符串列表，本次不展示。`);
    return [];
  }
  return value as string[];
}

function shortText(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= 300 ? value : undefined;
}

function namesIn(directory: string, allowed: Set<string>) {
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return []; }
  return entries.filter(entry => !entry.isSymbolicLink() && allowed.has(entry.name.toLowerCase())).map(entry => entry.name);
}

function collectFiles(directory: string, out: string[], mode: 'skill' | 'prompt', depth = 0) {
  if (out.length >= 40 || depth > 6) return;
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
  if (mode === 'skill') {
    const own = entries.find(entry => !entry.isSymbolicLink() && entry.isFile() && entry.name.toLowerCase() === 'skill.md');
    if (own) { out.push(join(directory, own.name)); return; }
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(directory, entry.name);
    if (mode === 'prompt') {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push(full);
    } else if (entry.isDirectory()) collectFiles(full, out, mode, depth + 1);
    if (out.length >= 40) return;
  }
}

function localResources(base: string, entry: string, kind: 'skill' | 'prompt') {
  if (!entry || entry.startsWith('!') || entry.startsWith('+') || entry.startsWith('-') || /[*?\[]/.test(entry)) return [];
  const expanded = entry.startsWith('~') ? join(homedir(), entry.slice(entry.startsWith('~/') || entry.startsWith('~\\') ? 2 : 1)) : entry;
  const full = isAbsolute(expanded) ? resolve(expanded) : resolve(base, expanded);
  let info;
  try { info = lstatSync(full); } catch { return []; }
  if (info.isSymbolicLink()) return [];
  if (info.isFile()) {
    if (kind === 'prompt') return [full];
    return basename(full).toLowerCase() === 'skill.md' ? [full] : [];
  }
  if (!info.isDirectory()) return [];
  const found: string[] = [];
  collectFiles(full, found, kind);
  return found;
}

/** Read one explicit settings.json and explain it. Does not write, apply, or open auth.json. */
export function previewPiSettingsFile(filePath: string): PiSettingsPreview {
  if (typeof filePath !== 'string' || !filePath.trim() || filePath.length > 1000 || !isAbsolute(filePath)) throw new AppError(400, '请填写 settings.json 的绝对路径');
  const file = resolve(filePath);
  if (basename(file).toLowerCase() !== 'settings.json') throw new AppError(400, '只能预览名为 settings.json 的原版设置');
  let info;
  try { info = lstatSync(file); } catch { throw new AppError(400, '找不到这份设置文件'); }
  if (info.isSymbolicLink() || !info.isFile()) throw new AppError(400, '设置路径必须是普通文件');
  if (info.size > 256 * 1024) throw new AppError(400, '设置文件超过预览上限');
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new AppError(400, '设置文件不是有效 JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new AppError(400, '设置文件必须是 JSON 对象');
  const record = parsed as Record<string, unknown>;
  const dir = dirname(file);
  const project = basename(dir).toLowerCase() === '.pi';
  const notes = [
    '这次只预览，不修改这份原版文件，也不写入工作台运行设置。',
    project ? '这份文件位于 .pi，按原版属于项目设置。项目设置覆盖用户目录里的同名项，资源列表会合并。本次预览没有合并，也没有应用。' : '这份文件不在 .pi 目录，按原版属于用户代理目录设置。资源路径相对该目录解析。本次预览没有应用。',
    'defaultTools 里的名字和加减号是原版工具名单，不会变成工作台授权。',
    '技能、模板、扩展、主题和包来源只说明出现过，预览不会安装或执行。',
    'sessionDir 不会切换工作台的会话目录。',
  ];
  try {
    const auth = lstatSync(join(dir, 'auth.json'));
    if (auth.isSymbolicLink() || auth.isFile()) notes.push('同一目录存在 auth.json。预览没有打开它。');
  } catch { /* absent */ }
  const skills = textList(record.skills, 'skills ', notes);
  const prompts = textList(record.prompts, 'prompts ', notes);
  const extensions = textList(record.extensions, 'extensions ', notes);
  const themes = textList(record.themes, 'themes ', notes);
  const defaultTools = textList(record.defaultTools, 'defaultTools ', notes);
  let packageCount = 0;
  if (record.packages !== undefined) {
    if (!Array.isArray(record.packages) || record.packages.length > 50) notes.push('packages 不是最多 50 条的列表，本次不计数。');
    else { packageCount = record.packages.length; notes.push(`列出了 ${packageCount} 个包来源。预览不回显地址，也不会安装或执行。`); }
  }
  if ('httpProxy' in record) notes.push('设置了代理。地址不回显。');
  if ('shellCommandPrefix' in record || 'externalEditor' in record) notes.push('设置了命令前缀或外部编辑器。预览不执行，也不回显内容。');
  if (record.cacheWarming === 'streaming' || record.cacheWarming === 'idle') notes.push('原版缓存预热可能产生额外模型请求。工作台当前不启用，预览也没有打开它。');
  const compaction = record.compaction;
  if (compaction && typeof compaction === 'object' && !Array.isArray(compaction) && (compaction as { enabled?: unknown }).enabled === false) notes.push('原版这里关闭了自动压缩。工作台新任务仍使用自己的压缩设置，预览没有改它。');
  const defaultThinkingLevel = shortText(record.defaultThinkingLevel);
  if (defaultThinkingLevel) notes.push(thinkingLevels.includes(defaultThinkingLevel as typeof thinkingLevels[number]) ? `文件里的思考档位是 ${defaultThinkingLevel}。当前工作台档位没有改。` : '文件里的思考档位不在工作台可保存的档位中，没有写入。');
  const modelThinkingLevels = modelThinkingLevelsFrom(record.modelThinkingLevels) ?? {};
  if (record.modelThinkingLevels !== undefined && !Object.keys(modelThinkingLevels).length) notes.push('按模型思考档位没有可保存的条目。');
  else if (record.modelThinkingLevels && typeof record.modelThinkingLevels === 'object' && !Array.isArray(record.modelThinkingLevels) && Object.keys(modelThinkingLevels).length < Object.keys(record.modelThinkingLevels).length) notes.push('部分按模型思考档位格式无效，没有进入预览。');
  const enabledModelPatterns = enabledModelPatternsFrom(record.enabledModels) ?? [];
  if (record.enabledModels !== undefined && !enabledModelPatterns.length) notes.push('enabledModels 不是可保存的模型名单。');
  const defaultProjectTrust = shortText(record.defaultProjectTrust);
  if (defaultProjectTrust) notes.push(project ? '项目设置里的 defaultProjectTrust 按原版不会被采用。预览没有改信任。' : '用户目录里的 defaultProjectTrust 是原版项目信任的后备值。预览没有改信任，也不会自动执行项目配置。');
  const secretKeys = Object.keys(record).filter(key => /key|token|secret|password|credential|authorization/i.test(key)).slice(0, 20);
  if (secretKeys.length) notes.push(`这些字段名像凭据，值没有放进预览：${secretKeys.join('、')}。`);
  const contextRoot = project ? dirname(dir) : dir;
  const contextFiles = [...namesIn(dir, contextNames).map(name => `设置目录/${name}`), ...(project ? namesIn(contextRoot, contextNames).map(name => `项目目录/${name}`) : [])];
  const resourceDirectories = namesIn(dir, resourceNames).map(name => `设置目录/${name}`);
  if (contextFiles.length || resourceDirectories.length) notes.push('旁边的上下文文件和资源目录只确认了名字。预览没有读取正文，也没有执行。');
  const ignoredKeys = Object.keys(record).filter(key => !recognized.has(key) && !secretKeys.includes(key) && key.length <= 80).slice(0, 40);
  const withheld: string[] = [];
  if (shortText(record.sessionDir)) withheld.push('sessionDir 没有切换工作台会话目录。');
  if (defaultTools.length) withheld.push('defaultTools 没有变成工作台授权。');
  if (extensions.length || themes.length || packageCount) withheld.push('扩展、主题和包来源没有安装或执行。');
  if (skills.length || prompts.length) withheld.push('技能和模板只登记已经存在的本地文件，导入时不执行。');
  if (defaultProjectTrust) withheld.push('项目信任没有改。');
  if ('httpProxy' in record) withheld.push('代理没有写入工作台。');
  if ('shellCommandPrefix' in record || 'externalEditor' in record || 'npmCommand' in record) withheld.push('命令前缀、外部编辑器和包管理命令没有执行，也没有写入。');
  if (secretKeys.length) withheld.push('凭据字段没有写入工作台。');
  if ('compaction' in record) withheld.push('原版压缩设置没有改写工作台压缩。');
  if (record.cacheWarming === 'streaming' || record.cacheWarming === 'idle') withheld.push('缓存预热没有启用。');
  return { schemaVersion: 1, kind: project ? 'project' : 'agent-directory', applied: false, notes, sessionDir: shortText(record.sessionDir), skills, prompts, extensions, themes, packageCount, defaultTools, defaultThinkingLevel, defaultProvider: shortText(record.defaultProvider), defaultModel: shortText(record.defaultModel), defaultProjectTrust, modelThinkingLevels, enabledModelPatterns, contextFiles, resourceDirectories, ignoredKeys, withheld };
}

/** Copy the thinking level and a same-provider fixed-Pi model into workbench settings. The source file is not written. */
export async function importPiSettingsFile(filePath: string, settings: PiSettings, binding: ModelBinding | undefined, revision: unknown): Promise<PiSettingsImport> {
  const current = settings.configuration();
  if (!Number.isSafeInteger(revision) || Number(revision) !== current.revision) throw new AppError(409, '运行设置已被更新，请重新读取后再导入');
  const preview = previewPiSettingsFile(filePath);
  const before = readFileSync(resolve(filePath));
  const refused = [...preview.withheld];
  let apiModel: string | undefined;
  if (preview.defaultModel) {
    if (binding?.kind !== 'api' || !binding.provider) refused.push('当前不是 API 连接，原版模型没有写入。');
    else if (preview.defaultProvider && preview.defaultProvider !== binding.provider) refused.push('原版提供商与当前 API 提供商不同，没有切换提供商或模型。');
    else apiModel = preview.defaultModel;
  }
  const target = apiModel && binding ? { ...binding, model: apiModel } : binding;
  let probe = await settings.snapshot(target);
  if (apiModel && !probe.model) { refused.push('固定 Pi 不支持原版 defaultModel，没有写入。'); apiModel = undefined; probe = await settings.snapshot(binding); }
  const modelId = apiModel ?? (binding?.kind === 'api' ? binding.model : current.apiModel);
  const fromPattern = modelId ? await settings.patternThinking(target?.kind === 'api' ? target : binding, modelId, preview.enabledModelPatterns) : undefined;
  const fromMap = binding?.kind === 'api' && binding.provider && modelId ? preview.modelThinkingLevels[`${binding.provider}/${modelId}`] : undefined;
  let thinking = current.thinkingLevel;
  if (fromPattern && thinkingLevels.includes(fromPattern as PiThinkingLevel)) thinking = fromPattern;
  else if (fromMap) thinking = fromMap;
  else if (preview.defaultThinkingLevel) {
    if (!thinkingLevels.includes(preview.defaultThinkingLevel as PiThinkingLevel)) refused.push('原版思考档位不在可保存范围内，没有写入。');
    else thinking = preview.defaultThinkingLevel as PiThinkingLevel;
  }
  const supported = probe.model?.supportedThinkingLevels;
  if (thinking !== current.thinkingLevel && supported && !supported.includes(thinking)) {
    refused.push('目标模型不支持这份思考档位，保留当前档位。');
    thinking = current.thinkingLevel;
  }
  if (apiModel && supported && !supported.includes(thinking)) {
    refused.push('当前思考档位在原版模型上不可用，没有切换模型。');
    apiModel = undefined;
  }
  const patternsMatch = preview.enabledModelPatterns.length > 0 && await settings.patternsMatch(binding, preview.enabledModelPatterns);
  if (preview.enabledModelPatterns.length > 0 && !patternsMatch) refused.push('可用模型名单没有匹配当前提供商，没有收窄列表。');
  const patternLevels = patternsMatch ? await settings.patternThinkingLevels(binding, preview.enabledModelPatterns) : {};
  const nextLevels = modelThinkingLevelsFrom({ ...preview.modelThinkingLevels, ...patternLevels });
  const nextPatterns = patternsMatch ? preview.enabledModelPatterns : undefined;
  const base = dirname(resolve(filePath));
  const skillGroups = preview.skills.map(entry => localResources(base, entry, 'skill'));
  const promptGroups = preview.prompts.map(entry => localResources(base, entry, 'prompt'));
  const skillPaths = [...new Set(skillGroups.flat())].slice(0, 40);
  const promptPaths = [...new Set(promptGroups.flat())].slice(0, 40);
  if (skillGroups.some(group => group.length === 0)) refused.push('有些技能路径不存在、是链接，或使用了排除规则，没有登记。');
  if (promptGroups.some(group => group.length === 0)) refused.push('有些模板路径不存在、是链接，或使用了排除规则，没有登记。');
  const modelChanged = apiModel !== undefined && apiModel !== current.apiModel;
  const thinkingChanged = thinking !== current.thinkingLevel;
  const levelsChanged = JSON.stringify(nextLevels ?? current.modelThinkingLevels ?? {}) !== JSON.stringify(current.modelThinkingLevels ?? {});
  const patternsChanged = JSON.stringify(nextPatterns ?? current.enabledModelPatterns ?? []) !== JSON.stringify(current.enabledModelPatterns ?? []);
  const skillsChanged = preview.skills.length > 0 && JSON.stringify(skillPaths) !== JSON.stringify(current.importedSkillPaths ?? []);
  const promptsChanged = preview.prompts.length > 0 && JSON.stringify(promptPaths) !== JSON.stringify(current.importedPromptPaths ?? []);
  if (!modelChanged && !thinkingChanged && !levelsChanged && !patternsChanged && !skillsChanged && !promptsChanged) return { schemaVersion: 1, sourceUnchanged: true, refused, snapshot: await settings.snapshot(binding) };
  const snapshot = await settings.update(current.revision, thinking, binding, undefined, undefined, undefined, undefined, modelChanged ? apiModel : undefined, nextLevels, nextPatterns, preview.skills.length ? skillPaths : undefined, preview.prompts.length ? promptPaths : undefined);
  if (!readFileSync(resolve(filePath)).equals(before)) throw new AppError(500, '原版设置文件被改动');
  return { schemaVersion: 1, sourceUnchanged: true, appliedThinkingLevel: thinkingChanged ? thinking : undefined, appliedModel: modelChanged ? apiModel : undefined, refused, snapshot };
}
