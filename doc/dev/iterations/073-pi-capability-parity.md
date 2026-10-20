# 073 Pi能力保留与体验补齐

## DeepSeek 授权续跑：长历史对照与 >5 分钟执行

用户追加 100 次调用（总顶 120）后 `loop-165` 五段通过：工作台多文件预定检查、原版长历史、两侧本地 MCP、模型+powershell 约 323s 并接续。累计约 52 次 / ≈$0.020。PIV-05 与 PIV-16 三类关闭。其后 `loop-170` 关闭 F13/PIV-13 真实识图（`deepseek-flash` 工作台可核对；累计约 56 次 / ≈$0.021）。F17 合并/部署仍开；交付为 dulse 验证后合并 main。候选 build/probe 见 loop-164；串行全套 loop-169。

## DeepSeek 真实模型：多文件对照通过

固定 Pi 1.0.3 支持 `deepseek` / `deepseek-flash`（`api.deepseek.com`）。思考可用 `off`/`low`/`high`/`max`，**不支持 medium**；两侧同用 `high`。工作台与原版 coding-agent 均修好 `calc.ts` 的 `add`。工作台 5 次请求、目录价约 $0.00216；另有 1 次探活。密钥仅环境变量，未写入源码/证据。视觉样本与部署未做。证据 `output/dev-evidence/pi-parity/loop-160/`。

## 窄窗键盘缩放总检

主界面一次走通设置、查看请求、指导纠正、交互确认、额度恢复；含 800×600 窄窗、键盘 Tab、真实 Chrome 150% 缩放与第二浏览器上下文同步。证据 `output/dev-evidence/pi-parity/loop-159/`。无外部模型、无部署。

## 预算与重试次数页面记录

页面可见临时故障恢复的两次模型请求，以及认证失败的单次请求；失败计入同一任务额度；401 路径无自动重试文案；人工追加后累计仍保留。工程路径仍由 `tests/pi-retry-worker.test.ts` 证明。证据 `output/dev-evidence/pi-parity/loop-158/`。无外部模型、无部署。

## 近上限导入备份还原后可接续

约 120MiB 原件导入并 fork 后做备份还原，还原会话可打开并追加接续；同次记录扫描耗时与 workerPeakRss。127MiB 既有扫描数字一并收录。未提高配额。证据 `output/dev-evidence/pi-parity/loop-157/`。无外部模型、无部署。

## 离线六工具一次总检

同一离线会话完成写、编辑、读、grep、find、powershell 与取消；取消后已有文件内容不变。不是真实模型驱动样本。证据 `output/dev-evidence/pi-parity/loop-156/`。无外部模型、无部署。

## 导入档位进入新任务，兼容说明成文

设置页导入思考档位后，之后提交的新任务 policy 为 high；导入前已提交的任务仍是 medium。使用说明列出终端自定义组件、编辑器、主题和五种会话动作不支持。PIV 记录索引见 `doc/dev/piv-records.md`。证据 `output/dev-evidence/pi-parity/loop-155/`。无外部模型、无部署。

## 四类操作中断对账表已闭合

流式消息、交互答复、追加预算、分支创建各自验证了：写入前失败不落库、事务中回滚不留半截授权或话题、提交后同一命令键重放不重复副作用。矩阵写在 `doc/dev/pi-interrupt-matrix.md`。综合证据 `output/dev-evidence/pi-parity/loop-154/`。无外部模型、无部署。

## 摘要转述拒绝与进程说明收尾

复制整理时，除字面与空白改写外，若摘要仍同时含有已删除记忆的主要关键词，整段摘要改为「已删除记忆」，原件不变。固定夹具里的 private note 转述不再进入副本。纯同义词且无共享词无法识别，写入兼容限制。进程回收矩阵各格已有证据或使用说明，矩阵外不再改代码。原版对照准备见 `doc/dev/pi-comparison-prep.md`（缺模型账户与预算，未发请求）。证据 `output/dev-evidence/pi-parity/loop-153/`。无外部模型、无部署。

## 流式后缀与工具预览页面已走通

对话里最终回复比已收到的增量更长时，页面显示补上的后缀，刷新后仍是同一条消息。工具在正常收尾前若还有未到期的预览，页面工具面板能看到，刷新后仍在。证据 `output/dev-evidence/pi-parity/loop-152/`。无外部模型、无部署。

## MCP 登录与连接状态页面已走通

用户在插件管理里探测需要登录的服务后，可点「开始登录」。页面只显示授权地址，不自动打开浏览器，也不显示令牌。令牌只写入私有文件。同一页可探测本地 stdio 服务并看到工具数量。对话里的「MCP 当前传输」先显示已连通，再显示已断开。另一次受控执行调用了本地 MCP 工具。证据 `output/dev-evidence/pi-parity/loop-151/`。这不是持续打开的原生连接面板。无外部模型、无部署。

## 设置导入页面已走通

用户在设置里填写原版 `settings.json` 的路径，先预览，再确认。页面显示思考档位已写入，并显示登记了 2 个本地技能和 1 个模板。刷新后这些数字还在。原文件没有被改。扩展和包没有安装或执行。证据 `output/dev-evidence/pi-parity/loop-150/`。这不代表 PIV-10 全部完成，包和扩展的实际调用仍见有限剩余清单 F2。无外部模型、无部署。

## LOOP-149：确认导入只登记已经存在的本地技能和模板

上轮 LOOP-148 把模型名单上的思考后缀记到匹配模型。本轮补本地技能和模板。设置里的相对路径按该设置文件所在目录解析。目录里有普通 `SKILL.md` 时，登记这个文件；模板登记普通文件。缺失路径和以 `!` 开头的排除规则不登记。确认之后，这些路径会随之后的新任务交给 Pi 的资源加载器。测试里技能名 `imported-demo` 和模板 `review.md` 能被加载出来，扩展脚本没有加载，包名没有进入结果。原文件字节不变。证据 `loop-149/report.json`。这不是安装 npm 或 git 包，也没有在浏览器里点击。无外部模型、无部署。

## LOOP-148：模型名单上的思考后缀会记到每个匹配的模型

上轮 LOOP-147 保存了按模型档位，并用模型名单收窄列表。名单里的 `provider/model:low` 这种后缀当时只影响正在导入的那一个模型。本轮把后缀写进每个匹配模型的档位。测试里名单是 `openai/另一个模型:low`，总档位是 `medium`。导入后，那个模型的新任务请求 `low`，当前模型不在名单里，仍请求 `medium`。原文件字节不变。证据 `loop-148/report.json`。技能和包仍然不会安装或执行，也没有在浏览器里点击。无外部模型、无部署。

## LOOP-147：按模型的思考档位会进入新任务，模型名单会收窄可选模型

上轮 LOOP-146 只导入一份总思考档位和同提供商模型。本轮补原版的按模型档位和可用模型名单。`modelThinkingLevels` 里格式有效的 `provider/model` 会保存。新任务冻结时，当前模型有单独档位就用它，没有则用总档位。测试里 `openai/gpt-5.6-sol` 冻结为 `high`，另一个支持 `low` 的模型冻结为 `low`。之后在界面保存当前模型的档位，只改这一条，另一条保持 `low`。`enabledModels` 能匹配当前提供商时，模型列表只留下匹配项和当前模型。名单对不上当前提供商时不收窄，已保存的名单保持不变。名字像凭据的条目不写入。原文件字节不变。证据 `loop-147/report.json`。技能、包和上下文文件仍然不会导入，也没有在浏览器里点击。无外部模型、无部署。

## LOOP-146：确认后，只把原版思考档位和同提供商模型写入新任务

上轮 LOOP-145 可以预览原版 `settings.json`，但不会写入工作台。本轮在预览之后增加确认导入。导入重新读取该文件，只把可保存的思考档位，以及与当前 API 提供商一致且固定 Pi 支持的模型，写入之后的新任务。测试里档位变成 `high`，模型换成目录中另一个支持该档位的模型；原文件字节不变，结果和事件里都没有凭据。`defaultTools`、`sessionDir`、包来源、压缩开关和凭据字段被拒绝。提供商不同时不切换模型，已写入的模型保持不变。未登录、其他网站来源和过期版本分别得到 401、403 和 409。证据 `loop-146/report.json`。按模型单独指定的思考档位、可用模型名单、技能和包仍然不会导入，也没有在浏览器里点击导入按钮。无外部模型、无部署。

## LOOP-145：原版 settings.json 可以预览，不会被改写或套用

上轮 LOOP-144 在 shell 退出后结束已经记下的子进程。本轮补原版配置的预览。指定一份绝对路径上的 `settings.json` 后，预览说明它属于项目 `.pi` 还是用户代理目录，并列出 sessionDir、技能、模板、扩展、defaultTools、思考档位和旁边的上下文文件名。同一目录的 `auth.json` 不打开。代理地址、包地址、命令前缀和名字像凭据的字段值不出现在结果里。预览不修改原文件，也不改变工作台已保存的运行设置。未登录不能预览，其他网站来源的请求被拒绝。证据 `loop-145/report.json`。这不是把原版设置导入为当前任务配置，也没有在浏览器里点击预览按钮。无外部模型、无部署。

## LOOP-144：shell 退出后，仍结束它活着时已经记下的子进程

上轮 LOOP-143 在正常收尾时写下尚未到期的工具预览。本轮补进程记录。执行拉起 shell 后，只要这个 shell 还在，就把它当时的后代和创建时间写入本次执行的启动记录。shell 退出之后，这些已经记下的进程不再依赖 shell 仍活着。测试先确认子进程和创建时间都已写入，再让 shell 退出，子进程此时仍在；随后只结束创建时间相符的记录。创建时间写错的进程保持运行。证据 `loop-144/report.json`。某次进程列表还没看到、父进程就已经退出的后代，仍然不会被记入。没有经过这次启动记录的进程也无法归属。无外部模型、无部署。

## LOOP-143：工具预览在收尾时先写入，不必再等节流

上轮 LOOP-142 补上了最终回复里比增量更长的后缀。本轮补工具预览的收尾。进度更新先进入 200 毫秒节流。执行正常结束并调用 `finish` 时，如果这份预览还没写过，会按仍在运行的进度再记一笔，然后才等待写盘完成。测试里开始记录是“开始执行”，随后的局部结果是 `PARTIAL_TOOL`，不等待计时器就结束流，读回的预览是 `PARTIAL_TOOL`，阶段仍是 `running`，序号为 1。证据 `loop-143/report.json`。这是正常收尾，不是进程被杀死时把内存里的预览刷盘，也没有在浏览器里点击工具面板。无外部模型、无部署。

## LOOP-142：最终回复比增量更长时，补进同一条消息

上轮 LOOP-141 记下了执行拉起的进程。本轮补流式正文的收尾。增量先到达 `HELLO`，结束事件里的正文是 `HELLO TAIL` 时，保存结果仍是一条助手消息，内容是 `HELLO TAIL`，状态为最终。既有长文测试仍是同一条消息，重开后可以读到完整正文。证据 `loop-142/report.json`。结束事件里的正文如果更短，不覆盖已经记下的增量。这不是浏览器里重新点击刷新。无外部模型、无部署。

## LOOP-141：记下本次执行拉起的进程，结束后仍能结束它后来出现的子进程

上轮 LOOP-140 在执行消失后把仍标成已连通的传输改为已断开。本轮补进程归属。工作进程在加载 Pi 之前装上启动记录。Pi 拉起 shell 时，把 PID 和创建时间写入本次执行目录并刷盘。执行失联或进程退出后，只结束创建时间仍然相符的记录。测试里，这个 shell 后来又拉起的子进程随之结束；另一条创建时间写错的进程保持运行。证据 `loop-141/report.json`。创建时间还没记下就退出的进程不会凭 PID 补杀。没有经过这次启动记录的进程仍然无法归属。无外部模型、无部署。

## LOOP-140：执行进程消失后，仍标成已连通的 MCP 传输改为已断开

上轮 LOOP-139 核对了数据库提交边界。本轮补执行进程消失后的传输记录。失联中断和执行进程退出时，状态仍是 `connected` 的服务改为 `disconnected`，并各写一条 `run.mcp_connection`。已经是 `closed` 的服务保留原来的时间。再次调度不会重复改写。证据 `loop-140/report.json`。这是执行记录里的当前传输，不是原生 `/mcp` 面板，也没有在浏览器里点击。根进程消失后才出现的子进程仍无法归属。无外部模型、无部署。

## LOOP-139：数据库提交前被杀死会丢掉未提交内容

上轮 LOOP-138 在失联进程仍在时保留未绑定副本。本轮补业务数据库自己的两个边界。打开数据库时固定 `synchronous=FULL`。进程在 `BEGIN IMMEDIATE` 写入一行之后、`COMMIT` 之前被杀死，重新打开只有此前已经提交的 `ANCHOR`，没有 `UNCOMMITTED`。另一轮在第二条记录提交返回之后、进程退出之前被杀死，重新打开同时看到 `ANCHOR` 和 `COMMITTED`。证据 `loop-139/report.json`。这是 SQLite 事务，不是会话 JSONL，也不是断电时主文件被写到一半的扇区恢复。无外部模型、无部署。

## LOOP-138：失联执行仍在时，先保留未绑定副本

上轮 LOOP-137 把未发布标记留到会话路径写入之后。若那时宿主已经退出而执行进程还在，下次打开会在进程结束前删掉它正在使用的副本。本轮在仍有存活执行进程时跳过这份清理。重新打开先看到副本和标记都在。调度器确认命令行是 `server/worker.ts` 并结束后，再删除未绑定副本。命令行是其他程序时不结束该进程，未绑定副本仍然删除。证据 `loop-138/report.json`。命令行读不到时不删除，避免把还在使用的文件清掉。这不是数据库写到一半的恢复。无外部模型、无部署。

## LOOP-137：整理完成后的未发布标记留到会话路径写入之后

上轮 LOOP-136 的元数据条目为有效进度。本轮补会话副本的绑定窗口。`rewriteForkInPlace` 整理成功后不再删除 `*.jsonl.unpublished`。执行记录写入 `sessionPath` 之后，调度器才去掉这份标记，并且只处理位于该次会话目录内的普通文件。整理已经完成但还没有 `sessionPath` 时，下次打开会删除这份副本和标记。已经写入路径的会话正文保留。目录外的标记不会被去掉。失败的整理仍会删掉副本和标记，不留下新文件。证据 `loop-137/report.json`。写到一半被杀死时标记仍在。这不是数据库写到一半的恢复，也不是导入原件。无外部模型、无部署。

## LOOP-136：固定 Pi 的模型、思考、用量、标签和自定义条目可以扫描并接续

上轮 LOOP-135 未绑定副本为有效进度。本轮用固定 Pi 1.0.3 的 `SessionManager` 在同一会话里写下用户消息，以及 `thinking_level_change`、`model_change`、`usage`、`custom`、`session_info`、`label`、`custom_message`。只读扫描的条目数与 SDK 的 `getEntries().length` 一致。导入结构检查接受这些条目，并记下最后一次模型为 `gpt-5.6-sol`。接续后重新打开，上下文仍含 `META_USER`，副本里仍有 `model_change`。原件字节不变。证据 `loop-136/report.json`。无产品改动。这不是 PIV-01–18 的任务对照，也没有覆盖原版尚未在本轮写入的其他条目形态。无外部模型、无部署。

## LOOP-135：整理副本写到一半被杀死后，下次打开会去掉这份未绑定副本

上轮 LOOP-134 后出现的子进程为有效进度。本轮补会话副本整理的中断标记。`rewriteForkInPlace` 开始时写下 `*.jsonl.unpublished`，整理成功后才删除。进程在整理过程中被杀死时，标记留在原件旁边，原件字节不变。下次打开工作台时，没有被任何执行的 `sessionPath` 指向的这份副本和标记会一起删除；已经绑定到执行的会话只去掉标记，正文保留。同目录里残留的 `*.jsonl.readable` 前缀文件也会删除。证据 `loop-135/report.json`。既有中断整理测试仍能看到未完成副本里的旧记忆。这不是导入原件，也不是数据库写到一半的恢复。无外部模型、无部署。

## LOOP-134：第一次进程列表之后出现的子进程，在根进程仍在时会被再列一次并结束

上轮 LOOP-133 失联执行为有效进度。本轮补强停窗口：结束前先列出后代，等待 200 毫秒后再列一次。第二次才出现、父进程仍是该根进程的子进程会加入同一份清理名单。只结束根进程的调用失败时，这份名单里的后出现子进程仍会被结束。证据 `loop-134/report.json`。根进程在第一次列表前已经消失，仍不能据此确认清理。根进程消失之后才出现、已经无法从进程表归属的进程仍不在这次清理里。无外部模型、无部署。

## LOOP-133：宿主重启后结束失联的执行进程，不误杀其他 PID

上轮 LOOP-132 导入写盘为有效进度。本轮补调度器重新打开后的失联执行：租约已过期且当前宿主没有该执行的进程句柄时，先看进程命令行。命令行仍包含 `server/worker.ts` 时结束该进程树，再把执行标成失联中断，未对账前不能重试。命令行不是这个脚本的 PID 保持运行。证据 `loop-133/report.json`。待答失联回归仍通过。命令行读不到时不根据 PID 结束进程。这不是写盘中途杀死宿主后的文件恢复，也不是快照之后才出现的未登记进程。无外部模型、无部署。

## LOOP-132：导入写盘中途杀死宿主后按原字节续写

上轮 LOOP-131 传输状态为有效进度。本轮补原生会话导入的三个写盘边界。写入开始前被杀死时，文件仍是空的，重新打开后按同一块字节写完。写入前 8 字节后被杀死时，原件保留这段前缀，续写补上剩余字节且不另起一份文件。刷盘完成后、调用返回前被杀死时，再次提交同一块字节被接受。内容不同的重试被拒绝，已落盘字节不变。证据 `loop-132/report.json`。既有导入分块测试 2 项通过。没有检查点时仍按整块写入。这不是会话 JSONL 追加，也不是上传登记。其余宿主写盘监督仍待。无外部模型、无部署。

## LOOP-131：MCP 传输断开后，当前状态从已连通变为已断开

上轮 LOOP-130 中部损坏拒绝为有效进度。本轮补执行中的传输状态：固定 Pi 的 stdio 传输在 `start` 完成后记为已连通；服务进程自行退出、不是本次执行主动关闭时，同一服务的当前状态改为已断开。运行记录只保留每个服务的最新状态，并写下两次 `run.mcp_connection`。未知服务名被拒绝。证据 `loop-131/report.json`。这是传输起止，不是原生 `/mcp` 持续面板，也不代替单次探测或登录提醒。当前传输面板没有在浏览器里点击。宿主崩溃监督仍待。无外部模型、无部署。

## LOOP-130：文件中部已换行的损坏拒绝整份会话

上轮 LOOP-129 OAuth 登录地址为有效进度。本轮核对会话中部损坏：在 `BEFORE_GAP` 与 `AFTER_GAP` 之间插入一条已经换行、但 JSON 不完整的记录时，扫描、接续和分叉都返回 422。后面仍然有效的 `AFTER_GAP` 不会被跳过使用，也不会生成临时前缀副本或新的会话文件。中部一行里的非法 UTF-8 同样拒绝整份文件，原件字节保持损坏内容。证据 `loop-130/report.json`。这不是末尾半截记录，也不是把中部损坏修掉。其余宿主写盘监督仍待。无产品改动、无外部模型、无部署。

## LOOP-129：MCP OAuth 登录给出地址，令牌只进私有文件

上轮 LOOP-128 未知记录版本为有效进度。本轮用固定 Pi 的 OAuth 流程补 PIF-08：对没有 Authorization 头、也没有静态 auth 的 HTTP MCP，用户点击开始登录后得到授权地址。工作台不自动打开浏览器。回调在 127.0.0.1 上接收授权码并换令牌，令牌写入 `private-model/mcp-oauth.json`，接口响应里没有 access token。已有令牌后再探测，不再直接返回 needs_auth。证据 `loop-129/report.json`。本地授权服务测试通过。登录按钮没有在浏览器里点击。持续连接状态仍待。无外部模型、无部署。

## LOOP-128：未知版本的指导、回复和工具记录不改原文

上轮 LOOP-127 事件与请求回执为有效进度。本轮把同一规则用到指导、回复和工具记录。缺版本的指导在视图里显示为不受支持，更新回执被拒绝，库内仍是 accepted。版本 2 的回复不能再追加分块，预览保持 CURRENT。缺版本且仍为 running 的工具不能追加进度，也不能写入核对结论；它不按当前待核对项挡住接续，也不会随核对结果交给下一次执行。工具面板对这种记录显示“版本不受支持”，不提供当前核对表单。证据 `loop-128/report.json`。指导回执和工具进度回归通过。工具面板没有在浏览器里点击。无外部模型、无部署。

## LOOP-127：未知版本的事件和请求回执不按当前契约使用

上轮 LOOP-126 半截 Pi 记录为有效进度。本轮补事件与账本迁移：会话历史和回复分块只读取 `schemaVersion` 为 1 的事件；缺版本的请求回执在结算时拒绝，库内原文仍是 reserved，费用不变。页面刷新历史时也不把其他版本的事件当成当前回复。证据 `loop-127/report.json`。账本分页测试和流式回放测试通过。序号游标不改。会话 JSONL 兼容与原版对照仍待。无外部模型、无部署。

## LOOP-126：Pi 写出半截会话记录后被杀死，锚点仍可接续

上轮 LOOP-125 末尾半截记录为有效进度。本轮用固定 Pi 的 `SessionManager` 先写完 `PI_ANCHOR`，再在它生成的下一条记录只落盘前 48 字节时 SIGKILL。扫描得到的 `tornTailBytes` 等于锚点之后的字节数。接续上下文含 `PI_ANCHOR`，不含 `KILL_THIS_ENTRY`。接续后原件字节不变，临时前缀副本被删除。证据 `loop-126/report.json`。这是 Pi 自己的条目被截断，不是文件中部已换行的损坏行。无外部模型、无部署。

## LOOP-125：会话末尾半截记录留在原件，接续只用完整前缀

上轮 LOOP-124 上传恢复为有效进度。本轮补会话 JSONL 写到一半的尾部：完整换行之前的条目仍可校验；最后一段无法解析的字节记为 `tornTailBytes`，校验值覆盖整个原件。接续时把完整前缀复制到临时文件再交给固定 Pi 分叉，成功或失败后都删除该临时文件。原件字节保持半截内容。已经换行的损坏行仍拒绝整份文件，原件不改。证据 `loop-125/report.json`。文件中部损坏、宿主在 Pi 写盘过程中被杀死的现场仍待。无外部模型、无部署。

## LOOP-124：上传写盘中途杀死宿主后按冻结校验恢复

上轮 LOOP-123 进程树快照为有效进度。本轮补上传的三个写盘边界：字节先写入 `*.partial`，刷盘后改名为暂存文件，再把记录改成 committing 并挪到资产目录。宿主在暂存已落盘、已记意图、或已改名但尚未登记时被 SIGKILL，重新打开后按创建时冻结的校验登记为同一资产；再次提交相同字节返回该资产。半截 `.partial` 在打开时丢弃，不登记，上传保持 pending。证据 `loop-124/report.json`。没有冻结校验的旧上传不会被自动登记。会话 JSONL 与其他宿主写盘仍待。无外部模型、无部署。

## LOOP-123：强停以快照核对进程树，而不是只看 taskkill 退出码

上轮 LOOP-122 会话夹具为有效进度。本轮补 PIF-09 强停边界：终止前用一次进程表记下根进程仍在时的后代。`taskkill` 报错后，只要这些进程都已结束，清理仍算确认；若还有残留，再对残留进程做进程树终止。根进程在快照前已经消失时，不能据此认为原先的子进程已清理，调用结果仍为失败。证据 `loop-123/report.json`：注入的首次终止失败仍回收父进程和子进程；已退出且无法快照的 PID 返回 false；快照后进程自行退出且没有后代时确认为已清理。750ms 收尾窗口仍在。宿主进程被杀死时的写盘监督、快照之后才出现的未登记进程仍待。无外部模型、无部署。

## LOOP-122：固定 1.0.3 会话夹具可重开且只读扫描一致

上轮 LOOP-121 待答指导为有效进度。本轮落下 PIF-00 原版对照夹具：`tests/fixtures/pi-1.0.3/` 由固定 Pi `SessionManager` 写出（用户、助手、压缩摘要、从用户消息分出的旁支）。同一文件用固定 Pi 重开后，活动上下文含 `ORIGINAL_USER` 与 `SIBLING`；`scanNative` 的条目数等于 `getEntries().length`，字节数等于原件。打开与扫描之后，夹具与副本字节都不变。证据 `loop-122/report.json`。这不是 PIV-01–18 的任务对照。无产品改动、无外部模型、无部署。

## LOOP-121：待答期间的指导留在当前执行

上轮 LOOP-120 交互版本为有效进度。本轮验证 `waiting_interaction` 时提交的 steering 仍指向同一 Run：下一轮模型请求包含 `STEER_WHILE_WAITING`，回执为 applied，没有另开执行。证据 `loop-121/report.json`。无产品改动、无外部模型、无部署。

## LOOP-120：未知交互记录版本不按当前契约答复

上轮 LOOP-119 并行未知结果为有效进度。本轮落实交互记录迁移：`schemaVersion` 不是 1（缺失或更高）时，视图为 closed，原因是版本不受支持；库内原文不改成 1；`answerInteraction` 拒绝。当前版本 1 的 pending 仍可看见。证据 `loop-120/report.json`。这不覆盖会话 JSONL 兼容或事件流迁移。无外部模型、无部署。

## LOOP-119：并行 MCP 失败都保持未知副作用

