# 开发文档索引

当前修复（060）：用户明确要求保留Pi原生能力，已实现新任务的八项原生工具与工作台工具共存。见[060记录](dev/iterations/060-native-pi-tools.md)、[当前现场](dev/current.md)。研究工具限制为059历史行为；是否实际应用与验收以060记录为准。

当前主线（059，2026-10-11）：以Pi为底座，研究开源项目并逐步接入有用能力。已实现第一步“开源研究卡”，见[059记录](dev/iterations/059-open-source-research.md)和[当前现场](dev/current.md)。以下“最新”条目为历史记录，阶段验收以当前现场和台账为准。

当前实现与计划（057）：[同任务重试预算修复](dev/iterations/057-task-budget.md)。主计划与执行计划同步为0.11，沿用本地电脑版范围，明确同目标全部尝试共享额度；工程与应用结果见本轮记录。下一步继续日常界面、Windows生命周期和真实使用验收；手机/云部署延期，M0未验收、M1未启动。

最新工程（056）：[取消存储竞争修复](dev/iterations/056-cancellation-contention.md)、[ADR-032](adr/032-cancellation-storage-contention.md)、[修复后](../output/dev-evidence/cancel-contention-056-after.json)、[收尾审计](../output/dev-evidence/cancel-contention-056-audit.json)。159项/150文件通过并正常应用，取消异步等待短竞争、标记与事件原子提交，内容/登录/配置保持，零模型请求。发现重试预算范围不一致，L-03c待修复；M0仍未通过，M1未开始。

最新运行（055）：[真实Pi草稿重试与取消诊断](dev/iterations/055-real-draft-retry.md)、[原始失败](../output/dev-evidence/draft-retry-055-real.json)、[接续通过](../output/dev-evidence/draft-retry-055-resume.json)、[收尾审计](../output/dev-evidence/draft-retry-055-audit.json)。6请求，同Task保存后取消/重试1→2→3通过，154项源码基线保持。取消首次423已独立复现，L-03b待修复；M0仍未通过，M1未开始。

最新工程（054）：[草稿修改后重试](dev/iterations/054-draft-retry-receipts.md)、[ADR-031](adr/031-draft-retry-receipts.md)、[修复后复现](../output/dev-evidence/draft-retry-054-after.json)、[收尾审计](../output/dev-evidence/draft-retry-054-audit.json)。154项/148文件工程通过，同任务已确认版本与来源可在重试/干净恢复后继续，手动编辑和其他尝试保持保护；已正常应用，零模型请求。实际UI/模型重试与完整M0仍待验收，M1未开始。

历史计划（053）：[主计划](主开发文档.md)与[执行计划](开发执行文档.md)当时同步为0.10，补齐本地交付清单和执行优先级：先日常体验与可靠性、真实使用和本地M0验收，再受控并行与插件扩展。手机、云端与多端后续按需启动，见[调整记录](dev/iterations/053-local-delivery-plan.md)。当次仅修改文档，产品验收状态保持。

最新工程（052）：[授权锁释放竞争](dev/iterations/052-auth-lock-release-contention.md)、[ADR-030](adr/030-auth-lock-release-contention.md)、[修复后](../output/dev-evidence/auth-release-052-after.json)、[收尾审计](../output/dev-evidence/auth-release-052-audit.json)。148项/148文件工程通过，真实存储竞争恢复已验证并正常应用，零模型请求；原042根因与M0仍待验收，M1未开始。

最新工程（051）：[对话修改当前草稿](dev/iterations/051-selected-draft-editing.md)、[ADR-029](adr/029-selected-draft-agent-editing.md)、[真实Pi](../output/dev-evidence/draft-agent-051-real.json)、[收尾审计](../output/dev-evidence/draft-agent-051-audit.json)。145项/148文件工程通过，真实Pi3请求同稿1→2，已正常应用；实际界面交互与本地M0仍待验收，M1未开始。

