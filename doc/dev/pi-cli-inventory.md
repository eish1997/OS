# 固定Pi 1.0.3入口盘点

读取本地安装包的docs/slash-commands.md、settings.md、sdk.md；包入口为dist/bundle/cli.js。以下是原版入口到工作台的映射要求，不能因为SDK中没有同名按钮就认为能力不存在。状态针对工作区，未部署能力不代表用户已经获得。

| 原版入口 | 工作台对应与待补项 | 任务 |
| --- | --- | --- |
| /settings、/model、/thinking、/scoped-models | 已有档位、时长、API 输出上限与 API 模型列表选择（LOOP-103/104）；订阅模型仍在 ChatGPT 连接选择。scoped 轮换可用列表等价 | PIF-01 |
| /login、/logout | 已有ChatGPT连接与API配置，不自动读原版凭据；新主入口及断开说明待补 | PIF-01、08 |
| /llama | 原版本地llama.cpp路由管理，不是当前承诺的模型接入；明确未接入，不标成完整提供商兼容 | PIF-00兼容清单 |
| /new、/resume、/name、/session | 工作台独立话题、历史和请求明细已有；重命名/详细模型上下文统计仍需盘点并补齐清晰入口 | PIF-01、10 |
| /tree、/fork、/clone | 当前只在接续时fork文件；任意历史点分支、复制当前会话和关系视图待补 | PIF-10 |
| /compact | 自动压缩和手动任务已接；可选摘要重点见 LOOP-108 | PIF-02 |
| /import、/export | 备份不等于用户会话导入导出；JSONL导入/导出和可读历史导出待补 | PIF-10 |
| /copy | 浏览器可选择文字，但独立回复复制操作仍应提供 | PIF-06 |
| /share、/bug | 向原版服务上传会话/反馈，不纳入本轮对外发布范围；保留本地诊断导出，不自动上传 | 有意不支持远端上传 |
| /trust | 宿主显式插件信任与启用、项目权限；不可盲继承原CLI的always信任 | PIF-08、09 |
| /reload | 后续运行重读资源与环境清单；运行中的插件命令上下文动作仍需明确映射/拒绝 | PIF-08、09 |
| /hotkeys、/changelog、/quit | 网页快捷键说明、版本/能力说明、停止任务及关闭窗口等价；关闭网页不得冒充取消任务 | PIF-06、09、12 |
| 扩展命令、模板名、/skill:name | 已有托管资源加载和命令冲突检查；发现来源及参数行为的完整清单待补 | PIF-08、09 |

配置来源：原版项目设置覆盖agent-directory设置，资源列表合并。宿主当前使用内存settings和托管资源，不能宣称已经继承全部原版配置。LOOP-145 对明确指定的 settings.json 做只读预览。LOOP-146 确认后写入思考档位，以及与当前 API 提供商一致且固定 Pi 支持的 defaultModel。LOOP-147 保存 modelThinkingLevels，并按 enabledModels 收窄当前提供商的可选模型；对不上的名单不收窄。LOOP-148 把 `provider/model:档位` 的后缀写到每个匹配模型。提供商不同、凭据、sessionDir、包、扩展和 defaultTools 的 +/- 不导入。LOOP-149 只登记已存在的本地技能和模板文件。

原版默认：thinking=medium，compaction.enabled=true，reserveTokens=16384，keepRecentTokens=20000；工作区新任务恢复原生压缩默认。分支摘要有独立reserveTokens/skipPrompt，不能用普通回答档位推断摘要请求档位。steering/follow-up默认one-at-a-time，仍需产品当前运行通道。

缓存预热是额外模型请求：原版默认streaming，宿主暂明确关闭以避免产生未纳入当前生命周期的背景请求。这不是核心回答缓存被禁用的同义词，也不能宣称完全保留原版缓存优化。后续若启用，必须同样计入请求账本和取消。

codemode/tool_search/MCP是CLI默认内置扩展，SDK必须显式工厂并bindExtensions；前两者初始inactive，MCP曝光方式可能激活它们。不能只在工具名单写名字。终端主题、布局、externalEditor、双Escape等采用网页等价或明确不支持，不逐像素复刻。

未穷尽项：settings.md其余提供商、网络、渲染及资源参数，CLI启动参数与RPC命令还需逐项归类；本表是已读入口证据，不用于提前关闭PIF-00。比较任务采用干净独立副本；原版外部资源自动发现须禁用或逐项固定，避免环境差异污染结果。