上轮 LOOP-118 待答失联为有效进度。本轮补 PIF-08 并发未知结果：同一轮直接调用 `mcp__fixture__a` 与 `mcp__fixture__b`，服务在记录调用后返回 JSON-RPC 错误。两路都进入执行，回执均为 failed 且 `outcomeUnknown`，id 不同；运行不能 completed；对账前重试被拒绝。证据 `loop-119/report.json`。无产品改动。OAuth 向导与宿主被杀死时的写盘监督仍待。无外部模型、无部署。

## LOOP-118：待答失联后关闭旧答复

上轮 LOOP-117 跨工具并行为有效进度。本轮补宿主重启扫描：`waiting_interaction` 且租约已过、本进程没有子进程时，先标成中断，再关闭 pending 交互（`worker_exited`），避免关窗时把状态拨回 running。迟到答复被拒绝；对账前不能重试；对账后新尝试排队，旧交互保持 closed，calls 不增加。证据 `loop-118/report.json`。这不是操作系统杀掉宿主进程时的写盘监督。无外部模型、无部署。

## LOOP-117：两个独立工具并行等待

上轮 LOOP-116 单次探测为有效进度。本轮补 PIF-09「跨工具并行」：同一轮模型同时发出 `gate_a` 与 `gate_b`，原生并行执行。两题同时 pending 且 Run 为 `waiting_interaction`；倒序只允许 B。副作用只有一行 `B`，会话含 `A_NO` 与 `B_YES`，两份 tool_execution 均 completed 且 id 不同。证据 `loop-117/report.json`。无产品改动。宿主失联/强停竞争与 OAuth 仍待。无外部模型、无部署。

## LOOP-116：MCP 单次连接探测

上轮 LOOP-115 嵌套强停为有效进度。本轮补 PIF-08 连接诊断缺口的一截：对已保存并启用的服务提供 `POST /api/mcp/probe`，用固定 Pi 同源 `McpClient` 做一次 initialize/tools.list；stdio 缺程序可标 `program_missing`；需 OAuth 的 HTTP 暂返回 `needs_auth` 且不开向导。页面 MCP 设置增加「单次连接探测」，文案明确不是持续状态面板。证据 `loop-116/report.json`：fixture 探测成功 toolCount=1，缺失程序失败。OAuth 交互、持续连接状态与宿主崩溃监督仍待。无外部模型、无部署。

## LOOP-115：codemode 嵌套 MCP 强停回收孙进程

上轮 LOOP-114 独立等待状态为有效进度。本轮补 PIF-05 嵌套路径下的子进程专项：codemode 调用 MCP 后，MCP 故意不回复并可忽略 stdin EOF，另拉常驻孙进程；宿主 `terminateOwnedWorker` 强停。父 `codemode` 与嵌套 `mcp__fixture__echo` 各有独立 tool_execution 且均为 running；对账前不可重试；MCP 与孙进程 PID 均消失。证据 `loop-115/report.json`（仅 Windows）。无产品代码改动，复用既有进程树终止。任意第三方未登记子进程、宿主自身崩溃监督仍待。无外部模型、无部署。

## LOOP-114：独立用户等待状态 waiting_interaction

上轮 LOOP-113 嵌套工具回执为有效进度。本轮落实 PIF-04/09 反复点名的「独立等待状态」：插件待答时 Run 进入新状态 `waiting_interaction`，与模型认证用的 `waiting_user` 分离；待答结束后回到 `running`。任务总时限在等待期间仍继续计时（不隐式扩张授权时长）；等待期间不发起新的模型预留。

`isLiveExecution` 覆盖 running 与 waiting_interaction，供取消、租约、收尾、通知、工具进度、流式文本与中途指导共用。状态同步在交互事务提交后单独执行并重试 CAS，避免与租约续期抢 revision。页面标签为「等待用户答复」；交互区说明与 waiting_user 的差异。

证据：`tests/pi-interaction-wait-state.test.ts` 通过（见 pending 时为 waiting_interaction、答复后回到 running、等待中取消、calls=0）；`tests/pi-dialog-worker.test.ts` 串行回归通过。报告 `output/dev-evidence/pi-parity/loop-114/report.json`。无外部模型、无部署。宿主崩溃监督、暂停总时限策略、跨工具并行与 PIF-08 OAuth/实时诊断仍待。

## LOOP-071：原生JSONL原件导出

上轮树选择为有效进度。本轮重新核对计划PIF-10/PIV-14，明确必须原件导出和经过校验的导入；本轮先完成原件导出，不用摘要/宿主消息替代原生文件。GET /api/runs/:id/native-export要求登录、projectId范围、Pi终态执行及有效原生来源。读取是只读，不要求模型连接或对未知副作用重放。

自有扫描子进程scanNative验证身份/格式/链/128MiB边界，然后按已知长度读取Buffer快照，额外检查没有新增字节，核对SHA256与源指纹；全部验证后才经IPC传长度/MIME/hash，宿主再核对登录和Run版本并开始stdout分块下载。导出application/x-ndjson、附件文件名、no-store/nosniff与X-Content-SHA256。取消和背压复用已测二进制传输，发送头后失败destroy响应。宿主不缓冲整文件；子进程保留最多一个原件快照，近上限RSS/导出断流专项仍未测。

页面选定历史执行后提供导出入口，明确包含完整历史、未选分支和内嵌图片，不改变当前选择/执行。测试核对401、跨项目403、运行中409、损坏422、完整字节与SHA256、原件不改、Task/Run数不增；下载JSONL以固定SDK重开，sessionId/entries/当前上下文与原件一致，包含旁支和context_edit。native-export-test.log 4/4通过（导出1项+二进制流3项），native-export-types-final.log和native-export-build.log退出0。

native-export-browser.log退出0：真实浏览器点击链接、等待实际download、文件名jsonl、下载失败值null、下载字节等于含自有旁支/摘要/图片的源文件，之后树选择/回执恢复/第二worker/来源导航链继续通过。下载仅保留在隔离浏览器测试目录，没有写用户生产目录。

下一步导入预览/格式与环境校验/原件保存/经过授权的接续；不能用本次SDK重开替代导入恢复验收。完整最终投影、大历史/模型对照和其他PIF仍待。无真实模型、生产部署、第三方安装；全部本轮句柄结束。

## LOOP-070：树状历史节点选择

上轮context_edit历史视图为有效进度。本轮普通分支候选扫描增加结构预扫描，只保存ID/最近可选父节点/子节点关系，以非递归栈生成深度优先序号；第二遍仅收集当前页+1条正文并按序号排序。不可选工具、摘要、编辑记录折叠到最近可选父节点，原parentId仍保留，tree包含可选parentId/depth/hasChildren。文件hash两遍一致校验保持，分页不扩大上限。

前端BranchTree以原生radio组呈现层级和连线，可展开/收起。为窄窗最多缩进四级，同时文字层级与父ID仍显示真实深度；没有截断深层节点。收起选中后代会清空选择，避免隐藏节点被误提交。加载后续页保持已收起分支状态，切换来源重置树；键盘单选由浏览器原生行为提供，未冒充完整ARIA tree控件。

新增跨页旁支用例：文件追加顺序中的后写子节点回到本分支，最终深度优先ID/层级精确一致，非可选中间记录不成为候选。branch-tree-test.log 14/14通过，包含历史读取及80MiB图片流回归；branch-tree-types-final.log与branch-tree-build.log退出0。

TREE_UI=1自有SDK夹具从原用户节点增加旁支与旁支子节点。真实浏览器选择主路径节点、收起根验证隐藏选择清空、展开恢复节点数、ArrowDown选择下一radio，再重新选择主路径创建分支；实际worker请求不含旁支标记，摘要/图片/回执恢复/来源导航链保持。branch-tree-browser.log退出0，branch-tree-small.png已查看；大树浏览器分页/完整辅助技术覆盖尚未穷尽。

继续导入导出、完整最终投影与其他PIF大历史/实际模型对照/交付，不以树界面通过结束总体目标。无真实模型、生产部署、第三方安装；全部句柄结束。

## LOOP-069：上下文编辑历史视图

上轮接续清理修复为有效进度。本轮祖先扫描纳入context_edit，首遍收集目标角色/工具名，读取时要求目标在当前祖先路径并可编辑、replacement符合原生null或content结构。替换记录复用文字预览/全文/图片与工具参数路径；宿主记忆目标仍隐藏替换正文/图片。返回targetId/targetRole/removed，页面区分上下文替换和移除，说明后续编辑/压缩会影响实际生效状态，不把历史列表当成最终模型输入。

新增测试覆盖替换目标元数据、null移除、正文去旧注入、记忆工具替换正文/图片隐藏，并与固定Pi buildSessionContext核对正常替换/移除语义。context-edit-view-test.log 19/19通过（10项历史读取、9项原生会话）；context-edit-view-types-final.log及context-edit-view-build.log退出0。

CONTEXT_EDIT_UI=1隔离夹具在原生压缩记录后追加普通用户消息、长替换、另一消息及null移除，再选后续节点分支。真实浏览器看到两种编辑记录和目标说明，展开替换全文不含旧注入。实际第二个Pi worker请求包含OWNED_EDIT_REPLACEMENT，不含原文字OWNED_EDIT_ORIGINAL、移除消息OWNED_EDIT_REMOVED或OWNED_EDIT_HIDDEN_CONTEXT。图片/摘要/回执恢复/来源导航链继续通过，context-edit-view-browser.log退出0；context-edit-small.png已查看。

原始历史仍显示被改写前的普通消息，这是明确标注的历史视图；未提供完整最终投影/自定义消息视图。下一步树状节点选择与导入导出，继续大历史/模型对照等其他PIF。无真实模型、生产部署、第三方安装；全部句柄结束。

## LOOP-068：上下文编辑不能绕过接续清理

上轮调用分页为有效进度。本轮读取固定SDK appendContextEdit/buildSessionProjection，发现fork仅清理message，后续context_edit.replacement会覆盖已清理内容。新增测试先复现：context-edit-before.log退出1，EDITED_DELETED_MEMORY仍进入buildSessionContext。

会话副本重写增加小型目标role/toolName表（含custom_message），用户replacement剥离固定宿主上下文尾部；search_memory/read_project_summary/propose_memory结果的replacement替换为历史上下文已移除提示。null移除、正常修改和图片保留；未知/不可编辑目标及非法replacement拒绝，原文件不改。Pi投影逻辑未修改。

原生回归覆盖用户文字+图片替换、记忆工具替换、正常替换与null移除，context-edit-after.log 10/10通过。随后扩展七worker图片链：在自有源会话用SDK追加含旧注入标记的图片用户context_edit，实际接续请求保留EDITED_IMAGE_USER和唯一图片，不含DELETED_CONTEXT_EDIT_SECRET；源文件以追加完成后为基线保持，分支/取消重试/备份恢复链通过。context-edit-worker-final.log 10/10通过，context-edit-types-final.log退出0。

本轮优先修复执行语义，尚未接入context_edit页面记录或最终投影视图；不将此修复等同压缩/会话整项完成。继续该视图、树选择/导入导出和其余PIF。无真实模型、生产部署、第三方安装；全部句柄结束。

## LOOP-067：历史工具调用完整分页

上轮工具记录为有效进度，但超过20次只显示前20次，本轮补该缺口。inherited-history新增toolCallsOffset，仅能配合detailEntryId并独占图片/单次调用全文参数；固定源和祖先验证不变。一次返回该消息最多20个调用预览及总数/起始偏移。负数、小数、超出总数和互斥参数组合拒绝。前端上一组/下一组替换当前组，长参数全文使用组偏移加行索引，避免第二组读到第一组的参数。

43调用夹具按0/20/40遍历三组，ID无遗漏/重复、每组不超过20，第43条长参数精确一致；第二组宿主记忆参数仍隐藏。branch-tool-pages-test.log 9/9通过，类型与构建分别branch-tool-pages-types-final.log、branch-tool-pages-build.log退出0。首次apply_patch因同文件删除/新增操作被工具拒绝，未执行该补丁；随后按更新操作完成并验证，不是产品运行故障。

TOOL_PAGES_UI=1在自有SDK历史中构造21个工具调用及匹配返回，非实际执行这些工具；原浏览器双worker链继续。页面首组20个details、下一组1个，第21个长参数含专属后缀并全文一致，返回首组恢复20个；图片/压缩摘要、丢回执恢复、来源导航保持。branch-tool-pages-browser.log退出0，branch-tool-pages-small.png已查看。没有用增加响应上限代替分页。

下一步context_edit与树状选择、导入导出，保留其余PIF大历史、实际模型对照和交付要求。无真实模型、生产部署、第三方安装；全部句柄结束。

## LOOP-066：只读工具历史与旧记忆隐藏

上轮压缩记录为有效进度。本轮祖先扫描加入toolResult，返回name/callId/isError等历史元数据；助手消息中的toolCall显示名称、ID和参数预览，长参数通过同一固定源/祖先校验的toolCallIndex分段全文读取。新增InheritedTools使用折叠记录，不提供执行按钮。返回记录的错误标志来自原文件，不把历史“正常返回”当成当前副作用对账结论。

对search_memory/read_project_summary/propose_memory沿用原生fork历史清理边界：历史调用参数与工具结果正文替换为明确提示，图片数量清零、直接图片读取404，details不输出；普通工具返回文字和图片沿既有分页/流式图片路径可查看。工具结果不会变成可选分支节点，普通选择规则不变。单助手消息目前仅返回前20个调用预览并告知总数，防止超大数组经IPC一次返回；后续必须补调用分页，不能据此声称完整多调用浏览。

branch-tool-history-test.log 16/16通过，含原生会话回归；新增普通长参数精确读取、错误返回关联ID、非存在调用拒绝、旧记忆参数/正文隐藏及图片不可取。原先祖先测试排除工具正文的断言按本轮明确扩展更新，旁支/后续排除断言保持。branch-tool-history-types-final.log和branch-tool-history-build.log退出0。

TOOL_HISTORY_UI=1配合SUMMARY_UI：在隔离临时会话由SDK追加一对自有历史bash调用/返回夹具，再写压缩记录与新选择点；这不执行bash，也不是实际工具成功证据。真实浏览器创建分支后显示调用/返回、展开超过400字的参数全文，实际worker请求含历史工具返回，operation仍为0；图片、摘要、分支回执恢复与来源导航链继续通过。branch-tool-history-browser.log退出0，branch-tool-history-small.png已查看。

下一步多调用分页和context_edit视图，再继续树选择/导入导出及其余PIF。真实工具副作用/对账验证仍引用既有PIF06/08专项，不用本次历史夹具替代。无真实模型、生产部署、第三方安装；全部句柄结束。

## LOOP-065：原历史压缩与分支摘要记录

上轮大图传输为有效进度。本轮读取固定1.0.3 session-manager的buildContextEntries/buildSessionProjection：最新路径compaction先进入上下文，其firstKeptEntryId起的保留段及压缩后节点接续；更早压缩即使在保留范围也不再贡献摘要；context_edit仍可修改投影。因此本轮明确展示原始历史节点，不擅自把原始历史标为模型完整上下文。

祖先扫描元数据记录类型以识别离所选节点最近的compaction；第二遍增加compaction/branch_summary的文字行，展示预览和既有全文分段。返回summary.kind/currentCheckpoint/tokensBefore/firstKeptEntryId/fromId，页面标注“所选路径的最新压缩记录”或“较早的压缩记录”。摘要不是新增可选分支节点，普通选择接口保持原用户/完成回复规则。图片读取对摘要没有图时仍404。

新增多次压缩、分支摘要与旁支压缩夹具；历史摘要只来自祖先，最新标志与固定Pi buildContextEntries输出首条compaction一致，旧历史仍存在且旁支不出现；摘要全文与长预览标志正确。branch-summary-test.log 10/10通过，含大图流相关回归；branch-summary-types-final.log和branch-summary-build.log退出0。

SUMMARY_UI=1真实浏览器流程：源图片worker完成后，仅在本轮临时夹具会话中用固定SDK appendCompaction写入受控摘要、appendMessage写入后续选择点，再通过页面选择该点分支。实际分支worker请求包含该摘要及唯一历史图片，页面展开摘要全文并显示2400 tokens/保留节点，来源文件以夹具追加完成后的字节为基线保持不变。branch-summary-browser.log退出0；branch-summary-small.png已查看。这里验证原生压缩记录消费与展示，不是模型自动生成摘要或阈值压缩验收，未扩大PIF-02结论。

context_edit效果、工具调用/返回、完整模型上下文视图、树状选择、导入导出及其余PIF继续。无真实模型、生产部署、第三方安装；全部本轮句柄结束。

## LOOP-064：历史大图分块传输与取消

上轮图片访问是有效进度，同时留下整块IPC/宿主解码问题。本轮新增streamNativeImage，生产HTTP图片请求改走该路径。子进程先按已有祖先/格式/hash规则完整校验，只经IPC回传MIME与解码后长度；宿主重新核对文件指纹和登录/Run/Conversation版本，写入响应头后发送继续信号。子进程每次解码65536个base64字符，经stdout输出二进制，逐块等待write完成；宿主pipe遵守下游背压，不再取得整张base64或整块解码Buffer。

共享两个扫描槽仍保持；请求取消会杀死所属扫描进程，close后释放槽。输出总字节与声明长度核对，过程失败若已发响应头则destroy连接，不发送伪成功正文。输出使用已校验的内存快照；开始传输前原文件指纹变化拒绝。普通节点/文字扫描仍走原IPC结果；内部branchPoints的图片测试入口保留，不是生产HTTP图片传输路径。

branch-image-stream-test.log 8/8通过（6项节点/接口与2项传输）；branch-image-stream-large.log 3/3通过，新增80MiB图片字节装入约107MiB原生文件，在现有768MiB子进程堆/128MiB单会话限制内输出hash一致。8MiB慢Writable接收测试确认写入队列不超过256KiB；首段取消后当前请求拒绝且下一次能完成，错误源hash不触发响应开始。大图为PNG签名加填充的传输夹具，非可解码的大尺寸照片，也不是峰值RSS测量；扫描端仍完整解析单JSON条目，不能据此宣称所有大历史内存问题已关闭。

branch-image-stream-browser.log退出0：有效PNG实际浏览器解码/下载、长文本双worker分支链、丢回执恢复/全文翻段/来源导航均保持。branch-image-stream-types-final.log类型通过。本轮无前端修改，复用已构建前端执行浏览器验证，未声称新构建。

继续工具与压缩语义、树选择、导入导出以及其他PIF。未做慢HTTP客户端近上限断流专项、RSS峰值与真实大图解码，这些仍属完整大历史/图片验收。无真实模型、生产部署、第三方安装；全部句柄已结束。

## LOOP-063：继承历史图片查看与下载

上轮全文分段为有效进度。本轮为同一inherited-history接口增加entryId/imageIndex图片读取，内部扫描结果携带image，只有固定分支祖先消息内的指定图片可取。验证序号整数非负、标准base64编码、PNG/JPEG/GIF/WebP文件签名与声明MIME一致；不接受SVG等活动格式。两次扫描及固定源hash检查完成、登录与实体版本复核后才返回图片，Content-Type按已验证格式、no-store与nosniff，普通列表仍不带图片内容。

前端按需展开原生会话图片，每次显示一张并提供上一张/下一张、下载和读取失败重试；明确可能是Pi保存的缩放图，不冒充上传原件。已有宿主资产下载仍保留。图片结果目前由子进程整块base64经IPC返回再由宿主解码；虽然受原128MiB会话边界约束，近上限单图的内存/背压未验，后续需按完整大历史要求解决，不能因小PNG通过声称全部图片规模支持。

branch-inherited-image-test.log 14/14通过，新增精确祖先图字节、错误索引/负数、非祖先节点、SVG拒绝；其中单元PNG仅签名夹具，不代表完整解码。branch-inherited-image-types.log与branch-inherited-image-build.log退出0。真实浏览器使用有效PNG与长输入，原worker/丢分支回执恢复/第二worker/全文翻段/来源导航链继续通过；继承图实际decode通过、下载字节等于该一像素原图，响应image/png/no-store、未登录401/不存在序号404。branch-inherited-image-browser.log退出0，branch-inherited-image-small.png已查看。

仍待：工具与压缩语义展示、来源缺失时副本读取、树状选择、大图内存/取消/流式传输、导入导出和其余PIF。无真实模型、第三方安装、生产部署；全部命令句柄结束。

## LOOP-062：继承历史全文分段读取

上轮祖先预览是有效进度。本轮增加truncated标记及内部detailEntryId/textOffset参数；inherited-history接口允许指定消息与文字偏移，但来源Run/hash/所选分支节点仍只取持久关系。节点必须是所选路径内的用户/助手消息，否则404。全文保留同一固定上下文剥离规则，不输出工具返回或图片base64；单次最多16000 UTF-16单位，结尾落在高代理字符时退一位，避免分段把emoji拆开。源hash和两遍扫描校验不变。

页面长消息显示“阅读历史全文”，按段提供上一段/下一段和末尾提示，可收起；只保存当前文本段及偏移列表，避免将整份长文持续累积到DOM。全文请求卸载时取消、失败可重试。尚未提供原生图片读取及完整工具/摘要视图，不能把文字全文等同于整个原生会话。

branch-fulltext-test.log 13/13通过：含超过两段长文字、Unicode边界、精确拼接还原、内部固定上下文不外露、非祖先消息拒绝、越界/负偏移、HTTP正文读取与越权节点404，原生分支回归保持。branch-fulltext-types-final.log类型及branch-fulltext-build.log构建退出0。

FULLTEXT_UI=1、BRANCH_UI=1增加约19k字符真实输入，沿原上传/原worker/丢分支回执恢复/分支worker链测试展开全文、下一段、返回上一段、末尾文本精确相同，再保留来源导航断言。首轮停在图片decode：新长输入把懒加载图推到视口外，测试没有先滚动。检查测试进程30620及子Chrome与临时库确认只有排队任务、无worker；只终止其所属进程树（原句柄退出1），未触碰生产服务。修正两处先滚动再decode，branch-fulltext-browser-final.log退出0。branch-fulltext-small.png已查看；此次失败属测试顺序问题，原日志保留。

下一步继续原生历史图片访问与压缩/工具语义、树状选择、导入导出和其他PIF，不缩减整体交付目标。无真实模型、第三方安装、生产部署；全部本轮句柄结束。

## LOOP-061：分支祖先路径预览

上轮来源导航是有效进度。本轮为分支历史扫描增加内部throughEntryId：第一遍只保存节点父关系，验证所选节点和固定源hash，沿父链构建祖先集合；第二遍输出该集合内用户/助手文字与图片数量，验证两遍hash一致。已有scanNative要求父节点先出现，排除了环。所有扫描仍在共享限流的独立子进程，不把原文件全部文本搬入宿主。

GET /api/conversations/:id/inherited-history只接受offset，固定limit30；源Run、节点、hash全部取持久Conversation.branch，核对同项目、原话题关系，响应前复核身份与实体版本。来源变化返回409而非悄悄切换到新历史。该接口是只读历史浏览，不触发模型或绕过实际分支提交的对账门禁。

页面“分支起点历史预览”按需读取、分页和取消卸载请求，显示每条最多400字与图片数量；明确不等于完整模型上下文、不含工具返回或压缩摘要。继承预览会显示祖先中不完整助手文字，避免把只可分支的节点过滤规则误当成历史规则。原节点选择仍只接受用户消息或无toolCall的完成回复。

新增祖先测试包含文件中先出现的旁支、所选节点后的消息、工具返回与部分助手回复；分页只取祖先、包含部分助手文本、排除旁支/后续/工具正文，原文件保持。真实HTTP覆盖未登录、固定源读取、源追加后的409；合并原生会话共12/12通过。branch-inherited-test.log、branch-inherited-types.log、branch-inherited-build.log均退出0。

branch-inherited-browser.log通过：沿真实浏览器上传/源worker/丢分支202刷新重试/分支worker链，展开预览看到原用户文字与一张历史图标记，选中用户节点后的SEQUENCE_DONE不进入继承预览；原来源导航仍通过。branch-inherited-small.png已查看，窄窗内容可读。模型仍为受控协议服务，非真实识图。

余项：完整历史全文/图片读取、工具与压缩摘要语义、来源缺失时副本恢复、树状选择和大历史整链性能，以及导入导出和其余PIF。当前只是历史浏览的预览层，不标记会话管理完成。无真实模型、第三方安装、生产部署；本轮所有句柄结束。

## LOOP-060：分支来源导航

上轮页面分支与丢回执恢复是有效进度，本轮复读组件与浏览器脚本后补来源导航。点击按钮读取当前会话目录，仅允许对应projectId的sourceConversationId进入窗口打开函数。原窗口存在则聚焦；已关闭则绑定原会话创建窗口，不创建Conversation或Task。无独立话题的项目级来源明确提示；来源不可用时在折叠表单外显示错误，组件卸载不再打开窗口。

BRANCH_UI=1真实浏览器链继续覆盖上传、原worker、分支丢202响应刷新恢复、第二worker、唯一历史图和原件保持。新增检查点击来源后实际焦点落在原窗口标题且窗口数仍为2；关闭原窗口后由分支重新打开，原历史图片可见，窗口数恢复为2而Run仍为2。branch-source-browser.log退出0，branch-source-types.log与branch-source-build.log退出0；branch-source-small.png已查看。未单独注入目录请求失败，不把错误分支代码当成已验。

更新能力清单中落后于实际记录的图片/分支描述。下一步读取所选节点的祖先路径并显示分支继承历史，不能直接复制原话题全部宿主消息，否则会包含所选位置之后内容。完整树选择、压缩语义、导入导出与大历史性能仍未完成。无真实模型、部署或第三方安装，全部进程句柄已结束。

## LOOP-059：分支表单、新窗口与浏览器恢复

上轮节点分页接口与测试为有效进度。本轮新增ConversationBranch组件，在聊天历史区选取终态Pi执行，分页列出可分支消息、图片数量和父节点标识，输入新话题名称/目标后调用分支API。界面明确提交会立即执行新目标。创建成功提供打开新话题按钮，工作台复用已打开的对应窗口或新增独立窗口，原聊天与草稿保留；分支会话显示来源Run与节点。

