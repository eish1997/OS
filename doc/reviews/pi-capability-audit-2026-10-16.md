# Pi 底座完整性联合复查

日期：2026-10-16。审查对象：当前工作树、正在运行的本机工作台与固定 Pi 1.0.3。三个子 Agent 分别审查核心执行、会话与长期任务、插件与界面，主 Agent 交叉核对并整合。本轮只审查并保存记录，未修改运行代码、安装插件或调用真实模型；未重跑测试，测试结论仅说明已有测试覆盖什么。

## 结论

工作台使用了真实 Pi AgentSession、工具循环与原生会话，不是单次聊天接口冒充 Agent。但是当前适配不完整，不能宣称与原版 Pi CLI 能力或体验等价。部分缺口是主动关闭或限制，另一些来自 SDK 不会自动加载 CLI 的全部能力。新增项目、资料、备份和插件管理不抵消这些差异。

前次插件管理交付与211项回归证明了当时范围内的实现，不构成完整 Pi 对照验收。没有证据支持“整体能力保留了多少百分比”，也没有同条件实测证明最终开发质量比原版差多少。

## 已保留的核心

- `server/worker.ts:104,134` 创建真正的 AgentSession 并调用 prompt，Pi 内部仍执行模型与工具的多轮循环。
- `shared/pi-tools.ts:2`、`server/app.ts:48` 保留八项原生文件、搜索和命令工具。`tests/pi-native-tools.test.ts` 实际验证文件读写修改、命令工作目录及取消，并非只核对工具名字。
- `server/native-session.ts:50–66` 使用真正的 SessionManager.forkFrom/open；已有跨项目隔离、原件保留、恢复重映射和损坏校验。
- 已接入 Skills、提示词、显式扩展、动态工具、非交互命令和生命周期。`tests/plugin-runtime.test.ts` 与 `plugin-execution.test.ts` 有真实SDK及工作进程验证，但部分使用确定性模型流或截获派发，不等于真实模型效果测试。

## 合并后的主要发现

| 优先级 | 确认的差异 | 用户影响与证据边界 | 关键证据 |
| --- | --- | --- | --- |
| 高 | 自动压缩关闭，没有宿主等价实现 | 长历史不能自动腾出上下文；项目已确认摘要只是附加输入，不能替代压缩。实际影响程度尚未做长任务对照 | `server/pi-adapter.ts:12`；`server/service.ts:67–68,250–254`；Pi `docs/compaction.md` |
| 高 | 前台会话接续限制2 MiB，备份校验允许128 MiB | 历史能保存、备份，不代表还能接着工作。单独开启压缩也未必解决，因为Pi会话文件会保留原始条目 | `server/native-session.ts:24–27`；`tests/automatic-backup.test.ts:121`已有明确边界测试 |
| 高 | 当前模型思考档位固定off | 本地模型元数据与provider映射表明当前gpt-5.6-sol请求选择reasoning.effort=none，订阅适配没有删除该字段。不能说模型完全不会推理；质量差异需同题对照 | `server/worker.ts:104`；Pi settings默认medium；pi-ai `dist/api/openai-responses.js:183–187,266–284` |
| 高 | 当前订阅每任务20次模型请求、5分钟总时长 | 正常工作的长任务可能到期被停止；同任务重试共享额度，不会自动补充次数。不是每个网络请求各有5分钟 | `server/chatgpt-auth.ts:183`；`server/service.ts:131–147`；`server/scheduler.ts:47–53`；实际实例最近Pi任务policy一致 |
| 高 | Agent自动重试关闭 | 临时错误不会像原版默认设置那样自动尝试恢复；手动重试另建attempt但保留原任务预算。恢复时仍必须核算调用且避免重放副作用 | `server/pi-adapter.ts:12`、`worker.ts:82`；`tests/chatgpt.test.ts:252`明确测试401/429/503不重试 |
| 高 | CLI内置MCP、codemode、tool_search没有适配 | 使用SDK并不自动继承这些CLI内置扩展。原版MCP配置不能据此认定在工作台可用；第三方扩展可能另作替代，但当前没有原生接入证据 | Pi `docs/sdk.md:116`；`server/pi-adapter.ts:13–22`没有extensionFactories |
| 高 | 没有原生steering通道 | 执行中发来的纠正作为后续任务排队，不改变当前执行；停止再发消息不等价于原生中途引导 | `server/worker.ts:32–36,134`仅start/reply/cancel；`service.ts:65–69`及`scheduler.ts:75–79`实现排队接续；Pi `docs/sdk.md:66–68` |
| 高 | 新版主聊天没有完整实时过程展示 | 文本等整次prompt结束后才发送最后一条；中间解释、思考和工具输出增量未转发。工具起止事件确实有保存，旧版也显示部分日志，不能说完全没有记录 | `server/worker.ts:124–145`；`server/scheduler.ts:146–172`；`src/workbench/panes.tsx:52`；`src/main.tsx:179` |
| 中至高 | 插件交互桥接缺失 | confirm/input/select/notify等没有网页对应实现；SDK默认confirm=false、输入undefined、通知无动作。交互插件可能提前退出或不产生预期动作。终端主题不必搬到网页，但基本确认和输入不应一概视作不适用 | `server/worker.ts:108`只绑定onError；Pi `dist/core/extensions/runner.js:132–160` |
| 中 | 图片附件到模型的通路未接入 | 网页能预览、选择图片，不代表图片进入模型。当前只传资产ID，read_asset按UTF-8读。原生read可以读取服务端图片并给视觉模型，因此不能说所有视觉能力缺失 | `worker.ts:30,134`；`service.ts:243`；`panes.tsx:45–47`；Pi `dist/core/tools/read.js:63–88` |
| 中 | 会话接续和配置继承不完全等价 | 每次执行fork文件，额外验证模型/策略/插件环境；为避免旧记忆复活，会替换部分历史宿主上下文与工具回执。没有原生任意节点树导航；使用项目.host-pi也不等于继承用户原版全部配置 | `server/native-session.ts:15,38–66`；`worker.ts:52`；Pi `docs/sdk.md:38,58` |

