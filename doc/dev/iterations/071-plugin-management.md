# 071：插件管理实施现场

日期：2026-10-15。状态：已完成工程验收与本机交付。以下各轮按当时结果保留，当前结论以LOOP-007和交付审计为准。

## LOOP-007：最终审计与增量交付

- 核实旧命令90581已经退出0；安装preparing/committing/completed、更新committing、卸载committing真实杀宿主共5/5通过。复核Service.retry保留taskId/policy，reserveCall累计同任务预算，以及worker工具许可、动态来源验证与错误传播。
- 页面准确说明显示最近10次执行、每次500资源/100诊断；新增浏览器可见性检查。最新插件UI通过，窄窗及实际部署截图已检查。
- Node24全套命令 `node --import tsx --test --test-concurrency=2 tests/*.test.ts` 211/211，耗时497.6秒，退出0，无跳过。`tsc --noEmit`、Vite候选构建、Pi离线探针退出0。最新全套句柄58858及浏览器52156均结束。原工作台三组浏览器证据继续有效，未改其行为。
- 按前次候选摘要核对F:/AI/OS目标，无意外目标修改；暂存25文件并保留原件。重新记录部署前摘要并确认无在途任务，按既有脚本正常停止守护和服务，完成独立业务备份后应用候选，守护启动后ready。停机56654与启动20103均退出0。
- `deployment/final/before.json`与`after.json`业务摘要相同；实际浏览器入口重新验证历史真实模型回复、工具来源、验收插件已卸载和用户布局未修改。没有新增模型调用，保留之前3请求、7078tokens的回执。
- 台账、现场、ADR与使用说明同步为实际交付状态。最后同步仅更新文档，不修改运行代码；最终源文件与证据摘要见manifest.json。修改未提交，不伪造新commit。
- 恢复材料：最终候选指针指向独立原文件和业务备份，前一轮备份同样保留。代码回退需按逐文件摘要核对当前目标，再正常停止服务并还原原件；数据恢复单独使用已验证备份流程，不能覆盖后续新数据。插件重新安装不是原子回滚。

## LOOP-001：真实 SDK 与第一条完整管理链路

- 目标：按插件执行文档实现完整 PLG-00–08，不缩小为页面。
- 开始基线：HEAD d2659ff75a77e822cc881da84fb15ee2eea9c8f2；已有执行文档及索引改动保留。
- 运行环境：系统 Node 22.20.0；验证使用用户缓存 Node 24.19.0。既有 4310 服务健康，观察 PID 70256 / instance 0ed2e7f9-f708-4201-a15f-2e9fb333ffe2；未停止或修改该实例，后续必须重新核对身份和源码位置。
- 实现：本地资源校验/注册冲突保护；插件状态、读写协调、SDK 管理 worker、接口；Pi manifest、生命周期、命令上下文与资源来源记录；管理窗口两入口、单例与布局复制去重；容量组与备份缺包恢复。
- ADR：035-plugin-runtime。
- 验证：类型检查通过。plugin-tests.log 的 13 项插件测试通过；包含真实 npm 脚本/版本变更/超时、真实 Git HTTP 来源、本地包、实际 Pi worker 非交互命令与环境变化拒绝、备份恢复。模型请求为 0；模型 dispatch 截取验证不当作真实模型调用。
- 浏览器：Chrome 真实安装→启用→刷新→禁用→卸载、重复打开定位通过，`output/dev-evidence/plugins/ui/report.json` 与截图。此证据早于后续资源来源/容量界面改动，最终需重验。
- 相关容量与恢复检查：19 项通过（插件恢复/执行、backup-portable、capacity），命令输出见会话；最终统一归档并关联代码摘要。
- 全套开始基线：baseline-tests.log，183 项，180 通过、2 失败、1 超时取消。独立顺序复核 windows-baseline-recheck.log：7 项，4 通过、3 失败。失败为 desktop-entry/local-service/supervisor 的真实启动；stderr 指向 ensureWindowsLocalPermissions。保护脚本只读 status 看到当前工作树根未私有化，原因仍待进一步核查，未修改权限规则或跳过测试。