历史计划（050）：两份计划当时同步为0.9，先本地日常闭环、可靠性和真实使用验收，再本地M1；手机、云部署与多端继续后置。补齐当前草稿对话修改的计划与验收，关联046/048/049进展，见[更新记录](dev/iterations/050-local-plan-refresh.md)。当轮只更新文档，没有新增工程通过或阶段验收。

最新工程（049）：[WAL容量恢复](dev/iterations/049-wal-capacity-recovery.md)、[ADR-028](adr/028-wal-capacity-recovery.md)、[收尾审计](../output/dev-evidence/wal-049-audit.json)。137项/147文件工程通过，修复正常应用；本地M0及M1未完成。

最新工程（048）：[资料阅读与草稿预览](dev/iterations/048-document-reading.md)、[ADR-027](adr/027-document-reading.md)、[收尾审计](../output/dev-evidence/reader-048-audit.json)。134项/146文件工程检查通过；浏览器新交互与用户反馈仍待验收，本地M0未完成。

历史计划（047）：两份计划当时同步为0.8，见[调整记录](dev/iterations/047-local-plan-update.md)。046已完成[草稿工作区局部验证](dev/iterations/046-draft-workspace.md)。以当前两份计划、[本地执行范围](dev/本地电脑版执行范围.md)、[当前现场](dev/current.md)、[权威台账](dev/backlog.md)、[验收矩阵](dev/acceptance.md)与[ADR-026](adr/026-local-desktop-first.md)为准。下文旧“最新执行”均为历史记录；远程准备不再作为当前前置。

044：[无现成资源的实施路线](dev/无现成资源落地路线.md)、[本轮记录](dev/iterations/044-deployment-route.md)。仅准备方案与条件实查，私人手机/Linux/云端和完整M0/M1均需继续验收。

最新执行：[043授权锁身份](dev/iterations/043-auth-lock-process-identity.md)、[ADR-025](adr/025-auth-lock-process-identity.md)、[收尾审计](../output/dev-evidence/auth-lock-final-audit.json)。128项最终工程通过并已应用；当前订阅和内容保持，原423原因及真实部署仍待验收。

最新执行：[042本机更新](dev/iterations/042-apply-local-preparation.md)、[部署方案](dev/部署准备方案.md)、[收尾审计](../output/dev-evidence/main-apply-final-audit.json)。123项工程通过；新准备源码已应用，现有内容/登录/订阅保持。真实云端及完整M0/M1尚未完成。

最新执行：[041转存进程中断](dev/iterations/041-offsite-process-crash.md)、[部署约束](../deployment/offsite/README.md)、[收尾审计](../output/dev-evidence/offsite-crash-final-audit.json)。123项工程通过，本机三处实际进程中断与死暂存回收通过；传输中硬杀、断电、云端/手机及完整M0/M1仍待验收。

最新执行：[040自动加密转存](dev/iterations/040-automatic-offsite-backup.md)、[部署入口](../deployment/offsite/README.md)、[收尾审计](../output/dev-evidence/automatic-offsite-final-audit.json)。121项工程通过；本地crypt调度已验证，真实云端/手机及原完整M0/M1仍待验收。

最新执行：[039加密备份转存](dev/iterations/039-encrypted-offsite-backup.md)、[ADR-024](adr/024-encrypted-offsite-backup.md)、[Agent操作入口](../deployment/offsite/README.md)、[收尾审计](../output/dev-evidence/offsite-backup-final-audit.json)。118项工程通过，本地合成加密恢复不替代真实异地/云端/自动调度或M0/M1验收。

最新执行：[038跨平台恢复修复](dev/iterations/038-portable-backup-and-cloud-candidates.md)、[云资源候选与费用](dev/云资源候选与费用.md)、[收尾审计](../output/dev-evidence/portable-deployment-final-audit.json)。116项工程通过；真实Linux/迁移、资源采购与完整M0/M1尚未完成。