请求前把不可变命令写入项目/会话范围localStorage；未确认回执保留同一命令，刷新后可以重试，4xx明确拒绝则清除。该机制目前是单页面防重复和后端同命令幂等，不宣称跨标签共享锁或完整所有崩溃窗口。成功但尚未打开窗口时，已创建会话仍可从已有对话选择。节点读取使用AbortController，组件卸载取消请求；可选范围仍由服务端最终验证。

扩展pi-image-ui-qa的BRANCH_UI=1路径：先通过真实浏览器上传和真实Pi worker完成含图对话，再选择首个历史节点创建分支；服务已返回202后丢弃响应，刷新页面重试原命令，打开新窗口，等待第二个真实worker完成。断言仅两个Run、分支conversation独立、原文件字节保持、第二个模型协议请求含一份历史图，布局保存后刷新来源仍可见、无pageerror。模型端为受控HTTP夹具，真实模型请求0。

首轮branch-ui-browser.log失败：恢复后成功清除pending，但open仍false，结果区域被收起。修复成功时展开表单后branch-ui-browser-final.log退出0，report.json记录两worker通过。branch-ui-types-final.log类型及branch-ui-build-final.log构建通过；截图branch-select-small.png/branch-open-small.png已查看，760×700窄窗控件可滚动操作，新旧聊天独立存在。最终代码类型复查另存branch-ui-types-verified.log。

未闭合：来源显示目前是Run/节点文本而非可点击导航，节点为带父ID的列表而非完整树；多页选择和全键盘需进一步真实UI验证；长历史提交仍有同步扫描。分支继承的原生历史尚未在工作台消息区完整展示。图片持久交接、导入导出与其余PIF继续，不提前标记PIF-10完成。无生产部署、真实模型或第三方安装，全部本轮句柄结束。

## LOOP-058：历史节点分页与独立扫描

前一轮为用户进度询问，仅核对记录，没有推进实现；本轮重新读取未验证的节点扫描文件并完成接口和测试。GET /api/runs/:id/branch-points要求projectId，可选offset/limit/sourceHash，默认30、上限100；后续页要求原hash。调用独立Node子进程流式扫描，共享原历史预检的两个并发槽，取消请求会终止所属子进程并释放槽位，响应前重新检查文件指纹、登录与Run版本。

节点选择与实际分支共用谓词：用户消息，或stop/length结束且没有toolCall的助手消息。返回entryId/parentId/role/时间、最多400字符预览和图片数量，不返回图片base64、工具正文与固定注入的项目上下文。列表包括原文件中的可选择树节点，尚未实现树状页面。只读列表不要求模型已连接；提交分支仍走原模型策略、绑定和未知副作用对账门禁。

新增tests/native-branch-points.test.ts覆盖分页连续性、源变化409、范围错误、无效参数、文件字节不变、排队取消和已启动扫描取消后可重新读取。真实HTTP验证401/403/活动历史409；32MiB图片记录扫描未完成时health已返回，响应正文小于3000字节且含图片数量。图片为结构夹具，不是图片解码或模型识图测试。

branch-points-test.log与branch-points-final.log均11/11通过，含8项原生会话回归；branch-points-types.log类型通过。最终增加大历史HTTP断言后的类型结果另存branch-points-types-final.log。无真实模型、部署、第三方安装；没有改动用户业务数据。当前证据仅覆盖列表扫描的响应性，不代表POST分支的同步节点检查、128MiB SDK fork峰值或整个会话管理已完成。

下一步接入历史节点选择、新话题标题/目标与父分支关系UI，继续页面联合验证；图片布局持久交接、导入导出与其余PIF待办保持。全部本轮命令已结束。

## LOOP-057：独立话题分支提交与实际worker

上轮原生节点分支为有效进度。本轮新增service.branchConversation及POST /api/runs/:id/branch：要求项目、节点、原文件hash、新话题标题/目标/命令ID，复用当前模型许可和冻结运行配置。先按原接续规则验证源Run、模型策略、未确认工具/操作、会话绑定，再核对节点与hash；单事务创建独立Conversation/Task/Run，Conversation.branch保存原Run/节点/话题/hash，Run.continuation保存选中节点。普通submit的跨对话隔离没有放开。HTTP命令回执按源URL与请求体指纹去重，响应重试不随当天设置重建任务。

prepareSource保留已有异步历史预检；选定节点检查当前仍使用流式同步scan，128MiB场景响应性能不能据此宣称完成。无效节点、过期hash在写入新话题前拒绝；模拟Run插入失败验证Conversation/Task/Run整体回滚。启动前取消后正式retry保留原选定来源；若已有自己的历史，仍按原重试规则接续其历史。

首次联测暴露调度器JSON比较把新增entryId误认为会话身份改变；现只比较原runId/sessionId/sha256身份，节点仍由提交层和worker校验。插件/MCP环境检查优先实际continuation来源，避免未启动取消记录尚无环境快照导致错误拒绝；未放开来源环境兼容要求。首次提交单元深比较也因JSON回执省略undefined字段失败，测试改比较实际序列化契约。

真实图片worker夹具增加HTTP分支：未登录401、跨origin403，相同命令回执同Run；选取含历史图片的早期用户节点，先取消尚未启动分支再正式retry，实际Pi请求包含新目标和唯一原图，不含源会话后来的追问，源文件字节不改、话题独立。原恢复worker链继续通过。受控请求总数预设为五次，产品默认额度未改。

证据根`output/dev-evidence/pi-parity/loop-001/`：首次失败`branch-submit-test.log`、`branch-http-worker.log`保留；`branch-submit-final.log`九项通过（八原生/提交回归及七worker链），`branch-submit-types-final.log`类型退出0。尚未有页面节点列表、选择、新窗口绑定或父子关系展示，不能称完整用户分支体验；节点列表性能、导入导出与其他PIF继续。

全部句柄结束，无部署、真实模型调用或第三方安装。

## LOOP-056：指定节点的原生分支执行层

上轮多页图片竞争修复为有效进度，本轮按计划推进尚未实现的历史节点分支，图片剩余验收不撤销。核对固定Pi SessionManager接口后，NativeContinuation增加可选entryId，不改变旧接续数据。forkNative仍先验证项目路径、sessionId、提交hash和容量；指定节点须是用户消息，或stop/length结束且没有toolCall的助手消息，工具中间节点/不存在节点拒绝。校验在fork写入前进行，无效节点不会留下新session。

使用原生SessionManager.forkFrom创建副本，再branch(entryId)。关键细节：branch只修改内存leaf，既有清理代码随后重新打开文件会丢失选择；因此追加workbench_branch自定义原生条目，记录原Run/session/entry/hash，让选定叶子持久化且不作为模型消息。随后仍执行原有工作台注入上下文与记忆工具回执清理，重新打开副本。原会话和未选后续条目保留，新副本的有效上下文沿选中路径建立。

新增原生集成测试：选中用户节点后另追加未选消息；无效节点拒绝且文件列表不变；分支、追加新消息、再次重开后均不含未选消息，选中消息与新消息存在，原文件字节保持、新sessionId不同、DELETED_MEMORY不进入上下文、来源custom记录存在。

`output/dev-evidence/pi-parity/loop-001/native-selected-branch.log`七项原生会话回归通过，`native-selected-branch-types.log`类型退出0。没有模型网络调用或额外依赖。当前是分支执行层，未开放请求参数/API或页面，不冒充已能从用户界面新建话题；下一步提交层节点校验、新话题父子绑定、列表选择与真实worker验证。大历史节点查找的响应性能仍待补，其他PIF缺口保持。

全部句柄结束，无部署/真实模型/第三方安装。

## LOOP-055：同浏览器多页上传互斥

上轮未完成上传的恢复验证为有效进度。本轮检查单组件operating锁不能保护同一聊天在其他页面的操作。ImageUpload使用与本地恢复键一致的Web Locks名称，以ifAvailable方式获取锁；上传、恢复和取消都进入同一流程，竞争失败明确提示另一页面正在处理，不排队执行已经过时的动作。取得锁后重新读取本地intent；storage事件同步其他页面保存/清除记录，避免仅使用挂载时快照。

真实浏览器IMAGE_CONCURRENT=1在第一页面POST去重完成、PUT尚未到服务端时暂停请求，第二页面打开同聊天尝试恢复和取消；两者被拒绝，upload仍1、asset仍0，本地恢复记录未被取消清除。第二页关闭后释放第一页PUT，丢失回执查询、刷新、真实Pi worker请求及历史下载继续通过，只有一个upload/asset。随后IMAGE_REOPEN=pending复验关页重开同图续传通过，没有留下使恢复永远等待的锁。

证据根`output/dev-evidence/pi-parity/loop-001/`：`upload-concurrent-types.log`类型、`upload-concurrent-build.log`构建、`upload-concurrent-ui.log`双页联合、`upload-concurrent-reopen.log`恢复回归通过。无页面布局改动，不重复调整截图。

互斥范围明确为支持Web Locks的同浏览器同源上下文；不支持时保留原单组件保护，不宣称跨页保证，也不声称不同浏览器/机器共享本地恢复记录。附件绑定与布局持久保存的交接、图像资源压力、完整UI/真实识图、压缩/流式边界、分支/导入导出及其他PIF要求继续待办。全部句柄结束，无部署/真实模型/第三方安装。

## LOOP-054：没有提交图片内容的恢复

上轮关页恢复实现与验证为有效进度。本轮重新检查组件和浏览器脚本，加入IMAGE_REOPEN=pending场景：POST创建回执仍被丢弃并去重恢复，但第一次PUT在发送到服务器之前直接中断，同时GET查询失联。断言上传记录存在、asset为0，再关闭页面重开；恢复操作明确显示内容尚未上传完成，附件按钮不存在，asset仍0、upload仍1。

在同一页面重新选择原PNG，恢复流程复用原intent/原upload并完成内容提交；不同内容此前已被拒绝。最后只有一条upload和一个asset，原聊天刷新后保留附件，真实Pi worker请求收到正确图片，历史图片解码/下载字节验证继续通过。此处没有把上传记录当成资产，也没有创建替代upload绕过恢复。

`output/dev-evidence/pi-parity/loop-001/upload-pending-ui.log`真实浏览器联合验证退出0，`upload-pending-types.log`类型退出0。本轮仅扩充有区分力的故障夹具，无生产代码或布局变化，使用上一轮已构建候选。完整上游模型仍使用受控HTTP，真实模型调用为0。

全部句柄结束，无部署/第三方安装。多页竞争、附件布局持久交接、图像解码资源限制、完整UI/真实识图、流式失败/压缩后图片、历史分支/导入导出及其余PIF要求继续待办。

## LOOP-053：原聊天中的待上传恢复

上轮上传intent去重与内容绑定为有效进度。本轮在ImageUpload加入按projectId/conversationId隔离的本地待完成记录，包含命令ID、原文件名/MIME、hash及size，不存图片二进制；记录必须在POST前成功写入localStorage。重开聊天显示恢复入口，使用相同intent取得原upload，done后核对资产并附加；非done说明需重选同一文件，重选内容hash/size不匹配不发起新upload。取消本次附加只清本地恢复记录，不删除服务器资产。

组件按conversationId重新挂载，mounted检查阻止旧组件在卸载后把迟到结果附到新面板，保留原恢复记录；同组件operating锁防重复按钮并发。此处没有宣称多窗口/多浏览器之间建立全局客户端锁。成功附加后清理待恢复记录，聊天附件仍由既有布局保存；两者之间的极短持久化窗口需要后续专项。

浏览器脚本IMAGE_REOPEN=1：服务端成功创建intent/保存内容后丢弃两次响应，并持续拒绝GET查询，关闭原页再打开同一浏览器上下文；恢复入口仍在。先选择不同内容，页面明确拒绝且upload仍一条，再恢复原upload，附件持久保存/刷新/真实worker模型请求/历史图片下载继续通过，asset只有一个。新页面复用了浏览器本地存储，不冒充跨浏览器同步恢复。

截图调整两次：最初错误区被flex压缩，固定提示空间后发现发送按钮被挤出，再在错误状态减少历史最小空间。最终`image-ui/upload-recovery-small.png`已看，错误、恢复/取消、输入和发送均可见。`output/dev-evidence/pi-parity/loop-001/upload-reopen-ui-complete.log`浏览器通过、`upload-reopen-build-complete.log`构建通过、`upload-reopen-types-complete.log`类型通过，前序截图/测试日志保留。

全部句柄结束，无部署/真实模型/第三方安装。未完成内容的同文件重选、多个窗口竞争、持续离线取消与布局附加持久化交接仍待专项；图像其他验收、历史分支/导入导出以及其余PIF要求保持。

## LOOP-052：上传意图持久去重与内容绑定

上轮PUT回执丢失对账为有效进度。本轮补POST创建upload回执未知。API新增可选commandId及expectedHash；仍先检查项目/来源/父版本权限，使用现有store.command事务以project/name/mime/sourceIds/parentVersionId/expectedHash指纹建立同一上传记录。相同命令返回原ID（提交内容完成后也如此），改变参数409；hash格式错误400。旧客户端未给commandId仍按原行为创建，不强制升级。

Assets.commit现在同时校验创建时绑定的expectedHash和本次可选header；不同内容不能用另一个正确header来覆盖原意图。完成态仍按原字节hash幂等返回同一asset。图片组件在File哈希确定后生成一次UUID；创建响应未知/5xx时最多重试一次同一intent，明确4xx不重发。之后的PUT未知继续按原upload ID查询，不自动新建记录。

`tests/upload-intent.test.ts`真实HTTP覆盖未登录、相同命令重复、名称/hash冲突、非法hash、header不能覆盖意图、错误内容无资产、正确内容及重复PUT同资产、完成后创建回执保持和旧客户端兼容。浏览器夹具在服务端各自完成后同时丢弃POST201和PUT200，最终只一个upload/asset，刷新、图片历史、下载以及实际Pi worker请求继续通过。

证据根`output/dev-evidence/pi-parity/loop-001/`：`upload-intent-test.log`接口通过，`upload-intent-storage.log`既有存储故障回归通过，`upload-intent-types.log`类型、`upload-intent-build.log`构建、`upload-intent-ui.log`浏览器通过。没有新增第三方库或修改默认容量。

全部句柄结束，无部署/真实模型/第三方安装。页面关闭时尚未持久保存客户端upload intent，持续失联及窗口切换恢复仍待补；当前不代表所有上传幂等情形完成。图片其余验收、历史分支/导入导出和完整PIF交付门槛保持。

## LOOP-051：上传内容成功但HTTP回执丢失

上轮历史图片展示与验证为有效进度。本轮补上传PUT回执未知的路径。浏览器计算所选File的SHA-256，使用原资产服务已有X-Content-Hash字段上传；PUT有30秒响应期限，失败时读取相同upload ID的状态（10秒期限），仅在done且projectId一致时从snapshot取得原assetId，核对project/hash/size后附加到当前聊天。没有自动新建上传，也没有根据文件名猜测哪个资产是原件。非done或查询失败保持失败，不误报上传成功。

真实浏览器联合脚本在route.fetch完成PUT并取得200后中断浏览器响应，之后页面通过GET回执找回同图；断言只有一条upload和一个asset，附件仍能在刷新后保留，并进入真实Pi worker的模型协议请求、历史图片和下载路径。说明这是服务端确实完成后的响应丢失，不是把上传请求本身取消后伪造成功。

`output/dev-evidence/pi-parity/loop-001/image-upload-receipt-types.log`类型、`image-upload-receipt-build.log`构建、`image-upload-receipt-ui.log`浏览器完整路径成功，页面无JS异常。此次未改变布局，不重复布局调整。全部句柄结束，无部署、真实模型调用或第三方安装。

边界保持：POST创建upload本身失去回执、GET持续失联、页面关闭/窗口切换时的上传恢复和用户手动重复选择尚未覆盖；不宣称全部上传幂等或离线恢复完成。其余PIF要求及最终对照交付仍待推进。

## LOOP-050：消息历史中的原图呈现

上轮聊天上传与联合测试为有效进度。本轮补发送后无法看见原图的缺口。ConversationMessage增加可选images；service.conversation只从task.accepted里的固定assetIds建立引用，核对资产仍属同项目且是支持的图片MIME，返回assetId/name/hash及受鉴权的资产URL。不向助手或steering消息复制附件，不修改旧数据库记录。原资产失效不提供URL，记录不存在则跳过，未知图片读取错误不破坏整个消息显示。

新增MessageImages，以原图缩略图和明确下载原图链接呈现，lazy加载、固定预览尺寸、名称换行，加载错误有提示。展示的是用户这条任务附带的原图，不代表模型成功接收、视觉理解或发送派生图内容。源图片继续使用既有资产哈希读取校验。

真实浏览器上传/刷新草稿/发送/worker完成后再次刷新，历史图片decode成功，API metadata和原资产一致，下载接口返回原字节且Run仍只有一条。补充会话隔离回归：A的新图片消息返回正确来源，B没有继承图片。首次窄窗截图发现历史被运行详情挤成不足一张图的高度，调整历史最小空间和运行详情收缩/滚动；最终`image-ui/history-image-small.png`已查看，完整缩略图及下载链接可见，输入区保持。

证据根`output/dev-evidence/pi-parity/loop-001/`：`image-history-ui-final.log`浏览器联合路径、`image-history-ui-build-final.log`构建、`image-history-ui-types-final.log`类型、`image-history-conversation-final.log`会话回归均通过。页面测试使用真实worker、受控模型HTTP；没有真实识图请求。

全部句柄结束，无部署/真实模型/第三方安装。上传未知回执与窗口生命周期、完整键盘/缩放/多页、派生图追溯呈现、流式失败/压缩后图、历史节点分支和导入导出及其余PIF要求仍未闭合。

## LOOP-049：聊天直接上传图片与浏览器联合验证

上轮恢复后真实worker为有效进度。本轮检查主工作台仅能从资产面板附加既有图片，上传需绕到legacy。新增ImageUpload组件放入ChatPane，按钮调用真实文件选择器；使用既有POST uploads和PUT内容协议，上传成功把资产ID加入当前聊天的持久view，刷新snapshot。上传时复用busy阻止发送，已存在未知提交时禁用添加；客户端初检PNG/JPEG/GIF/WebP及单图10MB，任务提交仍由后端校验实际内容、项目、总量和模型视觉能力。没有添加外部上传服务。

新增`scripts/pi-image-ui-qa.ts`：隔离数据和自有模型HTTP夹具，在真实Chrome选择项目/新建聊天，通过添加图片按钮打开filechooser并上传生成的有效PNG，核对资产项目；等聊天布局持久保存后刷新，附件仍在；760×700窗口发送，实际scheduler/worker完成，原Task绑定唯一assetId，真实模型协议请求含一份且内容一致的image，原图字节保持，页面无JS异常。模型结果为受控SEQUENCE_DONE，不是识图效果证明。

初次截图发现窄聊天发送按钮折行，操作栏改为允许控件换行、按钮文字不折行；最终复验并把回复滚入可见范围。`output/dev-evidence/pi-parity/image-ui/attached-small.png`、`completed-small.png`已查看，附件、上传/发送和完成回复可见。证据根loop-001的`image-upload-types-final.log`、`image-upload-build-final.log`、`image-upload-ui-final.log`均成功，`image-ui/report.json`保存联合验证结论。

尚缺上传失败/未知回执恢复和跨窗口生命周期专测、聊天历史图片可见呈现、完整键盘/缩放/多页验证、真实识图及其他PIF要求；不能把这一条成功路径当成全部页面验收。没有修改上传服务幂等协议或删除源资产。全部句柄结束，无部署、真实模型调用或第三方安装。

## LOOP-048：恢复目录中的真实图片接续

上轮模型明确失败后图片去重为有效进度。本轮补足恢复不只读取历史的证据。在独立恢复数据目录创建新app，先断言所有恢复插件disabled且installationState=missing；随后对本测试持有的同一本地fixture执行repair状态流，重新inspectPlugin、commit并明确configure启用，核对manifest签名与原Run一致。不修改历史签名，不放开兼容门禁；不安装第三方代码，也不从备份恢复模型凭据。

通过新宿主正式submit指定已恢复的源Run，实际scheduler/worker/Pi接续完成；第四个受控HTTP请求含且仅含同一图片data URL，calls为1，新的sessionPath位于恢复目录。恢复源会话字节、原数据目录的历史均保持不变。完整夹具现六worker（图被改拒绝、模型400失败、正式retry、普通接续、图命令、恢复接续），连接夹具许可为预先计划的四次受控请求，产品默认额度不变。

首次`image-restored-worker.log`因对已有missing插件使用install被409拒绝；第二次`image-restored-worker-final.log`因误传packageId而非source失败，均为测试步骤错误，日志保留。修正为既有repair/source契约后`image-restored-worker-recheck.log`六worker链通过，`image-restored-types-final.log`类型退出0。没有更改生产恢复/插件授权行为。

该验证仍在同机器、本地fixture路径仍存在的条件下完成；不宣称外部插件迁移、私有凭据恢复或跨机器部署已验收。图片真实识图、浏览器联合入口、流式失败与压缩后真实图恢复、解码资源压力、历史点分支/导入导出及其余PIF要求继续待办。

全部句柄结束，无部署、真实模型调用或第三方安装。

## LOOP-047：模型失败重试不重复附图

上轮图片提交后复验与重试修复为有效进度。本轮扩展实际Pi工作进程夹具：模型HTTP首次返回明确400，原用户图已进入原生历史；正式retry成功后检查完整请求。`image-model-retry.log`复现input_image数量2而非1，说明worker既继承历史又重复附原Task图片。

新增imagesForPrompt，仅当parentRunId和continuation同时存在时，读取session.messages的当前有效user image，以MIME和内容摘要比较后省略已存在的图。普通新输入即使选同图仍保持附件；toolResult不代表用户已附图；summary中没有图片时重新附图。只看有效上下文，不扫描已经压缩移除的磁盘祖先。插件接管补记也使用同一图片集合，避免在该分支重新引入重复图。来源custom entry和固定Task资产仍保留，原生循环不变。

真实链为五worker：提交后改图失败（0调用）、原图恢复后模型明确400（1调用）、正式retry成功（1调用且一份图）、不附图接续（1调用且一份历史图）、带图命令（0调用）。夹具授权上限改为3对应这三个受控请求，产品默认限制没有改变。源失败历史不改、原图保持和备份恢复原生读取等断言继续通过。

证据根`output/dev-evidence/pi-parity/loop-001/`：`image-model-retry-final2.log`两项通过（五真实worker及去重边界测试），`image-model-retry-types-final.log`类型退出0；首次失败及中间通过日志保留。单元测试的summary情形只证明去重函数选择，不冒充真实自动压缩后的图片恢复。模型失败为明确HTTP400，未覆盖流式半截响应或未知回执。

全部句柄结束，无部署、真实模型调用或第三方安装。恢复后实际worker、网页联合验证、真实识图、图像解码资源压力及历史分支/导入导出仍待完成；其余PIF缺口和最终对照交付保持。

## LOOP-046：图片复验失败后的可重试性

上轮图片接续和插件接管修复为有效进度。本轮在真实HTTP图片提交成功后、调度前替换隔离测试资产文件内容，要求worker重新验证原hash、失败且calls=0；再恢复原始字节，通过正式service.retry创建同Task的新attempt，断言parentRunId和固定assetIds保持，并执行真实模型传输夹具与后续接续/命令/备份场景。

首轮`image-retry-source.log`发现真实缺口：image_attachments原在session.prompt之前，但会话已经创建并通知宿主路径；图片校验异常时未生成历史文件，retry的continuationFor对该路径lstat得到ENOENT。修复为在取得固定model后、创建SessionManager之前复验，阶段标记image_validation；取消同样在这里终止。手动压缩沿用既有历史，不额外重新附图。没有放开丢失历史文件的校验，也没有把已有历史当作可丢弃内容。

`output/dev-evidence/pi-parity/loop-001/image-retry-final.log`两项通过：图片四worker（校验失败、正式重试、无附件接续、带图命令）及原九交互worker；`image-retry-types.log`类型退出0。原图/历史保持、恢复字节及Pi原生读取等既有断言继续通过。失败未发模型请求，后续只有图片重试和接续各一次受控请求；没有通过增加额度解决失败。

全部句柄结束，无部署、真实模型调用或第三方安装。此处只证明附件校验失败后的正式重试，不外推为模型响应中途失败后的图片去重；恢复后实际worker、网页联合验证、真实识图、资源压力和历史分支/导入导出仍待完成。

## LOOP-045：图片接续、恢复及插件接管历史

上轮图片传输为有效进度。本轮扩大真实worker验证：首次有图任务完成后显式接续，不再附加资产，第二次模型请求仍携带同一data URL且仅出现一次；源会话字节保持。完成后停止调度并备份恢复，核对原图、接续历史完全一致，恢复路径已重映射，用固定Pi SessionManager.open读取恢复历史中的user image内容。此证据覆盖恢复文件与原生读取，不冒充恢复后模型worker执行；恢复后的插件仍按既有规则禁用。

发现两个相关问题并修复：插件接管prompt时宿主补记历史只保存纯文字，现同时保存实际图片和来源；上一轮把来源正文直接追加到prompt末尾，会干扰斜杠命令解析。来源改用manager.appendCustomEntry('workbench_image_sources',...)单独保存，不改变原始命令及其参数。新增本地命令夹具明确断言args为空；它携图执行完成、模型calls为0，历史包含图和原hash，备份恢复后的命令历史也完全一致。原生工具行为未改。

证据根`output/dev-evidence/pi-parity/loop-001/`：`image-continuation.log`接续/恢复初验通过；`image-history-regression.log`原九交互worker通过，但带图命令因未被正确识别尝试模型并被既有额度门禁拒绝（worker_failed:model_budget），保留失败；没有增加额度绕过。修复分离来源后`image-history-final.log`通过；增加明确参数/命令历史恢复断言后`image-history-arguments.log`三个图片worker通过，实际模型传输只发生在前两个任务；`image-history-types-final.log`类型退出0。

