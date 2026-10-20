import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryCredentialStore, createAssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';
import { setTimeout as delay } from 'node:timers/promises';
import { loadPi, workbenchResources } from '../server/pi-adapter.js';
import { guardPluginRegistrations, validateRuntimePaths } from '../server/plugin-runtime.js';
import { nativePiTools } from '../shared/pi-tools.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'plugin runtime '));
  const agentDir = join(root, '.host-pi'); mkdirSync(agentDir);
  const skill = join(root, '.pi', 'skills', 'existing'); mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: existing\ndescription: Existing project skill\n---\nPreserve existing skills.');
  const unwanted = join(root, '.pi', 'extensions'); mkdirSync(unwanted, { recursive: true });
  writeFileSync(join(unwanted, 'unreviewed.js'), 'throw new Error("Automatic executable discovery is forbidden")');
  // Disk settings must not be used by runtime even when a project declares packages.
  writeFileSync(join(root, '.pi', 'settings.json'), JSON.stringify({ packages: ['npm:nonexistent-workbench-probe-do-not-install'] }));
  const extension = join(root, 'extension.mjs');
  const prompt = join(root, 'probe-template.md');
  writeFileSync(prompt, '---\ndescription: Probe parameter expansion\n---\nTemplate argument: $1 / $ARGUMENTS');
  const discovered = join(root, 'discovered', 'SKILL.md'); mkdirSync(join(root, 'discovered'));
  writeFileSync(discovered, '---\nname: discovered\ndescription: Plugin discovered skill\n---\nDiscovered skill instructions.');
  writeFileSync(extension, `export default function(pi) {
    const tool = name => ({ name, label: name, description: 'Local probe', parameters: {type:'object',properties:{}}, execute:async()=>({content:[{type:'text',text:'plugin-ok'}],details:{}}) });
    pi.registerTool(tool('probe_tool'));
    pi.on('session_start',()=>{ pi.registerTool(tool('probe_dynamic')); });
    pi.on('resources_discover',()=>({skillPaths:[${JSON.stringify(discovered)}]}));
    pi.registerCommand('probe-command',{description:'Non interactive probe',handler:async(args)=>{pi.appendEntry('probe-command-result',{args});}});
    pi.on('session_shutdown',()=>{pi.appendEntry('probe-shutdown',{ok:true});});
  }`);
  return { root, agentDir, extension, prompt, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('runtime rejects package specs, directories and missing paths before any loading', () => {
  const f = fixture();
  try {
    assert.throws(() => validateRuntimePaths({ extensions: ['npm:some-package'] }), /绝对本地路径/);
    assert.throws(() => validateRuntimePaths({ extensions: [f.root] }), /解析到文件/);
    assert.throws(() => validateRuntimePaths({ extensions: [join(f.root, 'missing.ts')] }), /资源缺失/);
  } finally { f.cleanup(); }
});

test('real SDK loads explicit extension only, preserves skills and binds dynamic tools and commands', async () => {
  const f = fixture(); const pi = await loadPi();
  let session: import('@earendil-works/pi-coding-agent').AgentSession | undefined;
  try {
    const resources = await workbenchResources(pi, f.root, f.agentDir, 'host context', { extensions: [f.extension], prompts: [f.prompt] });
    assert.equal(resources.loader.getExtensions().extensions.length, 1);
    assert(resources.loader.getSkills().skills.some(s => s.name === 'existing'));
    const registry = guardPluginRegistrations(resources.loader.getExtensions(), nativePiTools);
    registry.reserveCommands(resources.loader.getPrompts().prompts.map(p => ({name:p.name,source:p.filePath})));
    const credentials = new InMemoryCredentialStore();
    await credentials.modify('openai', async () => ({ type: 'api_key', key: 'offline-probe-not-a-real-key' }));
    const runtime = await pi.ModelRuntime.create({ credentials, modelsPath: null, allowModelNetwork: false });
    const model = runtime.getModel('openai', 'gpt-5.6-sol'); assert(model);
    // Omit a fixed allowlist so lifecycle-registered tools can appear; host uses exclusions + registry guards.
    session = (await pi.createAgentSession({ cwd: f.root, agentDir: f.agentDir, modelRuntime: runtime, model, resourceLoader: resources.loader, settingsManager: resources.settings, sessionManager: pi.SessionManager.inMemory(f.root), thinkingLevel: 'off' })).session;
    const errors: string[] = [];
    await session.bindExtensions({ onError: e => errors.push(e.error) });
    assert.deepEqual(errors, []);
    assert(registry.toolSources.has('probe_dynamic'));
    assert(resources.loader.getSkills().skills.some(s => s.name === 'discovered'));
    registry.reserveCommands(resources.loader.getSkills().skills.map(s => ({name:`skill:${s.name}`,source:s.filePath})));
    for (const name of ['probe_tool', 'probe_dynamic']) {
      const tool: (typeof session.agent.state.tools)[number] | undefined = session.agent.state.tools.find(t => t.name === name); assert(tool, name);
      assert.deepEqual((await tool.execute(name, {})).content, [{ type: 'text', text: 'plugin-ok' }]);
    }
    await session.prompt('/probe-command exact user arguments');
    assert(session.sessionManager.getEntries().some(e => e.type === 'custom' && e.customType === 'probe-command-result' && (e.data as {args:string}).args === 'exact user arguments'));
    // Capture the model dispatch boundary: this verifies real SDK expansion, not a live model response.
    const dispatched: unknown[] = [];
    session.agent.prompt = async (...args) => { dispatched.push(args); };
    await session.prompt('/probe-template alpha beta');
    assert.match(JSON.stringify(dispatched.at(-1)), /Template argument: alpha \/ alpha beta/);
    await session.prompt('/skill:discovered exact skill arguments');
    assert.match(JSON.stringify(dispatched.at(-1)), /Discovered skill instructions/);
    assert.match(JSON.stringify(dispatched.at(-1)), /exact skill arguments/);
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
    assert(session.sessionManager.getEntries().some(e => e.type === 'custom' && e.customType === 'probe-shutdown'));
    const ext = resources.loader.getExtensions().extensions[0];
    const registered = ext.tools.get('probe_tool')!;
    assert.throws(() => ext.tools.set('read', registered), /名称冲突/);
    assert.throws(() => ext.tools.set('probe_tool', registered), /名称冲突/);
    const command = ext.commands.get('probe-command')!;
    assert.throws(() => ext.commands.set('probe-template', command), /名称冲突/);
    assert.throws(() => ext.commands.set('skill:discovered', command), /名称冲突/);
  } finally { session?.dispose(); f.cleanup(); }
});

test('initial reserved tool conflicts fail instead of silently replacing builtins', async () => {
  const f = fixture();
  try {
    const pi = await loadPi();
    const { loader } = await workbenchResources(pi, f.root, f.agentDir, '', { extensions: [f.extension] });
    assert.throws(() => guardPluginRegistrations(loader.getExtensions(), ['probe_tool']), /名称冲突/);
  } finally { f.cleanup(); }
});

test('loaded extension command cannot silently shadow an existing prompt template', async () => {
  const f=fixture();
  try {
    writeFileSync(f.extension,"export default pi=>pi.registerCommand('probe-template',{description:'Collision',handler:async()=>{}})");
    const {loader}=await workbenchResources(await loadPi(),f.root,f.agentDir,'',{extensions:[f.extension],prompts:[f.prompt]});
    const registry=guardPluginRegistrations(loader.getExtensions(),nativePiTools);
    assert.throws(()=>registry.reserveCommands(loader.getPrompts().prompts.map(p=>({name:p.name,source:p.filePath}))),/命令名称冲突.*probe-template/);
  }finally{f.cleanup();}
});

test('real SDK propagates plugin tool errors and abort signals through the agent loop', {timeout:12000}, async () => {
  const f=fixture();let session:import('@earendil-works/pi-coding-agent').AgentSession|undefined;
  try {
    writeFileSync(f.extension,`export default pi=>{
      const common={label:'Failure probe',description:'Failure probe',parameters:{type:'object',properties:{}}};
      pi.registerTool({...common,name:'failing_probe',execute:async()=>{throw new Error('PLUGIN_TOOL_FAILURE')}});
      pi.registerTool({...common,name:'waiting_probe',execute:async(_id,_params,signal)=>{
        pi.appendEntry('waiting-started',{});
        return new Promise((_,reject)=>{const stop=()=>{pi.appendEntry('waiting-aborted',{});reject(new Error('PLUGIN_TOOL_CANCELLED'))};if(signal.aborted)stop();else signal.addEventListener('abort',stop,{once:true});});
      }});
    }`);
    const pi=await loadPi();const resources=await workbenchResources(pi,f.root,f.agentDir,'',{extensions:[f.extension]});
    guardPluginRegistrations(resources.loader.getExtensions(),nativePiTools);
    const credentials=new InMemoryCredentialStore();await credentials.modify('openai',async()=>({type:'api_key',key:'offline-not-real'}));
    const runtime=await pi.ModelRuntime.create({credentials,modelsPath:null,allowModelNetwork:false});const model=runtime.getModel('openai','gpt-5.6-sol')!;
    session=(await pi.createAgentSession({cwd:f.root,agentDir:f.agentDir,modelRuntime:runtime,model,resourceLoader:resources.loader,settingsManager:resources.settings,sessionManager:pi.SessionManager.inMemory(f.root),thinkingLevel:'off'})).session;
    await session.bindExtensions({});
    let nextTool='failing_probe';let step=0;
    // Only the provider stream is deterministic. SDK routing, execution, error
    // receipts, and cancellation use the actual AgentSession and extension tool.
    session.agent.streamFunction=()=>{
      const stream=createAssistantMessageEventStream();const call=step++===0;
      const message:AssistantMessage={role:'assistant',content:call?[{type:'toolCall',id:'probe-'+nextTool,name:nextTool,arguments:{}}]:[{type:'text',text:'done'}],api:model.api,provider:model.provider,model:model.id,stopReason:call?'toolUse':'stop',timestamp:Date.now(),usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
      stream.push({type:'start',partial:message});stream.push({type:'done',reason:call?'toolUse':'stop',message});return stream;
    };
    await session.prompt('Run error fixture');
    assert(session.agent.state.messages.some(m=>m.role==='toolResult'&&m.isError&&JSON.stringify(m.content).includes('PLUGIN_TOOL_FAILURE')));
    nextTool='waiting_probe';step=0;const pending=session.prompt('Run cancellation fixture');
    const deadline=Date.now()+3000;while(Date.now()<deadline&&!session.sessionManager.getEntries().some(e=>e.type==='custom'&&e.customType==='waiting-started'))await delay(10);
    assert(session.sessionManager.getEntries().some(e=>e.type==='custom'&&e.customType==='waiting-started'));
    await session.abort();await pending;
    assert(session.sessionManager.getEntries().some(e=>e.type==='custom'&&e.customType==='waiting-aborted'));
    assert.equal(session.agent.state.isStreaming,false);
  }finally{session?.dispose();f.cleanup();}
});