最新执行：[037实际进程崩溃恢复](dev/iterations/037-chatgpt-transfer-process-crash.md)、[部署执行清单](dev/部署准备方案.md)、[收尾审计](../output/dev-evidence/chatgpt-transfer-crash-final-audit.json)。本地准备通过；真实资源、账户迁移、手机与完整M0/M1仍待验收。

最新执行：[036ChatGPT会话交接](dev/iterations/036-chatgpt-session-transfer.md)、[ADR-023](adr/023-chatgpt-session-transfer.md)、[实际HTTP测试](../tests/chatgpt-transfer.test.ts)、[收尾审计](../output/dev-evidence/chatgpt-transfer-final-audit.json)。真实账户/跨机器与完整目标保持未验收。

最新执行：[035Linux部署准备](dev/iterations/035-linux-deployment-files.md)、[后台服务文件](../deployment/linux/README.md)、[实际依赖安装](../output/dev-evidence/linux-install.json)、[收尾审计](../output/dev-evidence/linux-preparation-final-audit.json)。真实Linux、公网/手机及完整目标保持未验收。

最新执行：[034Windows权限](dev/iterations/034-local-permissions.md)、[ADR-022](adr/022-windows-local-permissions.md)、[实际应用](../output/dev-evidence/local-permissions-application.json)、[主产品保持](../output/dev-evidence/local-permissions-production.json)、[当时109项工程基线](../output/dev-evidence/verification/history/2026-10-06T17-28-25-236Z/report.json)。原108项固定归档；完整目标保持。

最新执行：[033环境与部署准备](dev/iterations/033-deployment-preparation.md)、[部署方案](dev/部署准备方案.md)、[当时环境](../output/dev-evidence/deployment-environment-before-permissions.json)、[腾讯入口捕获](../output/dev-evidence/memory-deployment-review/manifest.json)。用户无现成资源；未购买或运行第三方代码，现有权限缺陷和远程回调前置已进入台账。

最新执行：[032节点恢复](dev/iterations/032-node-reconnect.md)、[真实故障结果](../output/dev-evidence/node-reconnect.json)、[新增探针验证](../output/dev-evidence/node-reconnect-verification.json)、[主产品观察](../output/dev-evidence/node-reconnect-production.json)。现有工程108项基线保持，新探针独立验证；不把本机断线算作远程/睡眠验收。

最新执行：[031自动恢复](dev/iterations/031-client-recovery.md)、[ADR-021](adr/021-client-recovery.md)、[真实浏览器证据](../output/dev-evidence/client-recovery.json)、[当时108项工程基线](../output/dev-evidence/verification/history/2026-10-06T16-40-51-530Z/report.json)。登录一次、直接对话；测试登录轮换和服务恢复已明确记录，完整开发尚未验收。

最新执行：[030 HTTPS 底座](dev/iterations/030-https-proxy.md)、[ADR-020](adr/020-https-proxy.md)、[实际 TLS/HTTP2](../output/dev-evidence/https-proxy.json)、[当前产品保持](../output/dev-evidence/https-production.json)、[当时104项工程基线](../output/dev-evidence/verification/history/2026-10-06T16-11-07-701Z/report.json)。免配置原则保持，公网/真手机及完整开发仍待验收。

最新复核：[029实际默认浏览器观察](dev/iterations/029-default-browser-observation.md)、[部分证据](../output/dev-evidence/browser-opening-observation.json)。实际打开命令/窗口存在已验证，页面读取被无法确认URL的Computer Use策略保护停止，页面可用性仍未通过；工程代码未变。

当前执行：[028一键打开与用户登录后启动](dev/iterations/028-one-click-and-user-startup.md)、[入口ADR](adr/019-one-click-and-user-startup.md)、[真实入口命令](../output/dev-evidence/desktop-entry.json)、[产品保持](../output/dev-evidence/desktop-entry-production.json)、[当时103项工程基线](../output/dev-evidence/verification/history/2026-10-06T15-43-07-620Z/report.json)。桌面入口和当前用户Startup已配置；真实OS登录/默认浏览器页面/睡眠唤醒仍待观察。