## 缺陷与下一条动作

- PLG-F001：首次 SDK 类型检查发现 ExtensionError.error、shutdown reason 与 setActiveToolsByName 接口差异；已按本地类型修正，类型检查通过。
- PLG-F002：浏览器 check() 对异步服务器开关即时断言失败；真实服务器最终状态正确，改为实际点击并等待可观察的服务器结果，完整链路通过。
- PLG-F003：插件命令不调用模型时没有原生会话文件；已记录实际用户请求触发 flush，真实 worker 验证通过。
- PLG-F004：Windows 产品启动基线失败，单独复核仍失败；已定位权限预检，不能作为已交付。下一步检查保护流程失败原因/耗时，保留本地权限和身份校验。
- 下一主任务：完善 PLG-02/06 的跨进程/共享依赖与恢复证据；增加 HTTP 多页面/权限、完整窗口交互；补真实模型验证与本地应用。
- 已结束的测试句柄不再轮询；没有本轮仍应等待的运行测试。后续先检查最新进程和文件再启动。

## 未完成验收

PLG-07/08 尚未开始总验收和交付；PV01–18 仍需逐项证据矩阵。真实模型调用、用户实例应用、全部 Windows 生命周期回归和最终完整 UI 复验未完成。本文不是验收通过报告。

## LOOP-002：进程接管与网络重试恢复

- 权限初始化原会话 75166 已结束，日志 permission-initialization.log 确认 protected，保护脚本保留 ACL 快照。未重放初始化；随后 desktop-entry/local-service/supervisor 顺序复验 7/7 通过，证据 windows-after-permissions.log。PLG-F004 的该组失败已解除，最终全套回归仍需执行。
- PLG-F005：fork 后保存 applying 状态失败可能遗留进程。调整为先注册进程关闭处理并持有 active，再保存状态和发送操作；失败杀进程树，等待 close 后释放锁。进度/提交持久化异常保留非终态，不能放行新执行。新增实际子进程故障注入测试；coordinator-recovery.log 共 4/4 通过。
- PLG-F006：前端查询乱序可回写旧状态；使用查询序号仅接纳最新查询。操作响应丢失后保存原始请求（含 revision 与幂等 ID）供重试，明确 4xx 后允许新请求。浏览器真实服务先接受安装再丢弃响应，重试确认仅一条操作；ui/report.json 通过且无页面异常，模型请求为 0。
- 类型检查、候选构建与 git diff --check 通过；构建日志 build.log，浏览器执行 ui-recheck.log。验证进程 99569、63814、84582 均已确认退出码 0，不再轮询或重启。
- 下一条动作：审查 Git 不同来源映射到同一托管目录的冲突，补写入前拒绝及实际来源验证；继续跨进程真实中断恢复、HTTP/多页面、窗口交互矩阵。当前不具备真实模型与应用交付证据，目标保持进行中。

## LOOP-003：目录冲突、实际宿主中断与 HTTP 契约

