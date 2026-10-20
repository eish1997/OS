# 036 Pi运行配置与模型请求核算

状态：运行配置与请求账本部分已实现；完整PIF-01仍进行中。

### LOOP-024 MCP执行边界

MCP运行配置在fork前冻结，原生内置工厂只读该快照；环境引用经IPC临时传递，值不加入Run。明确启用才允许builtin:mcp/codemode/tool-search来源，保留原生暴露级别。动态工具注册使用持久回执，工具进度等待注册；扩展工具execute前等待开始记录，以覆盖codemode嵌套调用的副作用边界。真实worker测试证明记录失败时MCP服务未收到嵌套调用；这不代表原生工具全部嵌套路径、HTTP/OAuth与强停生命周期已验证。codemode的额外模型助手仍关闭，不能绕过核算。

### LOOP-020 指导消息契约

run_input schemaVersion=1包含runId/conversationId/commandId/text/state/reason；命令摘要覆盖目标与正文，同一命令冲突拒绝。接收记录与run.input事件、回执同事务保存，重复请求查询最新实体，不重新派发。accepted代表宿主收到，queued代表worker接收确认，applied代表原生user message_start已进入轮次；均不表示目标已完成。正常退出明确未消费的消息为not_applied，异常退出未确认的消息呈现unknown并保留原记录，禁止自动重放。

LOOP-021更新：使用公开session.steer保留input/Skill/模板预处理，在受限异步范围收集原生最终入队消息，附加workbenchInputId元数据，不在正文加入标记。插件sendUserMessage/sendCustomMessage退出用户关联范围，避免其独立消息误领回执；handled独立表示插件接管，不代表模型应用或目标完成。取消先clearQueue再abort。沿用当前Run预算/工具授权，待确认命令固定类型和目标，结束冲突不改投。网页到真实worker的响应丢失/关页重发/指导与后续Task分离已验证。追问回执跟随同Task最新attempt，未获得检查点的重试保留continueAfterRunId。

LOOP-004/005补充：新冻结profile含autoCompaction=true，旧profile缺字段保持关闭。Pi原生压缩生命周期同步切换purpose，取消signal在预留前检查。Run.sessionAction可为compact，明确源历史并在fork上执行，任务重试沿原授权和操作类型；源会话仍受模型/项目/插件兼容和未知操作检查。手动操作本身不是新的普通模型对话；历史与源文件不覆盖。

固定Pi 1.0.3的普通Agent回答、压缩、分支摘要经过ModelRuntime.streamSimple。生产worker与离线真实SDK探针共用accounted-runtime包装器；provider内重试保持0，原生Agent重试开关尚待后续任务。不得让摘要助手绕过宿主核算，也不重写Pi模型工具循环。

运行配置采用schemaVersion=1：pi_execution_config保存revision与用户选择的thinkingLevel，未保存时偏好medium。每个新Run.policy.piRuntime保存configurationRevision、requestedThinkingLevel、实际thinkingLevel。固定模型目录决定支持范围，未知模型拒绝提交；不支持的偏好采用SDK能力映射且页面解释实际值。旧Run无新字段时继续使用历史off，不回填或修改旧policy。手动重试沿用原policy。

任务HTTP提交以命令标识及原请求摘要保存接受回执，和任务创建同事务。网络重发读取原结果，不因全局设置变化重新冻结；同标识不同输入冲突。身份验证与同源检查仍在回执查询之前。改变设置只影响新任务。

model_request实体schemaVersion=1，以runId:callNumber唯一定位，包含taskId、用途agent/compaction/branch_summary、预留美元金额、实际成本与usage（仅已知时）、结算时间。状态reserved表示无结算回执，settled表示需要的用量/成本完整，unknown表示收到但不完整。历史缺账本时不合成逐次记录。读取不安装资源、不调用模型、不重试请求。