前轮：[027默认后台守护](dev/iterations/027-owned-service-supervision.md)、[守护ADR](adr/018-owned-service-supervision.md)、[当时产品](../output/dev-evidence/supervision-production.json)、[原101项工程基线](../output/dev-evidence/verification/history/2026-10-06T15-30-46-133Z/report.json)。

前轮：[026大正文搜索](dev/iterations/026-bounded-ascii-search.md)、[有界ASCII/回退ADR](adr/017-bounded-ascii-search.md)、[实际最终HTTP性能](../output/dev-evidence/search-performance.json)、[当时产品](../output/dev-evidence/search-anchor-production.json)、[原99项通过基线](../output/dev-evidence/verification/history/2026-10-06T14-59-09-005Z/report.json)。

前轮执行：[025真实HTTP上传响应](dev/iterations/025-http-upload-responsiveness.md)、[实际小文件](../output/dev-evidence/upload-responsiveness.json)、[实际8 MiB大文件](../output/dev-evidence/large-upload-responsiveness.json)、[原基线与新探针验证](../output/dev-evidence/upload-probe-verification.json)。保持登录一次、直接对话，常规保护自动管理。

- [主开发文档](主开发文档.md)：当前产品与开发基线。
- [存储与多设备架构](存储与多设备架构.md)：当前本地存储与后续远程/电脑节点、同步和备份。
- [首个验证项目：腾讯 Memory](首个验证项目-TencentDB-Agent-Memory.md)：选型目标、固定验收、Pi 适配与内容交付，尚未运行或采用。
- [设计规范](design.md)：当前 Factory + ASCII 视觉与交互规则。
- [开发执行文档](开发执行文档.md)：开发 Agent 的循环、任务队列、验证与恢复规范。
- [接入与上线解决计划](dev/接入与上线解决计划.md)：优先验证ChatGPT订阅授权，分步解决真实AI、手机访问、独立备份与腾讯实验。
- 实际开发：[现场](dev/current.md)、[台账](dev/backlog.md)、[验收](dev/acceptance.md)、[迭代](dev/iterations/001-bootstrap.md)；[运行说明](../README.md)、[部署](deployment.md)。
- 决策：[Pi运行时](adr/001-runtime-and-pi.md)、[腾讯资料审阅](adr/002-tencent-memory-source-review.md)；[实验计划](dev/tencent-memory-experiment.md)、[文章初稿](dev/腾讯Memory文章初稿.md)。
- 当前证据：[代码基线/命令日志](../output/dev-evidence/verification/report.json)、[实际界面验证](../output/dev-evidence/ui/report.json)。效果图及离线证据不能替代真实模型/远程验收。
- 最近迭代：[项目上下文、摘要与自动保存](dev/iterations/002-context-and-summary.md)；[实际项目交互证据](../output/dev-evidence/ui/project-interactions.json)。
- 最新迭代：[搜索、视图恢复与后台服务](dev/iterations/003-search-and-lifecycle.md)；[ADR](adr/003-search-and-local-lifecycle.md)、[搜索交互](../output/dev-evidence/ui/search-interactions.json)。
- 当前迭代：[存储限制与可靠收尾](dev/iterations/004-storage-limits.md)；[存储写入ADR](adr/004-storage-admission.md)。
- 最新复核：[完整执行队列及会话恢复证据边界](dev/iterations/005-requirement-audit.md)。
- 最新实现：[ChatGPT订阅连接与解决计划](dev/iterations/007-chatgpt-connection.md)；[订阅界面验证](../output/dev-evidence/ui/chatgpt-interactions.json)。这是007离线实现证据；实际授权与目录已在010通过，模型用量与真实推理仍待确认。
- 接入复用建议：[模型网关与本地Agent协议](adr/005-provider-and-agent-reuse.md)，Pi已采用，LiteLLM/CLIProxyAPI/ACP仍为候选。
- 最新修复：[授权网络与可诊断错误](dev/iterations/009-oauth-network-fix.md)；原生代理复用不增加新网关依赖，实际账户登录已在010通过。
- 最新验证：[真实账户与目录修复](dev/iterations/010-real-account-catalog.md)；[连接元数据](../output/dev-evidence/chatgpt-real-connection.json)、[实际Chrome目录](../output/dev-evidence/ui/chatgpt-real-catalog.json)。62项测试通过，尚未执行真实模型任务。
- 历史等待：[模型用量三轮审计](dev/iterations/011-waiting-usage-audit.md)；012免配置要求解决此前启用前置，goal恢复active。
- 执行文档审查：[循环审查](reviews/开发执行审查-loop.md)、[架构审查](reviews/开发执行审查-architecture.md)、[优化记录](reviews/开发执行优化记录.md)；[初稿快照](reviews/开发执行文档-v0.1.md)。
- [整合审查结论](reviews/整合审查结论.md)：五项审查的发现与采纳情况。
- 专项审查：[产品](reviews/product.md)、[Pi 集成](reviews/pi.md)、[数据](reviews/data.md)、[自我升级](reviews/evolution.md)、[执行调度](reviews/execution.md)。
- [主开发文档 v0.1](reviews/主开发文档-v0.1.md)：历史快照，仅更新了文件引用。
- 设计提示词：[新版](design/prompts-v2.txt)、[首版](design/prompts.txt)。