- 按本地 Pi 1.0.3 package-manager/getGitInstallPath 与 utils/git 源码核实：Git 来源身份含端口，但托管目录不含端口。新增写入前目录重叠检查，覆盖不同端口、父子目录、恢复后目录缺失；同一包更换 ref 允许。真实 Git 安装后尝试冲突来源，操作失败、原代码与提交保持、环境仍 ready。destination-check.log 3/3；destination-state.log 4/4。
- PLG-F007：第二个协调器构造时无条件隔离进行中的操作，可能干扰第一实例。恢复改为先取得持久 scheduler 租约；原实例租约有效时保留状态，过期后才隔离并允许修复。live-owner-recovery.log 3/3。
- 实际宿主故障夹具在 preparing、committing、commit 返回后三处持久检查点阻塞，测试父进程实际终止宿主，重新打开数据库并恢复。准备/提交前两项保留未决状态直至旧租约过期，再隔离并显式修复；提交后不重放且保留成功配置。host-crash-recheck.log 5/5，包括两项恢复回归。
- 第一轮 host-crash.log 为2通过1失败：完成边界夹具误在事务内 phase(completed) 中断，实际上尚未提交。保留该证据；修正夹具在 commit 返回后中断，未削弱生产事务语义或断言。
- HTTP 真实服务测试覆盖未登录401、异源403、未信任400、读者占用等待、重复请求返回同操作、并发新安装409、两客户端旧修订409、旧请求原样重放与改载荷拒绝。http-contract.log 1/1，通过时不调用模型。
- 类型检查及 diff 检查通过。新增使用说明，明确本地源迁移通过卸载登记再安装新路径、备份后缺包恢复、非沙箱边界；不代表已应用到用户实例。
- 下一项补强是 npm 安装后代存活时终止宿主，当前三处实际中断测试使用本地源，不能据此声称 npm 进程树回收已全部覆盖。随后完成窗口交互/双浏览器、动态注册和真实模型验证、全套回归、实际应用。未完成项仍按执行文档保留。

## LOOP-004：npm 后代回收与浏览器矩阵

- PLG-F008：本地编写的 npm postinstall 每100ms追加心跳；脚本实际运行后终止管理宿主。原方案下 worker 已退出但脚本仍运行，JavaScript disconnect 清理没有执行证据。npm-host-crash-recheck/fixed/diagnostic/observation.log保留失败；首轮 npm-host-crash.log 是测试包元数据漏列安装脚本导致未进入注入点，修正元数据后才得到实际缺陷。
- 使用独立 PowerShell 守护建立 Windows Job Object，设置 KILL_ON_JOB_CLOSE，安装前将 worker 纳入组。守护在 worker 退出后关闭 job；守护自身退出也关闭句柄。保护初始化失败不启动 npm/Git；不使用系统管理员权限，不将进程管理说成权限沙箱。Unix保持进程组方案。移除诊断期间的临时恢复日志写入。
- job-guard.log 3/3通过，确认管理宿主被杀后 worker和npm生命周期进程身份均消失，心跳不再追加，并通过本地安装/卸载及启动状态持久化失败回收。插件整体相关回归 plugin-regression-job.log 21/21通过，约79秒；未把该集合当作整个仓库最终验收。
- 浏览器两独立上下文无刷新观察启用、禁用、卸载同步；浮窗400px宽下键盘列表/详情切换，无横向内容溢出；设置入口恢复图标化窗口且不重复创建。真实Chrome设置150%缩放后验证表单初始焦点、错误提示、保留输入、取消可达。ui-zoom.log退出0，ui/report.json通过，浮窗及缩放截图已查看。模型请求0。
- 最终类型检查、git diff --check通过；进程句柄75360、13918、28039均确认退出0，不再轮询。所有故障夹具进程及HTTP服务按finally清理。
- 下一具体动作：审查运行时扩展命令与模板/Skills的名称碰撞，以及session_start之后动态工具的执行来源记录；补真实SDK断言并修复遗漏。之后跨空间/复制导入窗口与真实模型、实际应用。生产4310实例仍未修改。

## LOOP-005：命令来源、完整回归与本机真实应用