worker每次RPC拥有UUID。模型预留以runId和RPC标识保存命令回执，唯一绑定用途和原始callNumber；重发不能再次占额，不能复用标识改变用途。回执不包含凭据，ModelAccess每次返回前仍重新验证当前授权与凭据。一次新的实际模型请求必须拥有新标识，不能把SDK重试混同IPC重发。

预留时额度和账本同事务写入；结算时Run累计、请求回执和事件同事务提交。新API与订阅请求按序号去重，首次结算作为固定回执，迟到重复不覆盖未知结果。未知成本仍按预留保守计入预算，实际成本字段留空；缺用量不宣称零消耗。订阅只有请求和tokens，不生成美元成本。API与订阅累计complete仅在全部请求都有完整用量回执时为true。进程消失后reserved继续占额，不能因重启自动退款。

接口GET /api/runs/:id/model-requests需要登录，以after序号分页，每页50、服务内部最大100。生产结算按唯一ID读取，页面按需获取明细，不把全部账本加入每次全局snapshot。UI解释历史缺记录、未知成本与不完整tokens。用量账本不存原始提示词、模型凭据或供应商原始错误。

已完成（见073）：生产压缩用途映射（LOOP-095/100）；分支摘要用途由 `PiSessionLifecycle.bind(navigateTree)` 自动标记（LOOP-105）；摘要请求挂起时结束 worker / 宿主重启扫描的预留保持 reserved（LOOP-097–099）；普通回答预留后、首字节前中断（LOOP-109）；流式 partial 后中断（既有 stream-crash）；API `maxOutputTokens` 与 API 模型选择入口（LOOP-103/104）；手动压缩摘要重点（LOOP-108）。

交互记录只认 schemaVersion 1。缺版本或更高版本在读取时视为已关闭，原因是版本不受支持，不回写成 1，也不能答复（LOOP-120）。会话历史和回复分块只采用 schemaVersion 1 的事件；请求回执缺版本或更高版本时拒绝结算且不改原文（LOOP-127）。指导回执、回复记录和工具记录同样只认版本 1：不能改状态、不能追加、不能核对，原文保留（LOOP-128）。未知版本的未完成工具不按当前规则阻塞接续，也不会交给后续执行重放。事件序号游标仍前进。会话文件兼容与原版对照、部署验收仍待。半截函数调用见 LOOP-110。不能把本ADR当作已经通过最终迁移/交付验收。

证据：tests/pi-accounting.test.ts、pi-settings.test.ts、model-request-ledger.test.ts、task-budget.test.ts；浏览器scripts/pi-runtime-ui-qa.ts。当前证据索引见073，不使用历史测试数量替代当前验收。

## 补充：同任务追加授权（LOOP-010）

task_budget_grant采用schemaVersion=1，保存taskId、sourceRunId、resumedRunId、commandId、追加次数/美元/原因及前后上限。只有最新已结束的失败/取消/已对账中断执行可以恢复；未知工具操作仍要求先对账。新增grant、新Run、事件和命令回执在同一个数据库事务提交，旧Run.policy不改，新Run仅显式增加两项上限。普通retry不增加额度，并阻止针对旧执行产生并行恢复分支。

GET /api/runs/:id/budget按task累计所有attempt消耗及未结算预留，返回最新授权和追加记录；POST /api/runs/:id/extend-retry提交calls、costUsd、reason、commandId。与retry共享幂等命名空间但将addition纳入摘要。同命令不同增量冲突；已接受回执在历史预检前返回，避免磁盘或环境变化导致重发结果不确定。所有接口仍经过登录和同源验证。

订阅不允许追加美元，API费用未知仍保守占额。任务追加不提升连接总额度或全局费用预算，不切换模型、工具、身份或每次执行时限。页面显示累计消耗、剩余额度和授权变化；网络未知时重发同一命令，确定4xx拒绝允许纠正输入。旧数据没有grant时直接使用原policy，不回填历史授权。