全部句柄结束，无部署、真实模型调用或第三方安装。尚需失败重试来源、恢复后的真实worker、网页联合验证、真实识图、图片资源压力；历史点分支与导入导出及其他PIF门槛保持未完成。

## LOOP-044：图片资产进入原生Pi消息

上轮关闭状态实现和回归为有效进度，生命周期剩余问题保持待办。本轮按完整目标推进尚未接通的图片输入：原路径只传assetIds，模型未收到图片。新增imageAttachments，使用固定Pi公开detectSupportedImageMimeTypeFromFile和resizeImage接口，先检查项目、资产可用状态、数量/总大小和模型input能力，再验证文件哈希、实际格式及可解码性。API在创建Task前预检，worker通过宿主RPC按Task固定资产再次读取，防止提交后内容改变直接进入请求。

图片使用session.prompt的原生images参数传入；提示正文记录顺序对应的资产ID、原图hash、发送MIME与原始/发送尺寸。原图不改，派生字节进入受原有会话容量约束的原生历史，无额外派生文件。初始支持PNG/JPEG/GIF/WebP，最多4张、原图合计20MB，重复ID不重复发送；BMP/其他格式转换尚未接入。模型设置快照额外暴露supportsImages（旧消费者兼容），不改变既有运行档位或原生read工具。

`tests/pi-image-worker.test.ts`真实HTTP提交→scheduler/worker→Pi模型传输请求，只有模型HTTP响应受控。断言请求实际含input_image及正确data URL，原生历史包含同图和资产来源，原图字节保持，calls为1；辅助断言跨项目、非视觉、伪图片、重复ID与第五张拒绝，伪图片API请求不创建Run。首个复制的PNG夹具无法解码，`image-worker.log`记录400；改为测试内生成带正确CRC的1像素PNG，`image-worker-recheck.log`通过，没有放宽产品解码检查。首次类型发现断言的可选错误消息类型，已修正。

证据根`output/dev-evidence/pi-parity/loop-001/`：`image-regression.log`五项通过（含原九交互worker、图片真实worker和三设置测试），`image-types-final.log`退出0。无页面改动，尚未做浏览器图片联合操作验证。当前是传输与历史证据，不代表真实模型识图效果；恢复/重试/备份、历史分支、插件接管时图片历史、大小/解码资源压力及完整来源追溯仍待验收。其他PIF缺口保持。

全部句柄结束，无部署、真实模型调用或第三方安装。下一步优先补图片恢复/重试来源与页面验证，同时保留原版对照及最终交付门槛。

## LOOP-043：关闭状态与队列保留

上轮收尾退出窗口及验证为有效进度。本轮检查发现stop只清除定时器，没有永久关闭状态，之后的tick仍可重新取得租约启动queued任务；并发stop也会各自清理和释放租约。新增同步stopping门禁，tick、launch及新后台维护均拒绝启动，stop缓存同一Promise，保留成功或失败事实；start在关闭后明确报错，已启动时不重复创建定时器。重新启动工作由新的宿主实例承担，不重置旧实例的清理状态。

真实交互worker测试在收尾通知后新增第二个queued任务，调用两次stop确认同一结果；退出前后调用tick，退出后任务仍queued且无workerPid，维护回调未执行，start被拒绝。正在收尾的原worker仍completed、原生关闭通知仍保存、插件读占用释放。没有取消排队任务或改写任务策略。

`output/dev-evidence/pi-parity/loop-001/shutdown-state-worker.log`12项全部通过，包含原八交互场景及一个收尾worker、五MCP场景和六大历史测试（含预检取消后关闭、32/127MiB原生fork与备份恢复）；`shutdown-state-types.log`类型检查退出0。大历史测试按既有脚本更新large-history证据。本轮无页面变更，不重复UI检查。

全部句柄结束，无部署/真实模型调用/第三方安装。强停时间边界的自然退出竞争、宿主崩溃监督、跨工具交互、MCP OAuth及其余PIF要求仍保持未完成，不能据此宣布生命周期完整或最终交付。

## LOOP-042：收尾工作进程的有界退出窗口

上一轮为用户进度答复，没有新增实现；本轮重新核对scheduler.stop、workerExited、requestCancel及实际测试后继续。原stop只给已终态Run等待750ms，仍running的worker即使正保存最后记录也立即强杀。现将同一窗口用于所有未在强停中的当前子进程；等待并行、有界、不改运行总预算，不伪造取消或完成。超时仍走当前ChildProcess对应进程树清理；taskkill失败仍保留占用并报错，不因父PID消失推定后代已清理。

新增真实插件命令夹具：发出可持久通知后延迟250ms，宿主在Run仍running时stop；断言最终completed、原生session_shutdown通知保存、插件读占用释放。该场景与原八个命令场景最终通过。MCP新增host-stop场景：服务已收到调用、不回复且不响应EOF，另有常驻孙进程；宿主stop等待后强停，两PID消失，工具原件仍running、重试仍需对账。五项MCP回归均通过。

证据根`output/dev-evidence/pi-parity/loop-001/`：`shutdown-grace-worker.log`保留首次结果（MCP五项通过、交互新增场景未启动）；`shutdown-grace-dialog-recheck.log`保留独立项目复验失败；检查调度源码确认未对账interrupted任务会阻止全局启动，不能仅换项目。测试核对前置强杀夹具停在第一个confirm、尚未写文件，使用正式acknowledge后才启动新项目的收尾命令。`shutdown-grace-dialog-final.log`最终通过（九worker），`shutdown-grace-types-final.log`类型退出0。没有为通过测试放开生产对账门禁。

本轮改善收尾过程，但并未完整解决750ms边界附近的taskkill与自然退出竞争；仍需进程生命周期协议/更强的清理确认，以及宿主崩溃、外部kill监督。无页面变更，无额外UI回归。全部句柄结束，无部署、真实模型调用或第三方安装；PIF其他缺口、完整原版对照及实际交付保持未完成。

## LOOP-041：多个待答问题与可见等待状态

上轮上下文动作拒绝及事件/工具验证为有效进度。本轮扩大真实动态工具夹具：同一工具用Promise.all同时发出A/B两个confirm，测试必须观察到两条pending再答复，按B→A倒序处理。全允许后才进入select并追加一行；拒绝B后即使A允许仍无写入；两问题均待答时取消整个Run，两个请求关闭，工具无副作用，模型请求停在第一轮。允许/拒绝正常结束后回到第二轮模型，等待期间calls不增长，初始事件询问仍在模型前。

`dialog-concurrent-worker.log`三worker通过。范围明确为同一真实工具内部并发询问，不冒充两个独立工具并行的完整证明。取消场景验证闭合全部等待和无写入，不推断任意插件会遵守输入结果。

页面增加独立待答问题数和等待送达回执数；文字说明局部等待时其他工具可能继续工作，未把Run强改成复用既有模型认证用途的waiting_user，也没有暂停总时限。显示顺序改为未结束的问题→历史答复→通知，避免窄窗先滚过通知才找到问题。浏览器使用隔离记录创建两个问题，刷新后仍2项，先拒绝第二个变1项，再答第一个变0项，逐问题状态正确。此浏览器路径用模拟调度回执，真实进程交互由上面三worker证明。

证据根`output/dev-evidence/pi-parity/loop-001/`：`dialog-concurrent-types-final.log`、`dialog-concurrent-build-final.log`、`dialog-concurrent-ui-final.log`退出0。初次UI已通过，但截图看到通知挤占问题显示后调整顺序，再构建/复验；最终`runtime-ui/plugin-concurrent-wait.png`已查看，摘要与当前问题位于前方，全部控件经自动滚动实际点击验证。无后端行为变更，不额外重复无关测试。

全部句柄结束，无部署/真实模型/第三方安装。下一步跨工具并行与宿主失联/清理进程树竞争，以及MCP OAuth/实时诊断；图片、历史分支、导入导出、原版对照和最终交付继续按完整目标推进。

## LOOP-040：上下文命令真实边界及事件/工具交互

上轮等待设置和写入顺序调整为有效进度。本轮核对固定SDK runner：未绑定的newSession/fork/navigateTree/switchSession默认返回cancelled:false，reload空返回，存在插件误以为操作成功的缺口。worker显式绑定这些动作到拒绝实现；PiDialogs在命令上下文提供带来源的错误通知并抛出明确错误，不运行withSession回调、不改变会话。waitForIdle接原生session.waitForIdle。此处是明确兼容边界，不是实现分支或新会话；PIF-10范围保持。

真实命令contextcheck逐个调用五种动作并检查均拒绝、回调未运行、sessionId不变，五条错误通知均保存，模型calls=0；waitForIdle实际返回。加入原场景后`dialog-context-worker.log`八worker命令路径通过（正常/超时/信号取消/通知洪泛/冻结等待上限/上下文拒绝/取消/强停）。

新增`tests/pi-dialog-tool-worker.test.ts`：真实scheduler→worker→Pi，只有模型HTTP受控。插件在session_start询问，答复前calls=0；随后动态注册工具，原生工具执行中select等待，持久tool_execution为running且来源为该扩展，模型calls保持1、真实文件无写入。分别选择write和skip，两独立worker最终calls各2；允许仅追加一行，跳过没有写入，通知/交互delivered/工具completed及原生历史相符。它验证实际原生循环等待，不以命令夹具替代工具路径。

新夹具第一次安装命令ID过短，被既有校验拒绝，`dialog-tool-worker.log`保留。第二次连接总请求额度仅3，两worker需4次，第二worker被model_budget正确拦截，`dialog-tool-worker-recheck.log`保留；仅将隔离夹具连接额度改6，单任务仍3，无真实模型调用，未改产品额度。`dialog-tool-worker-final.log`两worker通过；`dialog-context-types-final.log`类型退出0。证据均位于`output/dev-evidence/pi-parity/loop-001/`。本轮无前端改动，沿用已验证的通知显示，不重复浏览器构建。

所有句柄结束，无部署/真实模型/第三方安装。下一步独立等待状态、同时多个工具询问/取消边界、清理退出竞争；MCP OAuth/实时诊断、图片/历史分支/导入导出、原版任务对照及实际交付仍保持完整范围。不能因五种命令明确拒绝而宣称拥有对应功能。

## LOOP-039：可配置用户等待期限

上轮通知贯通与只读回执修复是有效进度。新增userWaitTimeoutMs设置（默认300000，1000–86400000毫秒），PiSettings读取旧配置时提供默认但不改库；设置保存有CAS/类型/范围校验，新Run冻结此值。已有Run和重试不被新设置重写。worker默认问题使用冻结值；插件自定更短期限可用，自定更长被宿主createInteraction按冻结值截住。旧Run无字段时保留原默认及插件timeout行为，不回填伪造历史。

工作进程不再在请求持久化前启动本地timeout，而是在收到宿主expiresAt后按该截止点设timer。这样插件等待和HTTP答复判定同一期限；取消信号仍可提前结束。页面设置可保存/重开、运行卡显示每题上限。明确每题等待与网络无响应不同，任务总时限依然继续，先到者生效；没有通过等待隐式扩张用户批准的任务时长。独立waiting状态、暂停工作计时策略及更多真实工具/事件等待仍需进一步完成，不能关闭PIF-04。

真实worker新增waitcap命令：插件请求60秒，Run冻结1秒；实际等待到期限后返回不批准，交互expired，Run无timedOutAt且calls=0。设置测试证明非法值拒绝、新Run冻结、旧Run/重试/数据库重开保持原值。浏览器设置900秒并重开/提交，实际policy为900000。原有答复、丢HTTP回执、短超时、AbortSignal、通知洪泛、取消、强停共七worker场景联合运行。

第一次联合测试`dialog-wait-final.log`五过一失败，真实abortinput Run报worker_failed:storage_busy（通过独立只读库确认场景，不输出输入内容）；不因复验通过删除失败。调整worker在命令专用原生历史写入前flush通知，避免宿主通知写入与本地历史写盘重叠；宿主通知使用capacity.exclusiveAsync有界1000ms等待，仅重试取得锁，不重放保存回调。此修复针对新通知并发，不宣称解决全部存储竞争或038进程树清理失败。

证据根 `output/dev-evidence/pi-parity/loop-001/`：`dialog-wait-recheck.log`六项通过（含七worker）；`dialog-wait-types-recheck.log`类型退出0；`dialog-wait-build.log`构建退出0；`dialog-wait-ui.log`浏览器退出0，`runtime-ui/settings-small.png`已查看，窄窗设置可达。浏览器在最终通知锁调整前运行，之后仅worker/宿主写锁顺序改变，已用实际worker复验。最终SHA256：pi-settings.ts `37F11EC8ED9563857A8BA3B9BD8473431AC2FD46CA403E7F4C0AC881EABE2B1B`；pi-dialogs.ts `1010F3398CC1244D7F78D5D83192A98E189DB8DD61FC02881C72B5F30F7FD449`；worker.ts `D838D4305492E92C46C79C89A848EDCD9D59CD18E1ED77D60258AD9D3187F81E`；scheduler.ts `DB606A94C68CB528C8124B0AE7CCE8E6A0BC760D2BC498A4B7CB23B0BC938857`。

全部句柄结束，无部署/真实模型/第三方安装。下一步独立等待显示与工具/事件路径真实验收、命令上下文和清理竞争；MCP OAuth/实时诊断、图片/分支、固定原版对照与交付保持完整范围。

## LOOP-038：普通插件通知与回执写锁竞争

新增PluginNotice与宿主recordPluginNotice：固定Run/扩展来源、通知ID、info/warning/error、正文、缩短标记；来源校验、同ID幂等/冲突、写入和事件同事务，API按Run返回。PiDialogs桥接ctx.ui.notify并有序异步保存，正常及取消后的session_shutdown通知在终态回执前flush；保存失败不能把通知当已交付。MCP专用启动摘要观察仍保持，未改成保存原始服务错误。

worker在IPC前遮盖已知用户input值、启动/续请求模型凭据和本次MCP环境值；按原文精确替换，不保证识别插件自行取得或编码后的秘密。通知过65536字符用固定超长说明替代，8k以上明确缩短；每Run100条加一条限额说明，后续忽略且不继续积累队列。前端纯文本显示来源、时间和级别，刷新重新读取；备份保留通知。真实命令故意回显受控输入和模型密钥，库里只存[已隐藏]。

复验再次失败，日志`plugin-notice-flood.log`首次给出了完整前因：另一页冲突答复预期409，实际423（worker保存历史占用容量锁）；随后finally中Scheduler.stop遇到进程树终止失败。修复前者：answerInteraction读取已保存回执/已终态冲突不再申请写事务；真实新答复仍在事务内重新检查，保证并发不覆盖。新增强制容量锁失败时重复回执仍可读/冲突仍409的测试。清理退出竞争尚未修复，不把前者原因推广为036全部失败的确定根因。

证据根 `output/dev-evidence/pi-parity/loop-001/`：`plugin-notice-worker.log`四项通过，含MCP动态/交互/备份；增加洪泛后失败日志上述保留；修复后`plugin-notice-final.log`三项通过（worker包含正常/超时/AbortSignal/洪泛/取消/强停六执行、只读回执与备份事务），通知101条上限和缩短标记通过。`plugin-notice-types-recheck.log`类型退出0，`plugin-notice-build.log`构建退出0，`plugin-notice-ui.log`浏览器退出0，`runtime-ui/plugin-notice.png`已查看，窄窗文本正常换行。浏览器通知注入验证持久HTTP/UI，原生通知另由真实worker验证。

所有句柄结束，无部署/真实模型/第三方安装。下一步独立等待期限/状态、工具及事件入口真实交互、命令上下文与清理退出竞争；OAuth、MCP实时状态、图片/分支、全量对照交付仍按原计划。PIF-09仍doing，不把基本四类UI桥接当完整兼容证明。

## LOOP-037：答复丢回执与备份恢复

上轮基本交互贯通属于有效进度。本轮新增真实HTTP故障：在输入答复服务端已处理、准备响应时销毁响应连接，客户端fetch确实失败；同命令重发读取原回执，worker仍收到原输入，持久answered事件只有一次。确认/选择、未登录401、另页409、超时/取消/强停继续验证。增加插件自身AbortSignal取消input，原生命令收到undefined，记录关闭而不是代填内容。

新增备份恢复验证：外部进程失联后Run已interrupted，但交互退出回调未写入时，原库可能仍有pending/answered。原interactionView已禁止在中断Run答复，故不是恢复库可批准旧问题的漏洞；不过底层状态未明确收束。restore现调用closeInteractions(restored)关闭未完成请求，保留delivered历史回执，原库不变。秘密输入不进入恢复库或事件，同命令旧回执不能重发值。首次夹具误在running状态备份，被已有在途保护正确拒绝；改为实际中断状态后复现底层pending未关闭，再修复。

证据根 `output/dev-evidence/pi-parity/loop-001/`：失败日志`dialog-backup-before.log`（在途备份拒绝）、`dialog-backup-before-closed.log`（状态未收束）；修复后`dialog-recovery-final.log`六项通过，含交互状态/备份、真实worker丢回执和工具对账/备份回归；`dialog-recovery-types.log`退出0；增加input取消后`dialog-recovery-abort.log`五worker专项通过。命令为Node24 `--import tsx --test tests/plugin-interaction.test.ts tests/pi-dialog-worker.test.ts tests/tool-progress.test.ts`、后续单独worker专项及tsc --noEmit。无UI变更，本轮不重复浏览器构建。server/backup.ts SHA256 `A1872C5CE8FA240DD3597099FA467BAA076BDE97A7D314F24F967F6EED59F2B5`；server/plugin-interaction.ts `8E81C7C46D0E3BE5658CBB805BBB67F7CF69CA9C1632DC0776D04ED3AEC7B075`。

全部命令结束；未部署/真实模型/第三方安装。036偶发测试清理失败本轮未再现，根因仍未确定；不因此关闭。下一步普通notify、独立用户等待时限与配置、工具/事件入口真实交互及命令上下文；MCP OAuth/实时诊断、图片/分支、原版对照与实际交付仍按完整计划推进。

## LOOP-036：插件基本交互贯通

上一轮MCP提醒接入是有效实现进度。本轮推进PIF-09依赖中的基本交互。新增PluginInteraction schema：固定run/source/id、类型/题目/选项/期限，pending→answered→delivered以及closed/expired。请求与答复状态/事件同事务；服务端核对本Run允许扩展来源，16个待答/500个总请求上限。答复校验类型/选择项/CAS归属，命令ID重复只读取原回执、不替换或再次投递；另一页面答复冲突拒绝。

输入值只在HTTP及原worker IPC内传递，不写entities/events/commands或持久摘要；仅保存答复命令ID及时间。相同命令重复即使带不同值也只能取原回执，不能重新发送。进程回执表示已收到值，不等于插件目标完成；丢失进程不能从持久记录重建输入或自动重放。插件自身仍可能使用/记录输入，页面不作全系统保密承诺。

PiDialogs包装固定SDK扩展的事件上下文、工具execute及命令handler，并处理后续工具/命令注册；ctx.hasUI对这些入口为true，基本confirm/input/select真正等待。custom/editor明确抛不支持，不返回虚假成功。普通notify及命令上下文动作仍未完成。MCP启动提醒观察继续保留。worker取消/结束清理本地等待；宿主真实exit关闭未完成记录，已停止Run的读取视图也禁止答复，原worker身份不匹配时拒绝发送。登录/同源保护沿现有API。

对话运行卡显示来源、问题、期限、同意/拒绝/提交/取消和回执；刷新读取原请求，输入框隐藏字符且提交后清空。关闭页面不代答，不把等待改成另一个Run。默认等候5分钟，插件timeout可设1ms–24h，但目前总任务运行时限仍照常计算：独立用户等待设置/暂停工作计时尚未完成，不能关闭PIF-04。

验证证据根 `output/dev-evidence/pi-parity/loop-001/`：`plugin-interaction-state.log`持久事务回滚/重复/冲突/拒绝旧run/选择类型/过期/只读重开/输入不落普通库通过；`plugin-dialog-worker.log`真实命令worker通过HTTP依次收到确认/输入/选择，未登录401、重复200、抢答409、超时返回不批准、主动取消关闭。`plugin-dialog-final.log`八项相关回归通过，含MCP动态撤回和插件注册保护；`plugin-dialog-types-final.log`及后续`plugin-dialog-final-types.log`退出0；`plugin-dialog-build.log`、`plugin-dialog-ui.log`退出0。浏览器为独立数据的UI/HTTP持久路径，模拟调度答复；实际worker另测，未冒充统一端到端。截图`runtime-ui/plugin-dialogs.png`已看，窄窗滚动可达。

增加等待时强停后，`plugin-dialog-crash.log`曾在首个正常答复场景约3秒报告失败，随后测试进程未退出；只读库确认三条delivered和Run completed，没有足够错误栈，原因未定位。核验进程命令行及父子身份后只终止该测试树95724（含测试子进程和esbuild），句柄19016最终退出1。加强测试finally：清理报错时输出错误并关闭测试HTTP，避免失败后遗留监听。`plugin-dialog-crash-recheck.log`及`plugin-dialog-crash-confirm.log`两次四worker（正常/超时/取消/强停）复验通过，强停记录closed、Run interrupted。不能据两次成功宣称偶发清理问题已修复。

全部句柄结束，无部署/真实模型/第三方安装。PIF-09维持doing；下一步普通通知、独立等待期限/状态、工具及事件入口真实交互、HTTP答复丢失/进程退出边界/备份验证与偶发清理失败定位。OAuth、实时连接诊断、宿主崩溃监督、其他PIF和原版对照/实际交付范围保持，不缩成仅基本弹窗验收。

## LOOP-035：原生MCP启动提醒贯通

上一轮真实worker撤回验收属于有效进度。本轮核对固定Pi 1.0.3 MCP源码：连接onChange为内部接口，启动失败/需要登录通过ctx.ui.notify报告，默认非交互UI会吞掉。新增仅针对builtin:mcp事件上下文的通知观察，保留hasUI及原生处理逻辑，不宣称支持完整交互。仅解析白名单类别和本Run配置服务名称；原始stderr、URL、认证消息不经IPC写入普通记录。宿主再次核对配置归属、重建安全对象，同类提醒去重、最多100项，写入Run和事件。

对话运行卡新增“MCP连接提醒”，即使没有托管插件包也显示。明确提醒是历史事实，不冒充实时连接状态；引导到插件管理核对配置/凭据。原生startup summary对failed不带底层错误，真实缺失程序因此显示通用连接失败，未猜测ENOENT。首轮测试错误地要求program_missing失败，日志保留；只有原文确实包含对应错误时才细分，单元测试覆盖含秘密的输入只返回类别。

真实worker动态测试增加独立缺失程序服务：其他MCP仍正常完成撤回/恢复，失败服务提醒持久化，诊断不含临时路径。证据根 `output/dev-evidence/pi-parity/loop-001/`：`mcp-diagnostic-final.log` 六项通过；`mcp-diagnostic-types-final.log`、`mcp-diagnostic-build.log`、`mcp-diagnostic-ui.log`退出0。运行Node24的tsx测试（diagnostics/dynamic-worker/worker）、tsc --noEmit、vite build及scripts/pi-runtime-ui-qa.ts。浏览器使用隔离数据与注入运行记录验证HTTP刷新/中文提醒，不冒充真实认证故障；真实连接失败另由worker测试证明。`runtime-ui/mcp-diagnostics.png`已查看，窄对话窗换行正常。

改动：shared/mcp/contracts、server/mcp-diagnostics/worker/scheduler、plugin-run-details及测试/UI脚本。全部命令结束；未部署、未用真实模型或安装第三方包。实时状态、断连状态刷新、连接测试和OAuth尚未完成，PIF-08仍doing；PIF-09完整通知及确认/选择/输入也未完成。下一步继续实时诊断与授权交互，宿主崩溃监督/并发未知结果和全部原版对照交付保持原范围。

## LOOP-034：真实worker动态工具撤回与恢复

新增 `tests/pi-mcp-dynamic-worker.test.ts`：使用真实app、scheduler、worker、Pi原生MCP工厂及独立stdio服务，仅模型传输受控。首次真实调用后服务发list_changed撤回工具，测试等待原生active目录确认；模拟仍在途的模型返回旧codemode调用，确认服务未收到WITHDRAWN。下一模型请求不再声明工具；恢复通知后下一请求重新声明并实际调用RESTORED。两次MCP执行均持久化completed且来源builtin:mcp，拒绝的codemode保留failed但无未知副作用标记，原生历史包含恢复结果，正常关闭后MCP进程消失。

首轮在模型请求已经发出后恢复目录，并要求同次请求直接调用新恢复工具，服务只收到BEFORE，证据 `mcp-dynamic-worker.log` 保留。修正为在下一模型请求验证恢复，并断言真实请求工具声明的撤回/恢复；不把目录已更新当成本次在途请求已有工具。单测复验通过。类型检查发现可选错误消息的断言重载不匹配，已补默认消息。

证据根 `output/dev-evidence/pi-parity/loop-001/`：`mcp-dynamic-final.log` 六项通过（动态worker、SDK、direct/codemode、嵌套许可失败、Windows进程树强停）；`mcp-dynamic-types-final.log` 类型退出0。命令使用Node24运行 `--import tsx --test tests/pi-mcp-dynamic-worker.test.ts tests/pi-mcp-builtins.test.ts tests/pi-mcp-worker.test.ts` 及 `node_modules/typescript/bin/tsc --noEmit`。最终测试文件SHA256 `1E13CD930DFD1B7DFB581AFD431F5E9633947C6B174E95B43F272FB064534771`；回归后仅补断言错误消息默认文本，无行为变更。未改产品代码，无部署/真实模型/第三方安装，全部句柄结束。