- 增加命令名称保留与绑定后复核，模板与Skill命令不会被扩展静默覆盖；工具注册回调将初始加载之后的新工具写入Run目录。真实SDK/worker测试5/5通过，dynamic-registration.log。初始与动态工具记录拒绝所有原生命名冲突，不仅当前policy列出的原生工具。
- full-regression.log：202/202通过，335.9秒。类型检查、Vite候选构建、Pi离线探针和原工作台三组真实浏览器通过。插件UI新增跨空间定位、复制/导入单例通过，ui-layout-matrix.log与ui/report.json。
- Orca CLI确认当前工作树dulse，目标F:/AI/OS同HEAD且目标源码无用户修改；只记录工作树状态，没有委派或更改分支。技能位置 C:/Users/ZYF/.agents/skills/orca-cli/SKILL.md。
- 应用前确认没有在途任务，保存业务摘要。按既有supervise-service/local-service正常停机、执行业务备份、校验55个候选文件的源/目标摘要后复制，重新启动守护。私有原文件/备份路径见deployment/candidate.json，未复制.env或凭据，未删除旧静态资源。应用后原21项目/39任务/40执行/56资产/16草稿等完整摘要保持，after.json确认unchanged。
- 使用现有已启用连接和预算，plugin-live-qa执行自编本地插件两任务、总3次模型请求，usage总7078tokens。验证真实模型调用工具并返回其随机标记、禁用后的新运行目录无插件、卸载后无包。live/report.json通过；验收项目归档、插件登记清理，源目录保留；未重复模型调用。
- 实际4310入口Chrome验证回复与工具来源可见，插件页面空列表及历史操作可见；浏览器私有布局拦截不会保存到用户布局，前后摘要相同。live/entry.json与截图通过，截图已检查。服务当前最近PID24060、实例55703548-392b-466e-8811-1e1bb03d314e，后续不可盲用历史身份。
- 仍需完成071-plugin-acceptance.md中各细项，尤其实际Pi占用时的写等待、插件错误/取消、缺工具/离线、安装中关窗、实际容量中断/恢复后重装。目标仍active，不能把实际可用与所有规范细项均验收混为一谈。
- 所有本轮进程已结束：完整回归26988、插件布局30247、原UI16521、停机59928、启动99756、真实模型76337均退出0。应用后新增的plugin-entry-qa.ts和文档修订还需在最终同步时加入交付文件清单；运行实现已同步。

## LOOP-006：补齐实际占用、容量、取消与离线证据

- 实际Pi命令写入启动标记后等待测试释放。在此期间更新操作保持waiting_for_environment、新任务queued，原任务退出后执行更新，新任务记录递增的环境版本，旧Run清单不变。随后主动制造session_start错误，Run失败且lastLoad准确关联该Run，模型请求0。real-worker-lock.log与runtime-capacity-recheck.log通过。
- 实际SDK AgentSession执行扩展工具，确定性provider流仅负责给出toolCall；错误工具形成isError回执，等待工具收到session.abort的AbortSignal并停止，agent退出流状态。tool-error-cancel-recheck.log5/5；首轮遗漏bindExtensions参数导致测试夹具失败，修正为SDK规定的空对象，不改生产行为。
- npm postinstall实际写20MiB，超过18MiB插件配额后被管理器中断并隔离；显式提高配额至64MiB后修复到锁定包，未清理未知路径。实际备份恢复到干净目录，恢复与manifest检查无registry请求；显式repair重新安装，默认禁用，主动启用后可取得清单。capacity-restore.log与runtime-capacity-recheck.log通过。
- 缺npm/git的真实worker使用空PATH，未创建安装目录即返回明确错误。生产加入先检查后安装，并区分尚未开始文件变更的失败，避免不必要隔离。真实不可达registry触发网络类别错误；只提取已知类别，不保存raw stderr或token；npm重试有界。prerequisites.log6/6、offline-network.log2/2、failure-boundaries.log14/14通过。
- 本地源实际移至新路径：缺失提示、拒绝加载，卸载旧登记保留移动后的文件，重新安装新路径并启用成功。local-relocation.log3/3。
- 浏览器更新等待中关窗重开，仍显示原操作，释放占用后仅完成一次。ui-pending-close.log与最新ui/report.json通过，其余双浏览器/缩放/空间矩阵保持。类型检查与diff检查通过。
- 本轮生产增强尚未同步到F:/AI/OS；待最后审计后增量应用。无活动进程句柄；83903、55396、68228、68848、53468均退出0。当前未新增任何模型请求。