## 补充：Retry-After等待不产生额外请求（LOOP-014）

固定SDK有些provider在HTTP错误时不触发onResponse。仅对明确支持fetch注入的适配器包装请求函数，原Response不改写；从429/503读取retry-after-ms或retry-after秒数/HTTP日期，提取后只保留内存中的截止时刻，最大30秒，不保存响应头。原生Agent决定是否重试和次数；宿主仅在下一次请求预留前补足剩余等待，与原生退避时间重叠，不相加产生双倍延迟，不发起独立HTTP重试。

等待沿请求AbortSignal取消，等待前后均检查取消，之后仍经宿主时间/权限/额度检查。等待不占新次数/费用，也不计为网络无响应；整体Run时限继续生效。worker重试状态显示原生退避与响应提示剩余时间的较大值。旧profile关闭autoRetry时不包装fetch。

固定1.0.3的Google Generative AI和Vertex拒绝自定义fetch，Bedrock未提供同等请求注入；这些适配器保留原传输和原生退避。WebSocket响应也没有HTTP提示。本实现不能声称全部provider的Retry-After都已接入，后续能力清单与验收需逐来源说明。

## 补充：文本与工具输出持久化（LOOP-015/016）

run_message schemaVersion=1以Run/UUID为身份，channel缺省assistant，新增tool_result；同一身份不能变channel。正文按16Ki字符保存有序块，命令回执以run/message/chunk去重；消息预览、块事件及回执同事务。文本只创建一次assistant.message会话位置，后续更新其投影，最终状态不再生成第二份全文。工具结果使用tool.result/tool.delta独立事件，不能混入助手回复。两个输出类别分别有局部索引；旧数据不生成虚假分块。

tool_execution schemaVersion=1以Run和toolCallId的SHA256为实体ID，记录name、source、sequence、phase、2000字符预览及resultMessageId。来源须在宿主许可或当前实际插件工具登记中匹配；同一调用来源/名字不变。进度顺序、重复回执和终态均校验；完成/失败之前要求完整tool_result已持久且归属当前Run。完整记录是工具返回的JSON（content与details），不表示第三方工具已截断的原始stdout也被重新获取。

工具更新200ms合并为最新进度预览，最终JSON按块串行等待保存回执；待保存结果累计上限8MiB，超额/序列化失败/持久化失败取消运行并保留已有记录，不标成功。主聊天从共享snapshot刷新读取按需分页工具记录，不创建另一条SSE。运行已结束但工具仍running时显示“结果待核对”，不推断其副作用。

GET /api/runs/:id/tools按50条分页；既有messages/:id/text对两种channel均提供有鉴权的完整读取，核对run归属并遵守HTTP背压。所有工具字段、输出块随数据库备份；输出引用的外部路径不因保存JSON自动纳入备份。

LOOP-019：ToolExecution可选reconciliation独立于phase，人工核对不伪造工具回执。POST runs/:id/tools/:toolId/reconcile接收revision/outcome/evidence，检查Run终态、worker不存活、归属、版本及幂等回执；证据与事件事务保存。恢复检查同任务全部尝试和接续祖先的未确认工具，核对依据注入下一worker固定上下文。公开agent.beforeToolCall等待开始进度持久回执再调用原hook，失败即取消。工具内部嵌套callTool仍需专门覆盖；人工核对不能证明系统已自动终止任意命令子进程。页面明确要求核对外部操作与子进程。

LOOP-018增加可选outputMessageId：仅原生bash/powershell在本Run独立临时目录产生的fullOutputPath可归档，单文件上限128MiB，分块读取并核对身份、大小及修改信息；终态需相应tool_result完整持久且归属本Run。原文件位于sessions目录保留并参与备份，数据库归档供鉴权网页读取。两份分别占用sessions/数据库容量；原生命令写盘尚无逐块配额阻断，不能将70k验收扩大为上限性能证明。任意第三方外部文件引用不跟随。