上一轮整理计划只产生文档进度，不能算功能交付。本轮关闭真实worker撤回验证缺口，不关闭PIF-08；下一步连接诊断/OAuth交互，宿主崩溃监督及并发未知结果仍待做，完整PIF/PIV对照与交付范围保持。

## LOOP-033：MCP私有凭据与执行引用

沿用PrivateFiles仅宿主用户可访问目录（Windows ACL/POSIX权限），为MCP增加全局/项目独立私有记录；明确不是加密保险库。凭据名称限定MCP_大写变量、条目与总大小有界；保存/移除用存储锁和版本检查，普通API仅返回名称/版本，不回显密钥，不写SQLite或事件。普通备份排除私有目录，恢复后缺失凭据明确拒绝执行。项目值覆盖全局，全局覆盖环境；移除项目覆盖会重新暴露全局/环境值，页面明确说明。

调度器在fork前解析明确引用的名称，只有所需值经IPC传入worker。私有文件随机身份+被引用条目版本参与非秘密运行签名，轮换/恢复重建/改变来源阻止旧会话静默换凭据，无关条目改变不使当前配置失效。环境变量自身的外部轮换仍无法由私有条目版本追踪，不冒充已覆盖。未启用MCP不读取私有凭据。

页面增加“MCP 凭据”保存/移除和状态读取；密码输入提交后清空，不写浏览器持久缓存。鉴权/同源、CAS冲突、项目隔离、来源回退、轮换兼容拒绝、普通记录与备份不含秘密经测试验证。真实HTTP direct场景删除环境变量，使用私有凭据实际连接成功；mcp-credentials.log八项通过，类型/build/UI退出0，credentials.png已查看。浏览器验证保存后输入清空、不回显、API不含值及移除。

所有命令结束，无部署/真实模型/第三方安装。尚缺OAuth授权交互、凭据轮换后的多页面体验与连接诊断；宿主崩溃监督/并发未知结果/真实worker撤回及其他PIF与最终对照交付范围保持。

## LOOP-032：未知结果备份恢复与基础MCP表单

新增未知MCP结果备份专项：原始failed+outcomeUnknown及完整回执在恢复库中保留，恢复门禁仍拒绝继续；人工核对事件保存故障时事务回滚、版本不变；相同版本同结论重发返回同一结果，不同结论被拒绝，最终只一条核对事件。核对后failed/unknown原始事实和回执链接不改，恢复门禁解除；恢复库操作不影响原库。mcp-unknown-backup.log三项通过。该测试覆盖重复/冲突提交语义，不冒充多进程同时写入压力测试。

增加基础“用表单添加服务”：HTTP或stdio、名称、地址/程序、逐行原样参数与暴露方式。合并进入现有编辑文档后仍需预览/信任/保存；现有JSON无效拒绝添加，同名服务拒绝覆盖，其他顶层配置和服务保留。认证、环境变量和高级项目覆盖仍用JSON，不能称为完整无代码配置或OAuth向导。

真实浏览器/HTTP在原MCP页面验证上新增HTTP/stdio表单、同名拒绝、路径含空格参数原样保存、加入表单不提前写服务端、保存未启用不影响有效服务。mcp-form-types/build/ui退出0，server-form.png已查看，窄窗表单可滚动。所有命令结束，无部署/真实模型/第三方安装。

下一步仍需凭据/OAuth与连接诊断、宿主崩溃/外部kill监督、MCP并发未知结果及真实worker动态撤回验证；其余PIF范围、固定原版对照与实际交付保持。

## LOOP-031：MCP失败副作用待核对

ToolProgress/ToolExecution增加可选outcomeUnknown。进入MCP执行阶段后发生错误的mcp__工具保留phase=failed、完整原始结果，并附加未知副作用标记；参数/许可阶段未进入执行的拒绝不加标记。当前不能可靠区分“服务内部部分写入后报错”和“未写入报错”，因此对已进入执行的失败保守要求核对。worker在收到此失败后abort本轮，并在前置调用入口阻止后续调用；不承诺撤销此前已经并发发出的请求。结果保存完成后以mcp_outcome_unknown结束，不把工具失败误报为本轮正常完成。

恢复门禁从仅phase=running扩展到outcomeUnknown，retry/continuation沿既有共同检查阻止恢复。人工核对接受这类failed记录，仍检查Run终态、进程已退出、归属、版本和依据，不覆盖失败结果。工具详情显示“调用失败，但操作可能已发生”及现有核对表单，核对结论继续传给后续执行。

真实HTTP七场景mcp-unknown.log通过；断连场景由030的第二次不同调用可成功，更新为本轮不再发第二次调用，服务日志只有lost-receipt。超时/取消/断连均生成failed+outcomeUnknown，恢复被拒绝，保存实际服务记录为依据后门禁解除且failed及原始结果链接保留。缩小到实际执行阶段后mcp-unknown-final.log三故障场景复验通过，final-types退出0。七项既有工具/真实worker回归mcp-unknown-regression通过。

页面真实浏览器/HTTP验证failed未知记录可核对并随后接续压缩，mcp-unknown-ui及build退出0；tool-recovery.png已查看，原失败状态与人工核对结果并存。所有命令结束，无部署/真实模型/第三方安装。尚需未知标记备份恢复专项、多MCP并发中断/服务错误分类更精细验证；宿主崩溃监督、PIF-08其余入口与其他PIF、最终对照交付不缩减。

## LOOP-030：HTTP回执丢失与未知副作用缺口

真实HTTP MCP服务在收到首个tools/call并记录operation=lost-receipt后主动destroy响应连接；下一轮受控模型明确发起不同operation=new-explicit-call。实际服务记录恰好两条且顺序一致，原生传输未重放第一次调用；第二条调用成功。持久工具回执分别failed/completed，模型请求共三次，不存在隐藏模型重试。环境凭据继续验证不进入实体/事件/原生历史。mcp-disconnect.log与mcp-disconnect-types通过，所有命令结束，无真实模型/安装/部署。

这个测试只证明固定Pi原生传输不自动重放、后续不同调用恢复可用，不能证明工作台未知副作用对账完整。检查现有recoveryTools/requireToolReconciliation和页面发现：只把phase=running视为待对账，MCP回执丢失则已经生成failed终态；即使服务端可能写入，仍可能允许接续。因此新增明确缺口：必须区分“调用返回错误”和“副作用未发生”，给MCP传输/超时/取消执行失败建立结果未知标记及页面核对入口，并将恢复限制与当前执行后续行为接通。不可删除原始failed结果、冒充工具未执行，也不可仅靠提示语替代对账门禁。

下一步优先补这条端到端路径，再处理宿主崩溃/外部kill监督与其余PIF-08入口/诊断、其他PIF和最终对照交付。测试中的第二次明确调用是传输恢复探针，不代表产品应允许未知写操作未经核对继续。

## LOOP-029：异步进程树清理与退出竞争

Windows进程树终止从spawnSync改为execFile异步调用，保留绝对系统工具路径、无shell、隐藏窗口、5秒超时及输出上限；不再同步占用主服务线程。scheduler按Run合并清理Promise，worker退出处理等待清理结果，之后才删除子进程跟踪和释放插件读锁。取消/时限到期在确认退出后完成对应终态；清理失败保留环境占用并报告中断，acknowledge拒绝只凭worker PID消失对账。

首次mcp-async-stop.log六项通过一项失败，实际worker已收到终态回执并在自然退出期间，stop又发taskkill导致进程不存在错误。stop现在对已有终态、尚未发起强停的worker最多等待750ms自然退出；未退出再强停。没有把未知清理失败简单转换为成功。mcp-async-stop-recheck.log七项通过，含不合作MCP与孙进程强停及既有取消/中断；后续ack保护改动mcp-async-stop-ack.log三项通过，mcp-async-stop-final-types2退出0。失败日志保留。

全部命令结束，无部署/真实模型/第三方安装。已确认异步实现和实际回归，不声称完成HTTP服务负载下的时延测量。宿主自身崩溃/外部直接kill遗留进程回收仍待独立监督与恢复机制；非Windows仍未保证整棵树。PIF-08其余入口/诊断/断连与其他PIF、最终原版对照和交付范围保持。

## LOOP-028：Windows宿主强停回收MCP进程树

新增terminateOwnedProcessTree，仅接受当前ChildProcess句柄并检查exitCode/signalCode，不接受持久PID进行回收。Windows使用SystemRoot下的taskkill.exe /T /F，隐藏窗口、不通过shell、最长5秒；主动强停、取消/时限宽限期到期和scheduler.stop均改走该路径。失败不声称已终止；stop返回失败而不是无期限等待。非Windows暂保持原child.kill行为，不宣称支持全进程树回收。同步系统调用可能短时占用服务线程，最长5秒的性能边界需后续改为可观测异步清理。

真实worker测试服务故意忽略stdin关闭，并用定时器保持存活；另启动一个常驻子进程，记录其PID。收到工具调用并写入调用日志、尚未响应时由宿主强停worker，检查MCP及孙进程PID均不存在。Run仍是interrupted，工具仍running/未确认，retry被要求对账，未把进程回收伪装为副作用未发生。

证据：mcp-force-stop.log七项通过，包含现有实际worker取消/中断/未知HTTP写入与MCP direct/codemode/嵌套许可；增加孙进程后mcp-force-stop-tree.log通过；mcp-force-stop-final-types退出0。所有测试结束，无部署/真实模型/第三方安装。

剩余明确边界：这是仍存活宿主发起的Windows强停。外部直接杀worker、宿主自身崩溃、父进程已退出后遗留子进程，不能依赖此路径收尾；需要独立监督/身份登记和恢复机制。断连重连、真实worker撤回/重现、OAuth/连接诊断/友好表单、024偶发model_request失败及其余PIF、原版对照与最终交付保持未完成。

## LOOP-027：MCP工具撤回与重现

扩展真实stdio内置工厂测试，服务通过受控文件切换tools/list内容并发送list_changed通知。撤回echo后，原生active loadout不再含该工具；通过实际Pi模型/工具循环要求codemode调用它，原生返回失败且服务调用日志没有新增。随后服务重新提供echo，工具回到active loadout，新的codemode轮次实际调用成功；最终关闭时子PID消失。全程沿真实SDK、原生MCP传输及宿主guard，只有模型响应受控。

范围限定：这证明原生工厂与宿主防冲突适配的撤回/重现行为，不冒充真实scheduler/worker多进程的完整撤回验证。现有Run.pluginTools是来源登记，不能把其中工具名仍存在解释为它当前可调用；可调用性继续由原生exposure/loadout检查控制。

检查强停路径确认scheduler目前主要终止直接worker；异常情况下不配合stdin关闭的MCP子进程回收仍没有证据，不能据正常session_shutdown/PID测试宣称已解决。后续需要验证真实worker强停并落实受所有权约束的进程清理，避免仅为测试增加合作退出行为。

证据：mcp-withdrawal.log通过；mcp-withdrawal-types退出0；mcp-withdrawal-regression.log六项通过，原插件冲突/命令/错误取消保持。全部句柄结束，无部署/真实模型/第三方安装。PIF-08继续doing；凭据OAuth/连接诊断/友好表单与其他PIF、最终原版对照和交付范围不变。

## LOOP-026：真实HTTP MCP暴露级别、凭据引用与取消

新增独立真实HTTP MCP服务与仅拦截模型HTTP的受控传输。真实scheduler/worker连接本地HTTP服务，环境引用经IPC送达后Authorization验证通过；测试检查entities/events及原生历史不包含随机凭据值。direct首次声明并调用；deferred首次不声明，tool_search加载后下一请求声明并实际调用；hidden既不声明，也不能通过codemode绕过调用。缺失引用时fork前拒绝，workerPid为空且HTTP无请求。故意不响应tools/call时原生3秒超时返回失败工具回执、HTTP关闭；主动取消执行后回执失败、Run取消、HTTP关闭。没有把工具错误后本次执行结束等同于任务验收成功。

首轮deferred断言失败，检查原生历史及固定Pi provider源码后确认实际是Responses协议使用additional_tools消息承载新工具，顶层tools只含初始工具。测试改为检查协议中的全部声明位置；未改原生运行逻辑，也未降低为只检查调用成功。mcp-http-worker.log失败证据保留，recheck三项通过；扩展后的mcp-http-lifecycle.log六项通过。

发现并修复真正兼容缺口：原生MCP在tools/list_changed时重新登记同源工具（包括将撤回工具改为hidden），guard此前会把同源刷新误判为冲突。仅允许builtin:mcp更新自己已拥有的工具名；原生保留名与其他来源冲突仍拒绝。真实stdio服务在调用后发送list_changed通知，guard观测到再次登记，再执行原生codemode调用及关闭。mcp-refresh.log六项通过，含插件名称/命令冲突与原生错误取消回归；mcp-http-final-types退出0。

所有句柄结束，无部署/真实模型/第三方安装。已证明的是六个HTTP正常/故障场景和同源列表刷新，仍缺断连重连、工具撤回隐藏/重现、worker强停的MCP子进程回收，以及凭据/OAuth交互、连接诊断和友好表单。024偶发model_request失败尚未定位；其他PIF缺口、原版对照和最终交付范围保持。

## LOOP-025：MCP配置页面与可恢复编辑

插件管理增加“MCP 外部工具配置”，全局/项目范围可选；导入本地JSON文件或手动粘贴，记录来源，使用服务端原生验证预览合并后的来源/覆盖/暴露级别。预览与保存不启动进程；默认可保存未启用配置，启用需独立信任勾选，修改后预览与确认失效。未保存修改时锁定范围，提供明确放弃重读按钮，冲突/未知保存响应保留输入并提示核对服务端，不自动覆盖。界面明确路径属于服务端、环境变量引用要求以及保存不代表连接成功。codemode/tool_search可显式选择；当前仍为JSON配置入口，不把它称为完整的无代码连接向导。

恢复修复：全局服务删除可能使项目仅覆盖配置失去基定义；GET原先会整体失败，页面无法修复。现在仍返回原全局/项目文档及diagnostic，worker manifest校验保持拒绝，页面可编辑修复后再预览保存。

新增test:pi-mcp-ui，真实浏览器/HTTP/持久存储验证文件导入、未启用保存、信任启用、项目覆盖、多页面全局版本冲突保留输入、明文凭据拒绝、窄窗、无效项目覆盖显示并修复；不启动外部服务。mcp-ui-recovery.log和build-recheck退出0，mcp-ui/report.json passed/errors空；project-config.png已实际查看，窄窗可滚动且无横向溢出。mcp-ui-recovery-types退出0，mcp-ui-config-regression三项通过。全部句柄结束，无部署/真实模型/第三方安装。

下一步PIF-08真实HTTP/deferred/tool_search、隐藏可见性与完整生命周期，环境引用实际进程/HTTP验证、凭据/OAuth入口和友好表单；继续追踪024偶发model_request失败。页面当前未把动态连接状态误作已成功，实际连接诊断的可读呈现仍待补。其他PIF缺口及最终对照/交付范围保持。

## LOOP-024：真实worker MCP与嵌套工具持久许可

worker现在将Run冻结的MCP配置传给内置工厂，启用时绑定内置扩展；保留原生direct/codemode/deferred激活机制，不把所有已注册工具一律激活。宿主只接受冻结配置允许的三个builtin来源。环境引用在fork前检查，经启动IPC传入worker，在Node启动之后设置，避免引用NODE_OPTIONS等变量直接影响宿主启动；快照仍只有引用，未将值持久化。凭据保险库/OAuth入口、环境引用实际服务联合测试尚待完成。

动态注册从单向消息改为持久RPC，目录写入与事件同事务并有1000ms锁获取等待；初始目录回执后补发当前目录，消除期间异步注册被初始快照覆盖的窗口。工具进度等待目录回执。扩展工具执行函数（包括MCP和codemode）增加持久beforeCall屏障，覆盖原生嵌套路径不经过公开agent.beforeToolCall的情况；所有原生工具嵌套路径仍须另行审计，不把此项扩大为全工具证明。

新增真实scheduler/worker测试，仅模型HTTP受控，MCP自建JSON-RPC子进程实际initialize/list/call。direct调用、codemode嵌套调用均保存来源、完整结果与原生历史，正常及失败退出后PID消失。对嵌套MCP的tool_execution插入施加故障，父codemode可开始但MCP服务未收到调用，执行失败且清理子进程；原工具强停/对账/接续测试保持通过。

验证：mcp-worker-recheck.log十项通过（配置/HTTP、真实MCP、指导、插件原生注册与错误/取消）；mcp-worker-nested.log两项通过；最终mcp-worker-admission-recheck.log四项通过，mcp-worker-final-types2.log退出0。失败日志保留：首轮plugin_bind暴露保留active工具时误带入未授权业务工具，已改为仅保留builtin来源的原生活跃工具；一次联合验证direct在model_request阶段失败，原因未证实，增加注册事务/锁等待后复验通过但不据此认定根因已解决。临时诊断写文件代码已移除。所有句柄结束，无部署/真实模型/第三方安装。

下一步PIF-08配置页面与导入来源/凭据交互、真实HTTP/deferred/tool_search及隐藏工具可见性、断连/超时/取消/强停清理；继续检查上述偶发失败。PIF-08仍doing，其余PIF缺口、原版对照与最终交付不缩减。

## LOOP-023：MCP配置持久化、预览与运行快照

新增全局/项目mcp_config与鉴权、同源HTTP预览/保存接口。使用固定Pi原生验证器，保留项目enabled/exposure/toolExposure覆盖及来源，检查工具命名空间冲突。保存和启用分离，启用须明确可信；预览和保存不启动进程、不联网。CAS同时校验项目与全局版本，事件失败事务回滚，备份恢复保留配置。敏感header/env要求环境引用，拒绝URL凭据与OAuth clientSecret；这不等于已提供通用凭据保险库，参数中的任意秘密尚需后续处理。

Run新增mcpManifest，调度器在fork前冻结定义与来源签名；显式启用空配置与默认未启用区分。已执行来源的签名改变时拒绝接续，旧会话按未启用处理；从未开始的失败预检可使用新配置。新增仅提取已启用服务所引用环境变量的辅助函数，缺失引用明确报错，值不写入快照；该函数尚未接入worker环境。修复JSON 1e309得到Infinity后可能被原生timeout验证接受的边界。

验证：mcp-snapshot-types.log退出0；mcp-snapshot-regression.log四项通过。增加真实Run快照断言后mcp-snapshot-final.log三项通过、一项失败：后续取消用worker未在7秒内进入等待工具；未采集到足以定位的失败状态，不能归因为纯性能波动。同一代码重跑mcp-snapshot-recheck.log四项通过，含配置/HTTP/作用域/事务/备份、显式空配置、兼容与凭据引用、真实worker指导及实际Run快照断言。保留失败证据，后续真实worker联合验证需关注此边界。所有测试进程结束，无部署、真实模型或第三方安装。上轮仅回复计划入口，没有推进实施；本轮已恢复代码与证据推进。

未完成：worker尚未传BuiltinResources或启用MCP，配置active当前仅表示已批准意图，不证明执行中已加载；页面尚未提供配置管理。下一步接入冻结配置与环境引用、内置工具来源和动态注册持久回执，保留hidden/deferred可见性与嵌套工具许可，再做真实worker MCP及HTTP/deferred/取消/关闭验证。PIF-08仍doing，PIF其他缺口、原版对照与实际交付范围保持。

## LOOP-022：Pi内置扩展工厂与真实stdio MCP探针

核实固定1.0.3公开createMcpExtension/createCodemodeExtension/createToolSearchExtension及McpExtensionOptions。workbenchResources增加显式BuiltinResources参数，使用builtin路径加载，继续noExtensions禁止目录自动执行；不传参数时行为不变。MCP使用注入并克隆的已加载配置，不自动读取项目/用户mcp.json；配置修改与浏览器登录必须走宿主入口，暂不让终端管理器自行改文件或打开URL。MCP工厂同时提供codemode/tool_search工厂，由显式开关或原生exposure按需激活。

codemode目前models:false：默认models命名空间可调用分类/图像等模型路径，尚未证明经过现有streamSimple核算；工具编排真实保留，不开放未经核算的额外模型入口。完整配置、凭据引用/登录、启用确认、运行环境签名与worker来源校验尚未接入，当前工厂参数仅隔离测试使用，产品执行路径没有自动启用MCP。

新增pi-mcp-builtins测试，自编JSON-RPC stdio服务真实处理initialize、tools/list、tools/call，记录PID和调用。测试旁置未授权项目mcp.json，显式配置不读取它；真实发现mcp__fixture__echo并调用，随后通过真实Pi模型/工具循环执行codemode嵌套调用（仅模型HTTP响应受控），服务实际收到DIRECT_OK与CODEMODE_OK。session_shutdown后检查子PID不存活。未使用联网模型或安装第三方服务。

首次mcp-builtins失败揭示DefaultResourceLoader.reload会重载settings，提前applyOverrides会丢失defaultTools；已改为内存初始设置，重载仍保留。第二次直接调用codemode被原生拒绝“No assistant message issued this call”，改用真实SDK工具循环验证，没有绕过此检查。最终mcp-builtins-regression.log 8/8、mcp-builtins-final-types退出0，回归原生文件/命令取消、插件动态工具/命令/冲突/错误与取消。失败日志保留。所有句柄结束，无部署/真实模型/第三方安装。

下一步PIF-08配置管理与冻结：保持原生stdio/http/exposure语义，明确来源及优先级、导入预览与凭据边界；生产worker必须识别builtin来源并等待动态MCP工具登记，不能把工厂测试通过当作产品可用。继续验证HTTP、deferred/tool_search、codemode-only、连接失败/取消/关闭和嵌套副作用；其余PIF范围不缩减。

## LOOP-021：指导原生预处理与真实浏览器交付链

追问消息现在显示排队、开始、结束、失败/取消/中断及原因，状态跟随同Task最新attempt，原消息不重复。修复未取得原生检查点的追问重试会丢失continueAfterRunId的问题，保留原前驱，不默默成为全新上下文任务。followup-receipts.log 10/10退出0，覆盖回执状态、重试前驱、原会话与预算回归。

指导改用公开session.steer，恢复原生input处理、Skill和模板展开。通过AsyncLocalStorage限定的短暂队列收集，在原生预处理完成后给实际用户消息加元数据；串行处理用户指导，正文不加入标记。插件sendUserMessage/sendCustomMessage退出该关联范围，不能冒领用户回执。handled单独显示“插件已接管处理”，不冒充模型已应用或目标完成；SDK拒绝的扩展命令明确not_applied。正常已排队消息仍由原生轮次处理、原预算核算。输入处理期间结束或取消时不投递到新的执行。

steering-resources.log通过真实三worker测试：同文经插件改写、handled、扩展命令拒绝、/guide参数展开、/skill:check内容进入实际模型请求，取消与强停/备份保持。进一步steering-extension-messages.log通过：input插件生成的两条额外消息保留，但不带用户workbenchInputId；四条真正指导保持各自应用回执。steering-extension-types通过。期间一次stream_persistence失败暴露出密集事件与会话写入竞争的路径，将text_chunk/tool_progress也改为与其他持久IPC一致的有界1秒获取存储锁；只重试拿锁，不重放已进入的事务。steering-native-input-recheck.log3/3验证指导/事务及真实工具恢复，失败日志保留。

新增npm run test:pi-steering-ui，使用隔离app、真实HTTP/SSE、真实Pi worker与自编离线模型transport，不替换scheduler方法。浏览器指导POST实际成功后故意丢弃HTTP响应；确认pending命令已保存到布局，再关闭页面并新开页面重发，run_input仍只有一条、原Run不变。随后排队追问，只有第二worker收到追问目标；第一worker只收到指导。结束后迟到指导返回409，不创建新消息或Run。steering-parity-types/build通过，最终steering-delivery-ui.log退出0、steering-ui/report.json passed/pageErrors空；完成截图已查看，追问回执在历史可见范围内。最初测试插件幂等ID不足8字符失败，修正夹具，保留steering-real-ui.log。

PIF-07工程验收完成（PIV-08主路径），全局最终回归仍归PIF-11；不代表其他PIF完成或已应用真实工作台。指导当前只收文字，附件仍走任务提交/PIF-10；任意插件行为不作无条件兼容承诺。全部句柄结束，无真实模型调用、第三方安装或部署。下一轮PIF-08：核实固定CLI内置MCP/codemode/tool_search工厂与配置语义，接入受控配置、运行来源与生命周期，先用自编本地/HTTP服务验证真实发现和调用。PIF-00–06剩余项、09–12保持原范围。

## LOOP-020：当前执行的原生指导与持久回执

新增run_input和POST runs/:id/steer，固定runId/conversationId/commandId，入库与回执原子保存；旧命令重复返回最新状态，即使原Run已结束也不改投新Run。新指导只允许宿主拥有的运行中Pi进程，停止/超时/压缩拒绝，最多32条待应用、每条30k字符。登录、同源、归属、内容冲突和事务回滚已验证。

PiSteering沿公开session.agent.steer进入原生队列，不另起prompt或重置预算。user消息附加workbenchInputId元数据，正文不夹协议标记；相同文字仍独立关联。accepted/queued/applied/not_applied区分，applied只证明原生message_start进入轮次，不证明模型遵照完成。退出缺回执投影unknown，不自动重放。当前为纯文字，不展开Skill/模板或执行斜杠命令，不走session.steer的input预处理；原任务提交仍沿既有预处理，完整插件输入兼容需后续处理。

网页同一输入框区分指导当前执行与排队追问，停止入口保持；目标和类型保存于pending命令，网络故障重发同一命令，结束冲突保留草稿，不改投执行。指导不带附件，附件走排队任务；历史展示状态，刷新不重复。排队仍创建原话题后续Task，不等于同一Run的Pi followUp队列，后续须补排队回执和真实页面联合验证。

修复测试发现的边界：取消仅abort会留下原生队列，现先clearQueue关闭接收再abort，未使用指导记not_applied；应用回执可能与会话文件写锁竞争，现沿用最多1秒存储锁等待，只重试获取锁。保留steering-cancel和steering-cancel-recheck失败日志。