“高”表示对当前完整个人开发Agent目标影响较大，不表示安全漏洞或已经证明所有任务失败。

## 必须澄清的边界

1. 开发执行文档的长期LOOP约束的是开发工作台的Agent，不会自动成为产品内部的目标调度器。工作台目前没有“检查任意目标是否交付→修复→继续”的完整循环。原版Pi普通工具循环也不能被宣传为任意目标自动验收系统。
2. `scheduler.finish`区分运行completed与任务acceptance=needs_review，并没有把所有模型结束标为验收通过。需要改善的是持续推进与用户对状态的理解，不能将现有代码说成没有任何验收区分。
3. 2048是当前宿主配置的maxOutputTokens，但订阅payload删除max_output_tokens，不能声称当前ChatGPT订阅回答有2048 token硬上限。API模式需单独评估。
4. 自动扩展发现受控、插件变更后拒绝旧环境接续、未知操作先对账，均有保护数据和防重复执行的目的。需要改进可用性，不是直接删除这些检查。
5. 原版终端外观、按键和主题不要求逐个搬到网页；应保留或提供等价的用户能力，并明确哪些尚不支持。

## 实际实例核对

本机入口仍为 `http://127.0.0.1:4310/`。只读登录查询显示当前模型gpt-5.6-sol、任务级额度20；最近Pi执行policy为20次、300000毫秒、ChatGPT订阅模式。读取目标配置得到maxOutputTokens=2048，按上节限定解释。没有输出凭据或用户正文。

主Agent核对 `server/pi-adapter.ts`、`server/worker.ts`、`server/native-session.ts`、`shared/pi-tools.ts` 与F:/AI/OS部署文件内容一致。HEAD为d2659ff75a77e822cc881da84fb15ee2eea9c8f2，存在未提交实现，因此不能只用该commit代表被审查内容。

## 建议后续交付标准

先建立原版能力清单，逐项标明保留、改造、关闭、未接入和有意不支持，不使用单个“兼容Pi”标签概括。

第一批处理长期工作基础：压缩与2 MiB接续门槛一起设计，开放模型支持的思考选择，让合理重试受预算核算约束，显式展示并设计长任务额度、时限和恢复方式。不能仅把所有开关打开就宣称修复。

第二批处理可见和可控：文本及工具过程流式展示、执行中引导、网页确认/输入/通知桥接；同时补齐CLI内置MCP等能力的适配或明确支持路线。图片附件与会话树按需求补齐。

最终用相同模型、思考档位、代码项目、任务和合理预算对照原版Pi，覆盖复杂代码修改、长历史、临时网络错误、中途纠正、MCP工具、交互插件和图片输入。比较实际产物、独立验收结果、恢复成功率、耗时与消耗，而不是只比较测试数量。可先用确定性故障注入验证协议，再在约定额度内做真实模型对照。

本轮交付是审查记录，不代表上述缺口已经实现或全部能力已完成穷尽审计。