产品效果图保存在 [output/product-concepts](../output/product-concepts/)。后续项目文档统一放入 doc，引用路径相对于各文档所在目录。

最新交付：[登录后直接使用及真实文件验证](dev/iterations/012-automatic-chatgpt-and-real-probe.md)，[自动接入决策](adr/006-chatgpt-automatic-onboarding.md)。67项测试通过；真实GPT-5.6-Sol两请求文件往返成功，01b后续生命周期及M0/M1仍待完成。011阻塞为历史。

当前交付：[真实取消、超时与用量回执](dev/iterations/013-real-cancellation-and-timeout.md)。70项测试通过；真实停止后检查点保留、所属进程退出、请求计数稳定；原生会话继续与M0/M1完整验收仍待完成。

最新交付：[项目原生会话接续](dev/iterations/014-native-project-continuation.md)、[ADR-007](adr/007-native-project-continuation.md)。77项测试通过，真实ChatGPT在服务重启后接续随机标记、独立绑定存在、原件不变、不重复原写入；异常中断与M0/M1完整验收继续推进。

当前交付：[中断接续、排队追问与独立磁盘恢复](dev/iterations/015-recovery-and-independent-backup.md)。78项工程测试通过；真实中断对账和排队追问成功，另一个项目成果隔离。E/C盘独立物理硬盘备份及恢复HTTP工作台通过；已修复维护临时登录占用设备名额，自动备份/保留和完整M0/M1仍待完成。

最新交付：[自动备份与保留维护](dev/iterations/016-automatic-backup.md)、[ADR-008](adr/008-automatic-independent-backup.md)。82项工程测试通过；真实双盘定时器与受控时钟保留轮转、实际Chrome通过；当前产品默认每天空闲/7点保留的首备份及恢复检查已成功。真模型记忆/内容、生产部署/异地恢复、大规模性能、腾讯及M1继续推进。

当前交付：[真实资料、记忆与文章闭环](dev/iterations/017-real-content.md)、[来源引用决策](adr/009-output-source-lineage.md)。83项工程测试通过；真实模型三轮11请求/31258 tokens，确认、修正、删除影响后续文章，原资料引用保留。最后界面定位失败已在零新增模型请求的原任务观察中修复；[最终文章](../output/dev-evidence/content-final-draft.md)。用户反馈、远程与生产门槛、腾讯及M1仍待完成。