最终steering-crash-regression.log 4/4退出0：真实worker工具等待时接收两条同文、HTTP鉴权/同源/幂等、下一模型请求收到指导、仍同Run且历史保留ID；第二worker取消未应用消息且无对应模型请求；第三worker强停保留unknown和唯一回执，备份还原保持；另回归工具副作用恢复、会话隔离和事务。steering-final-types通过。steering-ui-build及steering-ui退出0，浏览器指导入库/刷新/更新、不新增Run与原UI检查通过；UI派发为明确标注的隔离夹具，真实派发由worker测试证明，不冒称页面到真实worker联合验收。

全部命令结束，无真实模型、第三方安装或部署。PIF-07保持doing，下一步排队追问状态、关页/未知HTTP回执重发和真实页面到worker联合路径；扩展input预处理差异须明确处理。PIF-08–12及此前压缩隐私/等待/容量等剩余范围保持。

## LOOP-019：未知工具结果核对与执行前持久化

发现retry/continuation只检查业务Operation，遗漏tool_execution的running记录；旧中断确认只验证PID与资产。现在恢复检查遍历同任务尝试及接续祖先，未核对工具阻止retry、continuation和中断确认。独立reconciliation保存已执行/未执行/部分执行、依据和时间，不伪造工具终态；事务、版本冲突、重复回执、归属、登录/同源及活进程均检查。页面增加核对表单和进程成果确认；run.reconciled事件使页面同步。后续worker的实际模型请求携带核对依据，指示不重放已执行动作、部分执行先读现状。依据是资料，不扩大权限，也不保证任意模型不会误操作。

固定SDK的tool_execution_start事件消费未等待持久化，现利用公开agent.beforeToolCall等待开始记录回执，再调用保留的原生扩展hook；开始记录失败取消，不执行工具。未重写Pi循环。SDK内部callTool有独立hook，当前外层记录保守覆盖，尚未证明每个嵌套调用都有独立回执；MCP/codemode接入时须专门验证。

证据位于output/dev-evidence/pi-parity/loop-001：tool-admission.log 3/3退出0，含真实worker开始记录失败无写入、写一行后强停、核对前拒绝恢复、事务回滚、部分执行核对后新worker请求收到依据、成果仅一行及备份还原；并回归真实PowerShell长输出与插件执行。tool-recovery-regression.log 11/11覆盖会话接续/预算/工具记录，tool-recovery-http.log 2/2覆盖登录/同源/归属/版本/活进程与重复回复。tool-admission-types和tool-recovery-complete-types通过，tool-recovery-final-build通过，tool-recovery-ui-final退出0：页面实际保存、未核对阻断、核对完成同步和既有流式/额度/压缩检查通过；tool-recovery.png已查看。

失败日志保留：测试可选error及submit参数位置类型错误已修正；首次浏览器重复点击已展开details将其关闭，改为检查open后操作，不强制点击隐藏元素。全部命令结束，真实模型/第三方安装/部署均0。PIF-04/05/06尚不关闭：子进程生命周期、嵌套工具、半截函数调用、容量压力和用户等待仍待做。下一轮优先PIF-07中途指导/排队回执，沿公开SDK核实生命周期并贯通IPC/UI；PIF-08–12及早期剩余项保持。

## LOOP-018：原生命令完整输出归档

worker使用sessions/<project>/.output/<run>独立临时目录，原生bash/powershell返回fullOutputPath时按8KiB读取并归档为tool_result分块，保存完成后才写tool_execution.outputMessageId与终态。原文件保留，避免Pi继续读取原路径失败；网页提供“查看未截断的命令输出”。只读取当前目录中符合原生名称的普通单链接文件，拒绝其他工具路径、目录链接、文件变化及超过128MiB的文件。读取以初始大小为硬边界，即使文件持续增长也不无限追读；终态前再次检查文件身份及修改信息。

native-output-final.log 2/2退出0：Unicode分块、非法路径/硬链接/持续增长拒绝；真实worker原生PowerShell输出70000个x及首尾标记，SDK确实截断但归档完整，原文件仍在，备份还原后指针及内容保持。native-output-regression.log 4/4退出0：原生文件/命令取消、实际插件worker及工具记录HTTP/备份保持。native-output-types.log、native-output-build.log、native-output-ui.log均退出0；浏览器验证完整JSON及含表情原始输出链接逐字一致，保留设置/额度/断线恢复检查。UI用持久夹具验证呈现，实际命令行为由worker测试证明，未调用真实模型。

范围限制：70k命令输出测试不证明128MiB性能；原文件计入sessions容量，归档另占数据库空间，命令原始写盘过程尚无逐块配额阻断。第三方工具任意外部路径不自动读取。未知工具副作用对账、容量失败/压力和PIF-07–12尚未完成。所有本轮命令结束，未部署、未安装第三方包。下一动作核查Run中断后tool_execution仍running时retry/continuation是否遗漏对账，并补真实中断验证；不能把原始输出保存当作副作用已核对。

## LOOP-017：真实进程中断与SSE断线恢复

新增pi-stream-crash测试：真实worker收到受控SSE首段后等待无终态，确认数据库中partial可读且worker仍running，再用Scheduler终止其拥有的进程。退出状态interrupted，conversation将未完成正文投影为interrupted而不是final；原首段仍在。模型没有终态回执，ledger保持reserved、calls=1/预留$10，不误退款或伪造零用量；service.retry要求先对账，后续scheduler tick不新增请求。备份还原保留正文、interrupted Run和reserved账本。stream-crash.log1/1退出0，约3秒；不推断这代表已保存完整原生对话上下文或未知工具副作用已经对账。

浏览器新增真实传输故障。初次仅context.setOffline不能可靠关闭现有SSE，等待“正在重连”超时，保留stream-reconnect-ui.log。修正为测试宿主监听实际/api/events ServerResponse集合，先确认有存活连接，在离线时销毁该响应；页面确实进入重连，再让服务端保存最终分块，恢复网络后检查补齐且只有一条回复。stream-reconnect-ui-recheck.log退出0，其余工具/额度/设置/刷新断言保持。故障注入只在隔离QA服务器，不添加产品调试入口。

stream-crash-types.log类型检查退出0；全部命令已结束，无待续句柄。无真实模型调用、第三方安装或部署。下一步原始长命令stdout归档与未知工具执行的中断对账边界；本轮只证明模型回复中断，不代替工具执行中的未知副作用检查。PIF-06长期容量/吞吐测试以及PIF-04用户等待、PIF-05部分输出、PIF-07–12完整范围继续保留。

## LOOP-016：实际工具进度与完整返回结果

新增PiToolStream、tool-progress存储及分页接口。每次tool_execution_start/update/end拥有调用ID与来源，开始/进度/结束按序持久；更新合并200ms，预览最多2000字符。结束时将工具返回JSON完整分块，最终块确认后才提交completed/failed；channel=tool_result与助手正文分开，不重复出现在聊天。8MiB待保存队列保护，保存失败取消运行并保留已有进度。阶段记录不是未知副作用的执行许可或对账结论。

网页在模型详情内新增“实际工具调用”，显示来源、运行/完成/失败、结果预览和完整JSON入口；随现有共享事件刷新，不建立额外SSE。Run已结束但工具缺终态时显示结果待核对。每批50条分页；完整输出沿鉴权、归属验证和背压读取。工具输出只代表实际返回content/details，原工具截断后引用的stdout文件尚未自动归档。

tool-progress-final.log2/2：真实worker工具先发WRITING_PROGRESS，500ms后写入，模型再503恢复；运行中从数据库看到进度、最终JSON保存完整10000组“工具🙂”与FULL_DETAILS，文件只写一次。另一测试验证重复/乱序/终态、无完整结果不得完成、事件失败事务回滚、HTTP鉴权/分页与数据库联合备份还原，工具结果不混入助手消息。tool-native-regression.log3/3：真实原生文件/命令/取消及生产插件执行、环境占用和兼容拒绝保持。

类型tool-progress-types/final-types通过。初次tool-progress-ui失败揭示先打开请求详情后产生新调用，详情缓存仍旧0次；PiRequestDetails现在随调用/结算/状态更新并用请求generation防止迟到覆盖，嵌套details toggle不再误触。tool-progress-rebuild与tool-progress-ui-recheck退出0，浏览器验证执行中工具预览、完成后完整50000字符结果读取、原设置/文本刷新/压缩/额度路径，截图runtime-ui/tool-execution.png已检查。

全部本轮句柄结束，无真实模型、第三方安装或部署。下一步原生工具截断stdout路径的可访问归档、传输断线/强停与保存失败恢复；高频长任务容量/性能仍需量测。PIF-06保持doing，原PIF-04/05剩余边界和PIF-07–12不缩减。

## LOOP-015：持久文本流与刷新恢复

新增PiTextStream将实际SDK text_delta按200ms/16Ki字符分批，经串行IPC持久回执保存；待写队列超过2MiB触发取消和失败，不无限缓存。message_start确定UUID，message_end明确final/error/cancelled，不重复发送旧终态assistant.text。压缩操作的固定说明保留旧事件。工作进程done前等待文本回执，存储失败不冒充成功。

新增schemaVersion=1的run_message，保存preview（最多30000字符）、总字符数、下一个chunk序号及状态；每个assistant.delta保存完整文本，assistant.message只建立一次会话位置。分块命令以run/message/chunk幂等，内容不同冲突，缺序/终态追加拒绝；数据库事务同时提交消息状态、块事件及回执。新增可重复创建的局部索引按run/message/chunk读块，不反复扫描全事件。旧assistant.text仍可读，不迁移伪造旧分块。

conversation API按消息身份返回最新文本；主网页显示生成/停止/未完整结束，刷新从持久记录读取。旧版事件刷新过滤也兼容新类型，旧版增加状态与完整回复入口。30k之外提供鉴权text/plain读取链接，每次50块、等待HTTP背压并允许连接关闭，不额外全量拼接到服务内存。分块和预览避免截断UTF-16代理对，预览始终为原文前缀；全文不静默截断。

初次text-stream.log发现“全部正文已提前flush，空终态被跳过”导致final仍显示partial，已修复保留空终态；原网络/总时限worker回归当时通过。text-stream-recheck.log与text-stream-index.log各2/2：去重/乱序/冲突、事务失败回滚、数据库重开、跨run拒绝、完整长文本及表情下载、原会话隔离。最终text-stream-unicode.log1/1增加预览前缀/代理对验证。

text-stream-worker.log1/1（原八重试场景加流式场景）：受控SSE先发首段、600ms后发余文，真实运行中从持久conversation读到partial，结束后只一条final回复；工具重试不重放仍通过。text-stream-types/final-types退出0，text-stream-build构建通过。text-stream-ui浏览器退出0：首段可见、生成中刷新恢复、追加最终内容后只一条且生成状态消失，原设置/压缩/额度路径保持。最后旧版状态/全文链接补充经类型检查，旧版浏览器本轮未独立验收。

限制与下一步：工具尚只有原起止元数据，完整工具结果与增量未接；SSE传输故障、强停留下partial的恢复、长期容量压力及备份还原分块仍需完整验收。现有5Hz通知会触发共享snapshot刷新，须量测高频长任务性能，不能把限频当成性能证明。PIF-06保持doing，原总体计划仍完整。全部本轮句柄结束，无真实模型请求、第三方安装或部署。

## LOOP-014：有界Retry-After与等待取消

新增model-retry-hint解析响应建议（毫秒、秒数、HTTP日期，上限30秒），忽略无效/过去日期，仅429/503触发。按固定SDK源码选择支持fetch注入的OpenAI Responses/Completions/Codex、Azure、Anthropic、Mistral、Pi Messages适配器；保持原始Response及现有fetch，不缓存响应正文或头。Google/Vertex拒绝注入、Bedrock和WebSocket无同等HTTP入口，保留其原传输，不能宣传所有来源已支持。

accounted-runtime在新profile自动重试开启时读取提示；原生Agent决定重试，下一次调用在预留前等待提示剩余时长，原生退避已经消耗的时间不重复等。等待不计调用/费用、不计网络无响应，仍受整体总时限和取消；等待后再次检查AbortSignal，再走原授权和预算。退避UI状态取原生延迟与提示剩余的较大值，最多30秒。没有开启provider内部重试。

`retry-after-sdk.log`10/10：解析边界/日期/上限/无效头、传输兼容名单、等待取消；真实SDK证明180ms提示延长原生1ms夹具退避，以及30秒提示等待中取消仅保留已有一笔请求。`retry-after-workers.log`2/2：真实worker的429设置2秒提示，外部请求时间差至少1900ms；原八场景、工具写入一次、32MiB摘要重试及接续/备份全部保持。类型retry-after-types.log退出0。最后补等待结束后取消二次检查，无其他行为调整。

全部命令已结束，无待续句柄。无部署、真实模型请求或第三方安装。PIF-05还缺摘要重试取消/耗尽生产测试、部分工具输出及未知写入/强停边界；不同provider提示兼容范围如上，仍未关闭完整任务。下一步将重试故障边界与持久执行过程统一处理，并推进PIF-06文本/工具增量与重放；PIF-04用户等待与PIF-09桥接依赖仍保留。

## LOOP-013：已写入工具不重放、压缩摘要重试

真实retry-worker新增tool场景：第一次模型响应调用append_once，插件实际追加一行，第二次模型请求503，第三次恢复；文件最终恰一行，原生历史保留WRITE_CONFIRMED，账本顺序settled/unknown/settled。`retry-tool-write.log`1/1（包含此前七场景及新场景）退出0，约33秒。证明已成功工具回执后的普通模型临时故障不重跑该写入；不推广到工具结果未知或部分function-call输出。

摘要重试事件桥接：scheduled显示waiting，attempt_start显示retrying，finished显示中性“尝试结束”，不把缺少success字段的SDK事件当成功；compaction_end依据真实result/aborted最终标记恢复或失败。Run.retryState新增可选source，区分普通、压缩和分支摘要；原记录缺source仍按普通显示。当前没有产品分支导航入口，分支摘要最终成功仍须以后接原生动作结果验证。

32MiB真实压缩测试的外部传输在独立控制目录注入一次503，保持插件签名不变：新任务自动摘要重试，最终source=compaction/phase=succeeded/attempt=1，两次请求均purpose=compaction，第一unknown第二settled，累计usage不完整。后续第二worker接续及备份还原仍通过。`summary-retry-worker.log`1/1退出0，约10.6秒；类型summary-retry-types.log退出0。summary-retry-build构建及summary-retry-ui浏览器验证见本轮补录，新增压缩重试标签与终态等待结束断言。

Retry-After调查：固定Pi OpenAI Responses provider在SDK withResponse成功后才调用onResponse，HTTP错误直接进入catch，所以只挂onResponse不能读到429/503头。尚未实现Retry-After，不伪称原生退避自动遵守。下一步确认各provider的fetch注入兼容性，保留原生Agent重试次数，在运行时统一限制可取消的额外等待；禁止为了读响应头启用provider内部多层重试。

仍缺摘要重试取消/耗尽生产边界、部分工具输出和工具结果未知、强停等；PIF-05保持doing，其他PIF范围不缩减。未部署、无真实模型请求或第三方安装。

补录：summary-retry-build和summary-retry-ui均退出0，pageErrors为空。全部本轮命令已结束，无待续句柄。

## LOOP-012：原生有界重试与生产请求核算

新冻结profile增加autoRetry=true，旧Run缺字段仍关闭。workbenchResources定义最多3次Agent重试、baseDelayMs=1000/maxAgentDelayMs=30000，worker按冻结值启用；ModelRuntime和provider层仍maxRetries=0，避免重试相乘。复用Pi的abortable sleep、上下文失败尝试恢复及Agent循环，不重跑整个任务。auto_retry_start/end经IPC校验保存Run.retryState和事件，页面展示退避/恢复/失败，终态不继续显示仍在等待。

`retry-worker.log`1/1覆盖七种真实scheduler/worker/SDK场景，约30秒：503和429首次失败后恢复且2次请求；401和insufficient_quota只发1次；持续503最多4次请求（3次重试）；退避取消只发1次；任务仅2次额度时第三次不会触达外部HTTP。外部HTTP仅本地受控返回，每次请求均核对账本，不含原始错误秘密。`retry-regression.log`13/13覆盖原生核算/压缩/设置/网络超时，retry-types.log类型检查退出0。

retry-build/retry-ui均退出0，浏览器断言新profile启用、运行退避状态可见；随后补终态残留waiting状态展示与浏览器断言，最终复验见retry-final-build/retry-final-ui。页面证据仍是离线状态驱动，真实生产状态来自retry-worker测试；二者范围分别保留。

未关闭边界：固定SDK的Agent退避不自动使用Retry-After，当前沿固定指数退避，需后续补受限响应提示；摘要重试虽经过同一核算入口但其进度事件未桥接，需补真实worker摘要与额度路径；工具已成功写入后再发生临时故障、部分工具调用输出和强制中断仍需证明不重放。PIF-05保持doing，不以开关或七场景替代全验收。等待用户期限、压缩记忆语义和PIF-06–12仍继续。

无真实模型请求、第三方安装或部署。原HEAD与未提交用户/插件改动保持。

补充：retry-final-build与retry-final-ui均退出0，终态不再误显示仍处退避。全部本轮句柄结束，无待续进程。

## LOOP-011：总时限保存接续与页面计时

新增执行时间展示：排队未开始、运行剩余约时长、结束已用时长、主动停止和总时限到期分别呈现。每秒刷新当前运行的估计倒计时，卸载/结束清理定时器；独立显示模型无响应上限，页面注明服务端为准，不以浏览器倒计时决定停机。旧policy不回填，重试仍沿原每次运行时限。

真实生产验证在pi-idle-worker中扩充：新任务实际运行达到4000ms总时限（网络无响应上限10000ms），由scheduler请求取消，failed与timedOutAt、总时限文案准确；保存TOTAL_DEADLINE_MARKER历史、一次unknown账本。随后显式追加额度，另一个真实worker在同一task接续成功，原件字节保持，累计2次请求，新尝试时限仍4000ms。这是加速且真实墙钟的总时限测试，没有倒填时间；之前312秒验证独立证明跨旧5分钟边界。

`loop-001/total-deadline-worker.log`1/1退出0，包含五个真实worker的网络超时、恢复、主动取消、总时限到期、到期恢复路径，总测试约14秒。`time-types.log`类型检查、`time-build.log`构建、`time-ui.log`浏览器均退出0；浏览器新增验证排队未计时、运行中剩余时间及600秒独立网络时限，原设置/账本/压缩/预算恢复断言保持。

验证范围：合作响应取消的模型请求与正常进程退出；不可取消工具/插件被强制结束、进程崩溃边界及用户等待期尚未以此证明。没有真实模型调用、第三方安装或部署。全部命令结束，无待续句柄。下一步联通可持久化的等待用户状态与期限，并推进PIF-05有界原生重试；压缩摘要记忆失效与所有后续PIF范围继续保留。

## LOOP-010：追加额度与同任务恢复

新增task_budget_grant持久记录、taskBudget查询、extend-retry接口及请求明细中的“任务总额度与恢复”界面。grant、队列新Run、事件与幂等回执同事务；旧policy与已消耗请求/费用不改，所有attempt继续累计。API和订阅分开，连接/全局额度不被抬高。恢复必须针对最新attempt，防止多页面以不同命令并发恢复同一旧执行；原中断和未知操作对账条件保留。已接受命令重发在历史预检前返回原回执。

`budget-replay.log`9/9：额度追加和数据库重开、重复/冲突/并发命令、SQL故障原子回滚、订阅不允许美元、连接上限继续生效、旧累计预算及真实两进程最后请求竞争。初轮失败记录budget-addition.log：测试将带undefined的内存对象与JSON回执直接deepEqual，以及旧测试依赖已被禁止的并列retry；修正序列化比较，并保留真实两进程竞争同一最终额度及明确并列retry拒绝。没有删除预算竞争验收。

`budget-worker-regression.log`8/8：真实生产worker请求无响应耗尽一次任务额度后，显式追加1次/$10，在同一task新worker接续成功，原会话字节及policy不变、累计2次；主动取消仍独立验证。另含账本与设置回归。`budget-final-types.log`退出0，budget-build.log构建成功。

`budget-ui.log`退出0，浏览器完成800x600窗口追加2次/$2、原任务恢复入队、旧4次上限保持、新6次上限和累计2次消耗、刷新后授权记录仍在。截图runtime-ui/budget-addition-small.png已检查，界面位于可滚动执行详情中。runtime-ui/report.json包含新增断言，pageErrors为空。浏览器不调用真实模型；生产测试只替换外部HTTP协议。

全部本轮命令结束，无待续句柄。工作区dulse，原HEAD、未提交插件改动保留；真实模型0、第三方安装0、部署0。下一步PIF-04剩余时间/总时限检查点和用户等待期限（需与PIF-09交互状态一起设计），再推进PIF-05有界原生重试。摘要记忆失效、生产自动压缩/进程中断及PIF-06–12均未完成，不能以本轮额度闭环缩小总目标。

## LOOP-009：生产网络超时、接续与主动取消

新增 `tests/pi-idle-worker.test.ts`，使用真实scheduler、worker、SDK、持久化账本及本地受控传输插件，仅外部模型HTTP响应替换为可取消的停滞/确定响应。验证网络无响应产生明确failed原因、不设置总时限timedOutAt、一笔unknown记录且不伪造费用；原始目标存入历史，新worker从失败会话fork并成功完成接续，原件字节不变。随后第三个worker在请求已预留后主动取消，状态cancelled、无超时错误且仅一笔unknown记录。

首轮失败不是产品接续缺陷：测试将故障开关放入插件目录，移除文件改变了环境签名，产品正确拒绝接续。将开关移至独立控制目录，保持插件源不变后通过。保留初次`loop-001/idle-worker.log`；接续复验`idle-worker-recheck.log`退出0；包含第三worker取消的最终`idle-worker-cancel.log`1/1退出0，耗时约8.7秒。测试加速网络期限为200ms，另一个主动取消期限为10秒，不代表页面允许200ms。

类型检查初次发现断言失败信息允许undefined，与Node类型重载不匹配；增加默认说明后`idle-worker-types-recheck.log`退出0。该改动仅断言消息，不改变通过行为。全部执行句柄已结束，未部署、无真实模型调用或第三方安装。

下一步实现PIF-04同任务显式追加额度和恢复入口：独立授权记录、幂等命令、保留旧policy、所有attempt累计消耗，并提供页面可见的授权前后值。用户等待期限与交互桥接需共享持久状态；PIF-02摘要记忆失效、真进程中断等仍不能省略。本轮只关闭生产网络超时贯通证据缺口，不宣称PIF-04整体完成。

## LOOP-008：长任务设置、网络无响应与32MiB产品贯通

新任务支持显式选择standard/long，long冻结30分钟总时限，不增加请求次数或费用额度；旧Run和重试沿原policy。模型无响应上限独立配置10–1800秒，默认180秒；收到流式事件续期，终态后宿主保存回执不计入网络等待。页面可保存、重开，配置按版本检查并冻结入新Run。取消仍沿原信号；超时错误提供可理解原因。新增可复跑入口 `npm run test:pi-long-task`，该验证有真实五分钟以上等待，不进入默认单元测试。

已回收原执行句柄95348，退出0；`output/dev-evidence/pi-parity/long-task/report.json`证明真实Pi worker持续312526ms后完成并保存会话，授权1800000ms、maxCalls=2、calls=0。这是受控插件命令的真实墙钟验证，不是30分钟持续模型/工具循环或任务质量证明。

`loop-001/idle-sdk.log`13/13，类型检查`idle-types.log`退出0。新增真实SDK超时探针：外部fetch故意无响应，生产核算包装取消一次请求、仅结算一次未知用量，后续正常响应可恢复会话。其余覆盖原生压缩/溢出/重试核算、配置鉴权与冻结，以及流式续期、用户取消和终态后保存。无真实模型调用；生产worker的网络超时贯通仍待验证。

`loop-001/large-production-worker.log`1/1：超过32MiB原生历史经真实HTTP提交、生产worker手动压缩、第二worker接续及备份还原，原件保持。显式512MiB总存储配额；原生压缩检查点控制模型上下文大小，不能把32MiB磁盘历史当成32MiB模型输入。本项补上LOOP-007的大历史产品链路缺口，127MiB完整产品链路未验证。

后续优先：生产网络超时与历史保存、等待用户的独立期限、预算追加及恢复路径；继续处理压缩摘要中的已删除记忆语义和真实进程中断。PIF-02/03/04均未整体完成。所有改动仍在dulse，未部署、未安装第三方、真实模型请求0。原HEAD及未提交插件改动保留。

浏览器复验`loop-001/idle-ui-recheck.log`退出0，runtime-ui/report.json passed且pageErrors为空；脚本明确断言long、600秒无响应配置重开后保留，新Run冻结30分钟/600秒且maxCalls仍为4。全部本轮命令已结束，无待续句柄。报告checks标题较粗，具体范围以脚本断言为准。

## LOOP-007：大历史实际fork、还原与写入边界

forkNative保持原生forkFrom，但宿主清理改为逐条读取/写临时文件，完成后替换新副本，不再额外读入整份文件并split/map/join。预留覆盖副本及临时文件，原件不覆盖。保存追加新增同一128MiB单文件边界，失败发生在写盘前，guard维持失败状态以防误报成功。默认总sessions配额仍是128MiB，未无提示扩大用户存储授权；副本/备份需要独立剩余空间，测试显式授予512MiB会话总空间。

`large-fork-restore.log`4/4：32MiB和127MiB在独立进程执行实际SDK fork、上下文投影、追加消息、重开、联合备份及干净还原，原件hash相同。近上限夹具包含真实格式的压缩记录，模型上下文约剩余两条，磁盘仍保留所有历史。32MiB约0.99秒fork，127MiB约4.36秒；包含多次SDK重开的整段验证峰值分别约459MB、1000MB，不能当成单次运行固定内存需求。期间测试HTTP最长约26ms。数据见large-history/fork-restore.json。

`large-record-limit.log`2/2：单条127MiB JSONL记录通过，校验进程峰值约602MB；保存到上限附近后拒绝超额追加且文件大小不变。`large-cancel-dispatch.log`1/1：真实任务HTTP接受32MiB历史后，文件变化导致调度重新预检，在准备中取消并stop后没有启动模型worker、没有请求计次且子进程已退出。类型检查通过，diff检查通过。

仍需明确：整段大文件fork/还原在独立测试进程，32MiB真实app测试覆盖提交与准备取消；两者不是一次完整主产品运行端到端验收。未调用真实模型。PIF-02摘要记忆失效与中断边界、PIF-03产品容量解释和最终端到端验收仍未关闭。下一步补这些贯通证据，并推进PIF-04长任务设置，不停在局部绿灯。

补充：`native-capacity-regression.log`14/14通过，包括原生首次flush/追加容量拒绝、容量锁和实际进程死亡恢复。全部本轮命令已结束，无待续句柄。未部署。

## LOOP-006：大历史流式与异步校验

新增native-inspection逐条JSONL扫描，保留一条记录和ID集合，统一单会话128MiB校验边界，取消旧2MiB拒绝（2MiB仅作为异步预检触发点）。原件路径归属/链接/身份/版本/父链仍校验，增加严格UTF-8及读前后文件身份检查。缓存最多32个小摘要，按文件inode/dev/size/mtimeNs/ctimeNs失效，不缓存历史正文。

超过2MiB的HTTP提交/重试在独立进程预检，再由同步事务读取校验摘要；客户端断开会取消，返回后复查登录。Scheduler对排队接续及未预热历史异步预检，期间续租并阻止插件维护；取消排队/停机终止准备，未完成不启动模型worker。检查进程最多2个并发，每个Node old-space上限768MiB。工作进程使用同一校验器，仍需源hash匹配。

`large-http.log`3/3通过：3、32、127MiB异步校验，HTTP可响应；取消、损坏及超128MiB拒绝；32MiB通过真实app任务HTTP接受（9次健康请求、最长约19ms）。当前性能数据见large-history/inspection.json与http.json，校验进程峰值RSS约70–85MiB；数值只适用于此次夹具和机器。输入单条约16KiB，尚不代表单条极大记录的峰值。候选类型检查通过。

`native-stream-regression.log`7/7，`large-backup-regression.log`20/20通过，包含自动备份、原生接续、配置；自动备份既有>2MiB测试改为要求接续成功，仍保留损坏保护。全部命令结束，无待续句柄。真实模型0、部署0。

剩余：SDK fork仍会加载完整历史，宿主fork清理还有整文件二次读取，下一步去掉该额外复制并测量32/127MiB真正fork、恢复与主服务响应；单条极大记录、写入/备份/接续容量一致性、缓存失效竞争、准备阶段取消/关机均需扩展测试。不得把校验通过等同大历史交付。压缩摘要与删除记忆也仍需审计。

## LOOP-005：手动压缩、真实worker与磁盘接续

任务提交增加sessionAction=compact，要求明确Pi源会话并拒绝未结束/无有效历史的来源；沿既有登录、同源、命令回执、队列、授权及取消机制。Run冻结操作类型，重试保留操作、同任务额度与源检查点（若启动前取消没有新session，则保留原continuation）。worker在fork后的会话上调用原生compact，不将按钮文字发送给模型当普通提示；成功显示实际操作结果，不重发旧assistant文本。聊天请求明细加入手动入口和用量说明。

新增tests/pi-compaction-worker.test.ts：自编本地测试扩展只替代外部模型传输，执行实际SDK、worker、scheduler、账本与磁盘会话。HTTP手动提交/重复去重、无源/排队中来源拒绝→实际摘要请求→原文件字节不变→重新打开压缩历史→第二个worker继续→压缩检查点字节不变→联合备份/干净还原后身份与账本可读均通过。模拟历史约数百KB，不能代表32MiB/128MiB容量验证。没有真实模型请求。

`manual-http-worker.log`12/12通过；新增重试与还原验证后`manual-restore-recheck.log`7/7通过。初次还原测试在调度租约仍有效时调用离线备份被正确拒绝，改为await scheduler.stop()后备份，未放宽备份锁。保留manual-restore.log初次证据。类型检查、构建通过；浏览器验证手动按钮绑定同话题和源Run、队列停止，见runtime-ui/report.json。全部命令已结束。

PIF-02仍待生产阈值/溢出、摘要请求中进程中断及提交边界恢复等验证；压缩后旧摘要包含已删除记忆的可能性需纳入联合历史审计。PIF-03仍有2MiB前台门槛，不能用本轮小文件接续通过宣称已解决大历史。下一步进入大历史容量/异步校验，同时补上述压缩恢复边界。部署0、第三方安装0、真实模型0。

## LOOP-004：原生压缩与取消

新增PiSessionLifecycle共用生产worker与真实SDK探针：同步接收compaction_start/end设置用途，完成时回到agent用途；压缩状态持久化到Run并显示。模型失败状态取最新assistant结果，避免已恢复的上下文溢出仍判整次失败。新冻结policy包含autoCompaction=true；既有policy缺字段仍保持关闭，旧任务/重试不被偷偷迁移。自动压缩使用Pi默认阈值。阶段性功能已写工作区，尚未部署。

固定SDK abort()确认会同时取消普通请求、压缩、重试和分支摘要。取消探针最初出现额外摘要预留，定位为已取消signal仍能进入统一包装器；新增预留前throwIfAborted阻止占额，复验通过。阈值初次夹具只报告30输入tokens，未达到Pi依据实际usage判定的阈值；改为1800tokens/2048上下文的明确阈值夹具后通过，未改变产品阈值。保留compaction.log、compaction-threshold.log作为初次失败证据。

`compaction-final.log`13/13通过：包含原生阈值压缩、溢出恢复、手动压缩失败与取消，原历史条目保留、摘要用途与回执、恢复后错误状态清除，以及账本/设置相关回归。探针历史为内存会话，因此不能代表磁盘断电/重启恢复验收。手动产品按钮/API还未实现，PIF-02未完成。

下一步：提供明确的手动压缩任务（绑定指定会话，在独立fork上执行并保留源历史），沿既有额度/队列/取消通路；补真实worker与磁盘恢复验证。PIF-03大历史尚未实现。真实模型0、安装0、部署0。

补充验证：`compaction-types.log`类型检查退出0；`compaction-worker-regression.log`原生工具、真实命令取消及生产插件worker3/3通过，退出0；diff检查通过。全部本轮命令结束，无待续句柄。这3项没有触发生产压缩，不能替代该验证。

## LOOP-003：预留去重、API用量与可查看明细

reserveRequest以worker RPC标识绑定首次callNumber，重复预留不占额，改变用途冲突，凭据不写入回执。API累计tokens与complete状态现已补齐；新增登录后分页请求查询和聊天请求明细。新增可重复浏览器入口npm run test:pi-runtime-ui，以及ADR036记录当前契约和未完成协议。

类型检查通过；`ledger-reservation.log`13/13通过，包含预留重复、重开数据库、API累计完整性及分页。`runtime-build.log`构建通过，`runtime-ui/report.json`浏览器通过：思考档位保存/刷新、新任务冻结、800x600设置操作、已知/未知请求明细、未登录及非法分页拒绝。真实模型请求0，schedule关闭。

截图复查发现初版沿用100px横排状态栏导致明细拥挤，改为纵向及最多40%高度的滚动区域。QA增加第二条记录不得被输入框遮挡的几何断言，重建重跑通过；两张最终截图已人工视觉检查。全部命令结束，无待续句柄。尚未部署。

下一步从PIF-02核查原生压缩事件与取消，绑定purpose并补自动阈值/溢出/手动入口；PIF-01仍需模型选择和限制设置，以及完整协议ADR。PIF-00的CLI入口盘点与原版对照夹具也未完成。不得因当前账本UI通过结束整体目标。

## LOOP-002：逐次请求账本

新增schemaVersion=1的model_request实体，以runId:callNumber作为唯一身份，保存用途、预留额度、实际成本（如有）、用量（如有）、结算时间与reserved/settled/unknown状态。reserve的计次和实体写入同事务；settle的预算、订阅累计、实体状态与事件同事务。API及订阅的重复结算不再重复计费；缺成本保守扣预留值但账本不伪造实际成本，订阅不生成美元账单。进程无回执时reserved保留，读取不自动退款或重放。旧历史缺逐次记录时保持旧结构，不编造详细用量。Scheduler已传递用途并要求所有生产结算携带序号，fallback预留也返回序号。

`ledger.log` 12/12通过：包含API重复回执、数据库重开、未知成本、订阅未知用量、SQLite触发器在写入/结算中断使整体事务回滚，以及既有SDK核算与累计预算测试。这里的SQL失败注入不是实际worker崩溃证据；真实进程中断仍属后续验收。

补充：`ledger-types.log`类型检查退出0，`ledger-regression.log`19/19通过，含真实生产worker插件执行。结算已改为按唯一请求ID查询，生产路径不再读取整个项目账本；改动后`ledger-lookup.log`3/3通过。全部命令已结束，无待续句柄。

下一步：预留请求本身的幂等身份、API累计tokens、生产事件对应purpose、账本查询和UI。继续配置与压缩，不把此阶段当成PIF-01已完成。运行配置ADR仍待形成。无真实模型、第三方安装或部署。

## LOOP-001：基线、核算探针与运行配置

目标：PIF-00/01；关联PIV-02、06。工作区 `C:/Users/ZYF/orca/workspaces/OS/dulse`，分支dulse，HEAD `d2659ff75a77e822cc881da84fb15ee2eea9c8f2`。基线未提交文件摘要见 `output/dev-evidence/pi-parity/loop-001/baseline.json`，不覆盖既有插件实现。

实际改动：抽取accounted-runtime供生产worker与真实SDK探针共用；错误脱敏保留安全分类供Pi原生恢复识别。新增schemaVersion=1的思考配置及Run冻结、设置页面和任务档位显示；旧Run缺字段时保持off。HTTP任务回执以原请求绑定首次接受结果，与任务创建同事务，重复提交不因全局设置变更生成新授权或不同任务；同命令不同输入仍409。

验证使用隔离临时数据库、模拟HTTP模型协议及真实SDK，未调用真实模型。`settings-accounting.log` 当前12/12通过，覆盖普通回答/手动压缩/分支摘要/原生503重试/401不重试、配置持久化、模型支持范围、旧任务与重试冻结、认证/同源/版本冲突、HTTP提交重发，以及累计预算和两真实进程竞争。`types.log` 类型检查退出0。

初次探针失败在测试夹具：原生分支摘要不继承普通会话thinking参数。读取固定SDK实现后纠正断言，保留初次失败 `accounting-probe.log` 与复查 `accounting-recheck.log`，不改SDK来迎合测试。后者4项仅包含pi-accounting和plugin-execution；命令曾列出不存在的model-stream测试，不能声称该文件被执行。

尚未完成：逐请求持久账本与purpose、API回执幂等、生产自动压缩/重试、模型/限制UI、浏览器验证、CLI能力盘点及原版配对夹具。不得将本轮探针或12项测试冒充PIF-01、PIV整体完成。下一具体动作是设计并测试reserve/settle事务账本，覆盖重复回执、未知成本与进程中断，再接生产IPC。

本轮真实模型请求0，第三方安装0，部署0；F:/AI/OS仍为前轮插件版本，本轮未改用户业务数据。后续实际应用前重新核实服务和在途任务。

补充验证：`http-regression.log` 20/20通过（chatgpt、plugin-http、workbench-conversation），命令退出0；`git diff --check`退出0。类型检查在HTTP回执改动后再次通过。全部本轮命令已结束，无待续测试句柄。只读查询真实 `/api/health` 返回ready=true、PID79912、instance `252f2a08-97e1-4fad-8d01-1774cc7ffc23`、launchId `0e39f5e7-d232-4831-b552-0c4909059cb4`；这是当时健康观察，不是本轮候选已部署的证明。
# LOOP-113：嵌套工具独立回执

生产 worker 经 codemode 调用 `mcp__fixture__echo`。同一 Run 下 `tool_execution` 同时含父工具 `codemode`（source=builtin:codemode）与嵌套 `mcp__fixture__echo`（source=builtin:mcp），实体 id 不同，phase 均为 completed；MCP 服务收到一次调用。证据 `output/dev-evidence/pi-parity/loop-113/`。嵌套准入失败与强停仍见既有 mcp-worker 场景。无外部模型、无部署。

# LOOP-112：摘要重试等待中取消

手动压缩摘要首次 503 并带 retry-after=30，进入 `retryState.source=compaction` 且 phase=waiting 后请求取消。Run 为 cancelled；原件字节不变；取消前后 HTTP 次数相同（不再发起后续摘要尝试）；回执无 usage.complete 的成功结算。证据 `output/dev-evidence/pi-parity/loop-112/`。与 LOOP-111 耗尽互补。无外部模型、无部署。

# LOOP-111：摘要重试耗尽

手动压缩摘要请求持续返回 503。生产 Run 失败；calls=4、外部请求 4 次；四笔 `model_request` 用途均为 compaction、状态 unknown；未见 usage.complete 的成功结算。原件字节不变。过程中观察到 compaction 来源的 retryState。证据 `output/dev-evidence/pi-parity/loop-111/`。摘要重试等待中取消仍可用既有 agent cancel 路径类比，本轮专验耗尽。无外部模型、无部署。

# LOOP-110：半截函数调用中断

受控 SSE 只推送 `function_call` 的 `output_item.added` 与不完整 `arguments.delta`，流保持打开且无 `output_item.done`。结束执行进程后：`tool_execution` 为零、副作用文件不存在；`model_request` 用途 agent、状态 reserved；对账前重试拒绝。证据 `output/dev-evidence/pi-parity/loop-110/`。已执行写操作后的 running 工具中断与核对仍见既有 `pi-tool-recovery`。无外部模型、无部署。

# LOOP-109：普通回答预留后、首字节前中断

生产对话在模型请求已预留、传输已进入 fetch 但故意挂起、尚未返回任何流式字节时结束执行进程。`model_request` 用途 agent、状态 reserved，无 costUsd/usage；Run calls=1、reservedUsd=10、spentUsd=0。对账前重试拒绝；对账后新 Run settled，旧回执仍 reserved。证据 `output/dev-evidence/pi-parity/loop-109/`。与 LOOP-097（压缩摘要挂起）、LOOP-016/stream-crash（已有 partial 文本）互补。无外部模型、无部署。

# LOOP-108：手动压缩摘要重点

`Run.compactionFocus` 可选；仅 `sessionAction=compact` 可带，1–2000 字符，参与命令指纹。页面「摘要重点」写入任务；worker `session.compact(focus)`；`guardSessionCompaction` 仍把记忆守卫放在用户重点之前。生产实测请求含守卫、`Additional focus:` 与 `KEEP_FOCUS_MARKER`。重试保留原重点。证据 `output/dev-evidence/pi-parity/loop-108/`。无外部模型、无部署。

# LOOP-107：会话组容量迁移说明

ADR-037 增加迁移步骤：只调整或删除 `SESSION_MAX_BYTES`，不改写会话文件；写死旧 128MiB 组上限的部署需运维显式改为 285,212,672 后重启。契约测试确认默认组上限、单文件上限与显式旧覆盖并存。ADR-036 回写已完成的用途映射与 API 限制/模型选择。证据 `output/dev-evidence/pi-parity/loop-107/`。无部署、无外部模型。

# LOOP-106：轻改写清理与整理写盘中断

`scrubHostText` 对已收集记忆按大小写不敏感、空白与下划线可互换匹配替换为「已删除记忆」。测试覆盖 `deleted_memory` / `DELETED   MEMORY`；不含原词的语义转述（private note…）仍留在副本，明确为残留。`rewriteForkInPlace` 在 `PI_REWRITE_YIELD_MS` 下可被测；子进程首行写入后写进度文件并被 SIGKILL：原件字节不变，中断副本仍含 `DELETED_MEMORY`，删除后从原件再 fork 成功。证据 `output/dev-evidence/pi-parity/loop-106/`，`tests/native-session.test.ts` 12/12。这不是调度器租约失联扫描（LOOP-099），也不是摘要请求挂起时结束 worker（LOOP-097/098）。无外部模型、无部署。

# LOOP-105：分支摘要用途自动标记

`PiSessionLifecycle.bind` 包装 `navigateTree`：`summarize:true` 期间 `purpose` 为 `branch_summary`，结束后回到 `agent`（压缩中若被嵌套则保留 `compaction`）。`summarization_retry_attempt_start` 按 `source` 校正重试用途。生产 `worker` 在创建会话后调用 `bind`。核算探针去掉手动 `setPurpose`，仍断言 agent/compaction/branch_summary 三类回执齐全。`tests/pi-accounting.test.ts` 8/8。证据 `output/dev-evidence/pi-parity/loop-105/`。工作台分支仍是选定节点 fork，不走模型分支摘要；插件侧 `navigateTree` 仍明确拒绝。无外部模型、无部署。

# LOOP-104：API 模型选择

`PiExecutionConfiguration.apiModel` 保存所选 API 模型；未保存时回退 `PI_MODEL`。`ModelAccess` 经回调读取该值写入新任务 `modelBinding`。快照在 API 连接下列出固定 Pi `getModels(provider)`；订阅连接保存 `apiModel` 返回 400，页面不展示选择器。HTTP 实测：列表含默认模型，保存另一 openai 兼容模型后新任务 `policy.modelBinding.model` 与之相同，思考档位一并冻结。`tests/pi-settings.test.ts` 5/5。证据 `output/dev-evidence/pi-parity/loop-104/`。无外部模型、无部署。

# LOOP-103：API 输出上限设置

`PiExecutionConfiguration` 增加 `maxOutputTokens`。未保存时回退到 `PI_MAX_OUTPUT_TOKENS` / 默认 2048。API 连接可在页面修改；订阅连接保存时若带该字段返回 400，页面不展示该输入。新任务策略从 `piSettings.configuration().maxOutputTokens` 读取，已有任务与重试不变。`tests/pi-settings.test.ts` 覆盖本地保存、订阅拒绝与 HTTP 新任务拿到 512。模型选择入口见 LOOP-104。无外部模型、无部署。

# LOOP-102：摘要中的已删除记忆

`rewriteForkInPlace` 在用户消息里读取「已确认记忆」注入 JSON，收集 `text` 字段。之后的 `compaction` / `branch_summary`，以及用户正文，去掉宿主上下文切点，并把收集到的字面替换为「已删除记忆」。测试里无标记摘要含 DELETED_MEMORY 时，副本与重建上下文都不含该词，原件不变。worker 在创建会话后包装 `_runDefaultCompaction`，手动与自动摘要请求都带上 `compactionMemoryGuard`；生产手动压缩的请求体含 Additional focus 与该说明。证据 `output/dev-evidence/pi-parity/compaction-guard/report.json`。不含原文字面的改写转述仍可能留下。无外部模型、无部署。

# LOOP-101：会话组与单文件上限对齐

默认 `sessionsBytes` 改为 `2 × nativeSessionMaximum + 16MiB` = 285,212,672。单文件上限仍是 134,217,728。约 120MiB 真实 Pi 导入在默认配额下 fork：原件 125,829,633，副本 125,830,203，预留 125,838,849，会话合计 251,659,836。备份恢复后重开仍含 FORK_KEEP，不含 AFTER_SELECTED。先放入约 80MiB 原件加副本，再上传约 90MiB 第二份时，fork 前 507，文案含会话空间不足与不会提高，目录与第二份原件不变。证据 `output/dev-evidence/pi-parity/import-fork/report.json`，契约见 ADR-037。这是统一边界，不是给单个测试临时抬高夹具。已在 `.env` 写死旧 128MiB 的部署需按迁移说明调整。无外部模型、无部署。

# LOOP-100：生产上下文溢出恢复

普通接续的第一次模型响应是 400，错误文本含 maximum context length exceeded。固定 Pi 将其当作溢出：先压缩，再重试原目标。Run 完成，calls 为 3。三次用途和状态是 agent/unknown、compaction/settled、agent/settled。压缩原因是 overflow。失败请求没有被记成 0。原件 385,286 字节不变。新会话含 Recovered MARKER，不含 RAW_SECRET。证据 `output/dev-evidence/pi-parity/overflow-worker/report.json`。无外部模型、无部署。

# LOOP-099：宿主重启后的压缩预留

调度器重新取得租约时，一条正在压缩、租约已过期、本进程里没有执行子进程的任务被改为中断，错误是执行失联。摘要回执保持 reserved，没有 costUsd 和 usage。Run 的 reservedUsd 仍是 10，spentUsd 是 0。原件 413 字节不变。对账前重试被拒绝。对账后新的压缩尝试只是排队，没有启动模型，旧预留仍是 reserved。证据 `output/dev-evidence/pi-parity/compaction-host-restart/report.json`。这覆盖重启后的扫描，不覆盖宿主在写入会话文件的中途被操作系统杀死。无外部模型、无部署。

# LOOP-098：自动阈值压缩的摘要中断

普通接续先完成一次输入 264,000 的回答，模型窗口 272,000。随后的自动摘要请求挂起时结束执行进程。回答回执保持 settled。摘要回执保持 reserved，没有 costUsd 和 usage，reservedUsd 为 10，calls 为 2。原件 385,333 字节不变。已绑定副本包含本次回答，不包含未完成摘要；对账后重试另写会话，该副本字节不变，旧摘要预留仍是 reserved。新的摘要请求结算，原因是 threshold。证据 `output/dev-evidence/pi-parity/auto-compaction-interrupt/report.json`。宿主进程自身崩溃仍未按这条路径验证。无外部模型、无部署。

# LOOP-097：压缩摘要请求中的进程中断

手动压缩在摘要请求已经开始、响应尚未返回时结束本宿主的执行进程。原件字节保持不变。执行在摘要前已绑定整理后的副本，中断时该副本没有本次摘要；对账后的重试另写新会话，中断副本的字节保持不变。这次预留仍是 reserved，没有 costUsd，也没有 usage，reservedUsd 为 10，spentUsd 为 0。对账前重试被拒绝。恢复后的新请求状态是 settled，用途是 compaction，原因是 manual。证据 `output/dev-evidence/pi-parity/compaction-interrupt/report.json`。自动阈值压缩的中断、宿主进程自身崩溃，仍未按这条路径验证。无外部模型、无部署。

# LOOP-096：旧压缩摘要中的宿主记忆

`forkNative` 整理副本时，对 `compaction` 与 `branch_summary` 的 summary，以及压缩条目上的 systemMessage，使用与用户消息相同的宿主注入切点。切点之后的已确认记忆不再写入副本。测试在原件摘要中放入 SUMMARY_DELETED_MEMORY，复制后文件和 `buildSessionContext` 都不含该词，原件字节不变。没有宿主标记的转述仍会留下。中断提交边界仍待验。无模型调用、无部署。

# LOOP-095：生产自动阈值压缩

普通接续不是手动 `sessionAction=compact`。离线传输先返回一次输入 264,000 的回答，固定模型窗口是 272,000，高于窗口减 16,384 的压缩线，且未超过窗口本身。随后的摘要请求被记为 compaction。Run 完成，`calls` 为 2，用途依次是 agent、compaction，`compaction.reason` 为 threshold。源文件保持 385,334 字节，新会话摘要含 OLD_CONSTRAINT。证据 `output/dev-evidence/pi-parity/auto-compaction/report.json`。默认会话上限未改。无外部模型、无部署。

# LOOP-094：4096×4096 PNG 解码峰值

独立子进程解码一张自生成纯色 PNG。宽高 4096，编码 58,680 字节，声明表面 67,108,864 字节，仍低于 134,217,728。解码前 RSS 193,757,184，结束后峰值 410,562,560，堆 59,512,768。固定 Pi 解码成功，原字节未改。表面上限没有约束 WASM 或进程峰值。证据 `output/dev-evidence/pi-parity/image-formats/decode-peak.json`。无模型调用、无部署。127MiB 原件仍无法在默认会话配额内再复制一份。

# LOOP-093：32MiB 浏览器校验的堆峰值

用 Chrome 性能计数测量导入校验。文件 33,554,432 字节，按 1,048,576 字节切片。校验前 JS 堆 496,945,712 字节，校验过程中最高 515,477,896，升高 18,532,184。这低于整文件大小，所以没有把整个文件再放进一个缓冲区。14 次采样。用户暂停后没有导入记录。

显式垃圾回收后堆为 48,670,436 字节，低于校验前的读数，说明升高的部分没有被校验结果留住。校验前的高读数里包含当时尚未回收的页面垃圾，不能把回收后的下降说成校验释放了 448MiB。峰值仍高于单片 1MiB，因为每片之间只让出事件循环，没有强制回收。

证据 `import-hash/heap-report.json`、`heap-test.log`。无模型调用，无部署。

# LOOP-092：渐进 JPEG 与动画 WebP 正例

本地已有 Pillow 生成 4×3 渐进 JPEG 和两帧动画 WebP，字节嵌进测试，运行测试不再依赖生成器。渐进 JPEG 为 521 字节且含 SOF2。动画 WebP 为 222 字节且含 ANMF。固定 Pi `resizeImage` 解码两者，核对原尺寸，不改原编码。超大声明尺寸和损坏内容的原有拒绝仍然通过。声明的单张 RGBA 表面上限没有放宽，仍是 128 MiB。

4 项 `native-image-validation` 测试通过。证据 `image-formats/progressive.jpg`、`animated.webp`、`positive-report.json`、`positive-test.log`。没有测量接近 128 MiB 表面或大量动画帧的解码峰值。无外部模型调用，无部署。

# LOOP-091：两路 HTTP 预览时宿主仍响应