018诊断记录：[384MiB维护响应测量](dev/iterations/018-backup-performance-diagnosis.md)。当时独立HTTP观察发现约3.4秒同步备份阻塞；019已完成后台修复，完整容量/启动扫描仍待验收。

最新实现：[后台备份019](dev/iterations/019-background-backup.md)、[ADR-010](adr/010-background-backup.md)。88项工程测试、类型检查、构建和离线探针通过，当前产品已更新且连接/文章保留。源库只读，维护不冻结界面、新任务排队；384MiB三次实际备份/恢复/2点保留轮转，1180次数据读取最高49.6ms。完整容量/启动/远程和原M0/M1门槛保持。

当前交付：[Windows完整部署020](dev/iterations/020-windows-deployment.md)、[节点原文ADR-011](adr/011-node-receipt-content.md)。89项工程测试及完整工程检查通过；中文空格目录完整复制构建/启动/重启、节点CLI、自动备份及恢复HTTP通过。已修复节点上传原文末尾换行丢失并兼容旧回执。当前产品保持ChatGPT自动连接、文章和原浏览器会话，零模型请求。下一步完整混合容量/启动扫描；远程、腾讯、用户反馈及M1仍待完成。

当前交付：[后台搜索与容量测量022](dev/iterations/022-search-performance.md)、[搜索ADR-014](adr/014-search-and-capacity-performance.md)。022已应用后台只读搜索、单次候选查询及每次准入单次容量遍历，保留原件哈希/权限/配额与恢复预留。95项工程检查通过。完整场景小资料搜索最高1633毫秒、期间数据读取最高23毫秒；50份8 MiB正文页仍2757毫秒超过2秒门槛。独立项目29份32 KiB新写入共14.8秒，不等同整批建档已通过。用户无需新增设置，原ChatGPT自动连接、文章、31登录完整指纹、调用计数及每日备份时间保持。 生产/远程/腾讯/用户反馈/M1仍未完成。

前轮交付：[混合容量、较长归档与后台历史备份检查021](dev/iterations/021-mixed-capacity.md)、[归档ADR-012](adr/012-native-archive-validation.md)、[启动ADR-013](adr/013-background-recovery-scan.md)。91项工程检查通过，默认661资产/七备份和实际2043 MiB整体边界/恢复通过，七点启动3707毫秒、后台211次读取最高253毫秒。当前产品保持连接/文章/31登录及每日到期。搜索与写入扫描性能、生产/远程/腾讯/用户反馈/M1仍未完成。


最新[023](dev/iterations/023-search-mapping.md)：023已应用只读搜索数据库映射和UTF-8索引字节校验，原件完整哈希、损坏修复/权限/分页和存储边界保持。96项工程检查通过。完整容量小资料搜索最高1434毫秒、大正文页2057毫秒仍超过2000毫秒；期间数据读取最高23毫秒。用户无需新增设置，原ChatGPT自动连接、文章、31登录完整指纹、调用计数及每日备份时间保持。 最大两个只读进程各1 GiB虚拟映射不是OS内存/文件隔离。完整建档、生产物理配额/WAL、监督/唤醒、真实跨网络手机、异地恢复、腾讯和用户反馈继续按原门槛验收。


最新[024](dev/iterations/024-batch-write.md)：024已应用同一次上传前置容量合并测量，没有跨阶段缓存或扩大配额。98项工程检查通过。同脚本新建661资产/约499 MiB原件及原生会话，完整建档172.4秒→121.0秒（约29.8%改善），两批内容清单一致、各661哈希和16条SDK消息重开通过。单次写入峰值596ms、完整大正文2057ms及实际HTTP期间数据响应仍待验收。无需新增设置，ChatGPT自动连接、文章、原31登录完整指纹、调用计数与每日备份时间保持。 这次为本机各一次完整建档，不能推广为生产HTTP延迟或OS容量隔离已通过。真实跨网络手机、监督/唤醒、异地恢复、腾讯运行和用户反馈仍按原门槛推进。