两份各 41,943,296 字节的有效 v3 会话写入同一项目后，同时请求产品预览接口。默认会话上限 134,217,728 字节没有改。预览都返回 200，校验值与各自原件一致，各含 1 条消息。期间 `/api/health` 采样 10 次，最慢 34ms。结束后 sessions 为 83,886,592 字节，等于两份原件相加，没有第三份文件，也没有 Task 或 Run。

上传使用既有分块写入，不经过 HTTP；并发和健康检查覆盖的是预览请求。这不是 127MiB 文件，也没有把两路预览当成复制或执行。证据 `import-preview-pair/report.json`、`import-preview-pair/test.log`。无模型调用，无部署。

# LOOP-090：就地整理，去掉第三份临时文件

LOOP-089 的预留按原件、SDK 副本和重写临时文件同时存在计算，约 46MiB 原件因此无法复制，尽管完成后只有两份。现把整理写回刚创建的副本：读过的内容就地覆盖，只有变长且后面还有未读字节时才拒绝。不再创建整文件临时副本。`nativeForkGrowth` 改为一份副本加上每条记录 512 字节和 8192 字节余量。产品会话上限没有提高。

默认上限 134,217,728 字节。41,943,553 字节真实 Pi 会话导入后复制成功，副本 41,944,123 字节，预留 41,952,769 字节。复制后 sessions 实测 83,887,676 字节，等于原件加副本，低于上限。上下文含选定标记、不含后续文字。备份恢复后重新打开，选定内容仍在。

73,400,673 字节原件可以上传，但一份副本的预留 73,409,889 字节加上已用会超过默认上限，复制前拒绝。拒绝后 sessions 仍是 73,400,673 字节。容量、复制和原导入恢复测试 3 项通过。证据 `import-fork/report.json`、`import-fork/test.log`。

127MiB 原件加上一份副本仍超过 128MiB 会话总上限，不能在默认配额内复制。若整理使中间某条变长并碰到未读内容，会拒绝并删除未发布副本，原件保留。无模型调用，无部署。

# LOOP-089：默认配额内的导入复制与备份重开

`forkImportedSession` 在调用固定 Pi `forkFrom` 之前检查会话空间。不够时返回与页面准备相同的 507 说明，不创建第二份文件，也不提高 `sessionsBytes`。

默认上限 134,217,728 字节。测试只把磁盘余量检查设为 0，避免临时目录误伤，会话上限保持产品默认。8,389,121 字节的真实 Pi 会话导入后复制成功：副本 8,389,691 字节，上下文含 `FORK_KEEP`、不含选定点之后的文字，原件字节不变。复制后 sessions 实测 16,778,812 字节，正好是原件加副本。备份到新目录再恢复，用固定 Pi 重新打开恢复出的副本，选定上下文仍在。

另一份 48,234,849 字节原件本身低于 128MiB 单文件上限，也可以上传。复制预留 96,478,914 字节，加上已用超出默认上限，因此在复制前拒绝。拒绝后的会话目录仍只有该原件，占用 48,234,849 字节。`native-import-fork-capacity.test.ts`、原容量测试和导入恢复测试共 3 项通过。证据 `import-fork/report.json`、`import-fork/test.log`。

限制：预留按原件、SDK 副本和重写临时文件同时存在计算。因此约 46MiB 原件完成后的两份文件大约 96MiB，仍会在开始复制前被拒绝。127MiB 原件更不可能在默认配额内再复制一份。无模型调用，无部署。

# LOOP-088：双槽 127MiB 扫描时宿主仍响应

复跑 `pi-import-large-qa`。两路有效上下文扫描同时占用既有两个校验槽：多消息文件与单条巨大消息各一份，均为 133,169,152 字节。期间同一进程的 `/api/health` 采样 125 次，最慢 73ms。子进程峰值 RSS 为 380,256,256B 与 700,137,472B，脚本注明这是各自生命周期峰值，不能相加当成同时总内存。文件上限、768MiB 堆和两槽都没有提高。

同一轮还重新测到：结构扫描 815ms / 63,619,072B，多消息上下文 6725ms / 378,941,440B，单记录上下文 5620ms / 698,978,304B，取消后再扫描成功。HTTP 分 127 块上传并预览 4219ms，sessions 实际 133,169,152B，没有 Task 或 Run。原件指纹保持。证据 `import-large/report.json`、`pi-import-large-test.log`。

范围：健康检查证明扫描子进程没有堵死该进程的 HTTP。它不是两个预览请求同时打进产品接口，也没有做 SDK fork。127MiB 原件加上恢复副本仍超过默认 128MiB 会话配额，不能据此声称可以在默认配额内复制并执行。无模型调用，无部署。

# LOOP-087：分片校验暂停与会话空间说明

导入页不再把整个 JSONL 读成一个缓冲区再交给 WebCrypto。本地文件按 1 MiB 切片更新 SHA-256，每片之间可暂停；暂停发生在创建导入记录之前，已保存的上传仍可续传。恢复准备和提交遇到会话组 507 时，改为说明恢复副本还需的字节、当前已用和上限，并写明现有上限不会提高。磁盘不足等其他 507 保持原说明。

`incremental-sha256.test.ts` 与 Node 实现对照空文件、块边界和 `abc` 已知值通过。`native-import-capacity.test.ts` 确认空间不足时不新增确认或任务，释放占用后同一命令可以提交。类型检查通过。

浏览器：16 MiB 文件在校验过程中暂停，导入记录仍为 0，约 7.5 秒内停下。随后 28256 字节原件在测试上限 80000 字节下上传并完成结构预览；核对恢复环境返回 507，页面显示还需 65216 字节、已用 28256。没有确认记录、没有 Run。截图 `import-hash/paused.png`、`capacity.png` 已看。证据 `import-hash/browser.log`。测试上限只存在于该夹具，产品默认 128 MiB 未改。

未测：两个大扫描同时进行时宿主响应、浏览器进程内存峰值、SDK fork 加备份全链。无外部模型调用，无部署。

# LOOP-086：127MiB导入实际测量

新增 pi-import-large-qa，流式生成接近上限的真实v3 JSONL，分别测试约两千条消息和单条巨大消息。扫描worker按内部measure选项返回process.resourceUsage.maxRSS，默认接口不返回该指标。文件上限128MiB、子进程768MiB堆、共享两槽均未修改。

当前Windows运行证据（非跨设备性能保证）：127MiB结构校验368ms/RSS77,463,552B；多消息有效上下文2039ms/RSS396,337,152B；单记录有效上下文2032ms/RSS712,048,640B。127MiB实际HTTP分127块上传及原件预览2298ms，hash完全一致，sessions实际133,169,152B，未创建Task/Run。另取消扫描并等待子进程关闭后再次扫描成功，原件指纹不变。

`pi-import-large-test.log`通过，`import-large/report.json`保存详细值；`pi-import-large-types.log`退出0。单记录RSS显著更高，768MiB只是JS堆限制，不是进程RSS总限制，不能拿堆参数宣称完整内存边界。

接续：双大扫描并发/宿主响应、客户端127MiB整文件哈希峰值与暂停、SDKfork/备份全链和现有128MiB总sessions配额下的空间不足体验仍待。本轮仅验证上传/扫描/投影，不谎称127MiB可以在默认总配额内复制并执行。无模型调用、无部署。

# LOOP-085：多格式正例与后续帧尺寸边界

新增 pi-image-formats-qa：真实Chrome canvas产生JPEG、普通WebP和带alpha WebP，代码构造单帧/双帧GIF，5份文件保存在image-formats证据目录，均通过固定Pi实际解码且保留原尺寸。

加强 native-image-validation：GIF扫描全帧与扩展子块，WebP验证RIFF长度和块边界、ANMF帧头及其VP8/VP8L内层尺寸，JPEG扫描包括熵编码/转义/重启标记后的尺寸记录。后续超大帧不再仅受首画布声明约束；冲突尺寸或越界块拒绝。未扩大现有128MiB声明RGBA表面限制。

`pi-image-frame-test.log` 3项测试通过，包含正常PNG/损坏内容、四种格式巨大首尺寸、GIF后帧/WebP内编码/JPEG后SOF巨大尺寸及块长度溢出。`pi-image-formats-test.log` 5份真实解码样本通过；`pi-image-frame-types.log`退出0。

剩余：当前是单表面尺寸及结构检查，不保证累积动画帧/WASM进程峰值。动画WebP、渐进JPEG正例与128MiB真实资源测量待补。没有调用外部模型或部署。

# LOOP-084：有效图片实际解码校验

新增 native-image-validation：要求规范base64与声明PNG/JPEG/GIF/WebP头匹配，读取尺寸并限制声明的RGBA单表面不超过已有128MiB会话字节预算；然后使用固定Pi resizeImage/Photon真正解码，要求实际原尺寸匹配。设置保持原尺寸/原编码的选项，校验不改原件；有效上下文逐张校验，已移除或非选定历史不触发解码。导入预检进程与最终worker副本都检查。

新检查发现此前图片协议夹具的固定PNG字符串不能由Photon解码；此前验证仅证明协议字节传递，不能证明图片可解码。改为自有pixelPng生成正确CRC及压缩数据，重新跑所有有效上下文路径与实际worker/备份接续，三个请求各保留一份可解码PNG。损坏CRC/数据、截断、MIME不符、无效base64拒绝；四种格式的超大声明尺寸在解码前413。

`pi-import-image-decode-test.log` 4项综合测试通过，`pi-import-image-decode-types.log`退出0。没有增大SDK堆或文件限制，也没有外部模型调用/部署。

接续限制：128MiB仅约束解析到的声明RGBA表面，不是WASM或进程峰值保证。GIF/WebP多帧、JPEG多个尺寸记录等需继续加强一致性与资源边界，JPEG/GIF/WebP有效正例尚未覆盖。128MiB文件投影峰值/吞吐仍待，PIF-10不标完成。

# LOOP-083：导入有效图片与模型兼容

新增 native-import-context，使用固定Pi buildSessionContext对指定历史节点做投影；计数最终消息图片，忽略fork会清理的search_memory/read_project_summary/propose_memory返回图片，避免旧宿主记忆误拦。通过独立扫描worker执行，保留768MiB堆与两槽限制。普通结构预览不加载SDK，仅选定节点兼容检查时动态加载。

checkpoint返回有效图片数，环境确认记录包含当前supportsImages。prepare与restore都阻止有效历史图片进入纯文本模型；worker在真实副本创建后、AgentSession启动前按实际模型再检查。不是按原文件总图片数判断，未选分支/移除/压缩后的图片不会误拦。

验证：`native-import-images.test.ts`覆盖原图片、图片替换为文本、文本编辑成图片、null移除、旧记忆图片、压缩加旁支6种路径，校验原件未改。纯文本模型在prepare和提交时拒绝，移除后可确认且没有创建Run。实际worker测试加入内嵌PNG，三次受控请求（初次、干净备份后重导入、备份后原会话续聊）各一份且字节一致，预算第四次拒绝仍通过。`pi-import-images-test.log` 4项综合测试通过，types日志退出0。

边界：验证的是原生协议图片进入受控请求，未调用外部视觉模型。有效图片完整解码、巨大尺寸防护、128MiB SDK投影峰值/吞吐仍待，未增大限制或部署。

# LOOP-082：导入与跨进程备份一致性

检查发现：自动备份在独立进程VACUUM数据库并复制sessions文件，导入上传的原容量锁不足以阻止备份期间追加或撤销。增加受限锁名.native-import-write.lock，复用已有进程身份/崩溃锁恢复实现；NativeImports创建记录/写块/撤销与backup完整快照共用专用门闩。仍保留原容量核算，不用长时间全局存储锁替代，否则会阻断宿主调度续租。

新增真实子进程备份测试：在即将VACUUM处暂停自有worker（测试代码拦截db.exec，生产无测试钩子）；父进程确认新建/追加/撤销返回423、scheduler续租仍成功。放行后快照完成，源上传继续完成；恢复备份到新目录，实际偏移为备份时20字节，补齐后sha与原件一致。源记录/文件保持，没有半个新建记录。

`pi-import-backup-race-test.log` 5项通过（并发/上传/便携恢复），`pi-import-backup-race-types.log` 类型通过。`pi-import-auto-backup-regression.log` 11项自动备份回归全部通过，涵盖HTTP响应、编辑与队列、租约失效、优雅停机、只读worker、大于2MiB历史及启动扫描。轮询同一测试句柄直到退出0，未重启在跑测试。

接续：该锁仅协调受控导入写入，不承诺阻止外部程序直接修改文件。128MiB吞吐/峰值、浏览器哈希内存/暂停、导入图片目标模型兼容和完整消息语义等仍待。未部署。

# LOOP-081：备份后重新导入与既有会话执行

扩展 `tests/pi-import-worker.test.ts`：原服务停止scheduler后备份，恢复到全新数据目录并开新服务；确认插件不会自动恢复启用，显式修复/重检仅自有传输fixture。旧环境确认记录对新命令409，重新prepare/restore后实际Pi worker完成；再从备份保存的原执行会话续聊，实际worker也完成，sessionPath都位于新根，历史源文件保持。

三个受控协议请求均包含选定历史，排除未选后续和旧注入记忆。源根与恢复根导入原件字节一致。首轮新增第三请求失败于model_budget，查明夹具只预留两次全局请求，产品按预期拒绝；测试夹具改为准确预留三次，并新增第四次零请求失败断言。产品默认额度/限制未修改，不将放宽限制当作验收。

`pi-import-restored-worker-test.log` 通过：一个综合测试包含三个成功受控请求、一个预算拒绝worker、原环境负例及启动前重试；`pi-import-restored-worker-types.log` 退出0。未访问外部模型、未安装第三方、未部署。旧业务数据保持。

接续：上传正在写入时的备份一致性（尤其跨进程）、大文件峰值/取消、导入图片目标模型兼容与完整原生消息格式、客户端创建回执和跨窗口边界继续；PIF-10和整体计划仍未完成。

# LOOP-080：导入来源历史与备份关联

新增 inheritedSource 统一解析普通分支和导入来源，导入必须通过项目归属/原件结构和hash校验，返回前复核修订与撤销状态；路径、hash和历史起点均取持久Conversation，忽略客户端试图替换起点的参数。原有 inherited-history 接口和全文/图片/工具视图复用，页面增加导入来源提示与“导入起点历史预览”。

验证：`pi-import-history-test.log` 12项历史扫描/真实worker通过，新增HTTP401、固定祖先路径与旧注入隐藏断言。`pi-import-history-browser.log` 真实Chrome在原导入恢复全链上打开历史，选定文字可见、大段后续不可见，`import-ui/inherited.png`已查看；构建和类型日志通过。

备份验证：`pi-import-history-backup-test.log` 10项通过，新增备份到外部目录、恢复到干净根，导入原件sha保持，Conversation关联不丢，祖先历史实际读取新根并排除后续/旁支。restore使旧native_import_confirmation过期，恢复到新环境需要重新确认。原有普通会话备份接续回归通过。

边界：本轮备份测试验证导入原件/来源读取和确认失效，不等于已验证恢复后新worker完整执行、上传中的备份一致性或128MiB性能。上述及导入图片/模型兼容、完整消息语义仍待；无外部模型或部署。

# LOOP-079：恢复确认页面与完整浏览器链

新增 NativeImportRestore：复用BranchTree分页选点，prepare展示当前模型、请求上限、工具、插件和MCP名称；用户确认当前环境、填写外部操作核对说明及新目标后restore。提交前持久化完整意图，网络未知结果保留并提供同命令核对按钮；明确参数拒绝清空确认以便重做。项目Web Locks避免并行操作，打开结果前刷新工作台快照。

真实Chrome扩展脚本 RESTORE_UI=1：超过1MiB原件上传PUT丢响应→刷新续传；选择首节点而非大段后续记录；prepare确认；restore已创建任务却丢响应→刷新选择原导入→核对回执，Run始终一条；实际Pi worker通过自有传输得到结果，payload包含选定文本而不含后续，原件字节保持。打开新话题可见SEQUENCE_DONE和已完成。首次截图暴露打开时旧运行状态，增加打开前refresh并复验通过。`import-ui/restored.png`已目视检查。

证据 `pi-import-restore-ui-browser.log`、build/types日志通过。实际一个Pi worker、受控fixture请求，无外部模型调用，无生产部署。原取消模式脚本仍保留，本轮运行restore模式；日志按模式区分，避免误称零worker。

接续：完善导入来源/历史可见性及备份恢复，导入图片与当前模型能力、完整原生消息语义、大文件峰值/取消、创建回执丢失和跨窗口竞争验收仍待。PIF-10与整体目标没有完成。

# LOOP-078：公共环境确认与恢复提交

新增 `NativeImportSubmission`。prepare 对导入原件及选中节点执行异步验证，保存15分钟有效的确认记录（来源hash/节点、当前模型策略、插件与解析后MCP签名及展示名称）。restore 必须提供使用当前环境的确认和历史外部操作核对说明；重新检查原件指纹/hash/节点及当前环境，事务创建独立Conversation、Task、Run，Conversation保存importedFrom。回执按命令与完整请求绑定，重复请求先返回既有结果，参数变化拒绝。

HTTP 接口 `/api/native-imports/:id/prepare`、`restore` 保持登录复核、项目作用域、客户端中断取消。未直接使用客户端提交的策略或签名，不伪造导入来源的历史Run。MCP展示仅名称，不返回凭据环境。

验证：真实worker测试由内部绑定改为公共HTTP prepare/restore；401、跨项目403、无效节点422、未确认400、额度变化409、同命令同run回执和变更参数409均通过，再执行原启动前取消重试与实际受控请求。`pi-import-submission-test.log` 4项通过，`pi-import-submission-types.log` 类型检查通过。新增无效节点测试初次误预期400，核对既有分支扫描定义后按422验证。未调用外部模型、未部署。

接续：页面需接BranchTree、环境清单、核对说明、持久化提交意图和新话题打开。当前UI仍提示恢复未开放，不把HTTP已通冒充端到端交付。导入图片对目标模型兼容、完整原生消息语义、备份恢复与128MiB性能/取消等剩余边界继续验证。

# LOOP-077：导入worker与重试来源

新增 ImportedContinuation 契约。scheduler 在插件/MCP清单确定后分别比对确认签名，worker再次检查并通过只读Store调用 forkImportedSession；相互冲突的普通/导入来源拒绝。首次启动前失败/取消重试保留导入绑定，有本轮会话后只继承其普通continuation。导入被Run引用后不可撤销，保证追溯/重试原件还在。

实际测试先暴露取消于启动前的任务没有pluginManifest，普通父Run兼容校验误拒绝导入重试；改为导入重试核对自己的固定签名，已有普通continuation仍走原检查。负例确认插件/MCP签名变化均零请求失败。

证据：`pi-import-worker-test.log` 12项通过，含实际Pi子进程、自有传输fixture、选定上下文和旧注入排除、原件字节保持、启动前重试与本轮历史后重试、两种环境变更拒绝；`pi-import-worker-types.log` 修正测试断言可选字符串类型后退出0。没有外部真实模型或第三方安装，未部署。

接续：当前测试通过内部更新Run绑定模拟已确认提交，公共导入恢复HTTP/确认表单仍未实现。必须在提交事务前完成异步预检，并原子固定来源/签名/策略/核对说明及Conversation关系；不能开放任意客户端绑定。MCP凭据解析后签名需与预览一致；备份、长文件与启动中取消边界待补。UI目前仍如实显示恢复执行未开放。

# LOOP-076：导入历史节点与独立恢复副本

检查现有接续链：`NativeContinuation` 目前依赖真实 Run 和其策略/插件绑定，因此不能把导入伪装成 completed Run。先新增 `NativeForkSource` 区分 runId/importId，`forkImportedSession` 核验真实导入记录/原件hash/节点后使用固定Pi生成独立副本，持久化 workbench_import 标记；沿用原来的用户注入/context_edit/记忆工具结果清理。原件与复本相互独立。

导入 `points` API 使用结构校验和既有独立分支扫描进程，项目归属、撤销状态、分页hash、登录复核保持。仅供选择历史位置，不会创建或执行任务。

验证：`native-import-recovery-test.log` 12项通过（导入副本准备、上传HTTP/节点、既有9项接续）；指定节点和编辑生效，后续/旁支/旧注入不进入上下文，原件两份字节一致，新会话ID与sourceImportId正确，无伪造Run/Task；撤销源后副本仍可由固定Pi重开。错误hash/节点不留下副本。`native-import-recovery-types.log` 类型检查通过。未调用真实模型、未部署。

接续：需新增运行的导入来源契约与当前环境确认绑定，将准备函数放到owned worker启动流程（不可在HTTP线程直接fork）。提交时固定导入id/hash/节点及当前策略/插件MCP签名，调度前再次核对；用户确认原环境无法从JSONL还原、未知外部操作需要对账。首次运行失败/取消的重试须保留导入来源，已有本轮会话后改续本轮历史。备份及撤销关联规则随该绑定一起补齐。然后将points接到已有BranchTree和恢复表单，完成实际受控worker验证。当前恢复执行仍未完成。

# LOOP-075：浏览器导入与续传入口

新增 `src/workbench/native-import.tsx` 并挂入聊天窗口。页面按项目展示服务器导入记录，选择本地原件并算 SHA256，新建命令先保存 localStorage 再发请求；续传重新获取服务器偏移并核对所选文件大小/hash，以 1 MiB 块上传。同项目操作使用 Web Locks 避免多窗口同时处理；暂停会保留已保存块，撤销删除副本。成功预览展示消息/图片/压缩/context_edit统计并明确环境尚未核对、恢复执行未开放。

验证：新增 `scripts/pi-import-ui-qa.ts` 使用真实 Chrome、真实服务与自有 JSONL（超过 1 MiB）。故意丢弃已成功 PUT 的响应，刷新页面后重新选择记录与原文件，续传完成且服务器仅一条记录；文件字节精确一致、预览可见、撤销生效，Task/Run 为零。`native-import-ui-browser.log` 通过；`native-import-ui-build.log`、`native-import-ui-types.log` 通过。`import-ui/preview.png` 已目视检查，窄聊天窗可读、可滚动。未使用真实模型或部署。

接续：当前客户端哈希整文件读取，128 MiB浏览器内存峰值未验；创建POST回执丢失、同项目多窗口竞争和大文件暂停需继续补验。下一关键路径为建立导入来源与独立恢复副本，在当前授权/模型/插件MCP环境核对后恢复，不能伪造原运行环境或执行结果。

# LOOP-074：导入撤销与项目列表

`NativeImports.cancel` 在容量互斥锁内先持久化 revoked（沿用 Store 的撤销控制写预留），再校验路径并 unlink 导入副本。撤销记录保留；任何迟到上传和后续预览都拒绝。已撤销但尚未删文件时，重复 DELETE 可以继续清理。GET 列表按项目返回实际已保存大小，供页面发现和恢复导入；没有自动删除失败原件。

验证：`native-import-cancel-test.log` 4 项通过，覆盖写撤销标记后关闭/重开数据库、原件仍在时迟到上传 410、重复删除、预览拒绝、项目列表、真实 HTTP 未登录/跨项目删除拒绝及撤销后写入拒绝；`native-import-cancel-types.log` 退出 0。没有调用模型、安装或部署。

接续：导入页面与恢复运行仍未完成；今后绑定会话后必须禁用删除或改用独立恢复副本。真实磁盘满和强杀等边界仍需验收，当前重启测试为数据库重开与持久状态夹具，不宣称真实进程强杀。

# LOOP-073：原生原件分块保存与预览接口

实现 `NativeImports`：使用随机实体 ID 命名文件，绝不使用导入头 cwd/id 作为路径；创建命令幂等，块写入在现有跨进程容量锁内检查 sessions 配额并 fsync，单块 1 MiB，整文件限制不变。磁盘大小作为持久偏移；重发已存块比对字节，部分块可补齐剩余部分。预览通过独立扫描进程，要求完整大小、声明 SHA256 一致；环境仍标为未验证。

接入登录保护下的 `/api/native-imports` 创建及项目限定查询/PUT/preview；读请求体后再次核验登录，预览取消关闭子进程，返回前再次核验登录。无自动运行、安装或部署。

验证：`native-import-upload-test.log` 4 项通过，含 SDK 结构校验、重启续传、命令幂等、重叠恢复、hash 不符、配额拒绝、真实 HTTP 401/403/413、大于 1 MiB 原件分块预览、原件字节一致与零 Task/Run；`native-import-upload-types.log` 退出 0。

接续风险：尚无页面与恢复执行；需要撤销未完成导入、保留失败原件与容量释放的明确操作。尚未做真实宿主强杀/磁盘满中断、浏览器上传、128 MiB 全链或备份中上传并发验证。结构校验不是完整消息语义和当前环境兼容性证明。

# LOOP-072：原生导入校验准备

新增 `native-import-inspection.ts`、`native-import-worker.ts`、`native-import-async.ts`。结构校验读取固定 v3 头并验证节点引用；迭代 DFS 校验 context_edit/compaction 祖先关系，避免深链递归。自引用压缩遵循固定 SDK 的 appendCompaction(null) 实际行为。子进程限制环境、共享扫描并发槽、支持取消并等关闭后释放槽；返回前复核文件指纹。

验证：`native-import-inspection-test.log` 两项通过，包含固定 SDK 实际生成文件、同步/进程预览一致、原件字节保持及九种坏记录、无效编码和跨项目拒绝；`native-import-types.log` 类型检查退出 0。首次 IPC 比较失败因 undefined 可选字段消失，改为缺省省略后通过。未调用真实模型、安装第三方或部署。

接续：PIF-10 仍 doing。完成上传原件持久化与配额/中断恢复，再接预览和当前环境确认后的恢复。当前只是结构预检，完整消息元数据、图片解码、usage 等格式以及大文件运行中取消尚未覆盖；禁止把该结果当作运行授权或完整兼容性证明。

