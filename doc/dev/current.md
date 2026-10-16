# 开发现场

更新：2026-10-16。唯一进度台账；任务定义见[开发执行文档](../开发执行文档.md)。

## 当前交付与授权

本轮范围：用户已授权按开发执行文档持续推进完整目标。C00、C01.1—C01.4、C02—C04 已验收；C05 首发已验收，当前开始 C06 白板与设计能力逐项验证。完整 C06—C12 功能未完成。

产品路线：个人优先、本机运行、画布式本地资产管理；OpenPencil 底座；先独立运行，后接 OS。工程默认与尚待验证的边界见[架构约定](../全能画布架构与数据约定.md)，不将默认当作用户已确认的细节。

## 实际代码基线

- 当前工作树：OS/bluegill，分支 bluegill。
- 本轮开始的 HEAD：8afed9f4b27797dd09b007bae3ac2e6b57418d6f。
- 保留此前未提交文档改动；新增 apps/canvas 来源清单、许可证与 scripts/canvas.ps1。上游扩展以 apps/canvas/patches 中的补丁版本管理。
- 现有代码为旧 OS：React、Pi SDK 1.0.3；package.json 要求 Node.js 24+。
- 旧系统检查入口为 scripts/run.ps1 的 build/test/probe；新画布命令位于 scripts/canvas.ps1，不能拿旧 OS 测试证明新画布可用。
- OpenPencil 固定提交 78355fd3890cc9da9539235ee3b38beb917f2ed6（0.16.0），Bun 1.4.2；源码位于 .runtime/open-pencil-upstream，启动与验证入口为 scripts/canvas.ps1。节点、网页、透明窗口的早期可行性原型已验收；完整产品化仍归 C07—C10。Windows 安装与新 release 验证以文末最新 C05 检查点为准。
- 本轮启动独立 OpenPencil 验证服务，使用 14220/14221 端口；未操作旧 OS 服务、账号、会话或用户素材。

## 任务状态

| 任务 | 状态 | 证据 / 下一条件 |
| --- | --- | --- |
| 文档重整 | done | 四份核心文档及入口完成；14 个旧文件删除，design.md 已恢复；核心链接与 diff 检查通过 |
| C00 / A 基线 | done | 原版启动缺陷已复现并记录最小 Windows 补丁；编辑/撤销/重做及真实 FIG 重开通过，见基线证据；FIG ID 不稳定单独记录 |
| C01.1 / A 核心契约 | done | 覆盖布局、编辑态选择/移动/撤销、交互输入/缩放及 FIG 元数据往返通过；宿主/保存契约、风险和数值预算见架构第 9 节及 C01 报告 |
| C01.2 / 早期隔离原型 | done | 独立 Worker/QuickJS、认证能力桥、原生画布运行/取消/错误恢复通过；范围与 C08 缺口见 isolation/README.md |
| C01.3 / 早期网页原型 | done | 真实 Windows 网页承载、输入/IME、缩放、原生遮挡/命中及画布联动可行性通过；受测范围和 C07 待办见 canvas-c01/web/README.md |
| C01.4 / 早期桌面原型 | done | 透明双层、全局快捷键、下层鼠标/键盘、网页及短任务共存通过；范围与 C10 缺口见 canvas-c01/desktop/README.md |
| C02 / A 持久化 | done | 本轮恢复保护改动已通过生产重开与保存回归； 逐项验收见 C02 报告顶部矩阵；存储/重启/历史/布局/未知字段/失败恢复和真实生产页保存通过；规模性能验收仍归 C05 |
| C03 / A 目录 | done | 逐项证据见下方 C03 验收矩阵；完整构建、18 项后端回归、生产同步和重开通过；补丁 setup 幂等通过 |
| C04 / A 落盘 | done | 首期 PNG/TXT 落盘、批量/恢复/关联/撤销边界、快捷键及未重新导出状态验收通过；完整矩阵和平台限制见 C04 收口记录 |
| C05 / A 首发 | done | 逐项审查见 C05 README 收口记录；最新 Factory 安装版启动/主题通过；历史限制保留 |
| C06 / B 白板设计 | doing | C06.1 能力盘点与基础编辑验收；见 canvas-c06/README.md，未将上游测试存在当作通过 |
| C07 / B 媒体网页 | todo | 依赖：C05、C01.3；验收见执行文档对应任务 |
| C08 / B 节点 | todo | 依赖：C05、C01.2；验收见执行文档对应任务 |
| C09 / B agent | todo | 依赖：C08；验收见执行文档对应任务 |
| C10 / B 桌面 | todo | 依赖：C05、C01.4；验收见执行文档对应任务 |
| C11.1 / C 窗口管理 | todo | 依赖：C05；验收见执行文档对应任务 |
| C11.2 / C OS 业务接入 | todo | 依赖：C09、C11.1；验收见执行文档对应任务 |
| C12 / C 交付 | todo | 依赖：C06、C07、C08、C09、C10、C11.1、C11.2；验收见执行文档对应任务 |

C01、C11 是任务组简称，不再用整体状态挡住已满足依赖的子任务。状态为 todo / doing / verifying / done / blocked。进入新阶段后按执行文档拆最小子任务，不能仅因某段代码存在就勾选父任务。

## 下一轮入口

C05 已按文末收口审查完成。当前 C06.1：按需求 4/5 节逐项核验上游能力在 OS 画布模式的入口、实际编辑与保存恢复，先覆盖文字/图形/分组/画框/连线；缺口须实现或明确保留后续任务，不能直接写成对齐 Figma。

可复用独立开发服务 31081（24650/24651/24652，.runtime/canvas-theme-data），使用前确认仍存活。最新安装记录 factory-theme-installation.json。旧 C05 构建与测试会话均终态，不重复启动。历史大包超时与 60 Hz 投递空档保留在 C05 报告，不自动扩张当前通过范围。

## 历史检查点（按时间追加，当前状态以文末为准）

- 当前任务：C00、C01.1、C02、C03、C04 done；C05 doing。其余任务按上表，完整目标未完成。工作区未提交，保留既有文档重构与旧 OS 改动。
- 来源：apps/canvas/upstream.json 固定 OpenPencil 78355fd3890cc9da9539235ee3b38beb917f2ed6，Bun 1.4.2；上游扩展均纳入 apps/canvas/patches，当前 0002 SHA256 f9cd3e66e53bf1a491efaa6f78716a1c379711330501f234808197046bcf3e9a。setup 幂等验证通过。
- 服务实现：apps/canvas/local/。workspace.sqlite + 不可变 FIG 文件保存作品；layout.sqlite 独立保存面板配置。回环 HTTP 桥校验 Host/Origin/会话令牌，Vite 代理持有令牌，不注入浏览器。
- 已验证：[C00](../../output/dev-evidence/canvas-c00/README.md)、[C01](../../output/dev-evidence/canvas-c01/README.md)、[C02](../../output/dev-evidence/canvas-c02/README.md)。C02 包含真实磁盘/新进程恢复、提交中断、HTTP 拒绝、普通保存与丢响应重试、Ctrl+S/自动保存/并发编辑/标签绑定、UUID 复制粘贴/撤销重做、两页及视口恢复、首次草稿、独立布局与未知版本拒绝。
- 本轮验证：history-persistence、identity-persistence、persistence、layout-persistence 浏览器测试通过；Node 24 布局/存储/HTTP 共 7 项通过（recovery-service-tests.tap）；vue-tsc --noEmit 通过。新增历史、未来格式拒绝、文件与数据库写入失败后的原版本保留及同操作重试。完整 build 首次因布局循环常量条件 lint 失败，已修正并回归；第二次构建因跨 await 的 disposed 检查触发类型 lint 失败，已提取实时生命周期检查函数，保留防覆盖逻辑；最新完整构建退出 0（依赖包、结构/类型 lint、Vite 生产打包，覆盖 metadata 与预览桥），日志 output/dev-evidence/canvas-c02/build-preview.log。生产预览 14240/14242 已通过真实绘图、保存、新浏览器重开及丢响应重试，证据 production/persistence.json；代理来源/令牌拒绝检查通过。仍保留上游非阻断警告。性能预算尚未按规模验收。
- 当前验证环境：exec 会话 22263（前 48741、 16100、5278、40826、25769、95468、86597、28193、28688、72278、45839、4758、88113 已主动关闭）；14230 编辑器、14231 MCP、14232 本机服务，目录 .runtime/canvas-c02-test-data。入口 http://localhost:14230/?os-canvas。进程 ID 清理前用端口和命令重新核验；旧 14220/14221 原型服务属独立会话 33742，未碰旧 OS 服务。
- 启动：设置 OS_CANVAS_APP_PORT=14230、OS_CANVAS_MCP_PORT=14231、OS_CANVAS_PORT=14232、OS_CANVAS_DATA_DIR 为上述独立目录；scripts/canvas.ps1 local-dev -NodePath C:/Users/ZYF/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe。该 Node 为 24.19.0；系统 Node 22.20.0 未修改。
- 测试：node apps/canvas/probes/{persistence,session-persistence,identity-persistence,draft-persistence,layout-persistence,history-persistence}.mjs（分别运行，默认 14230）；C01 workspace 用 OS_CANVAS_TEST_URL=http://localhost:14230。Node 内核测试须使用上述 Node 24。
- 已知边界：FIG 内部 ID 重写，页面 pluginData 丢失；普通节点用 UUID，页面用同事务有序清单恢复。首次提交确认前存在约一秒加写入时间的未确认窗口。另存为保持 FIG 导出；布局目前仅两面板显示，完整窗口管理后续实现。
- 本轮修复：CanvasKit 同家族同样式的字体分片选择导致中文缺字，下载本身成功；0003-font-subset-fallback.patch 为补充分片建立仅用于渲染的别名并加入段落备用列表，作品仍保存原字体名。SHA256 ac147a4b756e9b41659a8a90b6d526080614abe11a85740cf0833dd2fbb02143。file-nodes 回归通过，已将重命名样例改为中文素材.txt；新浏览器保存重开后中文文件名、已关联/缺失状态均截图可见（canvas-c03/file-nodes.png）。诊断探针 font-subsets.mjs 使用 Vite 源模块，仅用于开发服务定位，不作为生产验收；HMR 版本可能产生模块副本，正式结果以文件节点 UI 回归为准。
- 构建核验：前次 build-fonts-final.log 的包构建、两类 lint 和 Vite 打包均完成，但外层 PowerShell 将原生命令 stderr 记为 NativeCommandError，返回 1，未当作成功验收。新的完整构建使用 Python 子进程捕获 scripts/canvas.ps1 的实际退出码，退出 0（exec 86883 已完成，canvas-c03/build-observer-final.log 与 .exit.txt），覆盖本轮自动监听、字体补丁、结构/类型检查和生产打包。直接 Bun 构建曾因 PATH 未含 Bun 失败，已恢复使用正式脚本入口。
- 本轮自动更新：directory-observer.mjs 使用直属目录 fs.watch 事件置脏，每 10 秒补扫；前端每次轮询结束 1.5 秒后请求 /mounts/:id/poll，首次打开补扫，离线恢复重建监听。30 秒无请求释放目录监听，服务关闭主动清理。普通打开与目录入口共用 currentMountId 监听；旧画布异步结果不得写入新画布，历史恢复待提交时暂不扫描；自动扫描失败不污染保存错误状态。
- 验证：observer-tests.tap 共 6 项通过（真实文件改名、离线恢复、漏事件补扫、监听租约回收及已有文件索引/HTTP 回归）。automatic-files 首轮真实浏览器通过，不点击刷新也同步中文改名、缺失/离线，保留几何、撤销和工作内容并重开。一次 503 后自动恢复、新增中文文件及保存亦通过（exec 93380 已完成）；automatic-files.json/png 已记录并人工查看截图确认中文卡片可见。
- 子目录入口：选中本地文件夹或其标签后点击“打开选中文件夹”，先保存当前未提交内容，调用已认证的 POST /mounts/:mountId/files/:assetId/open。服务器补扫并核对直属目录类型、可靠身份及可用状态，拒绝链接/替换目录/跨挂载 asset ID，再登记或重定位同一目录身份，复用唯一 canvasId。父子画布分别保留内容，通过“我的目录”返回。
- 子目录验收：child-folders.json/png 实际浏览器通过父画布新内容自动保存、子目录文件显示、往返后父子内容及 asset ID 保留，截图已查看。child-tests-final.tap 覆盖目录改名后复用画布、重复打开、链接/替换/跨目录拒绝、HTTP 未认证拒绝。早期一次测试因系统随机分配的端口命中 Fetch 禁用端口失败，后端测试已改用 Node HTTP 连接随机端口，保留真实网络认证检查；不修改产品网络策略。
- 构建：首轮子目录 lint 报函数复杂度，已提取 selectedFileLink 供后续重新关联复用；完整构建又报可选链规则，已修正。最终完整构建退出 0（exec 6892 已完成），日志 canvas-c03/build-child-final.log，退出码另写 .exit.txt；包构建、结构/类型检查及生产打包均通过，setup 补丁幂等通过。
- 同路径替换确认：后端 replacement-preview 仅预览、replacement-confirm 明确确认普通文件的新身份；保持资产 ID，增加修订，不改原件。预览有效 5 分钟、最多缓存 256 项，绑定挂载/资产/路径/修订/原件身份与修改签名；确认前复查，变化则拒绝。响应丢失时同一预览重试不增加第二个修订；服务重启使未完成预览失效，已提交关联保留。界面选择被替换文件后“重新关联原件”，展示目标绝对路径和大小，明确影响共享引用，可取消；选择/画布切换丢弃旧预览。
- 验证：replacement-tests.tap 后端套件通过，覆盖预览不改变关联、过期上下文/目标变化拒绝、响应重试、稳定 ID、重启恢复及 HTTP 认证；replacement.json 与两张截图验证真实界面预览/取消/确认、响应丢失重试和保存。新增按钮导致的横向溢出已修复为换行，截图复核恢复正常。结构/类型 lint 日志无错误，完整 build 退出 0（exec 45577 已完成，canvas-c03/build-replacement.log 与 .exit.txt），setup 补丁幂等通过。viewport 断言复跑通过（exec 38587），无横向滚动溢出。
- 跨目录文件重新关联：file-targets.mjs 预览绝对路径普通文件，预览不登记目录、不改文件；确认复查身份/修改签名，再登记目标父目录并复用其索引资产。/file-targets/preview 与 confirm 均要求宿主认证。有效期 5 分钟、最多 256 预览，变化/缺失/不可用/替换未确认时拒绝。界面显示完整目标路径及影响范围，确认仅改变选中节点引用；原资产与其他引用保留，节点自身 UUID/位置不变，单独可撤销/重做。目标资产 ID 可与原资产不同，不冒充资产合并。
- 外部引用同步：扫描当前画布根目录，同时轮询画布实际引用的其他挂载；外部挂载仅同步被引用的资产，不把其余目录内容铺入画布。解除引用后监听按已有租约回收；预览随选区、画布或输入路径变化失效。
- 验证：file-targets-tests.tap 通过预览不登记目录、复用目标资产、目标变化拒绝、HTTP 身份拒绝等；relink.json/png 实际浏览器通过跨目录移动后关联、节点 UUID/几何保留、撤销重做、目标外部修改自动更新、无关文件排除及重开恢复，截图已查看。原自动目录/替换确认回归通过（exec 25603/61067 已完成）。首次扩展扫描 lint 报复杂度 24，已拆分引用收集和已知资产读取；完整构建退出 0（exec 47201 已完成，canvas-c03/build-relink-final.log 与 .exit.txt），setup 补丁幂等通过。
- 挂载目录恢复：MountStore 提供 relink-preview/relink-confirm，确认前保留旧关联；5 分钟预览绑定源登记与目标系统身份/创建时间，确认时复核并以单个数据库事务更新路径/身份，保留 mountId/canvasId。目标已有另一登记时拒绝，不合并画布。丢响应精确重试可恢复；已提交后旧预览不能覆盖后续关联，重启使未提交预览失效。界面先打开原画布，在目录路径框填写目标，点击“恢复当前目录关联”，明确确认或取消；不替换当前场景，工作内容与布局保留。
- 扫描一致性：FileIndex 在扫描前后核对挂载身份，避免同路径换目录时旧扫描写入；DirectoryObserver 在身份变化时重建监听。目录恢复后同名不同身份的文件仍标记 replaced，需单独确认，不能因为同名就静默合并。
- 验证：mount-relink-tests.tap 共 10 项通过（目录恢复/去重/重启、目标变化/已占用拒绝、旧扫描失效、文件索引、监听、HTTP 认证）；mount-relink.json/png 实际界面通过预览取消、同路径目录替换恢复、丢响应重试、原文件 ID/位置/工作内容保留及重开，截图已查看。完整构建退出 0（exec 63561 已完成，canvas-c03/build-mount-relink.log 与 .exit.txt）。
- 最新 C03 验证：子目录替换会保留原子画布，父索引写入失败后可重新预览恢复；两个数据库不是共同原子事务。child-replacement.json、directory-list-reopen.json 均 passed。目录 offline/replaced/unavailable 标签已区分。all-service-tests.tap 共 18 项通过；build-child-replacement.log 及 .exit.txt 记录完整构建退出 0。
- 生产验证：production/automatic-files.json 与 production/directory-list-reopen.json 均 passed，URL 为 14240；覆盖自动增改删、离线、布局/撤销/工作内容保留、关闭后新增文件的初始补扫。预览会话 71271 使用独立 .runtime/canvas-c03-preview-data，清理前须重新确认进程。开发服务 22263 与生产服务句柄均需恢复时重新确认。
- 归档：0002 已重新生成并执行 setup，退出 0；README 中过时的中文缺字、无监听和目录替换未实现说明已修正。生产自动同步和子目录替换截图已人工核对，中文标签与状态可见；git diff --check 退出 0。C03 验收完成，进入 C04。路径输入代替原生选择器，字体完整离线加载尚待后续验证。


## C03 验收矩阵（2026-10-15）

以下证据位于 output/dev-evidence/canvas-c03；适用当前未提交实现及上述 0002/0003 补丁。

| 必须行为 | 证据 |
| --- | --- |
| 加目录自动创建画布、重复加入复用、重启恢复 | mount-persistence.json；mount-store.test.mjs；C03 后端套件 |
| 文件关联标识与中文可见 | file-nodes.json/png；production/automatic-files.png 已查看 |
| 外部新增、改名、修改、删除自动同步 | directory-observer.test.mjs；production/automatic-files.json passed |
| 离线保留节点、布局、工作内容和撤销 | production/automatic-files.json；file-nodes.json |
| 普通本机画布入口重开补扫 | production/directory-list-reopen.json passed |
| 子目录独立画布、父子往返保留内容 | child-folders.json；child-replacement.json/png |
| 同路径替换、跨目录文件关联、根目录恢复 | replacement.json；relink.json；mount-relink.json；对应后端测试 |
| 中断及重试不重复子画布 | replacement.test.mjs 的父索引失败/重开/重试案例；all-service-tests.tap 18/18 |
| 当前实现构建与复现入口 | build-child-replacement.log/exit.txt 为 0；补丁 setup 退出 0 |

当前文件节点为关联卡片，媒体预览属于 C07；原生目录选择器、完整离线字体、规模性能和安装交付尚未验收。C03 完成不代表这些能力完成。

## C04 当前实施边界

- 第一子任务 C04.1：本地文件提交日志及恢复。操作 ID 绑定目标挂载身份、文件名、内容摘要、画布与节点 UUID；同 ID 不得用于不同请求。
- 先保存工作内容再发起文件副作用；临时文件与目标位于同一目录，提交不覆盖已有文件。重名显示冲突，由用户修改名称；不静默改名或覆盖。
- 文件已提交但场景关联尚未保存时保留可恢复结果，重开可补关联。扫描必须识别待关联输出，不能先创建重复卡片。
- 后续子任务把上游选中对象导出接到真实界面，保留原节点几何/身份/选择，提供关联标识。落盘撤销不删除磁盘文件；长操作不能覆盖新编辑。
- 验收仍包含完整 C04 的重名竞争、精确重试、磁盘满/写保护、写入中断和文件提交后中断，不能以服务单元测试代替实际界面交付。

### C04.1 最新检查点

- 新增 apps/canvas/local/output-store.mjs 与 output-store.test.mjs。outputs.sqlite 格式 1 持久记录请求摘要、内容快照、来源画布/节点/修订、目标目录身份及 prepared/ready/committed 阶段。
- 同目录临时文件刷新和校验后，用硬链接发布，避免覆盖竞争中出现的同名目标。ready 记录保存系统文件身份；目标已发布但日志未完成时，重开后核对身份及内容再补记提交。已提交操作精确重试不再次生成文件，即使用户后来删除成果也不自动重建。
- 四项真实临时目录测试通过：重开与幂等、发布后数据库写入中断恢复、路径/重名/目录替换拒绝、发布中断后外部编辑保留。SQLite trigger 模拟写入中断，不冒充进程强杀、磁盘满或断电验证。完整服务回归证据为 output/dev-evidence/canvas-c04/service-tests.tap。
- HTTP 已接通（见后续检查点），界面尚未接通，不将 C04.1/C04 标为完成。待关联成果去重、持久关联确认及启动自动恢复尚未完成。
- 当前需要文件系统支持同目录硬链接，失败保留原工作内容与日志，不降级为可能覆盖目标的 rename；需明确验证非 NTFS 文件系统策略。写入中断可能保留未完成临时文件，尚未清理；并发多宿主写入尚未验证。后续恢复接口不得仅凭同名或内容哈希认领文件。
- 下一动作：接入服务生命周期及认证路由，用稳定输出操作引用协调 FileIndex 扫描与画布补关联；同时补充写入失败/真正子进程中断测试。之后接入选中对象真实导出与 UI 验收。

### C04.1 服务接入检查点

- server.mjs 已管理 OutputStore 生命周期和独立故障状态，沿用 Host/Origin/令牌校验。POST /outputs 校验规范 base64 及 sourceRevision，要求源画布修订确已保存在 WorkspaceStore；POST /outputs/:id/commit 发布文件；GET /canvases/:id/outputs 查询恢复日志。尚未校验源节点在该 FIG 内的身份，编辑端接入时必须补齐来源绑定。
- output_temporaries 表在写文件前登记每次尝试的随机临时名称，FileIndex 只排除当前挂载身份下日志登记的临时名称，不按前缀隐藏用户文件。中断遗留临时文件不会被显示成资产，尚未自动清理。正式输出仍正常索引，原节点关联及去重逻辑待编辑端接入。
- 新增真实 HTTP 验证：未认证拒绝、无保存修订拒绝、非法编码拒绝、服务重启后提交、幂等重试、文件内容和扫描结果、日志查询。新增中断后扫描临时文件排除测试，同时确认无关同前缀文件仍显示。
- 首次测试因样例文件名写错报 ENOENT，已改为现有 revision-1.fig；完整服务回归 24/24 通过，见 output/dev-evidence/canvas-c04/service-http-tests.tap，退出 0；git diff --check 通过。当前未改编辑器源码，不以本次后端测试声称 UI 或生产整合通过。
- 下一动作：确定正式输出到原节点的稳定引用与确认记录，接通编辑端导出、恢复日志消费和扫描去重；然后补真正进程中断、写入失败及真实 UI 验收。现有开发/生产服务尚未重启加载本轮服务代码，测试使用独立临时服务。

### C04.1 成果来源检查点

- OutputStore.origins 按日志中的目录身份和文件系统身份向 FileIndex 提供 outputOrigin（operationId/canvasId/nodeId/sourceRevision）。扫描/读取接口对来源明确且 available 的文件返回此字段，正式文件仍参与正常索引；不靠名称或内容哈希认领来源。
- 重开服务后来源映射保持，无歧义的改名保留来源。存在多个硬链接时仅原提交路径可认领来源，其他别名不获取同一节点的来源；同路径不同身份替换状态不返回来源。
- 新测试覆盖日志/索引重开、改名保持资产 ID、硬链接别名排除及同名替换拒绝。首次用例在曾经形成硬链接歧义之后要求改名保持资产 ID，与既定不自动合并歧义的规则冲突；调整为先验证无歧义改名，再验证硬链接边界，未放宽产品身份规则。
- origin-service-tests.tap 完整后端回归 25/25 通过，退出 0。HTTP 测试确认扫描实际返回来源字段。尚未修改上游编辑端；现有 fileEntrySchema 会忽略新字段，不能声称原节点自动关联或去重已经完成。
- 下一动作：扩展编辑端 fileEntrySchema 并以当前 canvasId + 节点 UUID 消费来源，保留节点名称/内容/几何与选择，避免把普通成果改造成文件卡片。补充保存来源节点清单/导出快照校验后接通 UI。仍需多次导出与已有关联的明确行为、关联确认和重开恢复测试。

### C04.2 编辑器来源关联检查点

- fileEntrySchema 已保留 outputOrigin；目录扫描在创建卡片前调用 attachOutputOrigins，按当前 canvasId 与节点稳定 UUID 给尚无文件关联的原节点附加 fileLink。已有显式关联优先，来源画布不匹配时不绑定；节点已不存在时不重建原作品，按普通文件流程显示。
- 文件更新仅自动改文件卡片拥有的标签及卡片名称；普通成果节点保留原名称、类型、内容与几何，外部改名不覆盖作品名称。新关联属于外部成果同步，不加入可删除磁盘文件的撤销动作。
- output-origin.mjs 实际浏览器验证来源画布排除、已有引用不覆盖、一个节点无重复卡片、保留选区/名称/几何及真实保存重开；output-origin.json passed，截图已查看。此探针使用构造的扫描条目并调用开发模块，验证的是适配层与真实编辑器持久化，不是完整落盘 UI/生产验收。
- 首次探针漏写函数结束括号而语法失败，修复后通过。源码变更已纳入 0002 补丁，setup 幂等通过；完整构建会话 80492 已退出 0，证据 canvas-c04/build-origin.log 与 .exit.txt；旧文件节点回归会话 11655 已通过，覆盖中文文件卡片、刷新、布局/撤销/工作内容、离线和重开。
- 当前缺口：成果节点尚无可见关联徽标/选中信息；落盘按钮、导出格式、来源快照清单、多个导出关联及恢复日志消费未接通。C04 仍 doing。开发宿主仍使用之前的服务进程，本轮浏览器测试不证明最新后端与前端已联合运行。
- 下一动作：接入真实选中成果导出与界面文件状态，并在更新后的独立服务验证写文件→关联原节点→保存重开闭环。

### C04.2 实际落盘 UI 检查点

- local-output.ts 与 LocalWorkspacePanel 已接入“成果文件名”和“保存选中成果到目录”，目前单节点 PNG 快照、文字 TXT；PNG 复用上游 renderExportImage。先保存作品，再捕获节点身份/内容；导出期间换图或内容修订变化会中止。请求失败保留同一个操作 ID 和字节供重试；明确的 prepare 冲突允许改名重新发起。
- 保存 metadata 增加 outputSourceNodeIds，服务端要求 nodeId 位于来源修订的身份清单；旧作品需重新保存才能落盘。清单是可信宿主提交的契约，不宣称服务独立解析 FIG 证明节点内容。源修订保存和该字段随同一事务提交。
- 落盘期间暂停自动扫描/自动保存发起，手动扫描后保存关联。当前成果多次导出时已有显式引用优先，后续文件单独显示，不静默覆盖引用；这一行为及多成果体验仍需完善。
- 原节点文件关联以选中信息显示，监听选区与节点更新，避免非响应式图数据导致状态不刷新。尚无所有节点常驻徽标。没有使用文件副作用参与普通撤销。
- 实际 UI 测试 output-publish.mjs passed：真实 PNG 字节头、同名保留、提交响应丢失后精确重试、目录无额外临时文件、原节点名称/几何/身份保留且无重复卡片、选中关联状态可见和重开。证据 canvas-c04/output-publish.json/png；截图已查看。失败记录仍保留，不代表最终结果。
- 诊断：首次 UI 因自动保存/扫描竞争留下关联待保存，已协调操作期间自动任务；第二次发现 computed 不订阅普通图数据，改为编辑器事件刷新后通过。构建首次 Boolean filter 规则报错，修复且移除误插入空画布创建路径的清单；第二次 scanDirectory 复杂度 22，提取 canScanDirectory；第三次构建 90409 被类型检查指出跨 await 的 disposed 判断，已改为实时生命周期函数，保留旧结果防写回；最新完整构建会话 64584 已退出 0，日志 build-output-ui-lifecycle.log 与 .exit.txt；包构建、结构/类型检查和生产打包通过，setup 幂等及 diff 检查通过。
- 当前联调服务会话 72314，端口 14250/14251/14252，独立数据 .runtime/canvas-c04-test-data，已加载最新后端。之前 22263/71271 等服务若清理必须先核实。最新后端 source-service-tests.tap 25/25 通过。0002 已归档本轮新增模块及界面。
- TXT 真实 UI 也已通过：OS_CANVAS_TEXT_OUTPUT=1 运行 output-publish.mjs，output-text.json 记录中文换行原文逐字节匹配、重名、丢响应重试、无重复卡片及重开。该模式与 PNG 共用探针，明确按扩展名选择格式。
- 下一动作：继续恢复日志主动消费、真正进程中断/磁盘失败和生产页面验收，补充多个成果/关联状态及提交阶段重名冲突可操作恢复。C04 未完成，不能将 PNG 路径代表所有格式或批量功能。

### C04.3 中断与生产验证检查点

- 新增 output-recovery.test.mjs，在独立子进程实际写临时目录，分别于部分写入和硬链接发布后 process.exit(73)，跳过存储关闭。父进程重新打开真实 SQLite/WAL/文件，确认内容快照完整、提交前目标不存在、提交后保留同一文件身份、同操作重试与扫描只产生一个成果。
- ENOSPC 与 EACCES 通过子进程测试专用 fs shim 注入；磁盘满案例实际写入部分字节再抛错，写保护案例阻止 wx 打开。明确不是填满真实磁盘或修改系统目录权限，也不是断电验证。原内容与操作日志保留，解除注入后恢复成功。产品无测试故障开关。
- recovery-service-tests.tap 共 29/29 通过，退出 0。未完成临时文件依然保留并通过日志排除扫描；自动清理未实现。
- 启动生产预览会话 24491，14260/14262，独立 .runtime/canvas-c04-preview-data。生产 PNG/TXT 首轮均已完成文件/关联测试但重开失败：上游“恢复未保存工作”弹窗挡住目录入口；对应 production/*-failure.json 保留。未将此轮记为生产通过。
- 修复 source.ts/io/create.ts/editor/session/modules.ts：暴露独立 protectSavedRecovery 接口，调用 recovery.markProtectedVersion 清理该编辑器已受保护的恢复快照；local-workspace 在确认当前内容已持久保存后等待此接口，并复核 generation。原同步 markDocumentSaved 接口保持不变。不关闭恢复、不删除其他编辑器草稿。C02 保存语义受影响，需生产重开及相关保存回归重新证明；C02 曾暂转 verifying，生产重开与保存回归通过后已恢复 done。
- 首次构建 70041 因把原同步 markDocumentSaved 改为返回 Promise 导致多个调用方类型检查失败；改为独立接口后重跑会话 2986（build-recovery-protection-final.log）。开发页 persistence 回归已通过，见 recovery-regression/persistence.json，覆盖新浏览器重开与保存响应丢失重试。下一动作确认构建后重跑生产 PNG/TXT（14260）及生产保存回归。

## 仅供参考的旧系统成果

[060 原生 Pi 工具](iterations/060-native-pi-tools.md)记录 SDK 原生工具和资源加载恢复；[058 迁机记录](iterations/058-new-computer-migration.md)描述既有环境。历史测试数和运行数据只代表当时，不当作本轮复验结果。

原生文件/命令工具的工作目录不等于系统级隔离；外部命令生成的文件也不自动成为已登记资产。后续复用运行能力需通过画布接口接入，保留账号与旧任务记录。

旧 ADR、迭代证据、实际 Memory 成果与部署维护文档已保留。被删除的计划清单见[文档索引](../README.md)，原文可从 Git 历史恢复。

### C04.3 本轮最终结果

- 完整构建 2986 退出 0，build-recovery-protection-final.log/exit.txt；setup 幂等和 git diff --check 通过。
- 生产 PNG（90143）、TXT（56757）、普通保存回归（3131）全部通过，证据 canvas-c04/production/output-publish.json、output-text.json、persistence.json。生产 URL 14260，重开未再遇到误恢复弹窗；截图已人工查看，中文 TXT 内容与原图形均恢复正常。
- C02 相关保存证据恢复有效，重新标为 done；C03 原目录扫描/身份实现未因恢复草稿修复改变。C04 仍 doing，已确认本轮中断/故障注入与生产 PNG/TXT 路径，不以此代替恢复列表、批量、节点常驻标识、多成果关联及硬链接平台边界的剩余验收。
- 生产预览 24491 暂保留供后续验证；恢复时须先核实进程/端口，开发联调为 72314。无真实用户素材被操作。下一动作在 local-output.ts/LocalWorkspacePanel 接通恢复日志列表和继续操作，明确完成、未完成、冲突项的处理。

### C04.4 未完成成果入口

- local-output.ts 接入 GET /canvases/:id/outputs，打开目录画布自动加载 prepared/ready 操作，面板增加“未完成的成果”刷新入口及“继续保存 文件名（原内容版本 N）”。恢复使用日志快照和既有操作 ID，不重新渲染当前内容，不自动触发磁盘副作用。
- 已提交操作从待恢复列表过滤；画布切换清空本地列表，代次及 canvasId 校验阻止旧列表/旧操作结果污染新画布。发布过程捕获独立请求对象，避免切换导致清空 pending 后继续引用失效变量；完成后扫描原节点关联并保存。
- output-resume.mjs 开发页真实 UI passed：拦截 commit 请求制造已准备但未发布操作；刷新并打开原目录后显示恢复项；继续前修改文字及位置；最终磁盘文件保持原快照文字，画布保留较新文字/位置，只有原节点，恢复项移除且第二次重开仍正确。截图已查看。这里验证刷新后恢复，真实服务进程退出由 output-recovery.test.mjs 单独证明。
- 首次完整构建 88192 在类型 lint 因跨 await 的 pending 可选链误报失败；提取 clearCompleted 实时检查后重跑会话 98173 已退出 0，build-output-resume-final.log/exit.txt 证明包构建、结构/类型检查和生产打包通过。生产恢复/落盘回归会话 3106/69858 均退出 0，production/output-resume.json 与 output-publish.json passed。setup 幂等和 diff 检查通过。后端协议未变，本轮未引入新的服务写入语义。
- 剩余：取消/换名处理提交阶段重名冲突、批量及多次导出关联规则、常驻文件标识、硬链接不可用平台处理和 C04 逐项验收。下一动作推进提交阶段冲突的取消/换名操作，并补多成果及阶段验收。

- C04.4 补充冲突验证：OS_CANVAS_RESUME_CONFLICT=1 运行 output-resume.mjs 已通过。恢复前外部程序占用同名路径时显示失败、保留外部文件和恢复项；将测试冲突文件改名保留在同目录后，原操作继续完成，画布新内容仍保留。证据 output-resume-conflict.json/png。此测试通过测试文件系统模拟用户移走冲突文件，不冒充应用内已实现换名/取消界面。

### C04.5 取消与更名保存

- OutputStore 新增 cancel/replacePending 与 output_replacements 表。cancel 只终止未发布操作，保留日志内容与临时文件，不删除用户文件；已发布但未确认的 ready 操作按文件身份拒绝取消/更名。cancelled 精确重试返回原状态，迟到 commit 拒绝。
- replacePending 在同一 SQLite 事务内复制原快照为新操作、取消旧操作并记录映射；新文件名保持扩展名，拒绝重名及已发布文件。精确重试复用同一 replacementId，旧名字/不同请求不能误提交。数据库失败回滚不会只取消旧操作。两个输出仍使用现有本机服务单写入路径；多宿主并发尚未验证。
- 新增 /outputs/:id/cancel 与 /replace，沿用认证；HTTP 测试覆盖未认证拒绝、取消后禁止提交及新操作成功。resolution-service-tests.tap 共 32/32 通过；包含事务中断、重启重试、保留冲突文件、已发布结果禁止伪取消。
- 恢复列表增加“取消保存”和“按上方新文件名保存原快照”。更名请求保留精确请求供丢响应重试；提交失败后重新读取恢复列表，不遗失新操作。用户在成果文件名输入新名称，不重新导出较新的画布内容。
- 开发 UI output-resume.mjs 的 OS_CANVAS_RECOVERY_ACTION=cancel/rename 均 passed：取消后无目标文件、重开不再显示恢复项；更名后原冲突文件保留、新文件内容等于原快照、原节点与新编辑保留。output-cancel.json/png 和 output-rename.json/png，截图已查看。首轮在画布仍加载时等待恢复按钮超时，探针已改为先等待实际节点恢复再断言按钮，不以固定延时替代。
- 构建首次因 OutputRequestError 未设置 name 失败，修正后该文件结构/类型 lint 0 错误；完整构建 97259 退出 0。随后发现取消操作可能错过暂停期间的自动保存计时器，增加 onIdle 恢复调度；针对修改文件的类型 lint 通过，完整构建 55986 退出 0（build-output-resolution-autosave.log/exit.txt）。
- 联调旧会话 72314 已停止并确认端口释放，最新开发会话 72833，14250/14251/14252，数据目录保持原独立 fixture 区。旧生产会话 24491 已停止并确认 14260/14262 释放，构建完成后重启生产服务加载新增接口再验证。
- 下一动作：确认构建、生产取消/换名回归、补丁 setup 后，继续多成果关联/批量及 C04 验收。取消保留临时文件、常驻标识与硬链接平台限制仍未完成。

- C04.5 补充：取消 UI 测试把真实取消响应延迟 1600ms，跨过 1 秒自动保存时点；不再手动点保存，验证 release/onIdle 会重新调度并自动保留新编辑。最新开发 output-cancel.json passed。
- outputs.sqlite 升为 schema 2，新增 cancelled 终态不能被旧版当作待提交状态；schema 1 升级前以 VACUUM INTO 创建一致性备份 outputs-schema1-backup-UUID.sqlite，不复制活动 WAL 文件。迁移测试确认备份仍为 schema 1、原快照完整，新库为 schema 2 且可取消。最新 resolution-service-tests.tap 33/33 通过。开发服务 72833 启动早于此版本戳改动，下一次重启会迁移；生产新服务已加载最新实现。
- 最新生产预览会话 57948，14260/14262，沿用独立 preview 数据并完成 schema 1→2 迁移；生产取消/换名结果已核对：production/output-cancel.json、output-rename.json 均 passed（14260）；取消不产出文件、更名保留冲突文件并使用原快照，两者均保留新编辑及第二次重开。历史会话是否仍存活需实际检查，不能仅据记录认定。


### C04.6 已提交成果的临时文件清理重试

- 核对生产取消/换名 JSON 结果后继续 C04。本轮修复 OutputStore.commit 的 committed 提前返回导致清理永远不重试的问题；相同操作重试仅清理已记录且目录身份、文件身份及内容摘要匹配的临时文件，不重新生成已删除的成果。
- 清理后解除 output_temporaries 扫描排除记录。临时路径已被外部文件替换时保留外部文件并解除隐藏；目录被替换或离线时保留记录，仍返回历史已提交结果，原目录恢复后可重试清理。清理失败不将已确认成果误报为落盘失败。
- 新增三项真实临时目录测试：重开后清理且不重建已删除目标；同路径外部替换保留且扫描可见；同路径目录替换保护及原目录恢复后清理。前两项在首轮 20 项相关回归通过，补目录边界后最新 21/21 通过；证据 output/dev-evidence/canvas-c04/cleanup-retry-tests.tap（Node 24，output-store、output-recovery、server 三套测试），git diff --check 通过。
- 这是服务层恢复修复，无前端或上游补丁修改；HTTP 测试新建服务加载本轮实现。未重启此前开发/生产常驻服务，不将此前浏览器结果宣称为本轮清理的 UI 验收。C02/C03 数据格式与契约未变，相关 HTTP 保存和来源/扫描回归通过。
- 尚未完成：取消/写入中断留下的临时文件清理、自动清理调度、硬链接不可用平台处理、多成果关联、批量逐项报告、常驻文件标识。C04 仍 doing；下一最小任务已进入下方 C04.7 多成果关联。


### C04.7 多成果关联（实施中）

- local-file-nodes 新增 os.canvas/outputLinks 附加成果元数据。保留原 fileLink 主要关联及其重新关联语义；同一节点后续输出追加到附加关联，不覆盖主要关联、不创建重复卡片。关联列表参与挂载引用收集、扫描更新和落盘完成确认；选中状态展示每个文件的路径及可用状态。原节点类型、几何、名称、选择不变。
- output-publish 探针增加 OS_CANVAS_MULTIPLE_OUTPUT=1：真实连续两次 TXT 导出、同名保护、丢响应重试、两个文件内容、原节点无重复、附加关联随 FIG 保存重开均已通过（72528）。随后扩展外部改名/删除及缺失状态验证；33719 在重试时失败，发现探针可能提前匹配上一次重名错误状态，增加 dropped 请求确认后 35313 通过。原代码未为此放宽行为；output-multiple.json/png 已记录并查看，原节点的两个关联及缺失状态可见。
- 修改文件的结构/类型 lint 通过。0002 已更新，SHA256 为上方最新值；setup 幂等通过。完整构建 21342 已退出 0，日志 canvas-c04/build-output-multiple.log 与 .exit.txt；包构建、结构/类型检查及生产打包通过。第一次 lint 错误地在根目录运行未找到配置，随后使用上游目录执行；修复实际检查指出的多余可选链后通过。根 package/lock 无变更。
- 现有开发服务 14250 已确认监听，探针使用该独立服务；本轮未重启服务，后端代码未改，前端 HMR 已加载并实测。生产端口 14260 已核实监听，43056 使用最新 dist 验证已退出 0，production/output-multiple.json passed，覆盖双文件实际内容、无重复卡片、重开、附加文件改名/删除及缺失状态；批量与其余 C04 验收尚未完成。

- C04.7 本轮检查点：多成果路径开发/生产均通过，架构约定同步主要/附加关联语义。下一动作：批量保存选中节点并逐项报告成功、冲突、失败和可继续操作；常驻标识及临时文件/平台边界仍待完成。关联列表暂以选中状态文字展示，未声称提供附加关联逐项重新关联 UI。


### C04.8 批量逐项保存（实施中）

- local-output/LocalWorkspacePanel 增加“分别保存所选成果”，按输入文件名生成 -1、-2 等序号，明确 PNG 快照/TXT 文字格式及不覆盖规则。先捕获各节点的已保存来源修订和字节，再逐项提交；一项准备/写入失败不阻断其他项，列表分别呈现文件已写入、画布关联待保存、冲突或其他错误。
- 失败项使用原 operationId/原快照精确重试，不重交成功项，不因用户后来编辑而改变已准备内容。单项未确认操作须先处理后才启动批量。切换画布后不继续提交下一项，旧结果不更新新画布报告；已提交文件仍由现有日志与扫描恢复。没有声称文件系统上的整批原子提交。
- output-batch.mjs 使用真实目录和浏览器：4 个节点混合模拟同名冲突、实际提交后响应丢失、矩形不支持 TXT、正常文字成功；失败不阻断后续、保留外部文件、单项同 ID 重试、较新编辑保留、无重复节点、真实 FIG 重开均通过（50356，output-batch.json/png）。截图已查看，逐项结果可见。首轮 5954 仅在重开比对失败，原因是矩形测试样例设置了不属于矩形的 text 内容；修正为仅 TEXT 样例带文字后通过，未放宽文字保存断言。
- 修改文件结构/类型 lint 通过；首轮 capture 复杂度超限，拆分单选入口 captureSelection 后通过。0002 补丁已归档，SHA256 见顶部；setup 幂等和 git diff --check 通过。完整构建 56103 已退出 0，日志 canvas-c04/build-output-batch.log 与 .exit.txt；单项 PNG 回归 22932 passed。生产批量使用最新 dist（14260），output-batch.json passed，完整混合结果/精确重试/新编辑保留/真实重开均通过。
- 当前批量列表为会话内报告；重开通过现有成果日志恢复已准备操作、通过画布保存恢复工作内容，不宣称重开会恢复未发往服务端的批量排队列表。批量逐项改名入口、首期规模性能及 C04 常驻标识/平台/清理边界仍需继续审查。

- C04.8 本轮最终检查点：开发与生产批量、单项 PNG 回归及完整构建通过；后端没有改动，沿用原服务协议。本轮修改 capture 单选入口，已有 PNG 回归证明单项重名、丢响应、关联及重开仍有效。下一动作推进常驻文件关联标识，再审计临时文件清理和硬链接平台错误处理；C04 仍 doing。


### C04.9 节点常驻文件标识（实施中）

- 增加 local-file-badges 服务、LocalFileBadges 组件及对应主题，接在 EditorCanvas 内、仅 os-canvas 模式启用。标识独立于作品树，显示本地关联总数及缺失/待关联数；aria-label 提供文件路径明细。全部层使用 pointer-events:none，属性/图层等工具面板仍在画布之上。
- 关联与世界锚点按 sceneVersion 响应更新，投影使用画布已绘制帧 drawnView，避免快速缩放平移时标识提前移动。只处理当前页可见节点，隐藏祖先/零透明度及超出祖先裁剪范围的锚点不展示；交互预览或隐藏 UI 时隐藏标识。当前实现不声称解决密集标识碰撞排布，规模验收仍归 C05。
- output-publish 增加 OS_CANVAS_BADGES=1 模式，file-badges.mjs 检查未选中仍显示双关联/缺失数、elementFromPoint 命中底层 canvas、缩放与节点移动位置误差小于 1px、隐藏/显示响应、面板切换不移动标识或新增作品节点。真实双 TXT 导出、外部改名删除和重开后再测，开发 21560/89896 均 passed。截图人工发现首版标识遮挡文字首行，移到节点上方后 89896 复验通过且截图已复核。
- 修改文件类型/规则检查通过（初轮嵌套条件与 defineProps 解构规则已修正）。新增上游文件已以 git add -N 纳入补丁生成，0002 包含 EditorCanvas 入口及服务/组件/主题，SHA256 见顶部；setup 幂等通过。完整构建 70494 已退出 0，日志 canvas-c04/build-output-badges.log 与 .exit.txt；生产 38254 使用最新 dist 验证（14260）退出 0，production/output-badges.json passed；缺失数量、重开、缩放/移动、隐藏、面板及鼠标穿透断言全部通过。
- 本轮后端未改，未更改旧 OS。下一动作核对完整构建并跑生产 badges 探针，然后继续落盘临时文件及硬链接平台边界；C04 仍 doing。

- C04.9 最终检查点：常驻标识开发/生产与完整构建均通过；git diff --check 通过。当前性能/密集标识布局尚未按 C05 规模验证。下一动作处理未完成/取消操作临时文件的可追溯清理以及硬链接不支持的明确错误/恢复路径，然后按 C04 验收矩阵收口。


### C04.10 临时文件归属与终态清理

- outputs.sqlite 升为 schema 3；schema 1/2 升级前 VACUUM INTO 一致性备份，新增列/回填/版本戳在事务中提交。output_temporaries 新增 operation_id/file_identity；创建 wx 文件后，使用打开句柄 fstat 获取身份并先持久记录，再写字节。因此实际进程中断后可判断临时文件归属，不以名称前缀猜测。
- 只清理 committed/cancelled 终态操作；检查原挂载身份、路径、文件身份与内容。已完整验证的临时文件必须完整摘要匹配；写入中断的临时文件须为已保存内容的前缀。失败项仍保留快照供重试；完整文件被外部截短，即使恰为原内容前缀也保留。不同身份/不同内容文件不删除，并解除其扫描排除。目录离线或清理失败保留记录，下次扫描/精确重试再处理，不把已提交结果误报为失败。
- cancel 与更名事务提交后均尝试清理；普通目录扫描会补清理已终态操作，不清理 prepared/ready。原件/成果路径不属于清理范围。schema 1/2 中只有可匹配到 outputs.ready 等完整记录的临时文件回填归属；无法确认身份的旧残留保留。创建文件与记录身份之间中断的极小窗口也保留未知文件，不冒充已实现所有孤儿自动清除。对于未完成临时文件，外部修改若恰好仍是原快照前缀无法区分，这是身份加前缀校验的边界。
- 测试：temporary-ownership-tests.tap 26/26；进一步完整 ownership-all-service-tests.tap 41/41，退出 0。覆盖真实子进程部分写入退出、写失败恢复后不留临时文件、取消部分文件、保留外部修改、完整临时文件截短保护、重启后扫描补清理、保留活跃写入，以及真实 schema 2 四列旧表升级与备份、schema 1 升级。
- 生产旧会话 57948 已停止，确认 14260/14262 端口释放后启动 86088；使用原独立 .runtime/canvas-c04-preview-data，加载 schema 3 并保留 schema 2 备份。生产 output-rename.json（13068）和 output-batch.json（86357）均 passed。更名探针新增断言目录只保留原冲突文件与新成果，旧临时文件已清理；批量精确重试/新编辑/重开回归通过。开发 72833 未重启，不能将其作为 schema 3 实测服务。
- 本轮无前端源码改动，不需重新打包；生产 UI 使用 C04.9 已通过的构建，新后端通过完整服务测试及生产联调。补丁 0002 SHA256 不变；git diff --check 通过。下一动作处理硬链接不可用时的明确错误与可恢复路径，然后核对 C04 完整验收；C04 仍 doing。


### C04.11 Windows 无硬链接提交与明确失败

- 新增 publish-file.mjs：优先原硬链接；Windows 遇 ENOTSUP/EOPNOTSUPP/ENOSYS/EPERM 时使用 MoveFileExW 同目录移动，flags=8，不启用 REPLACE_EXISTING/COPY_ALLOWED。固定 PowerShell/C# 代码通过子进程环境接收路径，路径不拼入代码；windowsHide=true，15 秒超时。目标已存在返回冲突，超时或未知结果保留 ready 日志供精确重试；没有以复制覆盖作为兜底。
- API 依据：[Microsoft MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)。native 移动消耗临时路径但保持已记录身份，后续 target 身份/摘要核对沿用原协议；移动后、日志提交前进程退出可补提交，不再要求临时路径仍存在。没有声称断电验证或所有文件系统已实测。
- publish-file.test.mjs 在当前 Windows 文件系统实际调用系统 API，验证文件身份、中文/脚本特殊字符字面文件名、不覆盖目标及跨目录拒绝。output-recovery.test.mjs 测试专用子进程注入硬链接不支持，然后真实 native 移动，验证成功、移动后立即退出、检查后同名竞争及恢复/取消清理。native-publication-tests.tap 10/10 通过。
- 无可用安全提交路径（ENOTSUP/EOPNOTSUPP/ENOSYS/EXDEV）转为 unsupported-filesystem/HTTP 501。服务测试注入文件系统失败验证 501，移除注入后同操作恢复成功；界面给出原快照保留与取消入口说明。output-resume 的 OS_CANVAS_UNSUPPORTED_OUTPUT=1 是 UI 注入 501、真实准备/重开/取消测试，开发 91706 passed，不冒充真实不支持卷测试。
- 全部后端 native-all-service-tests.tap 45/45 通过。前端修改类型/规则检查、setup 幂等通过；0002 SHA256 见顶部。完整构建 25106 已退出 0，日志 canvas-c04/build-output-filesystem.log 与 .exit.txt。生产旧会话 86088 已停止并确认端口释放；新会话 87126 使用原独立 preview 数据，14260/14262，加载新后端与最新 dist。
- 平台边界：当前磁盘的真实 native 路径通过；FAT/exFAT、网络盘、其他操作系统未实测，仍需满足可靠文件身份要求。PowerShell 被系统策略禁止时返回未确认失败并保留快照；性能门槛由 C05 验证。下一动作完成生产错误提示/正常保存验证并逐项核对 C04，不能把上述注入测试等同所有平台兼容。

- C04.11 生产结果：output-unsupported.json（63171）passed，真实准备后 UI 注入 501、重开恢复项、取消及新编辑自动保存均通过。普通 PNG 首轮 36943 在重开等待 5 秒超时，failure.json 显示 Untitled/无节点，尚处加载；探针增加先等待实际节点加载（最多 30 秒），再保持原关联断言，86850 报 PASS。生产 output-publish.json 已记录文件字节、冲突保护、丢响应重试与重开成功。git diff --check 通过。
- 下一动作：按需求 3.2/3.3 和执行文档 C04 形成完整验收矩阵，特别核对撤销不删除导出文件、快捷命令入口、已关联成果的再次导出语义及未写回修改状态；缺证据的项补实现/验证，不直接把父任务标为 done。C05 的筛选/安装/作品包/规模性能仍未开始。


### C04.12 撤销边界与可配置成果快捷键

- output-publish 增加 OS_CANVAS_OUTPUT_UNDO=1，使用真实键盘微移、Ctrl+Z/重做、Delete/刷新/撤销删除。生产 output-undo.json（63540）passed：导出不覆盖原编辑撤销步骤，撤销/删除不改导出字节，刷新不重建已移除节点，撤销删除恢复原 UUID/文件关联并可保存重开。
- 在既有 keyboard/registry 接入成果命令，复用 publish/publishBatch，按当前选区数量执行。首期配置提供 Ctrl+Alt+E、Ctrl+Alt+S、关闭三项，不宣称任意键录入；沿用 appPreferences 持久化，旧偏好缺字段时补默认。键盘走已有输入框/文本编辑/弹窗/预览保护，忽略重复按键，工作区忙碌时不再发起操作。界面明确 PNG 为快照、TXT 为文字、更换文件名另存、同名保留。
- 初轮 44193 快捷键未触发；全局键盘持有代理 store，WeakMap 保存会话按实际标签页 store 登记，已改为运行时 getActiveEditorStore。67546 仍失败，随后动态导入诊断发现 HMR 模块副本无法查到会话。旧开发 72833 停止后核实端口释放；新开发 97371（14250/14251/14252，原独立 test 数据）已迁移 schema 3。无第三次原样重试；删除产生模块副本的探针动态导入，改用真实界面验证。
- 新开发 76569 passed；补设置弹窗阻止与单项快捷导出后 47036 passed。output-shortcut.json/png 覆盖输入焦点保护、打开设置弹窗不触发、旧绑定移除、配置键批量及单项真实落盘、配置与关闭状态重开保留、无 pageerror；截图已查看。键盘与按钮同样要求当前保存/扫描空闲，探针等待可用按钮后按键，不把忙碌状态误记为键盘失败。
- 修改文件结构/类型检查通过，补丁 0002 包含偏好与快捷键文件，SHA256 见顶部，setup 幂等及 diff 检查通过。完整构建 26581 已退出 0（build-output-shortcut.log 与 .exit.txt），生产快捷键 output-shortcut.json 已核实 status=passed，使用最新 dist（14260）；输入/弹窗保护、单项与批量、配置重开和关闭均通过。

### C04 验收矩阵（首期 PNG/TXT 已验收；以末尾收口记录为准）

| 必须行为 | 当前证据 / 缺口 |
| --- | --- |
| 单项内容导出、原节点关联、不重复卡片 | production/output-publish.json、output-text.json；首期 PNG 快照/TXT，后续媒体与节点格式随 C07/C08 验收 |
| 多项逐项结果、失败保留、新编辑不被旧输出覆盖 | production/output-batch.json、output-resume.json；批量已准备快照原样重试 |
| 同一节点多次另存关联 | production/output-multiple.json；全部关联持久保存，主要关联不被附加成果覆盖 |
| 重名、丢响应、磁盘写失败与进程中断恢复 | native-all-service-tests.tap 45/45；生产 publish/resume/rename/cancel；磁盘满/写保护明确为故障注入 |
| 文件身份与临时文件清理 | ownership-all-service-tests.tap、native-publication-tests.tap；归属不明残留保留，不承诺所有磁盘已兼容 |
| 关联常驻标识与路径明细 | production/output-badges.json；缺失/待关联数量与选中路径可见 |
| 撤销、重做、移除展示不删除磁盘成果 | production/output-undo.json |
| 成果命令与可配置快捷键 | 开发及 production/output-shortcut.json passed；完整构建 build-output-shortcut.log 退出 0 |
| 导出后继续编辑的未写回状态 | production/output-snapshot-txt.json、output-snapshot-png.json；选中来源节点逐文件比较，修改/撤销/重做/重开通过；未选中仅常驻文件关联标识 |
| 已有关联时的操作语义 | 界面说明 PNG/TXT 导出及更名另存、同名不覆盖；原件写回未提供，不能标为已实现 |

下一动作：核对生产快捷键后补未写回修改状态，再重新审计 C04。C05 仍未开始。


### C04.13 导出快照比较基础（实施中）

- 已核实生产 output-shortcut.json 为 passed，C04.12 快捷键验收完成。
- OutputStore.origins 新增 snapshotHash / snapshotFormat，使用持久日志中原始导出字节的 SHA256 和原提交扩展名；不读取当前磁盘内容冒充导出快照。不变更数据库格式，已有日志也能提供摘要；未知格式返回 unknown。
- 来源关联测试覆盖重启、改名和原件被外部原位修改后仍返回同一快照摘要；HTTP 测试检查实际扫描响应字段。单项套件 16/16、完整本地服务套件 45/45 通过（snapshot-service-tests.tap）。日志打印末尾的 Python 控制台遇 GBK 编码错误，测试日志已完整写入并核查 pass 45/fail 0；该打印失败不属于产品或测试失败。git diff --check 通过。
- 前端尚未消费新字段，尚无“未重新导出”界面；当前运行宿主也未重启加载此后端变更。C04 保持 doing，不能将摘要接口等同完整行为。
- 下一动作：扩展 fileEntry/fileLink 来源 schema，按导出格式比对当前选中内容与快照；TXT 只比较文字，PNG 比较实际导出结果；保护异步结果不串选区/画布，旧元数据无摘要显示未核对。验证修改/撤销/位置变化/重开和较新编辑后再接常驻标识。当前比较对象是原导出快照，磁盘外部修改是另一状态，不混淆两者。


### C04.13 选中成果快照比较检查点

- fileEntrySchema 保留可选 snapshotHash/snapshotFormat，旧记录仍可读。local-output 在选中来源节点后延迟 250ms 比较：TXT 实际文字、PNG 实际导出字节；同格式复用一次计算，按 generation/graph/disposed 丢弃过时结果，取消计时器。比较仅作用于当前画布原来源 UUID，不拿普通文件卡片比较他人的成果。
- 状态显示“与导出快照一致”“内容已修改，尚未重新导出”或“尚未核对导出内容”。当前仅选中信息，不宣称已接常驻变化徽标；不把磁盘被外部修改混同当前画布编辑。没有另建场景或修改文件。
- 开发服务 97371 已关闭并确认端口释放，新 48418 使用同一独立 test 数据/14250、14251、14252，加载快照摘要后端。类型/规则检查通过（来源 UUID 保护是此检查后的最后小改动，仍需最终重验）。补丁已重新生成，SHA256 见顶部。
- output-snapshot-txt.json（45507）、output-snapshot-png.json（49686）通过真实导出、重开后的相等状态、只移动不改变内容状态、内容修改、键盘撤销/重做及原文件字节保留。PNG 截图已人工查看。前两次失败定位为文档撤销会清空选区（restoreDocumentChange 源码确认），探针改为重新选中原 UUID 后核对；保留键盘撤销验证。也为键盘移动历史合并等待 600ms。
- 已追加修改后保存/再次重开断言，TXT 会话 51726 尚在运行，不能将旧 passed 证据当作此新增断言已通过。完整 build 会话 4535 正在运行，日志 build-output-snapshot.log/.exit.txt 结束后生成；构建期间追加来源 UUID 保护，应核实构建版本并重验必要部分。生产尚未加载后端新字段。
- 下一动作：核实 51726/4535 实际结果，最终规则检查、完整补丁 setup/构建和生产 TXT/PNG 验证；再审计多成果/子节点编辑/过时异步等状态边界及 C04 收口。C04 仍 doing。

- 补充结果：51726 已退出 1，新增第二次重开在 30 秒内未找到原 UUID；failure.json 为 Untitled/空节点，需诊断重开入口/加载与本轮 HMR、构建并行的影响，不能声称编辑后重开通过。原先首次重开、修改及撤销证据仍有效。4535 最新轮询仍运行。下一轮先诊断该失败，不原样重复等待。


### C04.13 重开诊断与生产验收

- 51726 空白原因已定位：新增第二次 reload 只等待节点，没有像首轮一样通过“我的目录”打开原画布。当前重载是空白新文档入口，不能将它当作自动打开原画布。探针补实际目录打开，保留原 UUID/修改状态断言；开发 TXT 1905 passed。
- 完整构建 4535 退出 0，build-output-snapshot.log/.exit.txt；最终来源 UUID 保护的规则/类型检查通过。生产 87126 已关闭并确认端口释放，44651 使用原独立 preview 数据/14260、14262，加载快照摘要服务。生产 PNG 16095、TXT 94578 均 passed（production/output-snapshot-{png,txt}.json/png），覆盖初次重开相等、移动不误报、编辑变化、键盘撤销重做、磁盘不变，以及修改后保存/再次打开保持变化提示。
- 完成项记录仍仅适用于选中来源节点状态，不冒充未选中节点常驻变化徽标。扫描关联标识仍正常存在。
- 随后审计补上 node:created/reparented/reordered/history:changed 触发比较，避免分组子节点操作不触发更新。该最后改动通过规则/类型检查，已归档 0002，尚需子节点和生产回归；前述生产证据未覆盖此事件扩展。探针 JSON 新增具体 snapshot checks 描述，已完成生产运行早于该描述变更，但执行断言相同。
- C04 保持 doing；下一动作验证分组子节点变化与多成果比较边界，核对最终构建；评估常驻未导出状态的实现和首期成本，再对照 C04 需求矩阵收口。不要重新把已解决的第二次打开误记为存储数据丢失。

- 子节点验证：snapshot PNG 探针改用真实 FRAME，3560 passed。修改后重开保留提示；恢复画框宽度后与原快照一致；新增红色子节点变为未重新导出，删除子节点恢复一致。证据 output-snapshot-png.json/png（新增子节点断言已执行，JSON checks 尚未列举此条）。架构文档已明确快照比较和磁盘变化的区别。最终事件扩展完整构建 38341 仍运行，输出 build-output-snapshot-events.log/.exit.txt；下一轮先核实句柄结果并对最新生产构建执行 PNG 画框探针。


## C04 首期收口 / C05.1 开始

- C04 已按上方矩阵核对首期 PNG/TXT 交付。最终 build-output-snapshot-events.log/.exit.txt 退出 0（38341），生产 PNG 画框/子节点增删/修改后重开回归 86315 passed；TXT 生产 94578 passed。后端 45/45、先前批量/恢复/撤销/快捷键和常驻关联标识证据适用，新增比较不改变发布协议或写文件副作用。git diff --check 通过。
- 首期边界：只支持明确标示的 PNG 快照/TXT；不提供原件覆盖写回；未选中节点常驻关联/缺失标识，内容差异在选中信息逐文件显示。C07/C08 扩展内容及格式时仍需各自验收。非当前磁盘/网络卷未实测；无安全提交路径保留快照并报错。完整安装包、规模性能和作品包属于 C05，未完成。
- C05.1 进入 doing：组合筛选仅改变视图，不写 visible/几何/作品历史，不取消任务。首期按当前页顶层对象作为展示单元；复合对象任一实际内容节点同时满足类型和关联条件时保留整个对象及其子树，避免拆散设计与文件卡片标签。不同条件 AND、同条件多选 OR；必须清理被隐藏选区，清除恢复原布局，显示匹配/隐藏数量。名称/路径查询与匹配采用同一语义。连线需随可确定端点处理，缺少连线端点协议不能虚称已验收。
- 下一动作：实现无副作用的筛选分类/匹配与复合对象规则，再接入临时视图隐藏、渲染/命中/选区和覆盖面板，做真实保存重开及清除恢复验证。不要用修改节点 visible 并保存的方式冒充筛选。


### C05.1 筛选匹配基础

- 新增 local-filter.ts：当前页顶层对象投影为 shown/hidden 集合，不写任何场景属性。类型/关联/名称路径搜索同节点 AND，同字段多选 OR；复合对象任一内容匹配就保留整组。文件卡片由真实文件扩展名/目录 kind 分类，生成标签不作为文字工作内容；扩展名分类不是宣称已能预览对应格式。
- local-filter.test.ts 三项/12 断言通过：复合树匹配及 JSON 数据完全不变、清除恢复、图片文件卡片标签排除、缺失关联不归入未关联内容。源文件结构/类型检查通过。直接 oxlint 检查测试文件时报 @ 路径解析错误（Bun 执行正确，显式 tsconfig.tests 仍报）；正在用项目标准 tsgo 测试配置核验，不为此修改产品导入规则。
- 两个新文件已用 git add -N 纳入补丁 0002（不是提交），SHA256 见顶部。渲染/命中/面板还未接入，不声称筛选可用；不运行无关完整构建来掩盖这一缺口。下一动作接入临时视图排除与选区保护、真实 UI 筛选测试。

- 类型检查结果：tsgo --noEmit -p tsconfig.tests.json 退出 1；未报告 local-filter 源码或新增测试错误，但整套测试配置存在 dom-css 源码/dist 私有类型冲突、Bun/DOM 定时器/fetch 类型冲突及已有 runtime/config 测试缺 osCanvas 字段等诊断。不能称全仓测试类型检查通过；C05 整合回归需处理属于 OS 扩展的 config 测试缺字段，其余先确认适用基线。筛选三项运行测试及源文件类型检查通过。


### C05.1 筛选接入与验证

- SceneGraph 增加临时 viewHiddenNodes/viewVisibilityVersion，不写节点属性或场景事件；命中跳过隐藏子树，Editor 的统一选区入口拒绝隐藏对象。渲染主路径、分块/retained、标题缓存和本地关联标识使用同一排除规则；筛选版本变化刷新绘制缓存，不增加文档历史。导出提取图不携带视图排除，单元验证通过。
- createLocalFilter 由本地工作区会话持有：类型/关联/查询条件改变或场景变化时更新匹配投影，清理隐藏选区、悬停和已进入容器。LocalFilterPanel 使用既有按钮/输入/主题，显示条件按下态、数量、清除和组匹配说明；全部条件仅当前会话，重开为全部。条件改变不删除文件、不改变 visible/位置。
- 依赖包构建 99483 退出 0。初轮渲染入口复杂度 21 超过 20，已提取视图缓存刷新函数，最终相关结构/类型检查通过。完整 build-filtering.log/.exit.txt 退出 0（73392）；包含选择按钮可见按下态，生产截图已核对。
- 单元测试共 16 项/40 断言通过（筛选匹配 3、SceneGraph 命中 10、编辑器命中 1、新视图选区/导出 2）。既有 runtime/config 测试两处期待值补 osCanvas:false，4 项通过；没有为规避错误改运行配置逻辑。此前全测试 tsgo 的其他跨源码/dist、Bun/DOM 类型问题没有声称已修复。
- filtering.mjs 开发 81780 passed；生产 46241 passed，新增组内绿色子图形保留检查后再通过。证据 canvas-c05/production/filtering.json/png：类型与关联 AND/同字段 OR、嵌套查询、原像素隐藏/恢复、隐藏对象点选/直接选择/全选保护、关联徽标隐藏、场景无修改、筛选中保存后重开全部内容和坐标保留。后续追加实际红/绿像素断言，7198 尚在运行，需核实。
- C04 生产 PNG 画框成果回归 40873 passed，证据 canvas-c05/production/output-snapshot-png.json，覆盖落盘关联、快照比较、子节点变化及重开；没有因筛选破坏导出。截图检查发现首个样例文字未显示，已为样例设置填充并补可见绿色子图形像素检查，不把空框当作子内容显示证据。
- 资源：开发 48418 已关闭，确认原端口释放后启动 64254（14250/14251/14252，原独立 test 数据）；生产沿用 44651（14260/14262，原独立 preview 数据），读取最新 dist；不接触旧 OS。所有修改已归档 0002，SHA256 见顶部；未提交。
- 剩余：隐藏任务继续的真实节点任务须随 C08/C09 接入验证，当前没有真实任务运行器；连线端点协议随 C06 后验证，不能虚称已覆盖不存在的端点。密集/规模性能、视口查看匹配、安装启动产物和作品包仍需推进。筛选所有绘制模式和吸附/图层操作的边界还需审计，C05 不标 done。

- 最终补充：7198 退出 0，生产截图像素严格验证初始红色 [255,0,0,255]、组内绿色 [0,204,102,255]，隐藏/恢复及匹配组保留检查通过。完整构建/生产筛选/PNG 成果回归均通过；git diff --check 退出 0。当前仅 setup 补丁幂等检查待核实。

- setup 已退出 0，固定依赖无变化，当前补丁幂等通过。下一动作审计筛选的绘制模式/吸附边界，再推进 C05 独立安装和作品包，不重复已通过的普通筛选流程。


### C05.1 吸附、分块绘制与交互预览

- 发现隐藏节点仍可吸附；在 Vue SDK 的共享 resolveObjectPixelSnap 排除 viewHidden 子树，覆盖拖动/缩放/矢量编辑使用的对象候选。新增 snap-visibility.test.ts，父节点隐藏时子候选也不吸附，清除恢复，显式页面辅助线仍可用；相关 11 项/24 断言通过，类型/规则检查通过。
- 新增“查看匹配内容”，复用 revealNodes，仅调整视口，不重排节点。filtering 探针支持 retained/tiled 独立证据，验证远移后定位匹配及作品数据不变。开发 tiled 35948 passed；完整 build-filtering-boundaries.log/.exit.txt 退出 0（9483），生产 tiled passed（filtering-tiled.json/png）。原 retained 生产证据仍有效。
- 继续审计发现交互预览 islands 以独立 DOM 层绘制，先前未服从筛选。IslandLayer 增加 hidden 投影与 v-show，保留实例而不卸载。首次 filter-islands 20286 已隐藏 DOM，但输入从用户值重置成 Name；查明 Island.vue 的 watch 返回新数组，普通 sceneVersion 重绘会重新初始化状态。
- 已把该 watch 改为分别监听 rootId、预览 revision、控件 ID 序列；普通重绘不重置输入，真实身份/预览重启/控件变化仍初始化。Vue 包两次构建均退出 0（24220、44303），最后相关类型/规则检查通过。filter-islands.mjs 最新开发通过：真实 textField 输入隐藏/恢复、原 DOM handle 仍连接、预览保持运行、输入值保留、源节点属性不变，无页面错误。不是自定义节点后台任务测试，后者仍随 C08/C09 验收。
- 两个 islands 文件已归档补丁，SHA256 见顶部。最终完整构建正在运行，日志 canvas-c05/build-filter-islands.log/.exit.txt，句柄见本轮工具结果；生产还未验证这一最后修复。下一动作核实构建并跑生产 filter-islands，然后继续 C05 作品包/桌面交付，不反复重测普通筛选。
- 桌面准备核查：PATH 无 cargo/rustc，C:/Users/ZYF/.cargo/bin/cargo.exe 不存在；vswhere 已找到带 VC.Tools.x86.x64 的 VS2022 Community。上游 Tauri v2 宿主仍是优先路线，尚未安装私有 Rust 工具链或生成桌面包，不将浏览器开发页冒充安装版。

- 最终构建会话为 59694；开发/生产服务仍为 64254、44651。当前只读准备与样例测试不改旧 OS 数据。恢复时先核实 59694，再对 14260 跑 filter-islands.mjs；后续安装缺 Rust 可在独立工具目录准备，不需要停下其他 C05 工作。


### C05.2 作品包与历史导入基础

- 已核实 C05.1 最终 build-filter-islands.exit.txt 为 0，production/filter-islands.json 为 passed：隐藏/恢复保留真实输入控件实例和值，预览继续运行，作品源数据不变。自定义任务运行器仍归 C08/C09，不以此替代验收。
- 新增 canvas-package.mjs：版本化压缩作品包保存全量修订清单、去重 FIG 字节、布局与外部文件引用；校验摘要、格式、大小、连续历史、引用身份及文件名。当前外部原件为引用，不打入包；不会从应用设置收集凭据。未知工作元数据保留。
- WorkspaceStore.importHistory 将全部历史、当前版本与操作记录在同一 SQLite 事务提交；不可变场景先落盘。同操作精确重试返回原结果，不回退后来编辑；已有画布拒绝覆盖。抽取 writeScene 复用已有保存路径，未改变原保存协议。
- 真实 FIG 在全新临时管理区导入后关闭重开，逐修订核对字节、元数据和时间通过；注入第二修订写入失败后无部分历史/当前版本/完成记录，重开后同操作可恢复，其他画布不变。篡改包、截断、超限、未来版本、路径穿越和重复引用身份拒绝测试通过。
- 验证：Node 24 全部本地服务测试 50/50 通过，证据 output/dev-evidence/canvas-c05/package-service-tests.tap；git diff --check 通过。没有改前端，因此未重复完整前端构建。工作区仍未提交。
- 尚未完成：包的 HTTP/界面入口、历史 FIG 所引用文件的完整收集、外部引用待核对恢复、布局恢复，以及多个数据库之间的可恢复导入协调。以上测试仅证明作品历史存储，不宣称整个作品包已可交付。C05 保持 doing。
- 下一动作：读取当前文件索引/挂载/布局协议，设计并实现持久导入操作记录；跨存储失败可继续，导入引用在验证前不作为可用原件。随后接真实作品导出/全新管理区导入界面验证。


### C05.2 外部引用恢复基础

- MountStore/FileIndex 新增 importReferences，分别以自身 SQLite 事务导入引用，并持久保存操作请求用于重试；同操作输入改变拒绝，精确重试不重写后来重新关联的数据。mount_imports/file_imports 为附加操作表，不修改既有数据列或原件。
- 导入目录保留 mountId/canvasId/path，但不信任包中可用状态或文件系统身份；路径存在时报告 replaced，缺失时 offline，复用现有目录恢复预览/确认。文件保留 asset ID/路径/种类/修订，初始 missing 且无本机身份；目录确认后扫描将同名文件标记 replaced，明确确认后才成为 available，扫描不重复创建卡片。
- 包引用校验补充同一目录画布 ID/路径重复拒绝。导入已有 ID/路径冲突整批回滚，不覆盖本机既有登记；包中的 outputOrigin 未作为本机成果日志权威导入。
- 实测：全新临时目录中导入、关闭重开、目录确认、文件扫描/确认、原 asset ID 保持、精确重试不回退确认结果、半批冲突无残留均通过。全部本地服务 52/52，证据 output/dev-evidence/canvas-c05/package-reference-tests.tap。
- 当前仅每个存储内部事务原子；跨挂载/索引/作品/布局的持久协调仍未接通，不能声称全包导入已经可用。常驻宿主尚未重启加载这批后端改动，以上为新建测试实例证据。下一动作实现导入日志与恢复协调，再接 HTTP/界面及完整历史引用收集；C05 保持 doing。


### C05.2 持久导入协调与 HTTP

- 新增 PackageImportStore，以 package-imports.sqlite 保存原始二进制包、摘要、操作 ID、目标画布与 prepared/complete。准备阶段校验包并拒绝已知已有画布/挂载/文件冲突；恢复按目录→索引→作品历史→布局推进，各参与者自己幂等提交。中途失败保留原包与 prepared，不承诺跨数据库共同原子事务。
- LayoutStore 新增 imported_layouts：包布局保留为独立预设，仅当前布局修订为 0 时自动应用；已有布局不覆盖，重试不回退用户后来保存的配置。完整预设切换 UI 仍未接。
- HTTP 新增 GET /package-imports、POST /package-imports/:operationId（二进制准备）、POST /package-imports/:operationId/resume。复用 Host/Origin/令牌保护与请求大小上限，JSON 读取提取共用有界字节读取；服务关闭同步释放导入存储，导入组件失败不关闭原作品读取功能。
- 实际子进程分别在四个参与者提交后直接退出 73，父进程重新打开后均能完成导入；核对真实 FIG 每个历史版本字节/时间/元数据、缺失引用身份、布局及完成状态。额外验证布局提交后用户新修改不被恢复回退，目标冲突准备前无残留。HTTP 测试验证无令牌/错误来源拒绝、准备后服务重启、列表恢复、精确重试及真实场景字节读取。
- 全部本地服务测试 56/56 通过，证据 output/dev-evidence/canvas-c05/package-journal-tests.tap。架构文档同步导入协议与布局边界。未修改前端/上游补丁，未重建前端；常驻服务未重启，本轮证据来自新建服务与独立临时管理区。
- 尚未完成：历史 FIG 引用收集及导出 HTTP、导入/导出/继续未完成导入的 UI、完整浏览器新管理区恢复验收。包保留的成果来源仍不冒充本机 outputs 日志。C05 仍 doing；下一动作先接历史引用收集与导出，再以真实 UI 完成全流程，随后推进桌面与性能验收。


### C05.2 历史引用导出与 HTTP 往返

- 新增 package-export.mjs，复用固定上游已构建 @open-pencil/fig 的 parseFigBuffer，读取每个不同摘要的真实历史 FIG；遍历记录及嵌套插件数据，收集 fileLink/outputLinks 身份与每个版本根目录。按身份从本机索引收集最新路径/缺失状态，仅包含被作品历史实际引用的文件，不导出其他资产。格式未知字段与 FIG 本体保持原样。
- 导出要求 expectedRevision 与当前保存版本一致，依赖加载后同步捕获历史及引用，避免本宿主请求交错混合版本。损坏 FIG/引用或历史身份在索引缺失时明确拒绝，不能悄悄遗漏关联。外部原件仍为 references-only。
- 新增 POST /canvases/:id/package 返回二进制 .oscanvas，沿用本机认证；不使用客户端给定引用清单代替历史解析。当前解析模块从固定 .runtime/open-pencil-upstream/packages/fig/dist/index.js 加载；桌面打包必须携带及适配这个已构建模块和依赖，尚未声称安装版可用。
- 测试使用上游 patchFigArchive 构造真实两版 FIG：第一版关联外部文件、第二版移除该关联并新增成果引用；导出仍保留两者，外部改名保持 ID/新路径，无关文件排除，所有历史字节不变。损坏关联/缺索引/旧保存版本拒绝通过。真实 HTTP 导出→另一全新管理区准备与导入→读取 FIG 字节相同，测试通过。
- 全部后端 58/58 通过，证据 output/dev-evidence/canvas-c05/package-export-tests.tap；本轮无前端源码与上游补丁变更。常驻服务仍未重启，不以新建测试服务证明已有预览已加载新 API。
- 下一动作：阅读 design.md 与现有 LocalWorkspacePanel/local-workspace 会话，接保存后导出、选择作品包导入、待恢复导入列表与布局应用提示；测试真实浏览器跨独立管理区往返，再更新来源补丁和构建。C05 仍 doing，桌面安装与规模性能仍未完成。


### C05.2 作品包面板与浏览器初验

- 新增 local-packages 会话服务与 LocalPackagePanel：保存确认后导出、二进制选文件导入、保留同操作 ID/同 File 的失败重试、读取持久导入记录及继续 prepared 操作。导入只增加本机画布列表，不替换当前编辑内容；释放会话中止请求但不删除服务端日志。选择其他包仅释放当前浏览器待上传引用，明确保留已准备操作。
- 复用现有按钮/提示/主题与有界下载读取。导出先检查当前画布身份和 generation，避免保存期间切换后导错；请求失败给出冲突/体积/格式与继续恢复提示。面板布局预设目前仅提示后端保留结果，尚无明确应用按钮，自动恢复布局也未主动刷新当前前端布局状态，后续补齐。
- 前端四文件类型/规则检查通过；初轮嵌套三元表达式与 HeadersInit spread 错误已改为状态映射和 Headers。0002 已包含两个新文件与两个接入文件，SHA256 见顶部。
- 新开发宿主会话 95272，14270/14271/14272，独立 .runtime/canvas-c05-package-data，加载本轮后端；未改旧 OS 数据。既有 64254/44651 服务不作为本轮新后端验收来源。
- apps/canvas/probes/packages.mjs 实际 Edge 测试通过：下载并解码真实作品包、选择文件导入、当前图内容保留、本机列表出现导入作品、导入记录可读，无页面错误。证据 canvas-c05/packages/smoke.json/png，截图已查看。此探针使用同宿主中的独立画布 ID 验证 UI，不冒充跨全新管理区验收。首次与第二次失败均为列表按钮实际带修订后缀而探针 exact 名称不符；已改为列表内唯一随机名称匹配后通过。
- 完整构建会话 26743 仍运行，日志 canvas-c05/build-packages-ui.log 与完成后 .exit.txt；已通过包构建、结构/类型检查并进入 Vite 生产打包，不能预记成功。git diff --check 通过。下一轮先核实同一构建句柄，不因等待超时重启。
- 剩余：跨两个独立管理区的真实浏览器完整恢复、保存期间继续编辑/响应丢失/重开继续导入、明确应用包内布局、请求超时与长期会话边界、生产构建与预览验证。UI 初验不等于 C05 完成；桌面安装和规模性能仍待推进。

- 构建最终核实：26743 已退出 0，build-packages-ui.exit.txt 为 0；完整包构建、检查与生产打包通过。生产 UI 验证尚未执行，下一动作继续布局与完整恢复路径。


### C05.2 明确应用布局与导入响应丢失

- 导入记录增加“应用包内布局”。local-layout.applyPreset 先验证格式并读取当前持久修订，然后只在读取期间没有新用户编辑时应用预设；出现新编辑时保留并保存新编辑，不应用旧预设。存在忙碌/未确认保存/布局错误时拒绝并保留现状，复用已有布局保存重试。作品内容及历史不受影响。
- 作品包操作增加每轮 60 秒截止与独立 AbortController，超时保留导入操作 ID 和 File，下一轮可重新请求，dispose 中止请求但不取消后端持久操作。实际超时 60 秒路径尚未单独计时验收，不把响应丢失测试等同超时测试。
- 浏览器 packages.mjs 扩展并通过：真实导入请求在服务端准备完成后丢弃响应，再以同 ID/同字节重试完成；显式应用包内 false/false 面板布局、确认画布节点不变；拦住布局读取响应后手动开启图层，再释放响应，新修改保留且实际后端布局为 true/false。证据 canvas-c05/packages/smoke.json/png 已更新。
- 三个修改文件类型/规则检查通过；首次新增错误分支嵌套三元缺括号已修正，不改检查配置。0002 补丁已更新，SHA256 见顶部。完整构建 20000 正在运行，日志 canvas-c05/build-package-layout.log，结束后 .exit.txt；下轮先核实该句柄，未记录为成功。
- 开发服务 95272 仍为 14270/14271/14272，端口监听已核实。本轮无后端变更，HMR 加载前端并实测；git diff --check 通过。跨管理区浏览器完整恢复、重开继续 prepared 导入及生产预览仍待做；后端自动应用新管理区布局后前端即时同步仍需补齐（显式应用已可用）。C05 仍 doing。


### C05.2 跨独立管理区浏览器恢复

- 20000 最终退出 0，build-package-layout.exit.txt=0；上一轮布局应用/超时改动完整构建通过。本轮补自动应用布局后的前端同步：只在布局不忙且无未处理错误时 reload，沿用 reload 的新编辑保护；相关源文件类型/规则检查通过。
- 新目标开发宿主 94793，14280/14281/14282，独立 .runtime/canvas-c05-import-fresh-01，与源服务 95272（14270/14271/14272、package-data）完全分开。所有测试素材位于新建系统临时子目录；只在该样例目录内移动素材目录模拟离线，不改真实文件。
- package-roundtrip.mjs：源 UI 加目录、创建可见橙色矩形并修改位置形成历史、实际下载；目标在准备完成后阻断 resume，关闭页面并以新页面读取持久记录继续。对比全部历史摘要/元数据、原节点 UUID/几何/填充，核实外部文件原 ID 保留且 missing，真实打开作品后等待画布“本地 1 · 缺失 1”及目录离线标签。开发测试最终通过，证据 canvas-c05/package-roundtrip/result.json/restored.png，截图已查看。
- 首轮在打开后未读到目标节点；当轮发生开发 HMR，原因未单独证实，不据此推定产品无问题。第二轮独立随机目录避免同名，捕获错误与截图证明作品已正常载入，唯一差异为 FIG float32 颜色及默认 NORMAL 混合模式；探针对样例颜色采用 Math.fround、缺省混合模式按 NORMAL 比较，UUID/几何/历史校验未放宽。随后通过，再补真实缺失徽标断言后再次通过。失败证据保留 failure.json/png，不改为成功证据。
- 目标管理区从空目录启动；后续探针复用该测试管理区，各轮新目录/画布 UUID 在目标导入前明确不存在，不复用源作品缓存。本轮测试覆盖一个页面与基础图形/一个本地文件关联，尚不能代替多页/内嵌图片/未知扩展的完整浏览器矩阵。
- 0002 补丁已更新，SHA256 见顶部。完整构建 82418 运行中，日志 canvas-c05/build-package-roundtrip.log 与结束后的 .exit.txt；下轮继续核实同一会话，不重复启动。生产预览暂未验证最新包功能。
- 下一动作：收口作品包多页/内嵌资源/未知元数据及目标重新关联证据，跑生产跨存储恢复，并审计包兼容/大小/性能边界；之后推进独立桌面安装与 C05 规模性能。C05 保持 doing，不把开发测试当作完整首发交付。


### C05.2 生产恢复矩阵通过，转入规模验收

- 82418 已退出 0，build-package-roundtrip.exit.txt=0；最新布局自动同步改动完整构建通过。补丁 SHA256 不变。本轮只扩展探针/说明，不修改产品实现，不重复构建。
- package-roundtrip 扩展两页、内嵌 PNG、未知扩展 payload；以原页面 UUID、图片字节 SHA256、扩展字段与节点 UUID/几何/填充核对。开发 41447 通过。新生产源 13300（14290/14292，.runtime/canvas-c05-prod-source）、生产目标 26260（14300/14302，.runtime/canvas-c05-prod-target），分别独立存储；17830 跨管理区流程通过。
- 再补离线目录与文件重新关联：在目标 UI 指向样例 offline-assets，确认目录后文件为 replaced，选原卡片明确确认文件身份；原 asset ID 保持，缺失标识清除，工作图形、多页、图片字节和未知扩展不变。生产 12134 通过，production/package-roundtrip/result.json、restored.png、relinked.png；截图已查看，橙色图形/内嵌粉色图片和原文件卡片均可见。
- 同版本生产 packages.mjs 通过，production/packages/smoke.json/png 覆盖下载、准备后丢响应精确重试、导入不替换当前图、显式布局应用、新用户布局编辑优先。独立安装产物和大型作品性能不由这些小样例证明。apps/canvas/README.md 补操作与恢复说明。
- C05.2 基础作品包流程已有后端 58 项与开发/生产证据。尚未宣称全格式兼容、大体积性能或所有未来节点已支持；后续 C07/C08 扩展必须追加包依赖验收。当前转入 C05 规模/桌面交付，父任务仍 doing。
- 新增 directory-scale.mjs 按固定脚本生成 10,000 个临时样例文件，测真实首次索引及无变化补扫、条目和身份完整性；阈值沿用 10 秒，不改预算。进程 21004 已启动，结束后证据 performance/directory-10000.json。明确刚生成文件会温热文件系统缓存，不能标为应用冷启动或画布 10,000 卡片验收。

- 21004 退出 0：10,000 文件首次索引 531.48 ms，无变化补扫 477.73 ms，全部条目和身份一致，低于 10 秒预算。performance/directory-10000.json 记录 Ryzen 5 5600X / 32 GiB / Windows 10 / Node 24 与缓存边界。下一动作验证 1,000 对象/200 张图片下的加载、保存、30 秒交互及 5 分钟进程树内存，并继续独立桌面宿主交付。


### C05.3 画布规模测量启动（尚无结果）

- 新增 apps/canvas/probes/canvas-scale.mjs：固定 seed 123456789 生成 200 个不同 JPEG、每张 1920×1080，加 800 个图形共 1,000 对象，初始视口最多 8 个图片预览；1440×900，生产源 14290。图片生成不计入保存时间，记录实际图像/快照字节数，不能把非 20 MiB 场景测量宣称为精确 20 MiB 验收。
- 测量设计：点击保存至已保存确认；独立新浏览器上下文载入已有画布及同页再次打开，分别记录应用初始化与作品载入耗时。使用 Edge 且允许软件绘制回退，明确不代表原生桌面/操作系统冷磁盘；30 秒交互和 5 分钟进程树内存尚未实现。
- 本次执行 46621 仍运行，Node PID 33388，创建时间 20:29:59，本轮 20:32 后已用会话及系统进程复核仍活跃。未生成最终 canvas-scale.json，场景文件最近写入仍为测试前小样例，尚无规模保存确认。不把等待视为成功，不重启同一测试。
- 观察到 Edge 有高 CPU 进程和约 1.46 GB 工作集，但尚未完成父子归属核对，不能将这个进程快照当作应用进程树内存验收。新探针后续补充了 fixture ready/saved/opened 阶段输出；当前已启动进程加载的是原脚本，不会凭空拥有新增日志。
- 下一动作先继续核实 46621；取得结果后定位超预算阶段。若持续停在样例准备，需要收集有归属的进程/阶段证据并为探针加入有界诊断，不能通过减少 200 图片/1,000 对象或降低预算使其通过。当前 git diff --check 通过；本轮只增加测量脚本，无产品变更，无需重建。


### C05.3 首轮规模结果与交互测量修正

- 46621 最终退出 0。过程结束前工具会话短暂仍报告 running，但系统 PID 33388 已消失且 canvas-scale.json 已落盘，随后同一会话确认终态；未重启原测试。实际 1,000 对象/200 张全高清图片、8 个视口预览；图片 47,056,148 字节，FIG 37,274,816 字节（约 35.5 MiB）。保存 UI 确认 3,154 ms，新页面已有画布打开约 1,020 ms。该文件大于 20 MiB，不能将保存结果直接判为 20 MiB 指标失败或通过。
- 发现原探针同页重开用节点数判断，旧图已经 1,000 节点，71 ms 数字无效。修正为记录原 graph 对象并等待实际 graph 替换、完整节点数与保存状态，不放宽阈值。新增 canvas-interaction-scale.mjs 复用同一已存规模场景，避免重建样例。
- 首次交互 48694：实际 wheel 输入到 renderFromEditorState 完成并发生 pan 变化的 p95 为 50.4 ms；渲染间隔 p95 49.7 ms，但串行等待 CDP 每条输入确认使 30 秒只发出 856 次输入，输入驱动本身不足 60 Hz。原始记录保留 interaction-serial-input.json，不用该帧间隔单独推断引擎瓶颈。
- 改为目标 60 Hz、最多 8 条在途 CDP 输入，不无界积压。35625 通过测量流程但性能状态 budget-exceeded：30 秒发 1,800 次、收到 1,790 次、视口变化绘制 1,685 次，输入到绘制 p95 49.6 ms（≤100），绘制间隔 p95 33.2000003 ms（>33，未按四舍五入判为通过）。实际图替换的两次打开 933/902 ms（≤5 秒）。证据 performance/interaction-scale.json/png；预算保持不变。
- 此处测绘制完成，不冒充系统显示扫描输出；浏览器允许 SwiftShader 回退，实际 GPU/软件后端尚未记录。下一动作采集每次绘制执行时长与实际渲染后端，定位超过 33 ms 的原因；不要原样重跑求偶然通过。另须制作约定 20 MiB 快照保存样例、OS/应用冷启动测量及 5 分钟有明确归属的进程树内存；C05 不标完成。
- 本轮只修改测量脚本与台账，未改产品源码；git diff --check 通过，不需前端重建。生产源/目标继续沿用 13300/26260，当前没有尚未结束的规模探针。


### C05.3 帧调度诊断与五分钟内存启动

- 43873 诊断完成：CDP SystemInfo 确认 NVIDIA RTX 3070 Ti / ANGLE D3D11 / GaneshGL，非 SwiftShader 软件渲染。实际单次 renderFromEditorState p95 0.2 ms、最大 0.5 ms；浏览器 RAF 间隔 p95 16.8 ms，但输入事件送达 p95 33.3 ms，绘制间隔 p95 33.4 ms。证据 performance/interaction-diagnostic.json。不能把 33 ms 间隔解释为每次绘制占用 33 ms。
- 增加独立 RAF 连续视口工作负载，不修改产品或降低 1,000/200/8 规模。85135 完成：30 秒 1,783 次视口变化与绘制，绘制间隔 p95 17.1 ms、执行 p95 0.2 ms；打开两次 943/886 ms。render-continuous.json 标记 render-only-passed；真实输入事件数为 0，不作为输入延迟证据，真实输入仍以 interaction-diagnostic/interaction-scale 的约 50 ms 为准。该记录旧 scope 尾部沿用真实输入说明不适用于此模式，代码已更正未来输出，未重跑改结果。
- 当前结论：持续绘制能力低于 33 ms，真实输入响应低于 100 ms；自动注入输入的送达间隔仍存在约 33 ms 的 p95，不能冒称原生连续交互/OS 显示输出全部达标。不因测试驱动问题改轻量 renderer，待桌面真实宿主验证。
- 新增 canvas-memory-scale.mjs：读取同一实际规模场景，CDP 获取本次专用浏览器 PID，加固定生产 14290/14292 监听者并枚举其子树；每 30 秒采样 Windows WorkingSet64，保存完整进程归属。五分钟内轻微移动视口、无作品修改；不统计其他测试浏览器或其他服务。不等于原生 Tauri 进程树，也不计 GPU 显存为系统工作集。
- 内存测试会话 58307 已启动，首个采样 1,806,004,224 字节、15 个进程（约 1.68 GiB），尚未完成 5 分钟，performance/memory-scale.json 状态 running。不要在该测量期间启动新的同服务重负载或改变生产服务。下一轮先核实同一会话及采样，不以首样本宣称预算通过。
- 20 MiB 保存、完整冷启动和桌面安装仍待完成；C05 保持 doing。本轮没有产品修改，不需重新构建。


- 内存首轮 58307 已退出 1：采样时 CDP 列出的临时浏览器 PID 66920 在 Windows Get-Process 之前正常消失，导致 -ErrorAction Stop 失败；不是应用崩溃或预算结论。失败记录另存 performance/memory-process-race.json。
- 修正采样为读取同一份当前进程列表再筛选，记录 exitedDuringSample；仍强制专用浏览器主 PID 与两个服务监听者存在，不能因子进程退出就把整棵树视为完成。新会话 58044 已启动，五分钟计时重新开始，目标 memory-scale.json。恢复时核实该会话，旧 58307 已终态，不再等待旧句柄。


### C05.3 内存测量完成 / C05.4 桌面编译准备

- memory-scale.json 已为 browser-host-passed：完整 300,000 ms、11 次采样，最终工作集 1,497,227,264 字节（约 1.39 GiB），最大采样 1,855,049,728 字节（约 1.73 GiB），均低于 2 GiB。此证据只适用于独立 Edge + 生产本地服务树，不能代替 Tauri 安装版；此前失败的采样记录保留。
- 桌面交付审计确认：现有 /os-workspace 请求由 Vite 插件转发，安装版需要原生宿主服务桥；作品包 FIG 解析模块还使用开发目录相对路径，必须随安装资源携带并适配。上游 updater、应用标识与深链接属于 OpenPencil，不能直接作为 OS 产品发布。尚未修改这些产品行为。
- 官方 rustup-init 1.29.1 已下载至 .runtime/canvas-rust；安装使用本项目 CARGO_HOME/RUSTUP_HOME、minimal、--no-modify-path，未修改系统 PATH。实际 stable 解析为 Rust 1.99.0。安装会话 83593 仍运行、正在下载组件；恢复先核实此句柄，不重复安装。
- 新增 scripts/canvas-rust.ps1，固定 1.99.0，提供 setup/version/check；首次下载校验官方 SHA256，环境变量仅在脚本内设置并 finally 恢复；check 使用 cargo --locked 且默认不启用 native-test。脚本 PowerShell 语法检查通过，实际 version/check 仍待安装完成后执行。初始手动安装使用官方 HTTPS 下载，未单独执行 SHA256 校验，不冒充已运行脚本 setup 全流程。
- 固定 Bun 运行 generate:icons --target desktop 与 generate:tauri-menu 均退出 0；字体文件 mstmc.ttf 有上游解析警告但图标生成完成。git diff --check 通过。本轮没有修改前端或后端产品实现，不重复前端构建。
- 下一动作：核实 83593 终态，运行固定版本 setup/version 与桌面 cargo check；保存实际编译失败/成功日志，然后实现安装版的本地服务启动、鉴权桥与资源打包。C05 保持 doing；20 MiB 保存、冷启动、原生交互与安装验收仍未完成。独立测试服务沿用 13300/26260，不启动同端口替代实例。


### C05.4 本机服务可搬移打包

- 把 package-export.mjs 的变量动态导入改为可静态分析的字面量动态导入，仍延迟加载同一固定 FIG 解析器。新增 build-service.mjs，以固定 Bun 将本机服务及解析器依赖合为 Node ESM 文件；新增正式命令 scripts/canvas.ps1 bundle-service。输出在 .runtime/canvas-desktop-service，附文件字节数及 SHA256；不是可安装产品，不含 Node 可执行文件。
- 正式 bundle-service 命令退出 0，最终产物 277,659 字节，SHA256 73d389721976ea84efbe7962db2a8acc123894c71428c4255ba17ef1b9f7125b。首次直接运行构建器的路径注释不同，最终以正式命令产物为准。
- bundled-service.mjs 把单文件复制到系统临时目录，以独立 Node 24 子进程及不含项目路径/模块配置的环境启动；验证无令牌 401、错误 Origin 403，读取真实 FIG，写第二版，实际解析两版 FIG 导出作品包并逐字节比较，关闭后重开数据库验证新修订。最终产物探针通过，证据 desktop/bundled-service.json。探针初次误把无令牌期望为 403，核对现有服务器协议修正为 401，未改产品鉴权行为。
- package-export.test.mjs 两项回归通过，涵盖历史关联收集及损坏引用拒绝；git diff --check 通过。没有前端改动，不重复前端完整构建。服务打包的独立运行证据不替代 Tauri UI、安装、原生字体/输入或规模验收。
- Rust 安装 83593 持续运行，已核实 rustup-init.exe PID 67324、创建时间 20:53:30；组件下载有一份 partial 长时间停在 3,575,826 字节，无安装退出结果。不得并行重启同一安装；下一轮核实会话并诊断下载连接/超时，完成后再运行固定版本 setup/check。
- 下一动作继续 Tauri 服务桥、资源封装与独立应用标识/更新配置；当前服务包为可用基础，尚未接桌面启动生命周期。C05 doing，完整目标保持不变。


### C05.4 桌面服务私有启动与生命周期

- 新增 local/desktop-entry.mjs：宿主以私有 stdin 管道传入目录/令牌/origin，配置上限 8 KiB；服务监听回环随机端口，stdout 只报告 ready/协议版本/URL，不打印令牌。管道 EOF（含启动期间宿主退出）关闭服务，SIGINT/SIGTERM 亦清理。尚未接 Tauri 调用，不宣称原生宿主完成。
- 将 server.mjs 的 CLI 启动拆到 service-cli.mjs，避免多个入口打包成单文件后 import.meta.url 判断误启动。程序化 startWorkspaceServer 接口不变。bundle-service 同时生成普通服务与 desktop-service 两个独立文件，均包含 FIG 解析器。
- 正式打包退出 0，普通包 SHA256 a014f5399b4ff35c265eadbaad389aac83694fd7e5594b0eb36f8b7498737296，桌面包 f5bdda562b19d223c76ff5d27837f3b2acdfea381771bf0415b9f5a1db25b831。真实子进程验证私有启动、鉴权健康请求、管道关闭后端口释放、启动时 EOF、无效及超限配置拒绝且不回显哨兵秘密。
- 生命周期三项 + 现有服务五项共 8 项通过，desktop/service-lifetime.log/.exit.txt；独立包读取/保存/历史导出回归通过，desktop/bundled-service-regression.log/.exit.txt。日志采集首轮在写完成功证据后打印 Unicode 遇 GBK 错误；已仅补跑尚未执行的独立包回归，未把包装脚本打印失败误记为测试失败。git diff --check 通过。
- 下载诊断：原 83593 仍活跃但 rustc partial 长时间不增长、IPv6 TLS 连接保持；官方 manifest 经 IPv4 成功取得。核对完整进程路径后主动结束本项目 rustup-init PID 67324，83593 确认退出 -1，再启动 IPv4 下载同一官方 rustc 1.99.0 压缩包（会话 62246）。目标 SHA256 来自官方 manifest：20fed82e629c1ed145f9e9bdee9aad65e790d4237a49bcfc61221eda69e35b14。下载正在增长但较慢，尚未完成校验或安装；下一轮先核实 62246，若达 180 秒截止须保留已下载字节并使用断点续传，不能重复从零下载。
- 本轮未改上游补丁或前端，不重建 UI。下一动作完成工具链下载及 cargo check，同时接原生宿主的子进程启动/私有桥与关闭；C05 仍 doing。

- 下载后续：62246 达 180 秒后 curl --retry 自动从零重试，不能继续浪费已有进度。已按命令行确认唯一所属 curl 后主动结束，62246 退出 -1；改为 --continue-at -、无自动重试、1800 秒总截止，保留当前文件并续传。新会话 84568 已确认 running；完成后同一命令校验官方 SHA256 并复制到 rustup 私有缓存。下一轮只核实 84568，不恢复旧句柄。


### C05.4 资源预装配及包内 Node 验证

- 新增 stage-desktop.mjs 与 scripts/canvas.ps1 stage-desktop：仅接受本次验证的 Windows x64 Node v24.19.0，核对桌面服务摘要；将生产 dist、desktop-service.mjs、实际 Node 可执行文件及许可复制到新建独立 resources-* 目录。递归复制拒绝符号链接/特殊文件，不删除或覆盖旧目录；生成逐文件摘要、来源提交及未完成项清单。
- Node 对应版本 LICENSE 的 raw.githubusercontent.com 下载超时；改从同一官方 nodejs/node 仓库 v24.19.0 contents API 获取 base64 内容，成功后解码。本轮未更改任何系统 Node 或 PATH。
- 装配 88539 退出 0：resources-C21ms6，680 文件、128,267,995 字节（约 122 MiB）；证据 desktop/staged-resources.json。desktop-service.test.mjs 新增 OS_CANVAS_STAGED_DIR 入口，用资源包内 node.exe 实际启动复制到临时目录的服务；三项生命周期测试通过，staged-runtime.log/.exit.txt。
- 资源包只证明服务和运行时可携带，尚无原生执行文件/安装器；Tauri 服务桥、UI 的原生请求适配、应用身份及 updater 分离、前端第三方许可清单、离线字体仍未完成。不要把产物目录称为完整可安装交付。git diff --check 通过，未改 UI 无需重建。
- Rust 下载会话 84568 仍 running，文件已增长到 34,537,472 字节（21:10:05），无下载终态或摘要校验结果。继续核实同一会话，完成后才进行固定版本安装与 cargo check。此前 83593/62246 已主动终止，不再等待。
- 下一动作接入 Tauri 原生服务桥（候选已核查上游 tauri 2.12.1 可用的异步自定义协议，Windows 使用 http://<scheme>.localhost），仅 main 可信窗口请求可转发，令牌留在宿主；该方案尚未实现/验收，不能算完成。C05 doing，完整计划仍保持原范围。


### C05.4 原生服务桥接入源码（待桌面验证）

- 新增上游 desktop/src/os_workspace.rs 并注册 osworkspace 异步协议：setup 启动包内 Node/desktop-service，私有管道传随机令牌，15 秒就绪截止与 4 KiB 消息上限，限制就绪 URL 为无凭据/查询的回环 HTTP 随机端口。原生进程持有 stdin/子进程，释放时关闭管道并限时清理；启动失败由 setup 返回错误，不假装本机服务可用。
- 只转发 main 窗口、固定应用 Origin、/os-workspace 路径、GET/POST 与 X-OS-Workspace:1；OPTIONS 单独处理。请求/响应 350 MiB 上限，禁用 HTTP 重定向/系统代理，60 秒请求截止，令牌只在 Rust 端加到上游请求。新增 getrandom 0.3.4 直接依赖，并在现有 Cargo.lock 根包依赖列补登记；完整 cargo --locked 检查尚未执行，不能称 Rust 编译通过。
- 前端新增 workspaceFetch，统一现有布局/作品/落盘/关联请求。浏览器仍走 Vite 代理；Tauri 通过 convertFileSrc 的协议 origin 路由到原生宿主。相关 8 文件规则/类型检查退出 0。正式完整构建 18699 正在运行，日志 desktop/build-native-bridge.log，结束后 .exit.txt；下一轮先核实同一会话，再做生产浏览器回归。
- 调试原生宿主从 OS_CANVAS_RESOURCE_DIR 读取预装配目录，必须指定独立 OS_CANVAS_DATA_DIR；发布宿主预期 resource_dir/canvas 与独立 app-local-data/canvas。当前原生 Origin 只允许打包应用来源，普通 tauri dev 的 HTTP 前端来源尚未配置，不可直接当作该路径验收；后续优先打包 debug 宿主实测。资源配置和独立应用标识尚未接入，当前源码还不能直接交付。
- 本轮修改已归档 0002，SHA256 b6a908fc916b13344c52643bb2791f840aae973cb7eb7cda0015e976bcf38df9；git diff --check 通过，未提交。旧浏览器功能主体未变，但新增请求入口须生产回归后才能确认旧证据仍适用。Rust 模块为待编译/待实测，不能由 TS 检查代替权限拒绝/生命周期验收。
- Rust 下载 84568 仍活跃，21:14:29 文件 57,171,968 字节；尚未校验完成。下一动作：核实下载及 18699；下载成功后执行固定 Rust 1.99.0 setup、cargo check，按真实诊断修复桥；原生主窗口的保存/恢复、错误来源拒绝和退出回收须真实测试。


### C05.4 前端回归通过，Rust 安装完成并开始编译

- 完整 build-native-bridge（18699）退出 0，新增 workspaceFetch 已进入生产 dist。14290 生产 packages 探针通过，desktop/browser-regression/smoke.json/png 覆盖真实保存后导出、导入/丢响应重试、保持当前编辑器、显式布局恢复和较新布局编辑优先。未把浏览器证据冒充 native 协议验收。
- stage-desktop 新增 tauri.os.generated.json：独立 productName/identifier、默认 os-canvas 页面、资源映射，清空上游更新 endpoints/文件关联/深链接，关闭 updater artifacts。最新 resources-pepaHu 共 680 文件、128,268,176 字节，包含最新前端 dist；staged-resources.json 已更新。前次包内 Node 生命周期证据仍适用于未变服务与运行时；新配置尚待 Tauri 实际解析/构建。
- 新增 scripts/canvas-desktop.ps1：核对 staging 类型/固定 Node 及每个资源摘要和路径范围，临时设置私有 Rust/Bun 环境，再执行 tauri build --debug --no-bundle --config；不启用 native-test，finally 恢复环境。PowerShell 语法检查与 git diff --check 通过；此构建入口尚未运行，避免与 cargo check 争用构建目录。
- 84568 下载终态 0，rustc 压缩包通过官方 SHA256 并进入私有缓存。固定版本 setup（95258）退出 0，rustc 1.99.0 / cargo 1.99.0；证据 desktop/rust-setup.log/.exit.txt。无需继续等待旧下载/安装句柄。
- cargo check --locked（65340）已开始实际编译依赖，日志 desktop/cargo-check.log，结束后 cargo-check.exit.txt。尚无最终编译结论，下一轮核实同一会话，再按诊断修复 os_workspace.rs；不要并行再启 native build。编译通过后使用 resources-pepaHu 构建 debug 宿主并实际验证主窗口保存/恢复、错误来源拒绝与服务释放。C05 保持 doing。


### C05.4 原生编译通过 / 首次启动修复

- cargo check --locked（65340）退出 0；新增原生桥 Rust 编译通过，只有上游字体 dead-code 警告。native build（80988）亦退出 0，产物 desktop/target/debug/OpenPencil.exe；未启用 native-test。日志 cargo-check.log/native-build.log 及 .exit.txt。
- 新增 native-workspace.mjs，使用实际 Tauri/WebView2 的独立 CDP 端口 19420、独立临时数据/WebView profile；计划验证原生协议正常/缺请求标记/越界路径、鼠标绘图、保存、正常原生退出后所属 Node 服务消失、重启恢复同一画布。脚本 Node 语法检查通过，尚未全部执行成功，不把探针代码当验收结果。
- 首次真实启动退出 101：Tauri manager/webview.rs 在拼接默认页面时 InvalidUrl(RelativeUrlWithCannotBeABaseBase)。已读本机 tauri 2.12.1 源码定位：frontendDist 的 Windows C:\ 绝对字符串被当作 FrontendDist::Url，无法作为页面基址。失败日志/截图（若窗口存在）写在 desktop/native-workspace/failure.json；不是数据恢复失败。
- stage-desktop 改生成相对上游 desktop 目录的 frontendDist（正斜线）；修正当前 resources-pepaHu 的生成配置为 ../../canvas-desktop-staging/resources-pepaHu/ui。UI/service/runtime 字节未变，不重跑前端构建/服务打包。重新原生构建 60077 运行中，日志 native-build-resource-path.log/.exit.txt；下一轮核实同一会话，然后继续真实 native-workspace 探针。
- 本轮没有上游源码改动，0002 SHA256 不变；git diff --check 通过。C05 仍 doing；安装、原生来源拒绝完整边界与性能尚未完成。

- 60077 资源路径修正构建退出 0。真实窗口再次启动成功，标题 OS Canvas，但 native-workspace 42620 在等待画布 ready 时超时；截图为深色空白，无 pageerror。CDP 观测 URL 回到默认 ?os-canvas，而探针曾请求 ?test&os-canvas，提示初始原生导航与探针导航可能竞争；原因尚未证实，不能当作通过。42620 已退出 1，进程由探针 finally 清理。
- 保留 initial-navigation-failure.json，探针增加等待默认原生导航 domcontentloaded 后再进入测试页面，并收集 console/requestfailed/失败 DOM，便于区分导航竞争、资源加载与启动错误。诊断运行 13406 已启动，仍待结果；恢复先核实该会话，不重复启动另一原生窗口。


### C05.4 原生桌面保存/退出/重开闭环通过

- 13406 退出 1，等待默认导航后仍空白；诊断 DOM 显示 Vue 已挂载但工作台路由为空。读取 src/router.ts 确认只定义 /、/storage、/demo、/share，未定义 /index.html。根因是 native 配置/探针路径不匹配路由，并非保存数据或渲染器坏掉。
- stage-desktop 与当前 resources-pepaHu 配置把默认窗口 URL 改成 ?os-canvas（根路由）；探针改为 http://tauri.localhost/?test&os-canvas&no-rulers。21852 重建退出 0，native-build-root-route.log/.exit.txt。未改产品前端源码，因此不重复前端构建。
- 真实窗口随后画布 ready。首个边界检查在越界请求处抛 Failed to fetch；诊断明确原生返回 403 拒绝 OPTIONS，浏览器按 CORS 在预检阶段拒绝，JS 无法读取 403。探针修正为区分正常 200、无标记 403、越界 preflight-blocked；没有放宽产品协议或改服务权限。
- 最终 native-workspace 66763 退出 0，desktop/native-workspace/result.json、saved.png、reopened.png；截图已查看。实际 Tauri/WebView2 中鼠标创建矩形，保存确认；通过 native process 插件退出，验证原生父进程及其唯一 Node 服务退出；新进程/同独立数据目录打开本机画布，矩形类型/位置/尺寸一致且已保存。测试无 pageerror；旧路由失败保留 index-route-failure.json，不把历史失败改成成功。
- 已证明真实原生私有桥与普通保存恢复、请求标记/路径拦截及正常退出回收；未覆盖沙箱 iframe 错误 Origin、其他窗口标签、进程被强杀、安装/升级、完整规模或冷启动。C05 保持 doing，不把 debug/no-bundle 产物冒充独立安装验收。
- 全部本轮原生探针已终态，Get-Process 未发现残留 OpenPencil；生产浏览器服务仍独立保留。0002 SHA256 不变，git diff --check 通过。下一动作补实际原生边界与崩溃回收验证，完善发布/安装资源路径与许可，再进行安装启动及性能收口。


### C05.4 强制退出恢复通过 / 安装构建开始

- native-workspace 探针新增独立 OS_CANVAS_NATIVE_CRASH 模式：保存确认后 SIGKILL 仅结束本轮创建的原生父进程，验证唯一所属 Node 服务在 10 秒内消失；随后新原生进程打开同一数据目录并逐项恢复图形。36975 退出 0，native-crash/result.json status=passed、crash=true，截图保留；没有声称未确认保存也可恢复。
- 新增独立 OS_CANVAS_NATIVE_SANDBOX 诊断。真实 sandbox=allow-scripts srcdoc（消息 origin=null）无法访问服务 health；但出现 Cannot read properties of undefined (reading 'plugins')。本机 tauri 2.12.1 src/path/init.js 对 window.__TAURI_INTERNALS__.plugins 无空值保护，与此现象吻合。只读代码证据不是完整根因修复；未改供应商缓存，也不静默忽略错误。
- 最初合并崩溃/iframe 测试在严格 pageerror 检查失败，错误证据留 native-crash/unclassified-frame-error.json。CDP 主页面会话未收集到该异常，不能据此证明其他 frame 归属；已去掉无效归因逻辑，将崩溃测试与 sandbox 诊断分开。18052 诊断流程退出 0，但 native-sandbox/result.json 明确 status=sandbox-incomplete 并保存错误，不作为隔离能力验收通过。主画布在 iframe 移除后仍能保存、退出、恢复；C01.2/C01.3 需处理/验证该边界。
- scripts/canvas-desktop.ps1 新增 -Installer，使用相同资源摘要检查和独立配置，执行 release + NSIS 打包；默认仍是 debug/no-bundle。本次 installer-build（41760）已启动并编译 release 依赖，日志 desktop/installer-build.log 与最终 .exit.txt，尚无安装器产物或成功结论。不要并行启动第二次原生构建。
- 本轮未改上游产品源码/0002，无需前端重建；git diff --check 通过。下一动作核实 41760，处理打包错误并在独立目标路径验证安装启动/资源位置；第三方许可清单、完整离线字体、原生性能和错误来源/其他窗口边界仍未完成。C05 doing，sandbox 未完成项不能因安装构建启动而消失。


### C05.4 Release 编译完成 / NSIS 下载恢复

- 41760 最终退出 1：release 优化编译已通过（3m40s），生成 target/release/OpenPencil.exe 并已复制 canvas/runtime、service、licenses/resources.json；失败仅在官方 NSIS zip 下载 global timeout，不能称安装打包成功。installer-build.log/.exit.txt 保留。
- 阅读对应 tauri-cli-v2.12.1 官方 bundler NSIS 源码，确认 NSIS 3.11 与 nsis_tauri_utils 0.5.3 的固定 URL、必需文件和摘要。普通 GitHub release URL 经 IPv4 连接超时（80677 已终态）；改从同一官方仓库 release assets API 获取：zip asset 317051073、插件 asset 345882097，均成功。
- NSIS zip SHA1 EF7FF767E5CBD9EDD22ADD3A32C9B8F4500BB10D、插件 SHA1 75197FEE3C6A814FE035788D1C34EAD39349B860 与固定版本 bundler 一致。解压逐项确认 nsis-3.11/ 前缀及最终路径保持在 target/.tauri/NSIS 内，不覆盖不同内容。stage-desktop 和当前生成配置启用 bundle.useLocalToolsDir，使用项目工具缓存而非用户全局目录。
- 新 installer-build-local-tools（44367）已启动，日志同名 .log/.exit.txt；下一轮核实同一会话，不重跑完整前端构建。当前仍未生成/运行安装器，不能将 release exe 代替安装验收。
- native-workspace 增加 OS_CANVAS_NATIVE_INSTALLED=1：测试前要求 LOCALAPPDATA/local.os.canvas/canvas 不存在，移除开发资源/数据环境变量，运行安装目录 executable；检查服务进程实际 executable 位于安装目录 canvas/runtime/node.exe，再进行同样的真实保存退出重开。该新增分支只有语法检查通过，尚未执行；实际安装需要独立目标目录及已生成的 NSIS 产物。检查时 local.os.canvas 存在但为空，canvas 数据目录不存在，未修改旧 OS 数据。
- 未来 staging 清单修正过时的“桥未集成”说明；在用 resources-pepaHu 文件内容未随之重写，避免改变正在构建的资源。git diff --check 通过。下一动作安装器成功后在独立路径做无快捷方式静默安装并运行真实验收；许可、离线字体、性能及 sandbox 问题仍记录未完成，C05 doing。


### C05.4 首个安装器生成 / 安装版入口路径修复

- 44367 退出 0，首个 NSIS 安装器 37,368,754 字节，SHA256 2f2f38e91ad677d6926d698c8956b54a8e13fd8d393544c74496c1147886dc8e。检查生成 NSIS 脚本为 currentUser/RequestExecutionLevel user，确认没有既有 OS Canvas 卸载登记后，使用 /S /NS /D=独立临时目录安装，退出 0；未创建快捷方式。目录及摘要见 desktop/installation.json，产物路径 target/release/bundle/nsis/OS Canvas_0.16.0_x64-setup.exe（后续构建会更新，不应继续把旧摘要套到新文件）。
- 安装目标 C:/Users/ZYF/AppData/Local/Temp/oscanvas-install-9b2c37fe-609a-48b1-9975-6279b6aaff4b，仅包含本轮安装的 OpenPencil.exe/canvas/uninstall.exe；不覆盖旧 OS。安装探针的正式数据目录事前不存在。首次启动失败：宿主 setup 在解析 service ready 时遇 EOF，证据 installed-workspace/failure.json。安装文件中的 Node/服务单独跑生命周期三项通过，排除服务文件丢失及 Node 无法执行。
- 已定位可复现根因：Tauri resource_dir 使用 canonicalized Windows \\?\ 路径，Node v24.19.0 直接接收同格式脚本参数时在 main resolver 报 EISDIR lstat C:。独立安装目录原 Node/脚本复现；开发环境普通路径不触发。新增原生有界 stderr 采集（8 KiB，令牌脱敏），EOF 时给出具体错误而非 JSON 空值错误。
- 原生入口改为 url::Url::from_file_path（支持 VerbatimDisk/VerbatimUNC）生成 file URL，通过固定 --input-type=module --eval import(process.argv[1]) 加载，不用 shell 拼接、不暴露令牌。新增 namespaced path 回归；服务启动/退出/超限等共 4 项通过。上游补丁已归档，0002 SHA256 f9cd3e66e53bf1a491efaa6f78716a1c379711330501f234808197046bcf3e9a；git diff --check 通过。
- 诊断版构建 9778 已退出 0，但不作为最终修复产物。真正 file-URL 修复安装构建 9312 已启动，installer-build-file-url.log/.exit.txt；下一轮核实同一会话，再更新本轮自有安装目录并重跑 installed-workspace。现有已安装的是旧失败版本，尚不能交付。
- C05 doing，未更改前端或 Node 服务包，因此不重建 UI/资源；原生最终版本仍需安装后实测。测试安装登记暂保留，后续覆盖/卸载前须核对 installation.json 与注册位置，不操作其他软件。


### C05.4 Windows 安装版保存恢复通过

- 9312（installer-build-file-url）退出 0，最终安装器 SHA256 2f595191943a9c981e23aef4ff13a24dda349b7cb7a8c3a176f6a50b01971633。核对 HKCU OS Canvas InstallLocation 与本轮 installation.json 的临时目标一致后，同路径 /S /NS 更新安装，退出 0；旧记录保留 installation-before-file-url.json。没有触碰其他安装或旧 OS。
- installed-workspace 2109 退出 0，result.json status=passed/installed=true/errors=[]；saved.png/reopened.png 已查看。启动前正式 canvas 数据目录不存在；安装版从安装目录作为 cwd 启动，移除 OS_CANVAS_RESOURCE_DIR/DATA_DIR，实际 Node 子进程的可执行文件路径严格等于安装目录 canvas/runtime/node.exe。
- 完整真实路径验证：主窗口原生健康请求 200、无标记 403、越界预检拒绝；鼠标绘图后本机确认保存；正常原生退出且所属 Node 服务消失；新进程从安装版正式数据目录恢复同一图形/位置/尺寸/已保存状态。没有依赖开发 Vite 服务或源目录服务脚本。
- 测试生成的数据保留在 C:/Users/ZYF/AppData/Local/local.os.canvas/canvas，含本次唯一 Native 样例；该目录与旧 OS 分离，不删除。测试安装也暂保留在 installation.json 指定临时目录，未创建快捷方式；后续维护须核对本轮归属。当前没有残留 OpenPencil 进程。
- C05.4 的安装/普通保存恢复已取得实证，但不等于整个 C05 完成：安装版作品包/目录/落盘与离线使用仍需相关整合验证，原生 1,000 对象/200 图片性能、20 MiB 保存、冷/暖启动与完整进程树预算仍未收口；许可清单与 sandbox 已知错误继续保留。新安装器的桥实现改了入口形式，先前 debug 性能不作为此版原生指标。
- 0002 SHA256 f9cd3e66e53bf1a491efaa6f78716a1c379711330501f234808197046bcf3e9a；git diff --check 通过。下一动作优先在安装版验证真实目录/落盘/作品包，再迁移规模样例并测剩余性能，避免继续重复已通过的普通单矩形保存流程。C05 doing。


### C05.4 安装版目录 / 落盘 / 作品包整合通过

- 本轮先核对上一执行：native-integration 已终止，无 OpenPencil 残留；实际下载文件存在，但 Playwright saveAs 寻找自己的临时路径，和 CDP 指定下载目录不一致，报 ENOENT。修复探针为 Browser 下载事件关联 GUID、等待 completed 后读取 allowAndName 指定目录，保留二进制包解析与历史/引用断言，不改产品实现。
- 修复下载后的首次执行 71267 完成目录、落盘、导入部分，但重启时命中尚未退出的 WebView 调试端口。核实端口随后只剩 TimeWait，原生进程已终止。native-host.close 增加有界等待调试端点释放，避免父进程退出与 WebView 清理的竞态，不杀未知进程。
- 重跑 35421 退出 0；installed-integration/result.json status=passed。真实安装版新建独立样例目录，PNG 签名正确、原 TXT 字节不变、补扫仍为两个节点；导出的真实二进制包有两个文件引用及多份历史；新 UUID 作品导入不替换当前画布；原生进程重启后原目录节点身份/位置/关联全部一致，PNG 字节不变，导入作品能打开。无 pageerror；imported-reopened.png 已查看，页面与图层已恢复，但此截图不单独证明可见图形呈现。
- 本测试在已有独立应用管理区中导入新身份，不冒充全新管理区导入；后者已有浏览器生产证据。安装包及 0002 未变，未重复构建。failure.json 保留重启竞态的历史失败；最早下载失败由本记录描述，不把失败记录当当前通过证据。
- 原生测试进程已退出，git diff --check 通过。C05 仍 doing：原生规模/20 MiB 保存/冷暖与内存、离线字体和许可清单待完成，隔离诊断缺陷仍在 C01.2/C01.3 跟踪。下一步复用 native-host 在安装版收集离线请求与恢复证据，并迁移固定规模样例。


### C05.4 安装版受控离线流程验证

- 新增 native-offline.mjs；native-host 接受导航前钩子和仅传给测试子进程的环境变量。真实安装程序、新 WebView 配置，导航前禁用/清理浏览器缓存；外部渲染请求返回断网，保留 tauri/osworkspace/ipc 本机协议。原生 HTTP 使用本轮回环拒绝代理，不修改系统网络或全局代理。
- 初次 26856 退出 0，但仅拦截渲染请求且误拦 ipc.localhost（Tauri 回退 postMessage），不足以证明原生字体离线；按源码发现 tauriFetch 原生 HTTP 路径后修正探针，不把初次结果作为验收。第二次 18226 退出 0，记录实际 fonts.google.com/api.fontsource.org CONNECT 被拒绝，证明原生字体请求确实进入测试代理。
- installed-offline/result.json 为 bounded-offline-workflow-passed：加入新样例目录、中文文件名和中英文文字创建、确认保存、原生进程退出及新进程重开，文本/字体声明/坐标一致，无 pageerror。reopened.png 人工查看确认中文文件名、关联状态和“离线画布 Offline canvas 123”可见。saved.png 抓取时目录文字仍在解析，只用于中英文工作文字的可见性证据。在线字体服务仍有有界重试警告，未静默忽略。
- 明确边界：未断开操作系统网络；首次调试附着前的渲染导航未拦截，未清除原生下载字体缓存（不能为了测试删除已有数据）。因此证明当前安装环境下受控请求失败时基础工作流可用，不证明全新系统无缓存的全部字体可用；完整离线字体交付仍待核验。结果文件保留限制及代理请求列表，未把任意字体保证写成已完成。
- 探针运行结束并正常回收测试代理；产品源码、安装器及补丁未改，无需重复构建。新增原生代理观察断言按实际结果列表复核通过。下一步推进原生规模样例/20 MiB 保存/冷暖启动及进程树内存，并整理许可与干净字体缓存的独立验收方案。C05 保持 doing。


### C05.3 原生规模迁移发现样例去重，重建有效样例

- 新增 native-scale.mjs：只读打开既有生产样例 SQLite，校验原 FIG 摘要，生成新 UUID 的作品包，通过真实安装 UI 导入，计划测首次打开/保存/进程重启打开/同进程重开，并检查 1,000 对象与 200 独立图片。未更改产品源码或安装器。
- 首次 23362 终止于 Playwright 内存 buffer 上传 30 秒超时，证据 scale-buffer-upload-failure.json；改为磁盘真实 .oscanvas 路径，避免自动化大段 base64 传输。第二次 31380 导入成功，但严格检查发现 200 图片节点仅有 158 个不同 hash；流程退出 1，未记录性能通过。
- 直接解析导入前 FIG 的 fillPaints.image.hash，source-fixture-audit.json 同样为 200 节点 / 158 hash，排除该计数差异由原生导入产生。旧生成器仅改变小块相邻 RGB 值，JPEG 有损量化会消除部分差异。此前“200 张不同图片”表述不成立：既有浏览器时间/内存数据仍为实际观测，但只是 158 个独立图像资源的场景，不作为完整目标规模验收；不修改历史测量数字。
- canvas-scale.mjs 增加 8 位黑白块图案与每张 storeImage hash 去重断言，保持 1920×1080、200 图片节点、800 图形、8 个可见预览、seed 和性能预算不变。证据目录支持 OS_CANVAS_SCALE_EVIDENCE，避免覆盖旧数据。重新生成使用 performance/distinct-images；生产服务 14290 HTTP 200 已核实。
- 新生成执行 50661 正在运行，Node PID 74300，已通过会话和系统进程双重确认活跃；尚无最终结果，不重启。下轮先轮询该会话或核实进程/结果，再将有效样例接入 native-scale（当前仍读取旧 performance/canvas-scale.json，必须更新到新目录后再跑）。原生探针还需确认并匹配 1440×900 内容视口，20 MiB 保存、交互及内存仍未验收。
- git diff --check 通过。C05 doing；本轮的有效进展是原生包大文件路径验证、发现并修正会低估性能负载的样例缺陷，不能把原生规模失败改写为通过。


### C05.3 安装版 200 独立图片打开通过，保存耗时已取得

- 50661 退出 0，distinct-images/canvas-scale.json：1,000 对象、200 图片、200 独立 hash、1920×1080、最多 8 可见；新画布 ID 6472ed8d-edd0-40db-87b3-0ddbdbba7499。FIG 46,849,515 字节（约 44.7 MiB），源目录仍 .runtime/canvas-c05-prod-source。生成期间另行验证了原生窗口尺寸，故浏览器该轮时间仅保留观测，不作为无竞争性能验收。
- native-host 增加 resizeInstalledCanvas，仅对本探针启动的 PID/MainWindowHandle 调整窗口尺寸，使用 Windows 原生 SetWindowPos，不模拟 WebView 视口，不扩大产品权限。69782 独立验证退出 0，实际 innerWidth/innerHeight=1440×900。
- native-scale 切换到 distinct-images 新样例。79672 导入成功，但打开被当前测试草稿的未保存保护拦截（现场读取 UI 确认），最终超时退出 1；证据 scale-unsaved-draft-failure.json。未绕过保护，改为测量前先通过 UI 确认保存当前测试草稿/视口，再切换作品；准备时间不计打开耗时。禁用测试样例自动保存，手动保存单独测量。该修正不用于掩盖产品写入错误，保存未确认则探针仍失败。
- 67294 已退出 0。performance/native/scale.json status=open-passed：首次打开 1,939.2 ms；进程重启后打开 1,922.0 ms；同进程重开 1,130.5 ms，均低于 5 秒。实际验证 1,000 对象、200 IMAGE 填充、200 独立 hash、1440×900 内容视口。修改图形名称后保存并进程重启验证修改保留；无 pageerror。scale.png 已查看，8 张预览、图层与 1000/1000 筛选计数可见。
- 大作品保存耗时 8,475.3 ms；这是约 44.7 MiB 样例，不能直接宣布 20 MiB/2 秒指标通过或失败。宿主启动测量约 2.61/2.49 秒，包含测试附着与导航、文件系统缓存为暖，不是操作系统冷启动。性能验收尚欠 20 MiB 固定样例、30 秒真实交互、5 分钟进程树内存及冷/暖条件。
- 当前产品仍通过 FIG 导出、base64/JSON、原生协议桥与服务保存；这是后续分段计时的候选路径，尚无足够证据断言哪一段是瓶颈。下一步在该已安装作品 d3b191a9-42b9-4bef-9780-393d2a95ce2a 上采集保存各阶段与原生交互/内存，不重复生成已有效的图片样例。原生测试均终态，安装器及产品补丁未变；C05 doing。


### C05.3 原生保存分段与真实输入测量

- 新增 native-save-profile.mjs，在真实已安装规模作品上只修改测试图形名称，包装 JSON/base64/fetch/恢复保护并记录 performance 时钟；不改安装包，不把诊断包装当产品优化。92941 退出 0，native/save-profile.json 为 diagnostic-complete：点击至 base64 开始约 658.6 ms（包含 FIG 导出及前处理，尚未独立拆分）；base64 20.3 ms；JSON 47.5 ms；保存请求至响应头 2,711.0 ms；恢复保护 104.0 ms。请求成功且无 pageerror。
- 诊断中的自动化读到已保存时间晚于恢复保护结束约 5.18 秒，故不能把此前 8.5 秒全部归因于产品写入路径。已补 DOM 状态 MutationObserver，下一次诊断能分离状态真正呈现与测试轮询耗时；新增观察器尚未重跑，不伪称已有 DOM 时间。当前仍缺 20 MiB 专用验收样例。
- 新增 native-interaction-scale.mjs，复用浏览器测量方法但运行真实安装版/1440×900/200 独立图片。79271 退出 0 表示测量流程完成，实际 status=budget-exceeded：30 秒目标 60 Hz，发出 1,800 次可信 CDP wheel 输入，接收 1,783 次，视口变化绘制 1,649 次；输入到绘制 p95=50 ms（≤100），绘制间隔 p95=33.4000001 ms（>33），未四舍五入判通过。
- 同次 GPU 为 RTX 3070 Ti / ANGLE D3D11 / GaneshGL；绘制执行 p95 0.2000003 ms、最大 0.4000001 ms，rAF 间隔 p95 16.8 ms，输入实际投递间隔 p95 33.3 ms。这些是输入投递/合并与绘制调度的线索，不足以证明降低渲染复杂度是正确优化；也不能用未关联输入的 rAF 帧率替代实际交互门槛。安装版打开两次约 1.93/1.92 秒。
- native/interaction-scale.json 保留完整 GPU 和范围。原生两项探针均已终止并回收宿主。git diff --check 通过；未更改产品源码或预算。
- 下一步：补真实 DOM 保存确认计时和 20 MiB 负载，分离 WebView 桥/服务写入耗时；对 33.4 ms 间隔核查 CDP 投递合并影响，必要时以实际系统输入对照，不重复跑相同脚本求偶然通过；继续 5 分钟进程树内存。C05 doing，首版性能未整体验收。


### C05.3 原生五分钟内存与 20 MiB 保存目标取得证据

- 新增 native-memory-scale.mjs，进程树从本轮 OpenPencil PID 向下枚举，覆盖实际 Node 与 WebView2，校验 CDP 浏览器 PID 确实在树中，不混入测试驱动或旧浏览器服务。1440×900、1,000 对象、200 独立图片；每 30 秒轻微平移并采样，持续五分钟。13019 退出 0，native/memory-scale.json status=native-host-passed，共 11 样本/10 进程；首次 1,105,768,448 字节，五分钟最终 977,661,952 字节（约 0.91 GiB），低于 2 GiB。包含共享页工作集，不等于私有内存；无 pageerror。
- 新增 build-save-fixture.mjs + resize-scale-images.py：对有效 200 图片样例的真实 JPEG 重编码，保留 1920×1080 和唯一 hash；按质量 24/25 组合达到至少 20 MiB 图像负载，不填充假数据、不减少对象。修改 FIG 内图像 hash，使用固定上游 schema 编码并重新解析确认 1,000 图形/200 图像。81413 退出 0，save-20mib/fixture.json：FIG 21,144,019 字节（约 20.16 MiB），图像 21,034,957 字节。该样例范围事先限定 [20,20.25] MiB，负载高于 20 MiB 下限，2 秒预算不变。
- save-profile 新增 DOM MutationObserver，准确记录“已保存到本机”状态变化，独立于 Playwright 返回时间。20 MiB 首轮 90342 在导入后打开等待 1,000 对象超时，保留 first-load-failure.json；该次未捕获完整 UI 原因，不武断归因为格式损坏或草稿保护。加入现存 fixture 身份查询、防止重复导入，并在失败时保留界面文本/截图。
- 第二次 25778 在新原生进程中直接打开已导入同一作品，确认 1,000 对象，保存请求 200，pageerror 空；native/save-20mib/save-profile.json：实际导出快照 21,144,041 字节，点击至 DOM 保存确认 1,698 ms，达到 ≤2,000 ms。base64 12.9 ms、JSON 26.0 ms、本机请求至响应头 1,346.2 ms、恢复保护 2.6 ms。自动化读取状态比 DOM 晚约 2.41 秒，不能混为产品保存时长。不是所有尺寸作品都在两秒内的承诺。
- 新样例生成及测试在内存测量结束后执行，未用并行图像编码干扰内存样本。全体会话已终态，测试代理/原生宿主均按探针退出；产品源码和安装器未改，git diff --check 通过。
- C05 仍 doing：帧间隔 p95 33.4 ms 尚未达标、冷/暖启动口径待收口、全新原生字体缓存与许可清单待验收。下一步集中解决实际输入投递与绘制间隔，必要时用系统输入对照 CDP；首轮大包导入后不能立即打开的间歇现象保留待诊断，不因新进程打开成功而抹去。


### C05.3 导入状态诊断与连续输入对照；C05.4 许可补充

- native-import-diagnostic.mjs 使用新 UUID 的约 20 MiB 作品包，记录保存、展开作品面板、导入完成、打开列表、尝试打开五个检查点，包括 dirty、节点数量、视口/图替换事件及界面文本。93347 退出 0，desktop/import-diagnostic/result.json status=opened：导入前后 dirty=false、0 节点不变、无视口变化；目标打开后 1,000 节点。首次间歇拒绝本轮未复现，不能声称根因或修复；保留旧失败证据，诊断入口可在再次发生时给出具体状态。
- native-interaction-scale 新增显式 60/120 Hz 输入参数，预算和对象/图片数量不变，120 Hz 对照不覆盖旧 60 Hz JSON。86736 退出 0，native/interaction-120hz.json status=passed：30 秒发出 3,600 次，收到 3,244 次，1,763 次视口变化绘制；输入到绘制 p95 34.1 ms，绘制间隔 p95 17.3 ms；绘制执行 p95 1.1 ms，rAF 和输入投递间隔 p95 均约 16.8 ms。仍为真实安装版、1440×900、200 独立图片、同一 GPU。
- 这是更密集连续输入对照：未减少场景或放宽 100/33 ms 门槛。它支持先前 60 Hz 调度与刷新相位/输入合并影响绘制间隔的判断，并提供持续工作负载达到目标的证据；不是物理鼠标/屏幕扫描输出测量。旧 60 Hz 的 33.4 ms 仍保留，不能改成通过。截图路径仍沿用 interaction-scale.png，数值以各自 JSON 为准。
- 安装资源许可检查发现 stage-desktop 仅复制 Node 和 OpenPencil 主许可，缺已实际复用的 Kiwi NOTICE 与打包 Inter 字体许可。新增复制 pinned upstream packages/kiwi/NOTICE 及 tests/fixtures/fonts/Inter-OFL.txt 到 licenses；源文件已阅读，并核对编辑器 bundled.ts 实际使用 Inter 字体。
- 28182 stage-desktop 退出 0，新资源 .runtime/canvas-desktop-staging/resources-kgCZXG，共 682 文件/128,273,946 字节；新增两个许可文件已按 resources.json 验证摘要。未替换当前安装版、未重建安装器，其他 npm/Rust/字体依赖声明仍需完整清单；不把这两个文件当全面审计完成。
- git diff --check 通过；测试和 staging 会话均终态。C05 doing。下一步完成第三方清单及独立离线字体/启动口径，将最终声明打包进安装器并验证；导入间歇现象仍有未确定原因，不以一次成功删除跟踪。


### C05.4 第三方依赖与声明清单生成

- 新增 apps/canvas/collect-notices.mjs：从实际安装的 npm 生产依赖闭包及明确构建素材入口遍历，读取包声明与 LICENSE/NOTICE/COPYING/OFL 文件，按内容摘要存档；读取固定 Cargo 的 Windows 元数据依赖图（包括构建/过程宏），收集原生包声明及 license_file。找不到的声明明确列出，不凭 SPDX 名称自行编造版权文本。
- 25430 cargo metadata --offline --locked --filter-platform x86_64-pc-windows-msvc 退出 0，证据 desktop/cargo-metadata.json；没有网络拉取或更改锁文件。初次 10099 收集 1,183 包，发现 Node builtin 同名 npm 包被 resolve.paths(name)=null 漏检；修复为 package 子路径搜索，实际纳入 buffer/events 等 npm 包。源码工作区模块引用同一 pinned upstream 根 LICENSE，不将其误报独立许可文本缺失。
- 修正后收集退出 0，共 1,190 包（npm 822、Cargo 368）。输出 .runtime/canvas-third-party/inventory.json、THIRD-PARTY-NOTICES.txt、texts/ 下逐份原始文本。所有文本按清单 SHA256 重新验证，摘要和问题分类保存 desktop/notice-inventory-summary.json。
- 仍有 120 条待分类记录，包含未安装的非本平台可选依赖，以及确实缺少单独许可文本/声明的包。清单是保守依赖上界，并非全部实际进入二进制；不得把“依赖包未带文本”直接推定为最终发布缺失，也不得忽略。下一步根据 Vite/Bun 实际打包模块缩小交付范围，对内嵌 vendor/字体/WASM 和有效缺项核对原始声明。当前 status=inventory-review-required，不假称完整审计通过。
- 未把待审清单直接替换安装资源，安装器和运行时不变；先前新增 Kiwi/Inter 的资源仍为 resources-kgCZXG。git diff --check 通过。C05 doing，继续真实打包依赖核对和离线/启动验收。


### C05.4 实际打包模块对应声明

- 新增 audit-ui-build.mjs，通过 Vite generateBundle 记录真正输出 chunk 的模块与产物摘要，构建到独立 .runtime/canvas-audit-ui，不替换 dist/安装版。Bun 调用 31909 因 Vite import-meta-resolve 模块加载失败，保留日志；改 Node 24 执行 69810 退出 0（audit-ui-build-node.exit.txt），UI 5,473 模块/648 产物，清单 desktop/ui-build-inputs.json。既有 dist 的摘要对照另存 ui-audit-comparison.json，不擅自宣称所有旧安装字节一致。
- build-service 增加 Bun onLoad 输入记录；初次从仓库根执行导致源码标签注释路径变化，已经差异核对并固定 cwd 到上游目录。再次构建得到与已验证服务相同 SHA256：workspace a014f5399b4ff35c265eadbaad389aac83694fd7e5594b0eb36f8b7498737296、desktop f5bdda562b19d223c76ff5d27837f3b2acdfea381771bf0415b9f5a1db25b831。新增 inputs.json 是加载输入上界，可能包含最后被摇树移除的代码；运行时字节未变。
- 新增 map-build-notices.py，对真实文件向上找到包归属；虚拟图标映射到显式素材提供包，不把虚拟 ID 假装磁盘文件。发现实际 UI 使用 devDependency @agentclientprotocol/sdk，已纳入收集；处理嵌套无名称 package.json，避免错误当成独立依赖。现在总清单 1,191 包，实际 UI/服务及显式素材映射 234 包、225 虚拟输入、未解析输入 0。
- desktop/bundled-notice-map.json 中 npm 有效待核对 7 条：@stream-markdown/code/core 声明字段缺失；yoga-layout fork、Lucide/LobeHub 图标、@ai-sdk/provider-utils、jsondiffpatch 缺独立文本。不能把依赖字段缺失当作没有任何许可，后续核对已有文本/原始源码；Rust 368 包仍单独保留，不因 npm 缩小而移除原生缺项。
- 更新 notice-inventory-summary.json，未把待核对清单放进已安装应用或重发安装器。git diff --check 通过，所有构建均终态。下一步补齐这 7 项与原生缺项原始声明，检查 WASM 内嵌声明及独立离线字体，再生成最终安装资源。C05 doing。


### C05.4 npm 实际打包声明缺项补齐

- 检查 stream-markdown/code/core 的包内 LICENSE.md：完整 MIT、Copyright 2025 Jing Haihan，只有 package.json license 字段缺失。补充映射按已读文本 SHA256 固定标识，不更改依赖。
- apps/canvas/third-party 新增 Yoga、LobeHub、jsondiffpatch、provider-utils 根声明及其内嵌 zod3-to-json-schema ISC、Lucide/Feather 原始声明；每份带 source.json（URL、Git blob、SHA256、来源边界）。所有下载均验证 Git blob 的 sha1(blob-header+bytes)，再计算 SHA256。Yoga npm gitHead 在 open-pencil/yoga 分支取到，虽然包元数据还指 facebook/yoga；LobeHub/jsondiffpatch 同样按发布 gitHead。provider-utils 按精确版本标签取回，不使用任意最新许可证冒充发布来源。
- jsondiffpatch 的上游名为 MIT-LICENSE.txt，但已安装 npm 包确实没有文本；扩大文件名识别规则后仍需来源补充。此前 commentary 所说命名漏检只对应收集规则潜在缺口，不是该 npm 包遗漏的唯一原因。
- Lucide 来源按已安装 info.json 声明的作者/LICENSE URL 固定到不可变 Git blob；保留含 Feather 的完整声明。source.json 明确不能由此反推 iconify-json 图标版本的上游源码 commit。provider-utils 的 Apache 根文件是短引用声明，完整 Apache 标准文本和整体分发内容继续核对，不能以文件存在替代完整交付审查。
- collect-notices 增加 supplements.json 读取、外部补充文本摘要和包内证据验证；README 记录各项来源边界。重新收集 1,191 包/113 条保守待分类，map-build-notices 对实际 234 包映射为 missingDeclarations=0/unresolvedInputs=0。已对清单中所有文本重新校验摘要，summary 更新；不宣称保守依赖闭包的所有条目都已处理。
- 继续排查原生缺项：8 个 Cargo 包已取得包内 .cargo_vcs_info.json 的精确源码 SHA/path，含 alloc-stdlib、clipboard-win、defmt-parser、selectors、tauri-plugin、webview2-com 系列。下一步按对应提交补原始声明并核对内嵌资源/源码提供信息，再将最终清单进入安装资源。尚未改当前安装器，C05 doing。


### C05.4 原生声明补齐与源码包资源验证

- Cargo 8 个声明缺项已从固定源码提交或官方标准文本补齐，来源与摘要记录在 apps/canvas/third-party/supplements.json；当前依赖清单 1,191 包，保守待分类 105 条。实际 npm 映射 234 包，缺声明及未解析输入均为 0；该结果不代表内嵌资源审查全部完成。
- 新增 package-source-notices.py，为 5 个 MPL-only Cargo 包保存原始 .crate 源码归档：cssparser、cssparser-macros、dtoa-short、option-ext、selectors。归档 SHA256 与 Cargo.lock 完全一致；逐一对比本机实际使用的 66 个源码文件，内容一致，同时检查无未解释的额外文件。脚本退出 0。
- stage-desktop 增加源码清单依赖摘要和归档摘要校验，将源码、来源清单和解包说明复制到 licenses/sources。64182 退出 0，新资源 resources-Q4GOMi，共 689 文件/128,427,338 字节。独立复核新增 7 个资源的 SHA256 全部通过，证据 desktop/source-notices-staging.json。README 更新复现顺序。
- 未重建或替换当前安装器。CanvasKit npm LICENSE 初查仅有 Skia 主声明，内嵌第三方声明仍需结合固定版本核对；WebView2 loader 等原生内嵌资源也待核对。后续完成实际交付清单后统一生成最终安装包，避免把资源组装成功当作安装版已交付。独立离线字体、启动口径和导入间歇问题继续保留；C05 doing，完整目标未完成。
- 本轮 staging 已终态，git diff --check 通过。上一轮为用户进度说明，未推进实现；本轮已新增可复现源码归档与实际安装资源验证。


### C05.4 WebView2 原生加载器声明进入资源

- 按 webview2-com-sys 0.39.1 的固定源码提交 edc2caf886175ccaebe86078c9cfe1ae2a187328，读取 update-bindings 的 Git blob 1ac6cc0ae66ae6a2c8d59de89314c68c29cde86f，确认 SDK 版本为 Microsoft.Web.WebView2 1.0.3800.47。
- 下载官方 NuGet 精确版本包，x64 WebView2LoaderStatic.lib 与 WebView2Loader.dll 均和已安装 crate 逐字节一致。新增原包 LICENSE.txt（1,487 字节）及 NOTICE.txt（3,894 字节），来源/包摘要/二进制摘要见 apps/canvas/third-party/WebView2-SDK.source.json；supplements.json 同步纳入，不把 Rust MIT 绑定许可替代原生 SDK 声明。
- 重新收集声明、映射实际模块和整理源码包，16256 退出 0：1,191 包，234 个 npm 映射缺声明 0/未解析 0，5 个源码包 66 文件核对通过。stage-desktop 校验并复制 SDK 两份文本，59302 退出 0；resources-WwtCoG 共 691 文件/128,432,719 字节。独立摘要验证证据 desktop/webview2-notices-staging.json。未替换安装版；git diff --check 通过。
- CanvasKit 0.41.1 npm 元数据 gitHead=fba4f1bf212eef642cb1359d7cdf93a227e49c93，在 google/skia GitHub commit/tree 接口返回 422，Skia Gitiles 返回 404。初次请求连接重置后已通过不同官方入口复核，不继续原样重试；已知官方标签查询仅找到 canvaskit/0.41.0，不能把它直接声称为 0.41.1 发布来源。下一步核对发布打包来源和该 WASM 内嵌声明，然后生成最终交付清单；离线字体、启动口径、导入间歇问题仍待收口。C05 doing。


### C05.4 602 个依赖声明进入安装资源

- 新增 package-notices.py，选取实际映射的 234 个 npm 包及 Windows Cargo 保守闭包 368 包，逐份核对声明文本摘要并生成 THIRD-PARTY-NOTICES.txt（3,916,583 字节）及脱离本机绝对路径的包清单。映射过期、缺声明、越界路径、摘要不一致均拒绝输出。包含构建依赖，明确不称为精确二进制依赖普查。
- stage-desktop 校验 inventory、mapping 和合并文本的 SHA256 后纳入 licenses；48982 退出 0，resources-o9VtRi 共 693 文件/132,520,588 字节。独立核验两份新增资源、602 包计数及内容摘要通过，证据 desktop/package-notices-staging.json。README 已记录完整生成顺序；未重建安装器。
- 对 npm 0.41.0 官方包校验 registry SHA512 后与已安装 CanvasKit 0.41.1 比较，JS 相同、三个 WASM 均不同，证据 desktop/canvaskit-release-comparison.json。0.41.1 自带 CHANGELOG 明确修改 PathBuilder 性能和 libpng 1.6.56，不能据 JS 相同宣称版本源码一致。
- Gitiles 官方 refs 同样未列出 0.41.1 标签；0.41.0 编译脚本已取得，作为候选依赖线索，非最终版本证明。GitHub API 达速率限制，Gerrit 版本查询为空，Gitiles log 接口返回 401；不原样重试，后续从发布构建记录或变更记录继续定位。当前合并声明 manifest 保留 CanvasKit 内嵌依赖待核对项，不假称全面发布审查通过。
- git diff --check 通过，全部工具会话已终态。C05 doing，后续继续该内嵌资料核对及独立离线字体/启动/导入间歇验收；完整目标保持不变。


### C05 离线字体无缓存验收诊断

- 本轮从许可整理切到独立的离线字体验收，避免外部 CanvasKit 来源问题挡住全部首版工作。阅读实际缓存实现：下载字体通过 plugin-fs 访问 AppLocalData/cache/v1/font-cache，系统字体走原生命令，Inter/Arabic 来自打包资源。既有离线证据不能据此升级为无下载缓存验收。
- native-offline.mjs 新增显式 OS_CANVAS_DENY_FONT_CACHE=1 诊断及独立证据目录，尝试仅拦截下载字体缓存读取，保留所有实际磁盘缓存。两次诊断均因未观察到缓存拒绝而退出 1，首轮保留 first-interception-failure.json，后轮 failure.json 记录 installed=true 但 fontCalls/denied 都为空。没有把内容保存成功当成无缓存通过。
- 独立原生宿主检查确认 __TAURI_INTERNALS__.invoke 的 descriptor 为 writable=false/configurable=false，说明 initScript 的赋值静默失败；不是产品没读取字体缓存的证据。16119 原生诊断已正常退出。测试现在先检查 writable，明确记录 unsupported 并在任何目录添加前拒绝继续，不再虚报 installed。默认已有离线测试路径不启用该选项。
- 本轮未修改产品、未清除用户缓存、未改安装器；git diff --check 通过。无缓存验收仍未完成。下一步使用独立应用身份/数据路径的真实安装构建或受控专用 Windows 用户环境，验证初始字体缓存不存在；不能继续在不可写 invoke 上重试。需要核对独立身份是否影响宿主路径后选最小可复现方案。C05 doing；CanvasKit 声明、启动口径及导入间歇问题仍保留。


### C05 空应用数据目录的原生离线工作流通过

- stage-desktop 新增受格式约束的 OS_CANVAS_VALIDATION_ID，默认正式标识不变；清单记录 applicationIdentifier/validationOnly。scripts/canvas-desktop.ps1 新增 -Release（no-bundle），以真实 release 路径验证 AppLocalData，不依赖 debug 数据覆盖变量。
- 独立标识 local.os.canvas.validation0820f969aeda472186e3a68bb072113f，资源 resources-kY5RgG。62938 编译退出 0，日志 offline-validation-build.log/.exit.txt；编译期间核实 rustc 活跃，无重复构建。复制 executable/runtime/service/licenses 到独立临时目录，记录 offline-validation-host.json；exe SHA256 34081246b3ab918f2412d545e871bbe3950a016745a8cf6aebc37c6cfa8b364d。未重装原安装版；产物明确为验证身份 release，不冒充 NSIS 安装验收。
- native-host 支持显式 executable 与启动前 WebView 代理参数。native-offline 验证模式先断言独立 AppLocalData 不存在，禁用缓存 fault injection，运行后核对 workspace.sqlite 位于该标识目录。外网 WebView 代理在启动前设置，附着后补充渲染路由/禁缓存，原生 HTTP 使用拒绝代理；实际外部字体请求失败及有界重试日志保留。
- 45442 退出 0：加入中文素材目录、新建中英文文字、保存、退出、新进程打开后文字/字体声明/位置一致，无 pageerror。offline-clean-data/result.json 状态 clean-application-data-offline-workflow-passed；reopened.png 已查看，中文文件名、关联标识及“离线画布 Offline canvas 123”清楚可见。后验下载字体缓存文件列表也写入证据。
- 证明当前 Windows 系统字体可用时，初始应用数据及下载字体缓存为空的离线基础流程；不承诺任意未安装字体、全新 Windows 镜像或操作系统级断网。旧 immutable invoke 失败证据保留，不作为通过来源。UI 生产资源和业务代码未改，原安装版既有证据仍保留。
- 所有本轮构建/探针已终态。C05 doing；下一步收口启动测量条件、导入间歇问题和 CanvasKit 内嵌声明，最后正式标识重建安装器。正式资源必须重新 stage，不复用 validation 标识。语法检查及 git diff --check 通过。检查点写入首次因 Python 默认 GBK 解码失败，改显式 UTF-8 后成功；未重跑产品测试。


### C05.5 正式默认启动暴露首页偏差，已修正源码并启动构建

- 新增 native-startup.mjs，使用已安装正式版默认 URL ?os-canvas，禁止跳转 ?test；同一专用 WebView 目录分别记录首次空 profile 与后续复用 profile。native-host 增加 keepInitialNavigation、webviewProfile、启动分段观测和 onStartupFailure。计时标为包含 CDP 连接/轮询的可观察上界，不冒充精确首帧或操作系统重启冷启动；没有为启动另造通过阈值。
- 35939 初次 60 秒超时退出 1；39095 补诊断后同样退出 1。performance/native/startup/first-timeout.json、startup-page-failure.json/png 保留；截图已查看。真实默认页是上游“新标签页/S3 storage/欢迎使用 OpenPencil”而非本地画布，canvas 数量为 0；用户需先通过欢迎向导才能进入画布。此前 native-host 强制跳转 ?test 使 shouldCreateHome=false，绕过了正式首页，因此既有保存/离线/规模证据只证明进入编辑器后的流程，不能证明默认启动即进入画布。
- 根因是 WorkspaceView.vue 的 shouldCreateHome 与 welcomeShown 未区分 appRuntimeConfig.osCanvas。已限定 OS Canvas 默认直接 createTab，不自动弹上游 AI 欢迎及使用统计提示；普通 OpenPencil 首页/欢迎仍沿用上游逻辑。新增独立补丁 0004-os-canvas-startup.patch，SHA256 e057de5cf0aba9ddd1924193ce62ea08b2fba762fbb8598a7dc331fc4a5c1f23，反向 apply --check 通过；0002/0003 不改。
- 完整前端构建已启动，会话 36477，日志 desktop/startup-fix-build.log，结束后生成 startup-fix-build.exit.txt。最新已进入 core 包构建，尚未终态；下轮必须先轮询该会话/日志并核对进程，不重复构建。git diff --check 通过。
- 本轮真实默认启动仍未通过，修复仅源码完成待验证。下一步构建成功后更新实际 UI 模块清单（旧 notice mapping 的 UI 输入已过时，需要重取），正式标识重新 stage 和 release 构建，在独立复制产物先验证无测试参数的启动，再回归保存/重开/离线流程；之后重建安装器。既有数据模型/文件落盘实现不受该入口条件改动影响，C00—C04 状态不机械重开；C05 整体持续 doing。
- 专用 startup probe 两次已退出，未删除用户数据，未替换现有安装器。CanvasKit 内嵌声明、导入间歇现象仍保留；本次发现应优先修复以保证产品入口符合资产画布方向。


### C05.5 默认及标签入口修复构建通过，原生版本编译中

- 36477 完整构建最终退出 0，startup-fix-build.exit.txt 为 0；结构/类型检查及 Vite 生产构建完成。随后核对发现 TabBar 的加号与关闭末标签都经 createHomeTab，仍会返回上游首页。给 createHomeTab 增加 OS Canvas 模式直接 createTab 的分支，覆盖这些入口；普通模式保持上游行为。两个变更文件单独 oxlint --type-aware --type-check 为 0 错误/0 警告。
- 0004 补丁已包含 WorkspaceView.vue 与 tabs/index.ts，当前 SHA256 d0533bcb0d705b8695fab84807f965a978d89b1720320716126a16d44d20d3ff，反向 apply --check 通过。第一次定向 lint 的 Bun cwd 参数位置错误导致尝试解析无效 npm 包并 404，后改用工具 workdir 调用本机已安装 oxlint 成功；没有借失败输出判断类型通过。
- audit-ui-build 增加 OS_CANVAS_AUDIT_DIST=1，让实际 dist 同时产出模块清单。81764 退出 0，startup-audited-ui-build.exit.txt 为 0，含最终标签修复；234 个 npm 映射无缺声明/未解析，602 包声明重新生成。
- 初次核对发现 generateBundle 中间摘要与最终磁盘有 33 项不同（648 项总数），并非把不存在文件标为成功；后续插件仍会改写 chunk/CSS。脚本现于 build 完成后读取实际文件，保留 generateBundleSHA256。此次已成功构建结果独立执行相同后处理，记录 ui-post-build-finalization.json，不为摘要采集重复整套构建。随后逐个验证资源组装中的 648 项与最终摘要全部一致，package-notices.json 与最新生成文件逐字节一致。
- 35870 staging 退出 0，resources-6Sw6YI，693 文件/132,520,655 字节，正式 identifier=local.os.canvas。24985 正在执行 release/no-bundle 原生构建，日志 desktop/startup-fixed-native-build.log，终态写 .exit.txt；下轮先查同一会话，不重复启动。原安装版和测试用独立身份产物未替换。
- native-startup 增加显式 host record 入口（OS_CANVAS_STARTUP_HOST_RECORD），独立 startup-fixed-release 证据目录，实际检查默认页面无欢迎向导、本地目录/保存入口可见、新建及关闭最后标签仍留在画布。探针语义已改，但最终原生版本尚未跑该回归，不标通过。
- 下一步：24985 成功后复制 release executable 与 resources-6Sw6YI 的 runtime/service/licenses 到独立临时目录，生成带 SHA256 的 host record，用该记录运行 native-startup。保留原安装正式入口失败证据；之后做真实保存重开/离线回归再安装交付。C05 doing，CanvasKit 内嵌声明和导入间歇问题继续保留。git diff --check 通过。


### C05.5 正式默认启动及标签路径原生回归通过

- 24985 原生 release/no-bundle 构建最终退出 0，startup-fixed-native-build.exit.txt 为 0。构建中核对 rustc 78964 持续活跃，未重复构建。正式 identifier=local.os.canvas 的产物复制到独立临时目录，附 resources-6Sw6YI 的 runtime/service/licenses；desktop/startup-fixed-host.json 记录 exe SHA256 293bc9b1c995668e2a6a20ba7fbd889b2354e2139d686aa025aab0544546b9a7。原已安装程序未替换。
- 57852 native-startup 退出 0；performance/native/startup-fixed-release/result.json。完全保留默认 ?os-canvas，无强制 reload/?test：首次空 WebView profile 和随后同 profile 启动都直接出现画布、本地目录/保存入口，欢迎向导不存在。两轮均实际新建标签、保存、关闭新标签、关闭最后标签后确认新画布与输入仍可见，pageErrors 为空。fresh-webview-profile.png 已查看，符合直接进入本地画布的入口要求。
- 启动观测：首次 canvasReadyObservedMs=4393.5168，复用 profile=2496.7470；CDP endpoint/attached 分段分别 1337/1439 与 608/704 ms。输入自动化往返 41.96/19.54 ms。这是包含工具连接/轮询的观察上界，不是精确首帧；OS 文件缓存未清，不冒充重启冷启动。没有把已有画布打开 5 秒指标挪用作启动阈值。
- native-integration 增加指定 release host record、执行前 exe 摘要核对和独立证据目录，两次进程均使用同一新产物。14359 退出 0，desktop/startup-fixed-integration/result.json：原生目录挂载、PNG 落盘/原件保留、扫描不重复、真实作品包下载上传及新进程恢复节点身份/关联/已导入画布均通过。该整合探针仍使用 ?test 获取图断言，不替代上面的正式默认启动验收；结果 scope 已明确。
- 新入口修改未改变作品格式和本地服务，因此既有 C02—C04 核心数据证据继续有效，新增整合回归覆盖入口关联风险。旧正式安装默认页失败截图/JSON 保留；最终 NSIS 仍未更新，不能声称安装版修复已交付。需要正式安装重建与验证、CanvasKit 内嵌声明及导入间歇问题收口，C05 保持 doing。
- 本轮构建/探针全部终态，未清除用户数据。新增 probe 语法检查及 git diff --check 通过。下一步准备最终安装交付并继续未解决声明与间歇导入诊断，避免重复已通过入口测试。


### C05 导入后立即打开的时序诊断（2026-10-16）

- 阅读 local-packages/resumeOperation 与 local-workspace/open：完成提示后仍会刷新作品/导入列表；open 有 busy、元数据和未保存内容保护，加载完成前还校验图/版本/视口是否有新编辑。现有 first-load-failure.json 仅有 30 秒内节点为 0，无当时 UI 错误，不能据此确定为产品格式或竞争缺陷，也不能删除保护来求通过。
- native-import-diagnostic 新增 OS_CANVAS_IMPORT_FAST=1 与指定 host record，用 startup-fixed-host.json 的新原生版本；快速模式去掉导入完成和打开列表之间的三次重型 checkpoint，点击捕获阶段直接记录 dirty/节点/视口/保存状态，记录新编辑拒绝提示。新证据使用 import-diagnostic-fast，不覆盖原失败或先前诊断。
- 77233 退出 0，约 20 MiB 新 UUID 作品导入后立即打开成功，result.status=opened：点击时 dirty=false、0 节点、panX/panY=0、zoom=1，保存状态已保存；打开后 1,000 节点、一次 graph:replaced，pageerror 为空。这个结果排除了“先前诊断多次读取状态的延时必然掩盖失败”这一具体猜想，未证明原始间歇现象根因或已修复。
- 没有改动产品打开/保护逻辑，避免以未经证实的猜想扩大改动。原始失败继续作为已知未定位记录；新增快速路径可在再次出现时区分点击前脏状态和打开期间编辑。下一步继续 CanvasKit 随附声明与正式安装交付，不原样重复同一导入测试求偶然结论。C05 doing；本轮原生探针已退出，测试样例保留。


### C05.4 CanvasKit 官方发布源定位，补入 15 份原始声明

- 改按 GitHub commits API 对 modules/canvaskit/npm_build/package.json 做截至 2026-04-08 的历史查询，找到官方发布提交 3c68f3ffd7c9bc781494cdb85e718ff1e6f49d84，说明 Release Canvaskit v0.41.1，review 1205057。绕开不可定位的 npm gitHead 与缺失版本标签，没有擅自把 0.41.0 当成新版。
- 通过固定提交的 Gitiles 取回 DEPS、compile.sh、CHANGELOG、package.json；来源摘要保存在 desktop/canvaskit-release/sources.json。CHANGELOG 与已安装 0.41.1 包逐字节一致，DEPS 中 libpng 固定到 d5515b5b8be3901aac04e5bd8bd5c89f287bcd33。没有宣称 npm 发布 WASM 已逐字节重编译复现；旧 npm gitHead 不同的事实仍保留。
- 取得 brotli、expat、freetype、harfbuzz、icu、libjpeg-turbo、libpng、libwebp、wuffs、zlib 的固定 DEPS 原始声明，共 15 份（含 FreeType FTL/BDF/PCF/gzip 补充与 IJG README）。文件在 apps/canvas/third-party/canvaskit，来源在 sources.json；11 份根目录文件额外核对 Git blob SHA1，全部记录 SHA256。
- supplements.json 纳入 CanvasKit 文件。首轮 collect 因原规则仅允许同级文件而拒绝子目录；调整为 realpath 后验证相对路径留在补充根目录，再验证摘要，允许受控子目录且不放行符号链接越界。首次失败后的其他脚本仍针对旧清单，未算新材料通过；改用 subprocess check=True 顺序执行，22312 全部退出 0。
- 最新清单 1,191 包，实际 npm 234 包映射缺声明/未解析均 0；602 包合并声明变为 4,100,414 字节，5 个 MPL-only 源码包/66 文件重新核验。status 仍 vendor-review-pending：需核对 CanvasKit 内嵌字体、Emscripten 运行时及 FreeType/IJG 附加归属说明，不能将取得部分原文等同全面交付完成。
- 本轮未更换应用代码或已安装版本，资源 6Sw6YI 仍是上一版声明；最终安装前须重新 stage 以包含新增文件。所有会话终态，git diff --check 通过。下一步从该已定位发布提交查编译工具/字体资源，完成随附声明后重建正式安装器；C05 doing。


### C05.4 字体与 Emscripten 声明补充

- 固定 CanvasKit 发布源码 bin/activate-emsdk 明确 SDK=4.0.7；recipe 虽用旧 Docker 镜像标签，但注释和命令明确先激活源码指定 SDK，不能据 Docker 标签误认 3.1.26。取回 Emscripten 4.0.7 LICENSE/AUTHORS 与 musl、libc++、libc++abi、compiler-rt 的原始声明，Git blob 与 SHA256 均验证。
- 解析实际编辑器 NotoNaskhArabic-Regular.ttf name 表：Version 2.021，Copyright 2022 The Noto Project Authors，SIL OFL 1.1。notofonts/arabic OFL 固定 blob d4e170557fc8bcf8d1dcb317d9f1accaf8acf223 的版权头完全一致，原文纳入 sources/supplements；未声称该 blob 定位了字体发布提交。
- 固定 Skia BUILD.gn 指向可选 NotoMono-Regular.ttf，取回文件并验证 Git blob 3560a3a0c87b328a63c3c5dcd2020f3fc32dbbe9；font name 表 Copyright 2007 Google、Version 1.00、OFL 1.1。按字体自带版权信息与标准 OFL 1.1 正文生成随附文本，sources.json 明确组合来源。后续检查 Makefile 发现 npm 默认变体关闭 embedded font；完整字体字节未在 default/full WASM 中直接匹配，因此不能称已证明实际嵌入。该声明保守随附，ACKNOWLEDGEMENTS 已改成可选源码范围。
- 新增项目归属说明，引用 FreeType 项目及 Independent JPEG Group；不代替原始许可文本。CanvasKit 相关补充共 24 文件。6641 collect/map/package/source 全部退出 0，602 包合并声明 4,200,533 字节；之后对 NotoMono 范围说明做了上述准确化，摘要同步更新，下一步须重新运行完整收集流水线后 stage（不要使用修订前清单）。
- 本轮未改运行时或安装器，声明状态仍 vendor-review-pending，下一步核对最终声明集合/范围并重新生成正式安装资源，避免把旧 resources-6Sw6YI 视为包含新增资料。git diff --check 通过，全部会话终态。C05 doing。


### C05.4 / C05.5 最终声明安装与默认入口验证（2026-10-16）

- 上一轮状态答复核实安装构建已结束，属于获得终态证据；本轮继续安装验证，没有重复构建。61640 收集流水线完成，602 包声明 4,214,212 字节，CanvasKit 24 份补充及 5 个 MPL-only 源码包进入正式 resources-PYC25h；693 文件摘要均核对。声明状态 delivery-notices-assembled，保留可选字体及不可复现 WASM 的范围说明。
- delivery-installer-build.exit.txt=0，NSIS 35.92 MiB。检查生成安装脚本确认 /UPDATE 不卸载旧版、/NS 不建快捷方式，使用 /S /NS /UPDATE /D=<独立临时目录> 实际安装，退出 0。delivery-installation.json 记录安装器 SHA256 20ed29722c7d20d40101fd92e8e9528b86326cb3ee726ac71d25567e955b66f0、exe 摘要与路径。安装会更新当前用户安装登记；旧测试目录及 exe 保留，应用 canvas 目录 59 个文件安装前后逐一摘要一致。
- 安装后的 17 个外置 runtime/service/licenses 文件及 resources.json 与 staging 逐字节/摘要相符；UI 嵌入 exe，不把外置检查冒充 UI 独立文件检查。旧 installation.json 保留历史安装记录，新版探针显式读取 delivery-installation.json。
- native-startup 增加可选证据目录，避免覆盖旧失败和 release 检查记录。10054 退出 0，delivery-installed-startup/result.json：正式默认 URL，无强制测试导航；空/复用 WebView profile 均直接进入画布，新标签与关闭最后标签回归通过，pageErrors 为空。观察启动时间 4.29/3.16 秒包含自动化连接轮询，不称操作系统冷启动。
- 新安装版整合回归已启动 91153，输出目录 desktop/delivery-installed-integration；下轮先轮询已有会话或读取结果，不重复启动。C05 仍 doing：原 60 Hz 输入间隔超标与旧间歇导入原因未确定，未据新安装成功将其关闭。证据索引 output/dev-evidence/canvas-c05/README.md 已建立，后续同步安装结果。

- 本轮最终：91153 退出 0，delivery-installed-integration/result.json 为 passed；实际安装版目录加入、PNG 落盘、原件保留、扫描不重复、作品包下载导入、新进程恢复节点身份/文件关联通过。该整合测试使用测试 URL 获取图断言，与正式默认入口测试分开。默认页截图已查看；git diff --check 通过。本轮安装/探针均终态。下一动作处理 C05 原 60 Hz 交互测量超标的输入与绘制对应关系，保留预算与原失败，并核查旧导入失败记录的可定位性。


### C05.3 最终安装版逐事件交互诊断（2026-10-16）

- 上轮实际安装与回归是有效进展。本轮 native-interaction-scale 增加显式 host record/摘要验证、逐事件 wheel/rAF/render 时间线，使用 delivery-installation.json；不改产品代码、不变更预算及负载。新增截图按测量文件名保存，后续不覆盖其他测量截图。
- 57958 退出 0 表示诊断完成；interaction-delivery-diagnostic.json 实际 status=budget-exceeded。1,000 对象/200 独立图片，1440×900，60 Hz 连续 30 秒，1,800 次发送、1,780 次接收；输入到绘制 p95 49.7 ms、绘制间隔 p95 33.5 ms。绘制执行 p95 0.3 ms、最大 1.2 ms；rAF 间隔 p95 16.8 ms，事件投递间隔 p95 33.3 ms。没有以工具退出 0 代替门槛通过。
- 原始时间线 interaction-delivery-timeline.json，分析 interaction-delivery-gap-analysis.json：134 个 >33 ms 绘制间隔，132 个有至少两次 pending>0 的 rAF 回调，只有 1 个含 pending=0 的 rAF。pending 是捕获阶段收到、尚未遇到 pan 改变绘制的事件；这不等于已进入 editor.pan。此证据不支持将超标简单解释为“没有输入所以不绘制”，下一步必须核对输入处理到渲染调度链。
- 源码发现 packages/vue/src/shared/input/wheel.ts 先 createRafScheduler(flushWheel)，flushWheel 才调用 editor.pan；packages/vue/src/canvas/surface/render-loop.ts 再通过另一 requestAnimationFrame 调度 renderFrame。因此存在跨两次刷新回调的路径，和当前时间线一致，但尚未改动/验证优化。下一动作对该双阶段调度做最小修正或加入 viewport:changed 时刻进一步证实，保留滚轮合并、缩放中心、撤销及输入边界，再用相同负载回归。不能改为不停空绘制来凑帧率。
- 本轮原生探针已退出，未改变安装版本与用户数据格式；C05 仍 doing，原间歇导入跟踪继续保留。


### C05.3 输入与绘制共用帧调度修正（2026-10-16）

- 基于上轮逐事件诊断，新增 packages/vue/src/shared/input/editor-frame.ts：每个 Editor 共用调度器，先消费合并输入，再取绘制回调快照；输入引起的 viewport 改变在同一 rAF 中绘制。绘制过程中重新请求的任务进入下一帧，空闲不循环渲染，多个 surface 继续合并。
- render-loop.ts 使用该调度器，wheel.ts 保留原平移/缩放累加与算法，只改为 scheduleInput(flushWheel)；组件销毁时取消尚未执行的输入。未改预算、图像负载、作品格式、本机服务或已安装程序。
- Bun 运行 render-loop.test.ts 与 wheel.test.ts：26 pass / 0 fail / 64 assertions；新增同帧输入→多 surface 绘制、已有绘制前先输入、取消输入、绘制中新任务延后且不空转三个测试。类型规则初次报告 no-useless-spread，但迭代快照确实必要以免自重入；改用显式 pending 数组保留语义，单测复验通过，完整 lint 随构建进行。
- 补丁 apps/canvas/patches/0005-input-render-frame.patch 包含源码与回归测试，SHA256 c2462dcd5483016c73e0df82b9b83cffc6f6b9514ddf818e2e0e453d17c78955；反向 apply --check 及根工作区 diff --check 通过。此前补丁未改。
- 完整生产构建会话 82977 仍运行，日志 desktop/input-frame-build.log，终态写 input-frame-build.exit.txt；已确认实际 Bun/Node 构建进程活跃，进入 Vue/MCP 包构建。下轮先轮询同一会话或日志/进程，不重复构建。
- 下一动作：构建成功后更新真实 UI 构建输入与资源声明映射，正式标识 stage/release，以独立产物跑原 60 Hz/30 秒/200 独立图片性能及平移缩放回归；通过前不能声称修复性能，更不能将 C05 标 done。旧安装版证据仅说明修正前行为，新代码需重新验证受影响交互；基础保存数据证据未受格式影响。


### C05.3 帧调度生产构建通过，原生测量产物编译中（2026-10-16）

- 82977 完整生产构建退出 0，input-frame-build.exit.txt=0。结构 lint 10 warnings/0 errors，类型感知 lint 3 warnings/0 errors，Vite 生产打包完成；此前 no-useless-spread 已不再阻塞。没有把编译成功等同于真实性能通过。
- 36371 新 UI 审计/映射/声明/staging 流水线退出 0，input-frame-stage.log：5,474 模块、648 产物；234 npm 映射，缺声明和未解析均 0；602 包声明仍 4,214,212 字节。新资源 resources-QcaQj4，693 文件/132,853,898 字节，input-frame-staging.json 记录路径。无新增依赖，原源码声明归档与当前 inventory 仍一致。
- 新增 native-wheel-regression.mjs，待原生新产物验证 12 次可信滚轮累计平移、反向回到原位置、Shift 横移、Ctrl 缩放保持鼠标世界坐标，以及覆盖面板输入不触发底层平移。Node 语法检查通过，尚未实际执行，不记行为验收通过。
- 原生 release/no-bundle 编译会话 83262 运行中，日志 input-frame-native-build.log，终态写 input-frame-native-build.exit.txt。已确认 rustc PID 79560 活跃。脚本成功后自动将 exe 与 runtime/service/licenses 复制到独立临时目录，生成 input-frame-host.json（带 exe SHA256）；不会替换已安装版。
- 下轮先轮询 83262，不重启构建。成功后设置 OS_CANVAS_INTERACTION_HOST_RECORD=output/dev-evidence/canvas-c05/desktop/input-frame-host.json，先执行 native-wheel-regression.mjs，再执行 native-interaction-scale.mjs，指定新的 OS_CANVAS_MEASUREMENT_FILE 与 OS_CANVAS_INTERACTION_TIMELINE，保留原失败。C05 持续 doing；存储格式未改，交互性能及缩放/焦点边界必须新验，旧安装证据仅适用于之前版本。


### C05.3 帧调度新原生版本的输入行为回归（2026-10-16）

- 83262 编译最终退出 0，input-frame-native-build.exit.txt=0。此前等待均有 rustc PID 79560 CPU 持续增长证据，未重启构建。独立 release 位于 Temp/canvas-input-frame-l7cmku3p/OpenPencil.exe，SHA256 c2c0d04f97157c3a2c6863049102aa5ef3b13601a93ebaacbe651b610a05f297，记录 input-frame-host.json；正式身份但不是 NSIS 更新。
- native-wheel-regression 首次 59957 失败：预期 12×4×2=96，但实际位移 1236。检查 Windows windowsNotches 逻辑，整数 CDP 输入在 WebView 中走鼠标滚轮加速，不是线性触控板输入；16+40+100+9×120=1236 符合既有算法。旧失败保留 integer-wheel-assumption-failure.json。第一次修订脚本因 Python 默认 GBK 解码失败，PowerShell 继续执行导致 54366 原样复现失败；之后显式 UTF-8 修订，未修改产品算法。
- 36710 退出 0：使用明确小数触控板输入 12×3.5，位移精确 -84，反向回归原点，Shift 横移 -7，Ctrl 缩放 1→1.3286858140965117，指针下世界坐标不变；覆盖面板输入保留且底层视口不变，无 pageerror。input-frame-wheel/result.json 为 passed。此为真实 WebView CDP 输入，非物理鼠标。
- 3338 正在测量新产物 60 Hz/30 秒规模交互，测量文件 interaction-input-frame.json，原始 timeline 单独保存；已完成两次规模打开约 1.96/1.95 秒。必须等终态再判断性能，旧 33.5 ms 超标保留。

- 3338 最终退出 0，interaction-input-frame.json 仍 budget-exceeded：60 Hz 发出 1,800/收到 1,775，输入到绘制 p95 从修正前 49.7 ms 降至 33.9 ms，帧间隔仍 33.5 ms；不能据响应改善宣告全部通过。绘制 p95 1.3 ms/最大 4.2 ms，事件投递间隔 p95 33.4 ms。
- input-frame-comparison.json 对比原始时间线：修正前 134 个 >33 ms 间隔中，132 个含至少两次 pending>0 的 rAF；修正后 132 个长间隔中此计数为 0，其中 129 个含 pending=0 的空闲刷新。典型长间隔的新输入直到上次绘制后 30.6—32.7 ms 才到达。证明已消除原双帧等待路径，并将剩余问题收窄到输入空档/测量连续负载条件，不以空闲重绘凑帧数。捕获事件到绘制的独立 p95 为 17.7→14.5 ms；它与从 event.timeStamp 计的总延迟不同。
- 新产物 120 Hz 连续输入对照已启动 65174，文件 interaction-input-frame-120hz.json 与对应 timeline，预算与图像/对象数量完全不变，先前 60 Hz 失败不覆盖。下轮先轮询同一会话。需要根据记录明确持续负载与空闲间隔含义，不能静默降低 33 ms 门槛。新产物尚未 NSIS 更新，C05 仍 doing。

- 本轮最终：65174 退出 0，interaction-input-frame-120hz.json 为 passed；30 秒发送 3,599/收到 3,115，实际改变视口绘制 1,767 次。输入到绘制 p95 49.9 ms（≤100），绘制间隔 p95 17.0 ms（≤33），绘制执行 p95 0.7 ms。保留真实输入合并、所有对象与图片、1440×900，未降低负载；两次打开约 1.93/1.95 秒。相比同产物 60 Hz 测量，总输入时间戳延迟受 CDP 投递影响，不能声称所有输入频率均改善。
- 本轮全部构建/原生探针终态；产品修正已用真实 release 验证行为与连续负载，尚未更新 NSIS。下一动作将 C05 性能证据逐项收口，明确 60 Hz 的输入空档诊断与持续负载验收边界，并完成新补丁安装交付/必要保存回归。原间歇导入记录继续保留，不将不再复现写成已修复。


### C05 帧调度修正进入实际安装包（2026-10-16）

- 48579 NSIS 构建退出 0，input-frame-installer-build.exit.txt=0；已保留旧安装器 installer-before-input-frame.exe（原摘要核对后复制）。新安装器 35.92 MiB，SHA256 1b0571fa6c76590c9368981e8796108441b8ae256a92652ebad5b44d9e8969af。构建过程观察到 rustc PID 80548 活跃后正常结束，无重复启动。
- 新增可复用 probes/install-release.py，校验所有 staging 文件与正式身份，拒绝覆盖现有证据记录，使用 /S /NS /UPDATE /D=新临时目录 安装；保存安装过程和失败状态，核对旧 exe、已有数据及实际外置资源。实际运行退出 0，新目录 Temp/oscanvas-verified-install-ifqesg1z，input-frame-installation.json；17 个 runtime/service/licenses 摘要和 resources.json 一致，74 个既有画布数据文件前后摘要一致，旧测试程序保留。安装登记更新到新目录，不创建快捷方式。
- 82262 默认启动探针退出 0，input-frame-installed-startup/result.json：不跳转测试 URL，空/复用 WebView profile 的可观察画布就绪时间约 3.05/2.25 秒，新建与关闭最后标签通过，无 pageerror；非操作系统重启冷缓存指标。
- 47424 正在执行新安装版 native-integration，独立证据 input-frame-installed-integration，待完成后判定目录/落盘/作品包/重开回归；不复用旧安装版结果作为新验收。
- 更新 C05 README 性能口径：预算仍 100/33 ms，120 Hz 持续负载通过，60 Hz 原始 budget-exceeded 及空闲刷新诊断保留；没有删失败样本或用空绘制凑帧。apps/canvas/README.md 补充当前产物区别与准确构建/探针入口，避免早期原型描述被误认为最新状态。C05 尚未整体标 done。

- 本轮最终：47424 退出 0，input-frame-installed-integration/result.json 为 passed，目录挂载、PNG 落盘保留原件与扫描去重、作品包下载/导入保留当前工作、新进程恢复节点身份/文件关联和导入作品通过。整合测试仍使用测试 URL 获取图断言，与已通过的默认入口探针分开。本轮安装/构建/原生探针全部终态，git diff --check 通过。下一动作逐项复核 C05 剩余验收与已知限制，尤其区分输入空档诊断、启动记录口径与旧间歇导入记录；不得将完整 C06—C12 目标缩减为首版。


### C01.2 开始：可终止的生成代码执行原型（2026-10-16）

- 任务切换依据：C05 最新安装/整合回归已通过，未解决项仍保留，转 verifying 而非 done；不重复相同测量延长循环。按执行文档 C01.2 仅依赖已通过 C01.1，且应尽早验证，因此启动独立隔离原型，当前仅它 doing。C06—C12 依赖未擅自解除。
- 原 iframe/Tauri 注入错误继续保留。候选方案为 Worker 内 QuickJS WASM 解释执行，生成代码不直接在宿主 Node/浏览器 JS 域运行；只交换 JSON 和明确授权的数据。项目固定 bun.lock 已含 quickjs-emscripten 0.32.0（just-bash 传递依赖），本轮直接定位已安装固定版本做原型，没有改变发布依赖或安装包。官方接口依据 https://github.com/justjake/quickjs-emscripten/blob/main/doc/quickjs-emscripten-core/classes/QuickJSRuntime.md；实际可行性以本机运行结果为准。
- 新增 runtime/sandbox.mjs 与 sandbox-worker.mjs：每次新建独立 Worker/WASM runtime，CPU 中断、墙钟终止、取消、堆/栈设置；限定源码与结果大小，能力请求上限 64，当前仅允许读取预加载的授权素材文本。无文件路径/网络/进程/凭据桥，也不开放任意宿主对象。输入配置与 engine 路径是可信宿主参数，不允许生成代码提供。
- probes/sandbox-runtime.mjs Node 24 执行退出 0，output/dev-evidence/canvas-c01/isolation/runtime.json：真实临时 allowed.txt 由可信宿主按授权 ID 读取；../outside.txt、outside、constructor、__proto__ 均拒绝；process/require/fetch/WebSocket/XMLHttpRequest/window/document/Tauri 在 guest 中不存在；从能力函数 constructor 仍不能取得 Node process。异常返回 guest-error，死循环由解释器中断；Worker ready 后延迟 25 ms 取消正在运行的循环，随后新实例正常输出文字视图。外部哨兵文件未变化、目录无新增。
- 验证边界：Node Worker 执行层原型，未接入实际画布、Tauri 能力桥、异步任务、任意 HTML/JSX、自定义渲染或包生命周期，不能作为 C01.2/C08 完成证明。设置内存限额不等于已验收总进程内存上界。该候选不能据此缩减最终三类节点需求；后续还需验证自定义界面与媒体交互承载。
- 本轮进程全部终态，git diff --check 通过；未改变已安装画布。下一动作在独立开发宿主中接入这一执行层与真实画布节点，验证运行/取消/错误后的画布输入、授权能力正常调用及拒绝路径；引入直接产品依赖前固定版本、来源和随附声明。C05 剩余审查继续保留。


### C01.2 本地服务与真实画布节点贯通（2026-10-16）

- runtime/node-runs.mjs 增加有界任务管理：最多 2 个并发、32 个历史条目，真实 Worker 运行/查询/取消，服务关闭先终止实例。local/server.mjs 在已有 Host/Origin/token 认证后接入 node-runs 路由，限制源代码请求体、拒绝客户端设置 assets/engine 等授权参数。默认不开启；仅可信启动配置 nodeSandbox 可启用。dev.mjs 支持 OS_CANVAS_SANDBOX_ENGINE，当前只用于独立原型。
- 新增 IsolationDraft.vue 与 EditorCanvas 开发模式入口，需 DEV + ?os-canvas&isolation-prototype。它创建真实图节点，交互卡跟随画布位置/缩放，编辑代码后通过本地服务运行、查询、取消；结果以文本插值显示，不执行 guest HTML/宿主代码。销毁或取消后旧结果不回写界面。首期草稿与结果尚未持久化为完整节点定义，不冒充 C08 生命周期。
- 启动独立开发宿主 21789，地址 http://localhost:14350/?os-canvas&isolation-prototype，MCP 14351、服务 14352，数据 .runtime/canvas-c01-isolation-data。最初 sandbox-canvas 66288 失败，因为新客户端漏带 X-OS-Workspace 标记而被 Vite 拒绝；missing-request-marker.json 保留。补齐标记后再次运行退出 0，isolation/canvas/result.json 及 canvas.png：真实图节点、执行结果、死循环期间可信鼠标绘图、取消、错误恢复、进程能力拒绝、HTML 文本不执行、跟随平移全部通过，截图已查看，无 pageerror。
- sandbox-service.test.mjs Node 24 两项测试通过：无 token 401，伪造 assets/engine、null/数组 400，授权素材读出真实宿主提供内容，第三个并发拒绝，取消后能继续运行；未启用运行时返回 503。测试实例全部关闭，不使用开发宿主旧代码来证明新增校验。
- UI 定向 oxlint --type-aware --type-check 最终 0 warnings/0 errors。初次 Promise executor 返回 timer 被规则拒绝，改为块体后通过。源码增量归档 0006-isolation-prototype.patch，基于 0001—0005 后的 EditorCanvas 差异，反向 apply --check 通过；初次 Windows 反斜杠 patch 路径失配已改为 POSIX 路径重新生成。根 diff --check 通过。
- 限制：仍是浏览器开发宿主；未做原生安装版桥接、总进程内存上界、任意自定义 UI/媒体/异步任务或 C08 权限全面验收。当前 worker 文件与 QuickJS 引擎需要专门随原生服务打包，不能直接认为已有服务 bundle 已包含它们。C01.2 doing，C05 verifying，既有安装版不变。
- 下一动作：检查原型生命周期/过期结果与运行时资源回收，准备明确的原生 runtime 资源清单与桥接；必须继续验证真实 Tauri 承载后才完成 C01.2。开发服务 21789 本轮保留，测试浏览器均退出；继续前核对端口/进程，新增 null 校验在独立测试已通过但当前开发宿主尚未重启加载。


### C01.2 仓库外独立运行资源与原生启动协议验证（2026-10-16）

- 新增 build-node-runtime.mjs，将固定 quickjs-emscripten 0.32.0 与全部 7 个直接/传递包拷贝成自包含目录，校验每个包名、版本、依赖精确版本和 LICENSE，记录逐文件 SHA256。生成 .runtime/canvas-node-runtime/runtime-xxYRob，140 文件/9,240,234 字节；含 Worker 源码、原始包声明和 WASM。运行时不从网络或仓库解析依赖。
- sandbox 支持可信 workerURL；node-runs 传递它。desktop-entry 仅在私有 stdin 配置 enableNodeRuntime=true 时，从服务旁 node-runtime 读取固定格式/版本并定位 Worker/engine，不接受前端提供路径。默认不开启，现有桌面服务协议与数据目录语义保留。新服务 bundle 已生成，desktop-service SHA256 91c4702dc2afad6fff323d2de0c5866324a0ea21451a9e5fd3b9ca0f8ff58054；原已安装版未替换，新资源声明映射尚待同步。
- packaged-node-runtime.mjs 把 bundle 与 runtime 复制到仓库外临时目录，清除环境中的 NODE_PATH，按实际原生 Windows namespaced file URL + --input-type=module --eval 方式启动。首次执行 runtime-error；初次记录只含状态，补结果后明确错误为 Worker 继承父进程 --input-type 导致不能加载文件。sandbox Worker 现显式 execArgv=[]，不继承父启动参数，服务重新构建后通过。旧 first-failure.json/failure.json 保留。
- 初次失败清理时 Node 报 UV_HANDLE_CLOSING，测试清理已改为先关闭私有管道并等待退出，超时才终止本测试子进程；后续无该错误。packaged/result.json 为 passed：真实 QuickJS/WASM 加载、运行文字节点、循环时 health 仍响应、取消实例、管道关闭终止活动任务/服务、stdout/stderr 不泄露令牌。此证据是原生服务启动路径，不等于已在 Tauri 窗口中验收。
- 回归：desktop-service.test.mjs 与 sandbox-service.test.mjs 共 6 项通过；sandbox-runtime 原型再次通过。取消时序自检发现旧 start 响应在 generation 检查之前赋 jobId 可能覆盖新任务标识，已移到检查之后；0006 补丁同步更新并反向校验通过，此竞争路径尚需专门 UI 回归，不能只据旧界面测试算已验证。
- 下一动作：补迟到响应/新实例取消回归；将 node-runtime 资源纳入 stage 与声明映射，在独立原生验证身份启用私有配置并暴露原型入口，跑真实 Tauri 界面与权限拒绝。原型仍只有同步代码与文本输出，不能缩减最终节点种类。C01.2 doing，C05 verifying。开发宿主 21789 仍保留，其运行服务尚不是本轮最新 bundle；测试实例均已关闭，diff --check 通过。


### C01.2 迟到响应回归与原生验证资源接入（2026-10-16）

- sandbox-late-response.mjs 真实浏览器/本地服务验证退出 0：只延迟第一次 start HTTP 响应，取消旧运行后立即新运行，放行旧响应后分别观察旧/新 ID 的取消请求，服务确认新实例 canceled；编辑代码保留。isolation/late-response/result.json 记录两个不同任务 ID。证明上一轮 generation 检查前置修正的竞争路径，不以立即返回模拟替代真实任务。
- stage-desktop 新增可选 OS_CANVAS_NODE_RUNTIME_DIR，必须配独立 validation identity，否则拒绝；逐文件验证 runtime manifest 后复制到 service/node-runtime。map-build-notices 将这 7 个实际复制包纳入声明映射，既有保守 inventory 已含它们且无缺声明。原型资源不自动进入正式标识包。
- Rust os_workspace 私有启动配置 enableNodeRuntime 依据随附 runtime.json 是否存在，不从渲染端接收路径或开关。新增 0007-native-node-runtime.patch；0006 更新为 DEV 或显式 VITE_OS_CANVAS_NODE_PROTOTYPE=1 编译开关，再要求 isolation-prototype 查询参数。两个补丁反向 apply --check 通过。正常生产编译不开此原型入口。
- 53207 正在串行执行完整生产构建→实际 UI 审计→声明映射/合并→staging，日志 isolation/native-ui-build.log，终态写 native-ui-build.exit.txt/staging.json。配置存 native-build-config.json：独立身份 local.os.canvas.validation541b10765c824969b82b0b9bc7faaab1；runtime-xxYRob；明确编译开关开启。本轮观察日志已进入 Vite 构建，尚未拿到整条流水线终态，下轮先轮询同一会话，不重复构建。
- sandbox-canvas 支持 OS_CANVAS_ISOLATION_HOST_RECORD，验证 exe 摘要并通过 native-host 驱动真实窗口；原生证据目录 native-canvas，保留浏览器证据。脚本检查初始宿主及测试导航期间 pageerror，当前尚未运行原生验证，不标通过。
- 下一动作：53207 成功后读取 native-staging.json，执行 scripts/canvas-desktop.ps1 -ResourcesPath <新目录> -Release，复制 exe 与完整 service/node-runtime 到独立临时产物，生成带 SHA 的 host record，再运行原生 sandbox-canvas。C01.2 doing；开发服务 21789/14350/14352 保留，原安装版不变；diff --check 通过。


### C01.2 原生验证资源构建完成，release 编译中（2026-10-16）

- 53207 完整 UI/审计/声明/staging 流水线退出 0，native-ui-build.exit.txt=0。5,476 模块/648 产物，实际 npm 映射增为 241（含 7 个复制的运行时包），未解析和缺声明均 0；合并声明 609 包/4,228,192 字节。native-staging.json：resources-Q2OiJ2，834 文件/142,146,772 字节，独立 validation541b10765c824969b82b0b9bc7faaab1。
- 60746 正在执行 scripts/canvas-desktop.ps1 -Release，日志 isolation/native-release-build.log，终态写 native-release-build.exit.txt；实际 rustc PID 82432 CPU 持续增长，已看到普通未使用字体函数警告，无重复构建。成功后脚本会复制 exe 与完整 runtime/service/licenses 到独立临时目录，并写 isolation/native-host.json。
- 架构文档补入执行原型边界：每实例 Worker/QuickJS、可信配置与 JSON 结果、默认关闭服务接口，以及同步文本原型不覆盖完整三类节点和总进程内存验收。未把原生窗口尚未执行的测试写成通过。
- 下一动作：先轮询 60746；成功后 OS_CANVAS_ISOLATION_HOST_RECORD=output/dev-evidence/canvas-c01/isolation/native-host.json，Node 24 执行 sandbox-canvas.mjs。确认真实 Tauri 图节点、运行/取消/错误恢复、死循环期间可绘图、进程能力拒绝和 pageerror。C01.2 doing；C05 verifying；现有正式安装未动。开发服务 21789 仍保留。


### C01.2 原生画布回归通过，早期隔离原型收口（2026-10-16）

- 60746 原生 release 退出 0；native-host.json 记录独立验证 exe SHA256 63daf345c5fc267778227ff35b7b998a6494f42cd2ae9e1db5091a87fa364f33。完整 node-runtime 随服务复制，非开发服务器或替身执行。
- 1871 第一次原生探针在 helper 固定等待旧 ?os-canvas URL 处超时；实际已到 ?os-canvas&isolation-prototype。native-host 增加显式 initialURL（默认不变），sandbox-canvas 提供准确入口并增加启动失败证据回调；没有改产品入口迎合旧断言。
- 97229 退出 0，native-canvas/result.json：真实图节点代码执行、文字输出、循环期间仍可鼠标绘图、取消、错误后再次运行、未授权进程能力拒绝、脚本文本不执行、覆盖卡跟随平移全部通过，初始与测试导航 pageerror 都为空。截图已查看；独立数据目录，正式安装未改。
- 对执行文档 C01.2 逐项复核，isolation/README.md 给出要求到证据映射。执行实例、可终止、错误隔离、能力桥和宿主边界可行性已有真实运行证据，因此仅将早期原型 C01.2 标 done。C08 仍 todo：任意自定义界面、媒体、异步能力、动态权限、包生命周期、内存及完整拒绝测试未通过；不把旧 iframe 错误写成已修复。C05 继续 verifying。
- 本轮构建和原生探针全部终态，开发宿主 21789/14350/14352 保留。diff --check 通过。下一任务优先 C01.3 早期网页承载，需核对 Tauri 子 WebView/网页焦点、遮挡、输入与当前宿主共存，独立验证旧 iframe 限制；不因隔离原型通过就宣称网页功能可用。


### C01.3 原生网页承载基础验证（2026-10-16）

- 恢复时核对 28970 会话及 native-build.log，release 构建已退出 0，没有重复构建。独立产物 web/native-host.json 的 exe SHA256 为 1bbef5c4a1580831ea961b3673ce45f9ec0273302d4ef224b9cf2c7b40cfa94a；沿用独立 validation 身份和 Q2OiJ2 资源，不替换正式安装。
- Tauri 2.12.1 启用 unstable 子 WebView API，新增仅主验证窗口可调用的 web_preview 命令；HTTP(S) 地址检查、尺寸/缩放范围校验、独立 incognito 视图。修改归档 0008-native-web-preview.patch，反向 apply --check 通过。实验性接口的依赖/声明影响仍待交付前核对。
- 96521 执行 Node 24 apps/canvas/probes/native-webview.mjs，退出 0；web/result.json 为 child-webview-basic-passed。真实本机 HTTP 页面设置 X-Frame-Options DENY 和 frame-ancestors none，直接子视图可打开；中英文内容输入、按钮、滚动、500→333 CSS 像素缩放、550 像素调整尺寸、隐藏后主画布输入、恢复保留内容及关闭均通过。主窗口 pageerror 为空；网页调用 web_preview 被 ACL 拒绝。
- 范围：这是受控网站和 CDP 输入验证，不证明系统鼠标命中/中文输入法、DOM 面板对原生表面的遮挡、画布变换联动、公共网站/登录/弹窗。不得据此标 C01.3 或 C07 完成。没有更改数据格式，既有 C02—C04 证据不受影响。
- C01.3 doing，C05 保留 verifying。下一动作针对原生子表面与主页面覆盖面板做真实窗口合成及焦点验证，记录是否需要独立合成/裁剪适配。探针已正常退出；旧隔离开发服务是否仍在运行须按端口核实，不据历史会话推断。


### C01.3 真实窗口遮挡缺陷确认（2026-10-16）

- native-webview.mjs 增加可选 OS_CANVAS_WEB_INSPECT=1 交互诊断：真实子网页上方放置 z-index=2147483647 的主页面面板，记录主 DOM 命中、焦点和网页输入，支持 hide/show/status/finish。首次 84038 因非 TTY stdin 结束而正常退出 0，之后明确用 TTY 会话 20581 执行；不是因观察超时重复启动。
- 使用 computer-use 获取真实 OS Canvas 窗口（本轮 PID 75644 / window 2759054）。native-overlap.png 与 native-hidden.png 已查看并归档：原生网页可见时完全盖住测试面板；隐藏网页后橙框面板可见。inspection.json 中主页面 elementFromPoint 能命中该面板，证明 DOM 命中/层级不能代表最终原生合成结果。
- 系统坐标点击后网页 activeElement 为输入框，但 type-text OSfocus 后读回值未变化；工具返回 synthetic_input/unverified，不能宣称系统键盘或 IME 验收通过。保留此局限，不拿此前 CDP 输入通过替代。
- 结论：普通 Tauri 子 WebView 不能直接满足网页位于悬浮工作台面板下方的要求。C01.3 继续 doing，下一动作检查 Windows WebView2 原生裁剪/合成支持，做面板局部遮挡与露出区域仍可交互的最小原型。不能用遇到面板就永久隐藏整个网页替代完整目标；不擅自更换 OpenPencil。
- 验证仍使用独立身份和测试数据，未更改正式安装或作品格式。已发 finish 清理本轮原生宿主，终态以会话退出记录为准。


### C01.3 Windows 局部裁剪实现，原生构建中（2026-10-16）

- 已核对上一轮 20581 原生诊断正常退出 0；真实遮挡缺陷成立，继续在现有底座实现适配，不缩减面板覆盖要求。
- 新增 validation-only occlude 动作：获取 Wry 子视图独立 HWND 并校验父窗口，按实际 DPI 从区域减去最多 64 个覆盖矩形；SetWindowRgn 成功转移 GDI 所有权，失败释放；回传实际结果。不裁剪整个主窗口，其他平台显式不支持。来源和限制见 web/clipping-notes.md。
- 0008 补丁已同步、反向校验通过。native-webview 增加独立 host record/evidence 配置和 clip/unclip 交互命令，防止新实验覆盖原遮挡证据；尚未运行新原生验收。
- 50329 正在执行 release 构建，日志 web/clip-build.log、终态 web/clip-build.exit.txt；本轮核对 rustc PID 68200 活跃（CPU 281 秒），尚无终态，不能重启构建。源码只出现现有字体未使用警告。
- 下一动作先轮询 50329。成功后复制 exe 和 Q2OiJ2 的 runtime/service/licenses 到新的独立临时目录，生成新 host record（不得覆盖旧 SHA 证据）；用 TTY 运行网页 probe 并发 clip，真实窗口查看局部面板露出、鼠标命中及 unclip 恢复。C01.3 doing，C05 verifying；尚未实现面板/视口/DPI 自动重算。

- 本轮最终 50329 退出 0，clip-build.exit.txt=0。新产物已独立复制，记录 web/clipping/native-host.json（含 exe SHA256）；下一轮直接使用该记录运行真实窗口裁剪验证，无需再次构建。尚未测试显示/点击，不标验收通过。


### C01.3 局部遮挡实测通过，系统键盘仍待诊断（2026-10-16）

- 使用 clipping/native-host.json 固定 SHA 的独立原生产物，TTY 96488，PID 82208。clip 命令成功，真实窗口截图 clipped.png 明确显示面板在裁剪洞内、网页其他部分仍可见；没有以子页面截图冒充合成效果。
- OS 坐标点击 HOST BUTTON，inspection.json 读回 count 由 0 到 1 且主页面焦点在该按钮；对露出网页区域系统滚动，scrolled.png 的网页内容/滚动条改变、面板保持；unclip 后 restored.png 网页恢复完整，输入值仍为原内容。occlusion-result.json 记录部分验收通过及边界。
- 网页输入框系统点击后 activeElement 正确，但 type-text OSfocus 没有写入。新增 native-web-input-diagnostic.mjs 在两视图记录 keydown/beforeinput/input/focus；press-key A 只见网页 Shift，paste-text 只新增 Control，未见字符/输入事件。宿主出现 focusout/focusin；原因未确定，不能称真实键盘或 IME 已支持。下一动作核对 GUI 线程实际焦点、工具每次聚焦行为及 WebView2 控制器焦点，采用有事件回读的最小实验，避免盲目重试输入。
- 遮挡修正只证明单个不透明矩形、当前 scale=1；自动面板/视口/DPI 重算及多面板仍未接入。C01.3 doing，C05 verifying。finish 已请求退出本轮原生测试，终态见会话；正式安装及用户数据未改。


### C01.3 原生输入与中文候选提交得到证据（2026-10-16）

- 新独立 focus 证据目录，复用 clipping 固定 exe，TTY 54758 / PID 82016。保留前轮 clipping/input-events.json，不覆盖旧失败；诊断脚本支持单独结果路径。
- 新增 native-input-focus.ps1：发送前确认测试 PID 为前台窗口，GUIThreadInfo 焦点接收者的顶层祖先必须为该窗口；使用完整 x64 INPUT 结构发送一对事件，不使用 DOM/CDP 写值。默认只读焦点，SendProbe 才发送固定测试字符/按键，不修改全局输入法配置。
- Unicode X 的 SendInput 返回 2；网页记录 trusted keydown/beforeinput/input，值变为 网页输入 testX。随后普通虚拟键 Y 返回 2，DOM 无字符变化；真实窗口 ime-candidate.png 显示系统中文输入法候选 y。因此这次普通按键无 DOM 值变化是候选未提交，不是焦点丢失。
- 再发空格确认候选，网页收到 trusted beforeinput/input data=有，inspection.json 读回 网页输入 testX有。focus-result.json 记录当前机器/单个输入法的系统输入与候选提交通过。早前 Orca type-text/paste 的具体失败原因没有充分证据，不能笼统认定工具缺陷，也不需据此盲改产品焦点。
- 没有产品代码变化，既有保存/隔离证据不失效；探针 finish 已请求正常退出。下一动作将网页矩形与遮挡重算接到画布视口/面板移动生命周期，验证缩放/移动后裁剪和焦点保持；IME 候选弹窗与面板相交的边界仍需后续覆盖。C01.3 doing。


### C01.3 网页跟随真实画布变换的首轮贯通（2026-10-16）

- 新增 apps/canvas/runtime/web-surface.mjs：以已渲染 DOM 锚点为几何来源，读取面板矩形，串行提交 bounds/zoom/occlude；只保留最新待处理状态，避免异步更新倒序。不可见时隐藏，重新可见时恢复；关闭等待在途命令再隐藏，失败隐藏过期交互表面并报告。当前原型每帧读取几何，不主动要求画布重绘。
- native-webview 增加 OS_CANVAS_WEB_FOLLOW=1，使用真实 OpenPencil 图节点的隔离卡作锚点，测试入口注入可信模块，非正式节点 UI。14798 退出 0；web/follow/result.json 保留本次实际输出（状态字段仍为旧 basic-passed，新增 followBefore/Panned/Zoomed 给出本次具体证据；脚本后续已改为专用状态，未伪造重写旧结果）。
- 同一个原生子网页中：锚点 [350,216,320,254] 平移到 [390,241,320,254]，面板相对裁剪 x 从 100 变 60；面板移至 x=520 后重新计算；真实编辑器缩放 0.75 后锚点 [292.5,189.75,240,190.5]，子网页 devicePixelRatio=0.75，原输入保留，无同步错误。这里是实际宿主命令完成/子网页状态断言，尚未取得动态变换中的合成截图或连续指针验收。
- 明确缺口：原生 bounds 仍拒绝负 x/y，因此部分越过左/上边界尚不可用；zoom 仅支持 0.25—4，尚未定义更大画布缩放下的承载策略。面板清单当前显式传入，尚未接到正式面板注册；位置/缩放/裁剪分命令可能产生短暂错位，需要后续原生原子更新或有证据的调度适配。不能据这次通过标 C01.3 完成。
- 本轮复用独立 clipping exe，测试实例正常退出 0；正式安装、作品格式未改。下一动作优先允许带符号的子窗口位置并验证部分越界裁剪，同时把变换与裁剪组合更新，避免扩展节点 UI 后再重做宿主协议。C01.3 doing，C05 verifying。


### C01.3 带符号位置与合并原生更新（2026-10-16）

- os_web_preview bounds 校验改为有限绝对范围，允许负 x/y，尺寸仍必须为正。新增 layout 命令要求完整 bounds/zoom/occlusions 并在任何变更前校验，沿用 main validation 身份限制。
- layout 在同一个 with_webview 主线程回调中对受控子 HWND 执行 SetWindowPos（不激活、不改变层级）、WebView2 SetBoundsAndZoomFactor 以及区域裁剪；完成后 oneshot 回传。web-surface 改为一次 layout 请求，避免三次 IPC 的中间状态。它不是跨合成器的帧事务，连续动画撕裂尚未测量，不声称完全原子显示。
- native-webview follow 用例新增实际图节点部分越过左上边界、完全离屏隐藏、回到原位置后原输入保留。尚未执行新版产物。0008 补丁已同步并反向 apply --check 通过，模块语法及 diff 检查通过。
- 50740 正在构建 release，web/layout-build.log 和 layout-build.exit.txt 记录终态。已核实 rustc PID 34524 活跃 CPU 288 秒；不重复构建。下一动作轮询 50740，成功后复制独立产物并以新 host record 执行 OS_CANVAS_WEB_FOLLOW=1，证据另存 web/layout；原 clipping 产物不能运行新 layout 协议。
- C01.3 doing，正式安装未修改；缩放范围仍 0.25—4，超范围策略及自动面板注册尚待完成。

- 本轮最终 50740 构建退出 0。独立 web/layout/native-host.json 的 exe SHA256 bd8225513f8b5a52849229696308fc11581e9817f121cc32d962f9e8971089a8。61209 新原生 follow 测试退出 0，layout/result.json 为 native-follow-prototype-passed：合并更新成功，部分离屏 bounds=[-107.5,-40.25,240,190.5] 仍 visible，完全离屏后隐藏，再恢复到 [292.5,189.75,240,190.5] 且原网页输入保持；未出现同步错误。尚无连续变换的真实窗口合成验收，不能据 applied 状态证明无闪烁。所有本轮构建/测试已终态；下一动作补实际合成中的越界/连续拖动观察，并处理可交互缩放范围与面板注册。


### C01.3 真实变换截图、缩放恢复及画布边界裁剪（2026-10-16）

- web-surface 新增 suspended/onState：超出原生 0.25—4 缩放范围时暂停原生表面并报告原因，继续跟踪；回到支持范围重新显示，不再永久触发 error/stop。这是恢复行为，不等于任意缩放已支持；正式产品仍需清晰可见的节点占位/预览，本轮回调仅在测试面板写入 data 状态。
- TTY 94619 / PID 77672 的 layout-visual 原生测试退出 0：缩放到 0.1 再回 0.75，输入保持；测试面板移动后真实截图 panel-moved.png 显示裁剪同步。加入现有图层/属性/工具面板的显式 DOM 查询；并非正式面板注册系统。
- partial.png 揭示新边界问题：网页部分越过左上边界时，图层/工具面板裁剪生效，但标签栏被网页盖住。保留该失败截图，未把 applied 状态等同完整视觉验收。
- 新增 clipTo 几何来源，按画布元素实际矩形计算四边外区域并加入裁剪，避免网页覆盖画布外标签栏。native-webview 用真实 canvas-element rect，未改作品坐标，也不隐藏整个部分可见网页。原生 exe 无需重建。回归会话 3326 / web/viewport-clip，终态需核对；修正后真实截图尚待补验。
- 下一动作检查 3326 后，以 inspect 模式到 partial 状态拍真实窗口，确认标签栏露出及其按钮可用；继续正式注册/缩放占位和连续动画验收。C01.3 doing，C05 verifying；94619 已正常退出，正式安装未改。


### C01.3 画布顶部边界复验与早期原型收口（2026-10-16）

- 已核对 viewport-clip/result.json 回归通过；1851 独立原生窗口 PID 31280 的 viewport-visual 验证执行 finish 后退出 0。partial.png 实际显示网页被截在画布顶部以下，标签栏保持；OS 坐标点击新标签页后 new-tab.png 出现第二标签且旧原生网页隐藏。原有标签栏泄漏截图保留，未覆盖。
- web/README.md 对执行文档 C01.3 的真实承载、输入/焦点、缩放、遮挡、宿主兼容逐项给出证据与范围。当前 Windows/单输入法/受控网站/scale=1 可行性已验证，故仅把早期 C01.3 标 done；C07 仍 todo，完整网站清单/正式 UI/节点保存/弹窗/多面板/任意缩放/多 DPI/连续合成性能均未完成。
- 当前适配不改变作品权威或保存格式，不影响 C02—C04 已有证据。宿主依旧 OpenPencil/Tauri，没有因兼容困难更换底座；实验性接口版本和生产依赖复核仍归正式交付。
- 全部本轮原生探针终态；正式安装未替换。下一项尽早验证 C01.4 透明桌面/快捷键/输入释放恢复及与网页共存，先检查既有原生宿主窗口配置与全局快捷键支持，继续使用独立身份。C05 仍 verifying，不能据 C01.3 完成自动关闭首发遗留项。


### C01.4 桌面宿主与全局快捷键原型实现（2026-10-16）

- 核对 C01.4 要求：透明、快捷键、输入释放/恢复及网页共存必须实测，不能只交透明截图。Tauri Windows window.set_background_color 忽略 alpha；WebView 背景 alpha=0 支持透明，仍需窗口 transparent 配置及画布绘制透明配合。当前源码/文档依据已核对，尚不声称实际透明。
- 新增 os_desktop_preview.rs，仅 main validation 身份可调用。Windows 独立消息线程注册 Ctrl+Alt+F10 + MOD_NOREPEAT，明确注册冲突错误；全局消息转主线程隐藏/恢复主窗口，不修改作品坐标。提供 status、toggle、restore、stop 和 transparent 验证命令；stop 注销快捷键并恢复窗口。注册前 PeekMessage 建消息队列，避免刚注册即 stop 时消息队列尚不存在。该快捷键是原型默认，不是用户最终绑定。
- 此实现先验证原生窗口隐藏/恢复；还没有节点飞出动画、空白区域穿透、托盘恢复入口或完整 C10 产品行为。必须用其他应用真实接收输入后再全局唤回，不能把 invoke(toggle) 结果当全局快捷键证据。
- 修改归档 0009-desktop-prototype.patch，基于 0008 后 lib.rs，反向校验通过。独立复制资源为 resources-desktop-xhldhheg，仅新配置 transparent=true；原 Q2OiJ2 和正式安装未改。配置记录 canvas-c01/desktop/staging.json。
- 36846 正在原生 release 构建，日志 desktop/native-build.log、终态 native-build.exit.txt。本轮轮询会话仍活跃，尚无编译终态；不能重复启动。下一动作先轮询，成功后复制 exe 与 canvas 资源到独立临时目录并保存 SHA host record，再做原生透明/快捷键/恢复探针及网页共存。C01.4 doing，C05 verifying。


### C01.4 全局快捷键与外部窗口输入实测（2026-10-16）

- 36846 原生 release 构建退出 0；desktop/native-host.json 独立 exe SHA256 097519a2c6353f15525a3db27d57280bcc6943ec5aa2d4cd775237a59804c2ac，保留 transparent 配置，不替换正式安装。
- 新增 native-desktop.mjs 与 desktop-target.ps1，创建独立 WinForms 测试窗口；native-input-focus 支持指定窗口句柄并核对 PID 归属/前台/焦点祖先，单次 SendInput 发送完整 Ctrl+Alt+F10 按下/释放序列。每次测试新样例目录，结束写 stop-target 关闭自己启动的窗口。
- 最初后台启动的辅助进程没有让目标表单成为前台；通用窗口选择又选中无标题辅助窗口。原 first-foreground-failure.json、ambiguous-window-failure.json 保留。指定窗口后 provider 报 windowNotFound，进一步发现后台启动标志导致目标表单未显式显示；在表单 Shown 中 ShowWindow/SetForegroundWindow 自己的句柄后解决。未关闭前台校验，也没有向未知应用发送按键。
- 99492 退出 0；desktop/basic/result.json 为 native-shortcut-and-input-release-passed：其他测试窗口为前台时注册快捷键触发 hidden=true；实际系统字符 X 写入目标输入框并读回；再次全局快捷键 hidden=false，原画布草稿内容保持。重复 start 拒绝、stop 后 registered=false、再注册成功，无宿主 pageerror 或辅助进程 stderr。
- 范围：窗口隐藏/恢复与外部窗口键盘输入已得到证据；透明合成、可见透明窗口鼠标穿透、网页及节点任务共存、动画和备用 UI 入口尚未验证。不能将此测试称为 C01.4/C10 完成。所有本轮测试进程正常清理；旧失败记录仍保留。
- 下一动作在受控蓝色测试窗口上实测真实透明画布背景，保留可见节点与网页；随后核对全局退场是否连同网页子表面一起隐藏，以及恢复后的输入/任务状态。C01.4 doing，C05 verifying。


### C01.4 透明画布渲染开关与构建（2026-10-16）

- 源码确认 pipeline.ts 对非 overlay 层每帧强制 alpha=1，retained backing 同样清为不透明；仅设置透明窗口/WebView 无法实现目标。不是把 canvas 隐藏后冒充透明画布。
- SkiaRenderer 新增 desktopTransparent（默认 false）和 setDesktopTransparent，切换清理已有 scene/backing/tile/picture 缓存；pipeline 透明模式清为 alpha=0，并跳过 retained backing/tiled 输出，保留实际场景节点和普通绘制路径。开关仅属渲染展示，不修改文档 pageColor；透明模式性能未验收。0010-transparent-renderer.patch 已归档并反向检查通过。
- native-desktop 增加独立 host/evidence 环境配置和透明验证模式：进入实际 test 画布，调用 renderer 开关，只清除 canvas 到根路径的 CSS 背景，不隐藏画布；校验 pageColor 未改，允许在恢复后保留窗口检查真实合成。旧已编译 exe 不含新方法，不能直接运行该模式。
- 47438 正在 scripts/canvas.ps1 build，VITE_OS_CANVAS_NODE_PROTOTYPE=1，沿用独立原型构建配置；日志 desktop/transparent-ui-build.log、终态 transparent-ui-build.exit.txt。已观察 packages 编译推进，尚未取得完整 lint/Vite 终态，不重复启动。
- 下一动作先轮询 47438；若构建成功，按既有 audit-ui-build → map-build-notices → package-notices → stage-desktop 串行更新新资源（保留 node-runtime/validation 配置），新 generated config 设置 transparent=true，构建独立原生 exe 后运行 OS_CANVAS_DESKTOP_TRANSPARENT=1 的 TTY native-desktop。必须取蓝色测试窗口透出、节点实际可见的原生截图，再验证网页共存。C01.4 doing；C05 verifying；正式安装未改。


### C01.4 透明渲染构建复杂度修正（2026-10-16）

- 47438 已终态退出 1；transparent-ui-build.exit.txt=1。唯一阻断为 pipeline render complexity=22 >20，非工具超时；其余为既有警告。保留原日志，提取 clearFrameBackground 小函数，不放宽 lint 规则；0010 补丁同步、反向检查通过。
- 34707 正在重新完整构建，日志 transparent-ui-fixed.log，终态 transparent-ui-fixed.exit.txt；本轮已观察结构检查 10 warnings/0 errors、类型检查 3 warnings/0 errors，Vite 已进入 transforming。尚未见整个构建终态，不重复启动。
- native-desktop 透明检查补入真实图节点 Desktop transparency marker（洋红矩形），记录 WebGL context alpha 属性，并在退场恢复后核对该节点和 pageColor。测试脚本语法通过；尚未在新包执行，不算透明合成已通过。
- 已准备 .runtime/canvas-transparent-package.py：仅在 fixed 构建 exit=0 后运行，串行实际 UI 审计/声明映射与合并/staging/transparent 配置/native release/独立产物复制，写 transparent-package.log、transparent-package.exit.txt 和 transparent-host.json。此脚本尚未启动，不能据文件存在视为已构建。
- 下一动作先轮询 34707，成功后 python .runtime/canvas-transparent-package.py；终态成功后 OS_CANVAS_DESKTOP_HOST_RECORD=.../transparent-host.json，OS_CANVAS_DESKTOP_EVIDENCE=.../transparent，OS_CANVAS_DESKTOP_TRANSPARENT=1，用 TTY 执行 native-desktop.mjs 并检查真实窗口。C01.4 doing，C05 verifying，正式安装未改。


### C01.4 透明 UI 完整构建通过，新原生资源编译中（2026-10-16）

- 34707 已退出 0，transparent-ui-fixed.exit.txt=0；完整 packages/结构检查/类型检查/Vite 通过，不据上一轮部分日志推断。0010 背景辅助函数修正有效，既有警告保留。
- 47685 执行 .runtime/canvas-transparent-package.py：UI 实际构建审计 5,476 模块/648 产物，241 npm 包映射未解析/缺声明均 0，609 包声明 4,228,192 字节。新 staging resources-wqiqxc，834 文件/142,146,974 字节，transparent=true；记录 transparent-staging.json。
- 同一 47685 当前处于原生 release 编译，transparent-package.log 中仅现有字体警告；本轮核实 rustc PID 85924 活跃。脚本成功后才写 transparent-host.json 和 transparent-package.exit.txt，尚未取得终态，不重复构建。
- native-desktop 增加 OS_CANVAS_DESKTOP_WEB=1 的真实 HTTP 网页（禁止 framing），在退场/恢复后检查页面存活和输入保留。新增 native-window-visibility.ps1 核对目标窗口所属 PID，读取主窗口与全部子 HWND 可见性；probe 将验证实际隐藏/恢复而非仅内部 hidden 标记。脚本语法及 diff 检查通过，新增联合路径尚未运行。
- 下一动作轮询 47685，成功后以 transparent-host.json、独立 transparent 证据目录、OS_CANVAS_DESKTOP_TRANSPARENT=1 / OS_CANVAS_DESKTOP_WEB=1 用 TTY 执行 native-desktop.mjs；检查底层蓝色测试窗口透出、实际洋红图节点与网页可见。若失败先保存当前结果，不以旧 basic 测试证明联合路径。C01.4 doing，C05 verifying，正式安装未改。


### C01.4 双渲染层透明诊断与统一入口（2026-10-16）

- 上一轮仅回答进度，没有实现推进；本轮重新核实原生探针 82233 活跃并停在检查输入，未重复启动。47685 已构建成功，transparent-package.exit.txt=0；独立 exe SHA256 4db5fbe66e06a36636d7a41f6e18565d6d55dc7ddd673b34b3ddb85e98f8d873。
- 原生画布仍不透明的原因已定位：editor.renderer 是最后挂载的覆盖层，场景层仍 desktopTransparent=false。layer-propagation.json 记录两层修改前后；运行时同时设置 canvasRenderers 后，真实截图 layers-transparent.png 显示底层蓝色测试窗口、洋红图节点及网页同时可见。该截图已查看；这是运行时诊断证据，不代表新源码已构建验收。
- create.ts 新增编辑器级 setDesktopTransparent，统一更新所有已有渲染器并请求重绘；新注册或重建的渲染器继承该设置。展示状态不进入作品数据。native-desktop 改用统一入口。0010 补丁纳入 create.ts，反向 apply --check 通过（首次相对路径多一层导致找不到补丁，修正后通过）。
- 检查结束向 82233 发送 finish，探针退出 0：transparent/result.json 保存实际全局快捷键、主/子 HWND 隐藏恢复、外部输入、画布草稿及网页输入保留结果。透明视觉依据单独截图；动画、可见时鼠标穿透及完整 C10 仍未验收。
- 62480 正在执行 .runtime/canvas-transparent-layers-build.py，完整构建日志 desktop/transparent-layers-build.log，终态写 transparent-layers-build.exit.txt；已观察到核心包构建，尚未取得终态。下一轮先轮询同一会话；成功后用新的日志/host 文件名完成 UI 审计、资源打包及原生 release，避免覆盖本轮旧包诊断。随后按新统一入口重跑真实窗口，并验证切换回不透明、重建继承与页面颜色不变。C01.4 doing，C05 verifying，未完成完整目标。


### C01.4 原生联合验证通过，早期原型收口（2026-10-16）

- 62480 完整 UI 构建退出 0；transparent-layers-build.exit.txt=0。其后新增真实 CanvasKit 生命周期测试 1 pass/8 assertions：双层切换、移除/新注册继承、关闭透明后的继承与 pageColor 不变。首次测试文件路径错误未写入，修正路径后实际执行通过。测试纳入 0010，反向 apply --check 通过；运行代码未再修改。
- 45429 UI 审计/声明/资源/native release 全部退出 0；transparent-layers-package.exit.txt=0。资源 resources-UXoj9p；transparent-layers-host.json 固定 exe SHA256 42b6bf52f3df98573a9405090328537521bc3145c395eb3bd20cec9d03992627。保留四项原有 Rust 警告。
- 34107 真实 Tauri 联合探针退出 0：layers-native/result.json 验证双层透明、全局快捷键主/子 HWND 隐藏恢复、下层文字 X 与按钮点击计数 1、草稿/网页输入保留、注销和重新注册。鼠标输入以目标计数读回为证，不以 synthetic input 返回成功代替。
- opaque/transparent 两次切换截图已查看并归档 transparent.png、opaque.png、restored.png；显示真实图节点、网页与底层蓝色窗口。desktop-node-coexistence.mjs 通过 UI 请求短时 QuickJS 任务，在隐藏期间完成，恢复后结果仍在；node-coexistence.json passed。恢复草稿后主探针正常收尾，本轮辅助进程清理。
- C01.4 早期承载/透明/快捷键/输入释放恢复/网页及节点共存要求已有证据，标 done；完整 C10 仍 todo。动画、全屏层级、备用找回界面、快捷键配置、多 DPI、长期任务及媒体不在本次已验证范围。透明模式性能未验收，正式安装未替换。desktop/README.md 记录矩阵及缺口。
- 下一动作回到 C05 verifying，处理 60 Hz 帧间隔门槛、启动口径和旧间歇导入超时；不因原型完成跳过首发验收。所有本轮构建和原生探针已终态。截图 JSON 为 PowerShell UTF-16，首次归档按 UTF-8 解码失败，修正 BOM 解码后成功；未损坏原截图。git diff --check 与补丁检查通过，完整目标继续。


### C05 场景层性能复核与小幅滚轮缺陷修复（2026-10-16）

- 本轮继续 C05 verifying。修正 native-interaction-scale 只包装 editor.renderer 的不确定性，现包装全部 canvasRenderers，场景层作为响应/帧指标、覆盖层单独记 timeline，明确记录身份。两次原生测试实际注册顺序相反，不能再假设最后一个就是某一层。
- 当前正式安装摘要 7bb967cc9a1ffc72cd1e89aa7f1cce65878bedc30b79ff547674e75b23f40da7 已重核，scene-measurement-host.json 固定记录。16714/91096 分别完成 60/120 Hz 场景测量：33.6/33.3 ms（budget-exceeded）、49.8/17.0 ms（数值 passed），原文件 interaction-scene-60hz/120hz 及时间线保留。60 Hz 110 个长间隔中 109 个含空闲刷新，0 个含两次待处理刷新；未删除间隔或放宽预算。
- 人工查看 120 Hz 截图发现图像不在视口，timeline 最终 panX=-2572，旧 input-frame-120hz 同样为 -1404。因此撤回旧数值 passed 对持续 8 图可见负载的验收推断。探针新增初始视口复位、每场景帧 pan/zoom、图片矩形、每帧完整可见 8 图断言以及前后截图。不可用 fixture.visibleImages 常量代替实际可见性。
- 82470 位置反馈仍失败（minVisible=0，panX -1092..960）；4467 改用 0.5 小数像素仍失败（minVisible=4，panX -607..587）。两次失败保留。后者真实输入时间线显示 0.5 合并为 1、legacy wheelDelta=-240，触发只按整数判断的 Windows notch 加速，已定位可复现的细粒度输入跳跃；未把失败算作性能通过。
- 0011-fine-pixel-wheel.patch：pixel 模式幅度小于既有 99 阈值走普通像素处理；避免合并后变整数而激活 notch。保留 line/page、大幅正常刻度与平台路径。回归先红后绿：14 pass/2 fail →16 pass/45 assertions，含旧 Windows 加速/反向/缩放；记录 fine-pixel-unit-test.json，补丁反向检查通过。小幅 pixel 即使来自真实鼠标也采用比例移动，这是明确策略，不声称从 legacy 字段识别硬件。
- native-import-diagnostic 增加指定证据目录、exe SHA 校验、本机请求完成/失败时序与控制台/alert 捕获。56551 当前安装 20 MiB 新 UUID 快速导入打开退出 0，import-installed-trace/result.json opened（7 项请求、无 console/alert），旧 first-load-failure 根因仍未知；未宣称已修复。
- 20203 正在执行 .runtime/canvas-fine-pixel-build.py；desktop/fine-pixel-build.log，终态 fine-pixel-build.exit.txt。明确清除 C01 prototype/validation/runtime 配置，构建正式模式。下一轮先轮询此会话，成功后审计/声明/stage 新正式身份 release，再按每帧 8 图可见的场景层协议跑 60/120 Hz 及实际滚轮/缩放回归；通过前不更换正式安装或标 C05 done。
- 本轮此前原生性能/导入进程均终态；只有构建 20203 尚在运行。git diff --check 通过。完整目标继续，C06—C12 范围未缩减。


### C05 新原生细粒度输入修复通过，可见负载复测（2026-10-16）

- 20203 已终态退出 1：上游 tests/e2e/perf/pixel-grid.spec.ts 的 console.log 阻断 lint；0012 改为允许的 console.debug，保留输出与检查规则。93514 重建同样终态退出 1，新测试 Math.pow 被规则拒绝；改为 **，0011 重新归档。两份失败日志/exit 保留，未放宽检查。
- 76034 独立完整 lint（结构+类型）退出 0，9/3 个原有警告，无错误。上一轮 build:packages 已完成，之后仅测试期望语法变化；fine-pixel-preflight.json 记录分步来源，不把失败 build.exit 改为 0。39765 接续实际 Vite 审计/声明/stage/native release 退出 0；fine-pixel-package.exit.txt=0，5,476 模块/648 产物、234 npm 输入无未解析/缺声明、602 包声明。正式模式未带 C01 原型开关或 runtime。
- fine-pixel-host.json 固定独立正式身份 release：exe SHA256 ca3d1423744fe012df64f3fb66dfb624bcd32bd13d4282083864bf55e8148d4f，resources-XkD9jT。未替换原安装版。75787 实际 WebView 滚轮回归退出 0，fine-pixel-wheel/result.json passed，覆盖混合小幅小数/整数、累计位移、普通刻度、反向、Shift/缩放锚点和面板边界。
- 31945 120 Hz 规模测试退出 0：interaction-fine-pixel-120hz.json passed，30 秒 3,598 次发送/2,417 次接收（真实合并保留）；响应 p95 66.9 ms、场景帧间隔 p95 17.1 ms，均达 100/33 ms。每场景帧可见图像 min=max=8，panX -70..-1；结束截图已查看，8 图正常可见，无面板遮住。不是旧空视口的通过结果。
- 9299 60 Hz 对照退出 0但 status=budget-exceeded：响应 p95 33.9 ms、场景间隔 p95 33.4 ms；每帧 8 图，panX -65..-1。新增 analyze-frame-gaps.mjs 可复现诊断：126 个 >33 ms 间隔中 124 个含 pending=0 刷新，1 个含至少两次 pending>0 刷新；未丢弃帧或修改门槛。此结论保留为输入投递/持续负载边界，C05 不据单次 120 Hz 自动关闭。
- native-memory-scale 新增指定 host/证据文件、exe 校验、初始视口归零、每次采样验证 8 图可见、首末截图，并要求所有采样均 ≤2 GiB。这是因旧可见负载证据不足而补验，非原样重复已通过结果。79216 正运行 5 分钟，文件 memory-fine-pixel-visible.json；0 秒工作集 1,133,686,784 字节，30 秒 1,043,095,552 字节，10 个宿主/Node/WebView2 进程；初始截图已查看。尚未终态，不能标内存通过。
- 下一轮先轮询现存 79216；成功后查看末尾截图并记录真实范围，再收口持续负载预算解释、正式安装交付/默认启动及数据整合回归。旧导入超时仍未定位，不能删除保护或把后续不复现写为已修复。当前只有该内存探针仍运行，构建与滚轮/交互会话均终态；git diff --check 和 0011/0012 反向检查通过。C05 verifying，完整目标保持。


### C05 内存采样达标但截图收尾失败，修正原生采集（2026-10-16）

- 79216 已终态退出 1：300 秒 11 次进程树采样完成且每次 8 图可见，最大 1,133,686,784 字节、最终 1,014,734,848 字节，均 ≤2 GiB；失败在末尾 Playwright page.screenshot 等待 30 秒超时。memory-fine-pixel-visible.json 保留 failed，failure-analysis.json 分离采样结果和整支验收，不改成 passed。不能以文件含 11 个样本推定完整探针结束成功。
- native-memory-scale 改为首末恢复并捕获自有原生窗口（Orca computer，保存完整状态 JSON 和真实截图），始终保存 pageErrors；没有改变负载、时长或预算。新 25899 正在执行同一 fine-pixel-host.json，输出 memory-fine-pixel-visible-nativecapture.json，避免覆盖失败记录。初始原生截图已查看，8 图正常显示；当前采样到 120 秒，0 秒 1,188,208,640 字节，120 秒 1,028,448,256 字节，10 进程。尚未终态，不标通过。
- 60 Hz 唯一至少两次 pending 刷新的疑点已补原始相邻事件：30978.7 ms 的 -0.5 与 30995 ms 的 +0.5 相抵；30995.9 ms 场景完成但无位移，探针仅在 changed 时清理 pending，旧时间戳残留。31028.2 ms 新有效输入到达，31029.3 ms 场景完成。fine-pixel-pending-gap-explanation.json 保留完整片段；pending 是探针计数，不是引擎实际队列。未调整原始 33.4 ms 超标结论，也不加入空闲重绘。
- 更新开发现场顶部过时入口和 C01 状态，旧“最新检查点”明确改为历史追加，避免后续 agent 根据早期记录误判 C01.2—C01.4 未完成。C05 README 顶部矩阵切换到新场景层/逐帧可见性证据，旧空视口性能不再冒充验收。
- 已准备 .runtime/canvas-fine-pixel-installer.py（尚未运行）：要求新的 nativecapture 内存记录 native-host-passed 后才构建，使用 resources-XkD9jT；构建前按摘要归档已有安装器，构建后归档新安装器到 .runtime/canvas-release-artifacts，输出 fine-pixel-installer-artifact.json 和日志/exit。不会直接安装；后续用 install-release.py 的新目录/前后数据摘要保护路径安装并验证。
- 下一轮先轮询 25899；取终态和末尾截图。仅本轮探针仍运行，不重复启动。通过后执行 installer 脚本，再以 input-frame-installation.json 为 previous-record、fine-pixel-installation.json 为新记录完成受控安装；默认启动/数据整合回归使用新记录。C05 verifying，60 Hz 适用范围和旧导入未知原因仍需最终验收说明；完整目标继续。git diff --check 通过。


### C05 内存重验与新安装交付回归通过（2026-10-16）

- 25899 已终态退出 0，memory-fine-pixel-visible-nativecapture.json native-host-passed：300 秒 11 样本最大 1,188,208,640 字节，最终 1,025,286,144 字节，10 个宿主/Node/WebView2 进程，每次采样 8 图，pageErrors=[]。末尾原生截图已查看，图片正常显示；旧 CDP 截图超时 failed 原件不覆盖。
- 补充 fine-pixel-delivered-response.json：既有时间线的已投递输入到下一次改变场景 p95 为 14.8/15.6 ms（60/120 Hz），样本 1789/2417，无剩余事件。该保守诊断包含反向抵消时间戳，不替代原始 timeStamp 延迟或帧间隔门槛。
- 2111 installer 脚本退出 0，fine-pixel-installer-build.exit.txt=0；新 NSIS 35.98 MiB，按摘要归档到 .runtime/canvas-release-artifacts/a4c68b1269c626eec18660d9499c594b7ac1d5ffb314ac937af5fc88378ad4de.exe。已有安装器构建前同样归档；资源 resources-XkD9jT。
- .runtime/install-fine-pixel.py 退出 0，fine-pixel-installation.json installed-data-preserved：独立目录 oscanvas-verified-install-pes013xa，实际 exe SHA256 ca92497c9863cc3bec4e1f76dac8fccf0225b5eb57d32382bd3b0c2b062bfe21；旧 exe 不变、98 个应用数据文件前后完全相同、17 个随附资源/声明摘要核对通过。未删除或替换旧测试目录。
- 45796 默认启动验证退出 0，fine-pixel-installed-startup/result.json：正式 ?os-canvas 无强制 reload/test 参数，空/复用 profile 观察值 3735.49/2256.05 ms；新建及关闭最后标签、输入可用通过，截图已查看。不是 OS 重启冷启动，不把已有作品打开 5 秒预算套到启动观察值。
- 57250 安装版整合退出 0，fine-pixel-installed-integration/result.json passed：目录挂载、PNG 落盘保留原件、扫描去重、作品包下载/导入保留当前工作、新进程恢复节点身份/文件关联及导入作品。使用 test URL 获取图断言，与默认入口验证分开。
- 本轮所有构建/原生会话终态，无需继续轮询旧句柄。README 更新最新安装指针；分支 bluegill，HEAD 8afed9f 未改，git diff --check 通过。下一步按执行文档复核 C05 验收：明确连续负载与 60 Hz 投递空档的测量适用范围，保留所有失败；旧单次大包首次打开超时根因未知，当前带追踪导入及安装回归通过不冒充根因修复。C05 保持 verifying，完整 C06—C12 目标继续。


### C05 连续输入通过、导入保护恢复通过，视觉缺口待修（2026-10-16）

- 上一用户状态问答未改变实现，本轮恢复具体证据而非重复报进度。86674 句柄已不存在；interaction-installed-frame-clock.json 已终态 passed，实测 30,008.8 ms/1,780 次刷新驱动投递、无跳过、1,779 事件/1,778 场景变化，输入/场景间隔 p95 49.9/17.1 ms。逐帧 8 图可见，末截图已查看。满足原 100/33 ms 连续操作预算；60 Hz host-clock 输入空档的原始失败不删、不改门槛，不要求空闲重绘。
- native-import-diagnostic 新增明确的未保存图形保护与保存重试路径，且成功必须同时匹配目标名称和 1,000 个对象。最新安装包 ca92497c…，会话 18170 退出 0；desktop/import-installed-guard-recovery/result.json guard-recovery-passed。首次打开正确拒绝且哨兵保留，保存后打开成功，无控制台错误。旧 20 MiB 超时缺少 UI 证据，不能倒推其原因或声称修复；现有正常打开及保护恢复路径已有独立证据。
- 对照 design.md 查看截图和 src/theme/tokens.css，发现工作区未覆写 accent，底部选中工具仍为上游蓝色。C05 暂保持 verifying，下一最小任务修复工作区主题作用域并实测；不是重新跑已经通过的规模性能。需检查覆盖层/弹出菜单是否使用同一主题，不能修改作品自身颜色。实现开始后按执行规则将 C05 改 doing。
- 本轮仅新增诊断覆盖和证据说明，运行代码未修改；已有保存/安装证据仍有效。C06—C12 尚未实施，完整目标不变。git diff --check 通过，无本轮测试会话仍需轮询。


### C05 Factory 主题修复与浏览器验证（2026-10-16）

- 上一轮为有效进展（连续输入证据、导入保护恢复）；本轮修复视觉缺口，C05 状态改 doing。0013-factory-theme.patch 覆盖 theme.ts/tokens.css：OS 模式使用深色 Factory 主题、浅底深字 accent/选区；html 标记让标签和 body 下的 Teleport 菜单同样继承灰色面板。原 OpenPencil 模式仍走原主题偏好，不写回用户偏好，不修改作品颜色或保存协议。补丁反向 apply --check 通过。
- apps/canvas/probes/theme.mjs 在真实 Edge 浏览器以独立样例验证，39545 退出 0；theme/result.json passed：工具背景 rgb(238,238,238)、字色 rgb(36,35,31)，外置右键菜单 accent/panel 正确；预置 light 偏好在 OS 模式保持但呈现 dark，回原模式恢复 light。截图 theme/menu.png 已查看，控制台错误为空。这是开发页，尚非新安装版证据。
- 25482 完整 lint（结构/类型）退出 0，9/3 个既有警告，无错误；theme/lint.exit.txt=0。运行代码仅主题变化，不重跑无关存储和性能压力。git diff --check 通过。
- 开发服务起初尝试 14252/14352 端口被占用，均退出 1，未结束占用者；后改为已确认空闲的 24650/24651/24652。自有开发服务 31081 仍运行，目录 .runtime/canvas-theme-data；后续可复用，勿重复启动。最初补丁路径多一层 ../ 导致检查失败，改 ../../ 后通过，未改变补丁内容。
- .runtime/canvas-theme-package.py 正在构建：会话 27446，desktop/factory-theme-package.log，终态 factory-theme-package.exit.txt。先要求本轮 UI/lint 通过，再执行 Vite 审计、声明、独立 staging、native release，输出 factory-theme-host.json，不覆盖 fine-pixel 证据或已安装目录。下一轮先轮询 27446，再做新原生主题回归/安装交付；尚不能以开发页通过关闭 C05。全量 C06—C12 目标不变。


### C05 验收完成，转 C06.1（2026-10-16）

- 27446 release、19005 native theme、39946 NSIS、94482 installed startup、81720 installed theme 均退出 0。安装脚本退出 0，旧 exe/应用数据保留。最新安装记录 factory-theme-installation.json，exe SHA 0ce2b61e…；主题原生/安装截图已查看。新独立安装目录 oscanvas-verified-install-gxb2283z。
- C05 README 收口审查逐项对照筛选、隐藏继续、独立管理区包恢复、格式/关联/历史、规模性能、离线/默认启动及安装声明；本轮原始结果已核查。0013 仅主题修改，不使存储/筛选/输入调度证据失效；不重跑全部压力。连续负载 49.9/17.1ms 及内存均达原预算。旧 60Hz 投递空档和历史单次导入未知根因不改写，明确受测范围与复现后重开规则。C05 标 done；完整目标未完成。
- 下一任务 C06.1，先建立需求 4/5 能力矩阵并验证 OS 模式下实际文字、形状、分组/画框、连接和重开。上游 tests/e2e 已有对应入口，但是否在我方覆盖面板/本地持久化下成立尚未验证；不能复用上游文件存在作为通过。
- 开发服务 31081 尚留作后续验证（使用前检查）；所有本轮原生测试已正常关闭，无待轮询编译。分支/用户改动保留，未提交。git diff --check 通过。


### C06.1 基础编辑通过，修复裸画布文字可读性（2026-10-16）

- 31081 确认仍运行，复用 24650 开发服务与独立样例。新增 apps/canvas/probes/basic-editing.mjs，真实指针/键盘完成矩形、椭圆、中文文字、分组、移动、撤销重做、画框及 UI 保存/全新浏览器进程打开；逐层几何/结构/文字一致。76044 首次错误选择器失败已保留；80694 修正为 data-test-id 后退出 0。
- 实际重开截图发现直接在暗色画布新建文字为黑色。0014 在 app/editor/session/create.ts 包装 OS 绘图 createShape，只给页面直接子 TEXT 初始化浅色，仍使用现有形状历史；不改已有/导入作品，不替换图模型。42455 新证据 readable-text/result.json 退出 0，颜色断言及原完整流程通过，重开截图已查看。上游包核心代码未改，补丁反向检查通过。
- C06 仍 doing：基础路径证据不是全部文字格式/矢量/自动布局/组件/连线验收。连接类型在 scene graph/FIG 有声明，未找到实际端点吸附跟随编辑逻辑；下一步先完成本轮 lint，再补充容器内文字保持原颜色的实际回归，随后设计并实现关系连接最小完整流程（稳定节点身份、移动跟随、保存重开、删除/撤销）。
- 59459 正运行完整 lint（结构/类型），尚未终态，下一轮先轮询；31081 开发服务可继续复用，其余本轮浏览器已关闭。0014 尚未进入安装包；已验收 C05 产物保持，当前 C06 工作版须后续阶段构建。git diff --check 与补丁检查通过。


- 本轮追加：59459 终态退出 1，唯一错误为 create.ts composition root 274 行超过 260。已提取 installCanvasDrawingDefaults 到 session/drawing-defaults.ts，入口只调用一行，不放宽规则；0014 已重新归档并反向检查。81413 正在重跑 lint，下一轮轮询此句柄而非旧 59459。抽取后的 UI 回归与容器内文字保留原色仍需验证，避免把抽取前证据扩大到未验证变更。

- 最新 lint 恢复点：81413 退出 1（抽取后入口 261 行，仍多 1 行）；移除入口中冗余空行、整理 helper 缩进，未放宽 260 行规则。12615 正在运行完整 lint，后续只轮询此句柄。0014 重新归档；UI 抽取后回归仍待做。


### C06.1 子流程通过，准备关系连线（2026-10-16）

- 上轮为有效进展（新增基础编辑探针与文字默认色实现）；本轮轮询 12615 得到退出 0，完整 lint 结构/类型均无错误，既有 9/3 警告。没有继续轮询旧失败句柄。
- basic-editing 探针加入真实白色画框及内部文字、填色保存快照；34960 退出 0，text-container-regression/result.json passed，深色画布浅字/白框黑字/嵌套对象结构保存重开一致，截图已查看。该运行覆盖抽取后 helper 的实际调用，不只依赖抽取前截图。
- C06.1 基础编辑与默认文字可读性子流程收口；C06 仍 doing。下一 C06.2 关系连接：源码只有 CONNECTOR 类型/FIG/剪贴板映射，尚无可用端点跟随编辑器。优先复用场景向量/统一选区历史，用 localNodeId 稳定身份保存两端关联；读取 getWorldMatrix/getAxisAlignedWorldBounds 处理嵌套坐标，不能以屏幕位置存储或另建场景权威。
- 实现前须覆盖移动/缩放/父容器变换、端点删除后撤销、连接本身删除撤销、复制两端与连接后身份重映射、保存重开、筛选隐藏和离页行为。先小步可运行路径，标签/折线曲线和拖拽吸附仍保留在 C06 范围，不因首条线出现而标完整 done。
- 31081 开发服务继续复用；本轮浏览器与 lint 全终态。0014 尚未打包进 C05 安装产物；存储格式未变。当前目标仍是 C00—C12 全量，未提交用户工作树。


### C06.2 关系连接完整基础路径通过（2026-10-16）

- 新增 app/document/local-connections.ts 与 OsCanvasWorkspace 的连接按钮，0015 已归档；架构文档补充 metadata version=1/source/target 业务 UUID 约定。沿用 VECTOR、统一选区与 createShape 历史，不另建场景树。端点缺失保留最后几何并显示数量，微任务重算避免事件递归。
- 80621 connections.mjs 退出 0，connections-basic/result.json passed：UI 创建/移动跟随/撤销重做/删除端点提示/撤销重连/保存新浏览器重开/再次移动均通过，截图已查看。首次 92042 失败是 FIG 导入补默认 handleMirroring=NONE，原件保留；归一此默认字段后通过，坐标和身份仍完整断言。
- 35581 lint 退出 1（空 catch），改为固定内容警告保留原数据；79914 退出 1（relation 返回类型一致性），已给无结果分支显式 undefined。79931 当前运行完整 lint，下一轮先轮询，不重启。0015 首次 reverse check 因源文件混合换行失败，规范为 LF 后重新归档，reverse check 通过；未改上游大面积文件。
- C06.2 尚 doing：复制端点+连接会保留原 UUID 引用，目前**尚未重映射，不能称复制正确**；优先修复这一语义，再检查筛选联动与跨页/容器变换、连接自身删除撤销。标签/折线曲线/拖拽吸附均保留目标。原 C05 安装版未改，C06 当前开发页未打包。
- 31081 开发服务继续复用，UI 测试均结束；除 79931 外无本轮待轮询测试。git diff --check 通过。下一轮读取连接模块、local-identity 与复制实现，解决关联复制，不能只重复当前已通过的直线用例。


### C06.2 复制与跨画布粘贴关联修复（2026-10-16）

- 恢复 79931 退出 0（上一版连接 lint），本轮实现 0016。core clipboard 发同步 nodes-copied 事件，复制全树配对原 metadata/新 ID，事件在历史快照前；内部 pasteSnapshot/原生 OpenPencil HTML 分支同样通知。local-identity 先确保跨文档副本也分配新 UUID，local-connections 再重映射本操作端点并同步几何；未复制端点继续引用原 UUID。没有按微任务猜复制批次。
- 93878 退出 0：connections-copy/result.json 完成 UI 复制两端+连接及撤销重做；78054 退出 0：connections-cross-canvas/result.json 在新标签通过实际 prepareCopy/pasteSnapshot，三实例新 UUID、端点引用副本、撤销重做保留，原移动/保存重开也通过。后者不是 OS 剪贴板测试，不修改用户剪贴板。
- 21065 完整 lint 退出 0，结构/类型 9/3 既有警告；既有 packages/core/tests/editor/clipboard 共 100 pass、0 fail、375 assertions、18 文件，退出 0。0016 已归档并 reverse check 通过，git diff --check 通过。
- 当前 C06.2 仍 doing。接下来补“只复制连线/单端+连线/嵌套容器”、节点与连接本身删除撤销及跨页边界；外部 FIG 粘贴路径尚未发本事件，需明确处理保留 metadata 的导入，不能宣称所有粘贴都已覆盖。再处理筛选端点隐藏联动、端点重选/吸附、标签/折线曲线。现阶段实现只连接右中点到左中点。
- 本轮所有测试终态；开发服务 31081 可复用，先核对存活。packages/core 发生改动，阶段生产构建前需 build:packages，不能仅拿开发页证明新安装产物。C05 已安装产物保持不变；未提交，完整 C00—C12 目标继续。


### C06.2 部分复制、删除撤销与筛选联动（2026-10-16）

- 77028 connections-partial-copy/result.json 退出 0：只复制连接保持原两端，源端+连接只映射源端；复制后撤销重做保持映射；连接本身删除/撤销恢复。选区测试夹具用 editor.select，动作由真实键盘执行；原 UI 创建/移动/保存及跨画布粘贴链仍通过。
- 0017 抽出 local-connection-data.ts 元数据解析共享，local-filter 将关联向量归为线条，并按显示树隐藏端点不可见的连接；只修改 view projection，不写 authored visible/几何。已有端点离页/被隐藏时连接隐藏，真正缺失端点保留原几何及缺失提示。嵌套子连接可加入隐藏集合，计数仍按根显示单元计算，面板文案补充连接跟随规则。
- local-filter 4 tests/18 assertions 通过；66129 connections-filter/result.json passed，实际筛选使目标隐藏，连接自身名称虽匹配仍隐藏，线段局部像素变化且清除后恢复完全相同，图快照不变；filtered.png 已查看。全链含部分复制/删除撤销/重开继续通过。
- 17505 完整 lint 退出 0，既有 9/3 警告；其后仅修正筛选面板根项计数表达式和说明文字，未重新跑无关测试。0017 reverse check 与 diff 检查通过。所有本轮测试终态，31081 开发服务可复用。
- C06.2 仍 doing：下一步优先实际嵌套容器变换/复制验证，修复发现的问题；随后外部 FIG 粘贴元数据重映射、端点重选/拖拽吸附、标签、折线/曲线。当前连接祖先翻转/缩放、自身变换、跨页和缺失端点策略仍需专项测试。不能以根节点直线通过宣称全部白板连接完成。C05 安装版不变，新 C06 源码尚待阶段生产构建。


### C06.2 嵌套连线与立即保存修复（2026-10-16）

- 上一轮仅核对和回答进度，没有实现推进。本轮恢复 connections-nested 失败，确认 24650 服务 PID 87748 存活后复用。未启动重复开发服务。
- connections-nested-trace（13711 退出 1）没有节点更新；connections-nested-history（61547 退出 1）捕获 history:changed 调用栈来自 nudge.ts 的 commitNudge。根因是方向键移动 300ms 后补交历史，立即保存的版本捕获早于历史提交；并非已证明的 FIG 导出修改几何。
- 0018-save-pending-nudge.patch：本机保存生成新快照前 flushNudge，等待一个微任务使分组派生连线同步，再检查会话代次并捕获版本。已有待重试快照不重写；真实并发编辑检测保留。补丁反向 apply --check 与 git diff --check 通过。
- 14466 connections-nested-fixed/result.json passed；15649 connections-nested-save-guard/result.json passed。新增实际浏览器探针覆盖父容器平移/90 度旋转/反射、连线重挂父容器、整体复制后后代 UUID 重映射、移动副本不改变原件、立即保存及新浏览器重开。夹具和部分变换使用 editor API，连接按钮/复制/方向键/保存使用真实 UI；不宣称所有变换来自鼠标。
- 扩展保存保护测试拦住实际 POST，期间修改副本位置，原保存返回后仍显示旧快照/有新改动；后续保存、新浏览器重开恢复新位置。截图 restored.png 已查看，两容器及连线可见。原始失败保留，没有增加等待掩盖问题或放宽保存断言。
- 完整 lint 17785 退出 0，结构/类型既有 9/3 警告、无错误；第一次命令相对 Bun 路径错误未启动检查，修正为 ../canvas-toolchain 后执行成功。所有本轮测试终态。
- C06.2 仍 doing。下一步处理连接自身翻转/缩放与跨页边界、外部 FIG 复制元数据重映射，然后端点重选/吸附、标签、折线曲线。当前 C06 新源码尚未进入生产安装包；C05 已安装产物未变。完整 C00—C12 目标继续，未提交用户工作树。


### C06.2 连接自身变换与跨页验证（2026-10-16）

- 上一轮为有效进展（立即保存修复及回归）。本轮先复核现场、当前连接源码和 24650/PID 87748 服务；没有重复启动服务。
- 44169 connections-transform-before/result.json 退出 1：嵌套连接自身 flipX 后，世界端点从 [535,269,485,309] 错为 [535,309,485,269]。现有几何相等判断忽略翻转标记，且更新没有清除此标记。
- 0019-connection-transform.patch：连接同步判断加入 flipX/flipY，派生几何更新统一清除自身翻转。绑定端点仍为几何权威，父容器翻转正常参与世界矩阵；架构文档明确该行为，不把它冒充可编辑锚点或曲线。
- 40559 connections-transform-fixed/result.json passed：连接自身 X/Y 翻转、45 度旋转、宽高修改后仍贴合端点，原嵌套/复制/立即保存/真实并发改动保护/新浏览器重开全链通过。变换用 editor API，不能宣称所有手柄交互已验收。
- 61797 connections-transform-pages/result.json passed：将端点移到另一页，嵌套连线被视图隐藏且不报端点缺失；移回后恢复显示和原世界端点。该路径使用真实 graph/reparent 与当前页面的实际过滤投影，不修改作品 visible。其后保存与新浏览器恢复仍通过。
- 70835 完整 lint 退出 0，结构/类型既有 9/3 警告。0019 反向 apply --check 与 git diff --check 通过，所有本轮测试终态。C06 新源码未进入安装包，C05 安装产物未改，未提交工作树。
- 下一步优先外部 FIG 粘贴元数据重映射，然后实现端点重选/拖拽吸附、标签与折线/曲线。已定位 clipboard.ts pasteFromHTML 的外部 FIG 分支（207 行起）未发 nodes-copied；需要先读解析与身份分配顺序，不能简单在身份已改写后反推源 UUID。C06.2 doing，完整目标仍为 C00—C12。


### C06.2 FIG 粘贴关联修复（2026-10-16）

- 上一轮为有效进展（自身翻转修复、跨页验证）。本轮读取 clipboard.ts 外部 FIG 分支、prepareClipboardImport 和 local-identity，确认导入计划在提交前保留原 pluginData，提交后 created 观察者可能改写身份。
- 新增 connections-fig.mjs，使用真实 buildFigmaClipboardHTML 编码与 pasteFromHTML 解析路径，确认 HTML 不包含 OpenPencil 私有粘贴标记。connections-fig-before/result.json 退出 1：副本虽有新身份，连线 source 不在副本身份集合内，复现仍指向原对象。
- 0020-fig-connection-copy.patch 在 operation.commit 前复制计划节点原 pluginData，提交后、历史快照前发 nodes-copied，复用现有新身份分配和端点重映射。包括计划内的后代与依赖节点，不按名字或当前选区猜测来源。
- 85214 connections-fig-fixed/result.json passed：同文档及全新浏览器文档粘贴，两端都指向新实例，撤销/重做保持映射。81129 connections-fig-persistence/result.json passed：再覆盖粘贴后移动目标、真实磁盘保存、新浏览器打开，三身份和端点几何保持；restored.png 已查看。
- 这是浏览器内真实 FIG HTML 导入入口验证；未操作系统剪贴板、未启动 Figma，不等于跨应用权限或任意第三方 FIG 内容均验收。未复制端点的跨文档缺失策略及损坏元数据仍保留专项边界。
- 现有 clipboard 单测 100 pass/0 fail/375 assertions、18 文件；11353 完整 lint 退出 0，既有结构/类型 9/3 警告。0020 reverse apply 检查与 diff 检查通过。所有本轮测试终态，未修改已安装 C05 产物，未提交工作树。
- 下一最小任务实现连线锚点重选及交互入口，继而拖拽吸附、标签和折线/曲线；不要继续只扩充已有直线测试而遗漏需求功能。C06.2 doing，C06—C12 仍未完成；core 改动在阶段生产构建前需 build:packages。


### C06.2 四侧锚点编辑（2026-10-16）

- 上一轮为有效进展（FIG 粘贴修复）。本轮实现 sourceAnchor/targetAnchor 可选 top/right/bottom/left；旧数据缺省源右/目标左，未知枚举保留原数据且不重算。世界矩阵仍负责旋转与祖先变换。
- 新增 local-connection-edit.ts，选中单根关系线时显示起点/终点四侧按钮；修改同一 pluginData，接入统一 undo，锁定节点禁用修改。LocalConnectionPanel 位于 LocalWorkspacePanel 顶部，避免被现有面板遮挡。0021-connection-anchors.patch 已归档、反向检查通过。
- 初次 78870 因 PropertiesPanel 被资产面板覆盖导致真实按钮点击超时；已移到同一面板，未用 force click 绕过。13623 connections-anchors-fixed/result.json passed；2704 connections-anchors-ui-state/result.json passed：真实 UI 选择下/上锚点、撤销重做、按钮 aria-pressed、目标旋转 90 度、保存及新浏览器重开一致。截图已查看。父对象创建和旋转为 API 夹具，不冒充鼠标变换。
- lint 42521 报不存在的颜色类与同步函数复杂度，已用 text-on-accent 并将默认锚点归入几何 helper；5310 报动态字段类型缩窄，66620 拒绝宽泛 Record 断言，已改 Object.entries 无断言逐项校验。最新完整 lint 35622 结构部分已通过，类型部分仍待终态，下一轮优先轮询该句柄，不重启。
- UI 两次通过发生在最终解析字段遍历的等价类型修正之前；交互及运行数据格式未再改。当前尚未实现拖拽端点/吸附、替换连接对象、标签或折线曲线，C06.2 仍 doing。C05 安装产物未变，新源码未打包，未提交工作树。下一步先完成检查，再实现拖拽锚点交互。

- 本轮收尾：35622 已退出 0，完整结构/类型 lint 通过，既有 9/3 警告；所有本轮测试终态，无待轮询检查。下一步直接继续拖拽端点交互。


### C06.2 拖拽端点首轮（2026-10-16）

- 上一轮为有效进展（四侧锚点编辑）。本轮新增 local-connection-drag.ts 与 LocalConnectionHandles.vue，挂入 EditorCanvas OS 模式，复用 drawnView 坐标与现有端点编辑历史；0022 补丁归档。
- 选中连接显示源/目标手柄；真实 pointer capture 拖动，当前页非隐藏/非锁定普通对象四侧中点在 14 CSS px 内吸附。拖动中不改作品元数据，松手命中才更新端点 UUID/侧并入一条历史；空白处松手、pointercancel、丢捕获与选区变化取消。源/目标共用逻辑；本轮实际测试目标手柄，不能宣称两端所有情况均验收。
- 54237 首次失败是 Escape 后编辑器已取消选中，测试未重选就查找手柄；产品原连接未改。测试改为点击真实图层项重新选中。91757 在缩放后直接取 boundingBox 得旧位置，误拖底层对象，失败保留；72297 改为 Playwright hover 等待手柄稳定后真实 mouse down/move/up，connections-drag-stable/result.json passed。没有 force click 或放宽几何断言。
- 已验证：Esc/空白松手保留原两端，近目标 2px 吸附并更换目标、撤销重做、0.7 倍缩放后换回另一对象上侧、真实磁盘保存及新浏览器重开。dragged.png 已查看。创建夹具/设置缩放使用 API，拖动动作与图层重选为真实指针。
- 51008 lint 类型阶段指出非必要可选链，修正后 93000 完整 lint 退出 0，既有结构/类型 9/3 警告。0022 reverse apply 与 git diff --check 通过。所有本轮测试终态，原 C05 安装产物未变，未提交工作树。
- C06.2 仍 doing。下一步补裁剪/面板遮挡下的吸附排除、源端及中断边界；再完成关系标签与折线/曲线，不能把首轮手柄当完整白板交付。仍需阶段生产构建（含 build:packages），完整 C06—C12 目标继续。


### C06.2 裁剪与面板遮挡吸附（2026-10-16）

- 上一轮为有效进展（端点拖拽首轮）。本轮确认 24650 服务 PID 87748 存活，读取当前实现；新增真实拖动至被父画框裁掉的子对象和右侧面板后对象的测试。
- 61492 connections-drag-visibility-before/result.json 退出 1：裁剪子对象不可见但仍吸附，终点错误变为 [900,640]，保留失败证据。
- 0023 新增 local-connection-visibility：将锚点逐层变换到祖先局部坐标检查 clipsContent；遍历排除 opacity=0 分支；拖动候选用 elementsFromPoint 跳过手柄层后确认实际最上层是当前编辑画布，排除 UI 面板遮挡，避免 pointer capture 绕过面板命中。几何数据及撤销格式未变。
- 70990 connections-drag-visibility-fixed/result.json passed：裁剪与面板覆盖下均不改变原连接，原目标拖拽/取消/缩放/保存路径通过。72912 connections-drag-both-ends/result.json passed：进一步真实拖动起点到第三个对象右侧，撤销重做恢复，保存新浏览器打开两端均保持。测试源对象/裁剪框通过 API 创建，拖动为真实指针，未使用强制点击。
- 92324 完整 lint 退出 0，结构/类型既有 9/3 警告，无错误；所有本轮测试终态。0023 已归档，反向检查与 diff 检查见本轮命令。未修改 C05 安装产物，未提交工作树。
- 剩余范围：普通场景对象互相遮挡的精确命中、旋转裁剪专项、指针中断专项尚未验收；当前先进入关系标签与折线/曲线实现，避免只围绕直线无限扩充边界测试。C06.2 doing，完整目标未完成；阶段生产包仍需重新构建。


### C06.2 直线、折线与曲线（2026-10-16）

- 上一轮为有效进展（裁剪与面板遮挡排除）。本轮实现可选 route=straight/elbow/curve，旧元数据缺省直线，非法枚举保留原文但不按有效关系重算。新增 local-connection-route.ts 生成 VECTOR 路径，折线为中间 X 三段路径，曲线为中间 X 水平切线三次贝塞尔；不是独立 DOM 渲染。
- 连线同步比较完整顶点和线段切线（数值容差 1e-5），不会在端点没动时忽略线形切换。local-connection-edit 提取统一 metadata change 入口，锚点和线形都进入原编辑器撤销历史；面板增加三种线形按钮。
- 35993 初次探针在新浏览器重开后立即读取尚未加载的节点而抛错；修正读取空场景返回 null 交给 expect.poll 等待。44474 connections-routes-fixed/result.json passed：真实 UI 切换、折线四顶点、撤销重做、曲线两端切线、目标移动后重算及保存新浏览器恢复。elbow/curve 截图已查看。
- 29990 connections-routes-copy/result.json passed：加入线形按钮 aria-pressed 等待、移开指针后的截图以及 Ctrl+D 复制曲线、验证 route/切线保留、撤销副本后保存重开。源对象创建和目标移动为 API 夹具，操作按钮、复制和撤销为真实 UI/键盘。
- 19151 完整 lint 退出 0，既有结构/类型 9/3 警告，无错误。0024-connection-routes.patch 已归档，reverse apply 与 diff 检查通过；所有本轮测试终态。C05 安装产物未改，当前源代码尚未阶段生产构建，未提交工作树。
- 仍有关系标签未实现，下一步接入标签编辑、随线移动与保存/复制/撤销；曲线当前不支持自由控制点、自动避障或锚点法向走线，退化直线/旋转父容器专项仍待核验。C06.2 doing，不因三种线形出现而关闭整个 C06。完整 C00—C12 目标继续。


### C06.2 关系标签首轮（2026-10-16）

- 上一轮为有效进展（三种线形）。本轮 label 元数据、真实 TEXT 子节点、关系面板输入/应用按钮、字体加载等待已实现；0025 补丁归档。标签子节点由父关系管理，内容随 metadata 撤销，复制保留子树，空文本隐藏而不销毁身份。
- 15801 connections-labels/result.json 数据断言虽 passed，但人工检查 label.png/export.png 没有文字，因此撤销其视觉验收含义。39647 加入异步字体加载后数据仍通过、截图仍缺字；10535 diagnostic 显式等待宿主 ensureGraphFonts 后 label-only.png 与 export.png 出现完整中文/英文，确认字体等待是当前缺口，不是证明 VECTOR 子节点无法渲染。
- 产品 setLabel 接入字体任务等待及应用按钮 loading，保留会话/文字变化检查。6133 connections-labels-ready/result.json passed，不再由测试调用字体 helper；实际 PNG 已查看，包含“参考素材 Reference”。覆盖真实输入与应用、标签撤销/重做、曲线及目标移动、复制子节点、PNG、真实保存和新浏览器恢复。字体失败仍警告且保留文字，尚无面板重试反馈，列为后续缺口。
- 87168 初版 lint 通过；88762 对 Promise then 返回规则报错，改显式返回后 67363 完整 lint 退出 0（既有 9/3 警告）。最后仅返回表达式修正，不改变加载/布局算法。0025 reverse apply 与 diff 检查通过，所有本轮测试终态。
- 当前定位采用连线包围盒中点上方、固定宽度 240。仍需水平/垂直短线导出范围、标签与线重叠处理、多行长文本、清空/删除恢复和外部 FIG 标签往返专项；不以本轮斜线导出证明全部标签验收。下一步优先水平线导出与标签可读性，再做阶段整合构建。C06.2 doing，C05 安装产物未改，未提交工作树，完整目标继续。


### C06.2 短线导出与长标签排版（2026-10-16）

- 上一轮为有效进展（关系标签及字体等待）。本轮扩展真实探针：20px 水平连线、标签宽于线段、清空标签撤销、删除关系及撤销、新浏览器恢复。33975 首轮因图层名与属性标题同名导致 strict locator 失败；限定 layers-scroll 后 65263 connections-labels-short/result.json passed。水平导出 PNG 已查看，完整包含中文/英文标签与短线，不裁到线段包围盒。
- 38381 connections-labels-long-before/result.json 退出 1：重复中英文长文本后高度仍为 36，原 runLayoutForNode 不为自由文本计算内容高度。
- 0026 将字体加载后布局切换到现有 layoutAuthoredNodes(graph,[labelId])，先测量文本再布局。73011 connections-labels-layout/result.json passed：高度随长文本增加，长标签和短线 PNG 已查看，八行文字完整；清空撤销、删除撤销、保存重开继续通过。未更改用户现有 FIG 的全局导入策略，只在标签文字编辑后调用。
- 0026 reverse apply 与 git diff --check 通过；完整 lint 37203 的最终结果见本轮收尾。源码未打入 C05 安装包，未提交工作树。
- C06.2 仍 doing：标签与斜线重叠、字体失败反馈、外部 FIG 带标签复制仍需补；之后需整合构建和原 C06 连线回归，并按 C06 能力矩阵继续白板/设计其它承诺项。当前完成水平短线和长文本边界不等于整个 C06 已完成。

- 本轮收尾：37203 完整 lint 退出 0，结构/类型既有 9/3 警告，无错误；所有本轮测试终态，无待轮询句柄。


### C06.2 带标签 FIG 回归与整合构建启动（2026-10-16）

- 上一轮为有效进展（短线导出、长标签高度修复）。本轮扩展 connections-fig.mjs：先用真实 UI 设置中文标签和曲线，使用真实 FIG HTML 编解码粘贴，同文档/全新文档均断言标签子节点、label/route 元数据和两端新 UUID，覆盖撤销重做、目标移动、保存新浏览器恢复。
- 8978 connections-fig-labels/result.json 退出 0；restored.png 已查看，曲线和“来源说明 Source”可见。未使用系统剪贴板或操作 Figma 应用，不能宣称跨应用权限已验收。已发现标签与线局部相交仍需视觉修复，未隐去该缺口。
- C06 README 顶部修正过时“所有条目尚未验证”措辞，明确基础编辑与连接已验子流程，保留其它白板/设计能力待办，不用连线实现替代全部 C06。
- 52362 正在运行 scripts/canvas.ps1 build（Python 捕获实际退出码，Node24，清除原型环境变量）；日志 output/dev-evidence/canvas-c06/build/integration.log，终态写 integration.exit.txt。已观察核心及依赖包构建完成并进入 lint；最近结构检查 9 warnings/0 errors，类型/Vite 终态尚未取得。未因观察超时重启。
- 下一轮先轮询 52362。成功后使用 scripts/canvas.ps1 local-preview 配独立数据目录和空闲端口，运行不依赖 Vite 源模块的 connections-labels.mjs 做生产页验证。connections-fig.mjs/points helper 的动态 /packages 导入属于开发验证，不能直接拿到生产页冒充通过。构建期间不并行修改被编译源码。
- 本轮只扩展测试和进度文档，未改运行源码；C05 安装产物未变，未提交工作树。C06.2 doing，完整目标继续。


### C06.2 生产整合终态与标签避让（2026-10-16）

- 上一轮仅回答进度，属于无实现进展；本轮复核真实证据继续 C06.2。integration.exit.txt=0；production-labels、production-routes、production-basic-editing/result.json 均 passed。0014—0026 完整构建及生产页验证通过，未据此宣称原生安装验收。
- 本轮开始确认开发服务 24650/PID 87748、生产预览 24750/PID 56704 正在监听，复用服务，没有重复启动。两者独立数据目录沿用前轮记录。
- 83812 labels-overlap-before 退出 1，标签下缘 94 落入路径范围。0027-connection-label-clearance.patch 将标签置于路径包围盒上方，至少 6 间距且考虑粗描边。当前三种路由控制点都在端点包围盒内，此规则不声称支持未来任意自由曲线。
- 82107 labels-overlap-fixed 退出 0：真实 UI 三种线形间距、标签撤销重做/复制、PNG、水平短线/长文本、清空/删除撤销、磁盘保存及新浏览器重开通过；export.png 已查看，文字不再与曲线相交。代价是陡线标签离路径较远，后续需更紧凑布局；不将此描述为自动避障。
- 31728 完整 lint 退出 0，既有结构/类型 9/3 警告。0027 reverse apply 检查通过。未改 C05 已安装产物、未提交工作树。本轮测试终态，无待轮询检查。
- 证据边界：生产预览构建覆盖至 0026；0027 已改运行源码，只在开发页验证，须在下一阶段构建纳入。C06.2 仍 doing，字体失败可见反馈与重试、场景遮挡/中断边界仍待完善；随后继续 C06 能力矩阵，完整 C06—C12 未完成。
- 下一动作：读取 local-connection-edit.ts、LocalConnectionPanel.vue 和 fonts.ts，为字体失败提供面板反馈和重试，使用受控字体失败复现，再继续其它白板承诺项。


### C06.2 标签字体失败反馈与重试（2026-10-16）

- 上一轮为有效进展（标签避让）。本轮读取真实源码确认字体模块是 fonts/index.ts，面板在 components/editor，而非现场简写路径；继续复用 24650 开发服务完成浏览器测试。
- 0028-connection-label-font-retry.patch：按 SceneGraph 保存响应式失败集合，加载异常时在关系面板显示“标签字体加载失败，文字已保留”和重试按钮；旧图或已改变文字的异步异常不写入当前错误状态。重试沿用宿主 collectFontKeys/resetWebFontFailures/fontResolver.reset，重新加载与布局，不修改关系元数据、不增加撤销项。空标签清理错误，选中不同关系按对应 ID 显示。
- 88112 labels-font-retry/result.json 退出 0：测试在真实开发浏览器中对 fontManager.loadFont 注入一次拒绝并自动还原，再通过真实 UI 应用标签、查看错误、点击重试；文字保留，提示消失，一次撤销仍撤销标签。其后三种线形、复制、短线/长文 PNG、清空/删除撤销、磁盘保存、新浏览器重开全通过。font-failed.png 已查看。此为受控加载器异常，不冒充真实离线网络及所有字体缺字场景验收；正常返回 null 的缺失字体仍由宿主通用字体状态处理。
- 74048 完整 lint 退出 0，结构/类型既有 9/3 警告；0028 reverse apply 检查通过。所有本轮测试终态。补丁基于 0027 后精确源码增量生成，未提交工作树、未改 C05 安装版。生产整合证据仍只覆盖至 0026。
- C06.2 主要交互路径已实现；场景对象遮挡精确命中、指针中断边界、异步更换文档专项及更紧凑标签定位仍保留，不宣布整个 C06 完成。下一轮优先按 C06 矩阵盘点便签/列表/画笔实际入口，将发现的缺口拆成 C06.3，避免继续无限扩充连线边界；在 C06 阶段整合时统一纳入 0027/0028 并执行必要回归。


### C06.3 列表与自由画笔实际验收（2026-10-16）

- 上一轮为有效进展（标签字体错误反馈）。本轮按 C06 矩阵切换至列表/画笔/便签，C06.2 保留阶段整合和边界待办，不作为第二个正在实施任务。开发服务 24650/PID 87748 已确认监听并复用。
- 源码检查：上游 PENCIL 通过 Shift+P 提供，列表在文字编辑模式通过 Ctrl+Shift+8/7 切换、Tab/Shift+Tab 缩进；未找到便签专用入口，不把普通文本当便签交付。
- 新增 apps/canvas/probes/lists-pencil.mjs。31320 首轮退出 1，真实列表/画笔/撤销已通过，失败在保存重开严格对象相等：FIG float32 曲线精度和描边默认属性补全。读取实际格式编解码及 canvas/strokes.ts 后按格式精度和渲染回退规则规范化测试快照，保留原始失败。
- 24994 lists-pencil-roundtrip/result.json 退出 0，中文两段、有序/无序列表、缩进/减少缩进、自由曲线鼠标绘制、撤销重做、实际磁盘保存及新浏览器重开通过；restored.png 已查看，编号和白色笔迹清晰。不是通过 API 造列表/曲线替代交互。列表内容、段落样式及曲线完整网络同时比较。
- 本轮仅测试与文档改动，无运行源码变化，无需重复 lint/build；所有测试终态，无待轮询句柄，未提交。C05 安装版未变，生产整合仍待纳入 0027/0028。
- 下一最小任务 C06.3 便签：在 OsCanvasWorkspace 提供真实创建入口，复用 FRAME/TEXT 与统一撤销/复制/FIG 保存，不引入另一套场景；需正文可编辑、颜色/尺寸、拖动、复制、撤销和重开。先读现有 createShape/history 与文本编辑入口，避免创建一张仅能展示不能编辑的卡片。富文本样式与其它 C06 矩阵条目仍待验证，完整 C06—C12 未完成。


### C06.3 便签首轮实现（2026-10-16）

- 上一轮为有效进展（列表/画笔实际验收）。本轮新增 local-note.ts 和 OsCanvasWorkspace 新建便签按钮，0029-local-notes.patch 归档；FRAME+TEXT 复用统一场景，浅纸面深字、240×200、16 内边距、文字自适应高度/水平拉伸，os.canvas/note=1 标记。创建用 undo.runBatch，随后直接进入文字编辑并聚焦当前工作区画布。
- 72242 notes/result.json 退出 0：真实点击创建、中文两行输入、正文撤销、整张创建撤销、重做、图层选择、复制和方向键移动、真实磁盘保存及新浏览器重开。restored.png 已查看。颜色/尺寸交互、长文撑开卡片、重开后再次编辑仍待验，不能标便签完成。
- 53164 lint 指出 Vue 全局 document.querySelector，改 useTemplateRef 的工作区局部查询；54625 完整 lint 退出 0，既有结构/类型 9/3 警告。第一次 lint 命令从根使用相对 Bun 路径未启动，改正确 cwd 后执行。0029 reverse apply 通过；未改安装包、未提交工作树。
- 2763 notes-drag 失败：真实拖便签空白区域后 x 仍 600 而非 400；29369 notes-title-drag 也失败，标题区域拖动后位置不变。两份失败保留，后者截图已查看，没有靠删除断言把拖动写成通过。需诊断工具/编辑态、事件命中和 FRAME 选择规则，尚未证明是上游画框固有行为。
- 当前 C06.3 doing；所有本轮检查终态。下一轮先复现便签拖动，记录 activeTool/editingTextId/选区及 pointer 事件实际目标，定位后修复，再验证颜色/尺寸与长文及重开编辑。0029 的完整基本通过发生在局部查询改动之前；新探针已在局部查询版成功创建/编辑，但在拖动处停止，修复后须跑完整保存链。


### C06.3 便签拖动定位与自动布局（2026-10-16）

- 上一轮为有效进展（便签首轮及拖动失败）。本轮确认 24650/PID 87748 存活后复用，继续诊断，未重复启动。
- 45387 notes-drag-diagnostic、54545 notes-drag-hit 均退出 1，但带来新证据：SELECT、editingTextId=null、enteredContainerId=null、选中 FRAME，真实目标为 canvas；hitTestSelectable 对便签空白返回 null，拖动后清空选区。不是文字编辑抢输入或 DOM 覆盖。scene-graph/hit-test.ts 明确普通顶层 FRAME 空白用于框选，自动布局 FRAME 则 ownsItsEmptyArea。
- 0030-note-auto-layout.patch 改便签为 VERTICAL 自动布局，纵向 HUG、横向 FIXED、minHeight=200、四边 padding16，正文 STRETCH。复用现有命中/拖动和布局，无新场景或覆盖层拖动实现。
- 40116 notes-layout-drag/result.json 退出 0：真实拖空白区移动 [-200,+100]，创建/中文正文两级撤销重做、复制、方向键移动及保存新浏览器恢复通过，覆盖上一轮局部模板引用版本。
- 60722 notes-long-reedit/result.json 退出 1：新浏览器重开后真实双击正文编辑成功，长文将纸面撑高至 890、正文高度 858；保存再开，正文仍在但 FRAME 高度回到 200。失败在第二次 roundtrip，不放宽断言；long-note.png/failure.png 已生成，尚待视觉复核。这是新增布局持久化/恢复缺口，不将便签整体标完成。
- 15270 完整 lint 退出 0，既有结构/类型 9/3 警告；0030 reverse apply 检查通过。所有本轮测试终态，未提交、未改 C05 安装包，生产构建仍待纳入 0027—0030。
- 下一动作：对比长文保存 FIG 的 authored/derived 尺寸和重新打开布局时机，读取 local-workspace 与布局恢复路径，定位 890→200；保留 notes-long-reedit 原失败，修复后用新证据目录验证长文再编辑与两次重开。颜色/尺寸交互、完整 C06 矩阵仍待完成，C06.3 doing。


### C06.3 长便签尺寸保存修复（2026-10-16）

- 上一轮为有效进展（拖动修复及长文重开失败）。77736 notes-long-source 再现失败并新增证据：保存前 frame.height=890，但 source.editedFields=[]、source.fig.rawSize.height=200、derivedLayout.height=200。FIG exportNodeSize 按有效 rawSize 导出旧值；不是正文丢失。
- 根因 SceneGraph.updateNode 对所有 isApplyingLayout 都跳过来源字段编辑标记，无法区分用户编辑引起的布局与导入/字体派生布局。0031-authored-layout-source.patch 改为只跳过 isApplyingDerivedLayout，保留 sourceMetadataPreservationDepth 保护。新增单测验证派生加载不标 height、普通布局编辑标 height，不重排导入整页，也不在便签打开时强塞尺寸。
- 44859 notes-long-layout-source/result.json 退出 0：便签创建、文字编辑、撤销重做、真实拖动、复制、第一次保存重开、真实双击修改长文、撑高及第二次保存重开全部通过。long-note.png 已查看，长纸面和文字可见；第二次恢复通过完整快照断言。
- 68688 原定回归 138 pass/4 fail，四项 FIG patch 测试因 Core getCanvasKit 默认 Windows file URL pathname 带 /C:/ 而无法加载 wasm，非断言失败。用 .runtime/c06-canvaskit-preload.ts 通过现有 getCanvasKit({locateFile}) 显式文件路径初始化，不改生产 CanvasKit；重跑 basic、FIG patch、editor/text 得 155 pass/0 fail/1680 assertions、15 文件，命令已在本轮工具记录。没有把第一次失败隐藏。
- 完整 lint 85323 终态见本轮收尾；0031 reverse apply 检查通过。改动涉及公共场景图编辑来源，下一轮需补相关 layout/derived 回归及连线标签保存回归，然后阶段构建；不能凭便签单项通过认定所有旧功能无影响。C05 无关目录/落盘证据保留，当前新 C06 源码整合仍 verifying。
- C06.3 doing，便签颜色/尺寸入口待完善；未提交，未改安装版。生产构建仍覆盖至 0026，0031 和其它新补丁尚未整合。

- 本轮收尾：85323 完整 lint 退出 0，既有结构/类型 9/3 警告；所有本轮检查终态，无待轮询句柄。下一步直接做公共布局影响回归。


### C06.3 公共布局回归与生产整合（2026-10-16）

- 上一轮为有效进展（长便签尺寸来源修复）。本轮先复核 24650/PID 87748 与生产预览 24750/PID 56704 监听，复用既有服务；无重复进程。
- 公共布局影响回归：Bun test --preload ../c06-canvaskit-preload.ts，覆盖 core/tests/layout、editor/layout、text/derived-text、FIG export/layout-edit-export 和 instance/derived-geometry；71 pass/0 fail/271 assertions、16 文件，完整日志 layout-regression.log。包括 saved-geometry 及派生尺寸，不只新便签用例。
- 79462 labels-after-layout-source/result.json 退出 0：开发页连线标签输入、三种线形、复制、撤销、短线/长文 PNG 及保存重开通过。
- 97571 scripts/canvas.ps1 build 退出 0（build/notes-integration.exit.txt=0，日志 notes-integration.log）。核心/依赖包、结构与类型检查、Vite/PWA 均通过，既有 9/3 lint 警告和 States 示例组件命名告警保留；本轮构建覆盖至 0031，不再仅覆盖 0026。
- 48449 notes-production/result.json 退出 0：真实生产页 24750，新建便签/正文输入/撤销重做/真实空白拖动/复制/第一次保存重开/双击长文编辑/撑高/第二次保存重开全通过。95756 labels-production-0031/result.json 退出 0：相同生产构建的标签正常编辑、导出、历史和保存回归通过。两探针没有动态源模块注入；字体失败注入模式本轮未运行，不宣称生产离线故障已验。
- 架构文档补充便签 FRAME/TEXT、布局与统一历史，以及编辑布局/派生布局来源标记边界。没有运行源码新改动，无需重复 lint；所有本轮检查终态，未提交工作树、未更新 C05 安装产物。
- C06.3 继续 doing：下一步解决便签颜色/尺寸的实际操作入口与验收（当前 LocalWorkspacePanel 覆盖属性区需明确整理，不能让可编辑属性藏在遮挡后），再继续富文本与 C06 能力矩阵。完整 C06—C12 未完成；生产页通过不等于桌面新安装验收。


### C06.3 属性面板可达与便签样式（2026-10-16）

- 上一轮为有效进展（生产整合）。本轮实现 0032-workspace-panel-switch.patch：资产面板可切换显示，点击属性按钮先收起资产面板；属性面板只在资产面板隐藏时显示，消除覆盖。v-show 保留资产草稿/运行状态。assetsOpen 仅当前工作区内存状态，默认显示；完整布局保存归 C11，不冒充本轮实现。属性可见开关沿用已有 local-layout。
- 83231 notes-properties 退出 1，测试误把宽度当常驻 input；实际 NumberField 点击显示值后才产生编辑输入，失败截图确认属性区可达。按真实点击流程调整，无 force click。
- 52770 notes-properties-input 退出 0：原生属性控件宽度 240→320、填充 EEEEEA→DDE6D5、复制与两次保存重开、长文编辑通过。72435 notes-properties-history 退出 0，进一步确认切换保留目录草稿、两次撤销颜色/宽度、两次重做。测试只填写合成草稿 note-panel-draft，没有添加真实目录。
- 视觉复核发现两次 properties.png 中纸面颜色/宽度正确但正文不显示，标题也有异常字形；restored.png 重新打开正文正常。数据通过不能证明即时显示正确，C06.3 继续 doing。尚未确定是字体加载、缓存/重绘还是控件生命周期，不能宣称样式已完整验收。
- 74627 完整 lint 退出 0，既有结构/类型 9/3 警告；0032 reverse apply 检查通过。本轮测试终态，未提交、未更新安装包。生产构建仅覆盖至 0031。
- 下一动作：围绕属性切换/改宽/改色三个时点分别截图并记录字体状态、文本尺寸/可见性及渲染帧，定位正文消失；必要时导出 PNG 区分显示缓存和内容渲染。保留原截图证据，不以延长睡眠或测试强制字体加载冒充产品修复。


### C06.3 便签首次文字显示诊断（2026-10-16）

- 上一轮为有效进展（属性面板可达及显示缺口发现）。本轮阶段截图纠正假设：created-text 和 before-properties 已无正文，属性切换/改宽不是首个触发。styled-export.png 也无文字，不只是屏幕缓存。
- 75233 notes-display-stages、96775 notes-display-export 数据流程退出 0，但图片不通过；字体状态 Inter available/bundled、未 blocked、正文 visible/opacity1，文本高度22且 textPicture=false。数据通过不得记视觉通过。
- 8681 notes-display-history 捕获 created-text/after-redo 均缺字。其后修改开发源码发生 HMR，最终恢复断言失败（空场景），该次终态不能拿来判断正常持久化；以后等待浏览器验证终态再修改运行源码。
- 尝试在空便签创建后 await ensureGraphFonts 再进入编辑，77246 notes-font-prepared 数据通过、created-text 图片仍缺字，证明空文本准备不够。27722 lint 通过只针对该尝试；已按精确备份 .runtime/c06-note-font-before.json 恢复两个源码文件，未保留无效修复、未生成 0033。当前运行源码仍为 0032。
- 51864 notes-font-content-diagnostic 退出 0：测试在真实输入完成后调用宿主 ensureGraphFonts(graph,[noteId],renderer) 和 layoutAuthoredNodes，再 requestRender；diagnostic-font-ready.png 已查看，中英文正文和标题正常，正文高度22→52。随后属性、历史、保存及长文重开通过。该路径有测试专用调用，明确不是产品修复。
- 探针新增 OS_CANVAS_NOTE_DIAGNOSTIC 阶段截图/字体状态与 OS_CANVAS_NOTE_FONT_DIAGNOSTIC 内容字体诊断，默认关闭；正常生产探针不动态导入源码。原失败证据均保留。
- 下一动作：将实际正文变化后的字体准备接入便签产品流程，处理异步旧图/旧文字、编辑中焦点、失败反馈与重试；复用宿主字体加载，必要时限定布局范围，避免给整页无关对象重排。验收必须关闭 FONT_DIAGNOSTIC 仍得到可见正文与 PNG，再跑历史/保存回归。C06.3 doing，未提交、未改安装版，构建仍至0031。
- 所有本轮进程终态，无待轮询句柄。此次收获为明确根因方向和排除无效实现，产品显示缺口仍未关闭。


### C06.3 便签正文实时字体准备（2026-10-16）

- 上一轮仅答复进度，属于 no progress；本轮重新核验源码、结果和进程后继续修复。旧 62508 句柄已不存在，notes-live-fonts/result.json 为 failed（保存前正文高度 22、重开后 52）；旧 2550 lint 为失败，fontStyle 不属于 SceneNode。没有把未知句柄当运行中重启。
- 新增 0033-note-live-fonts.patch：正文实际变化后复用 ensureGraphFonts，监听 node:previewUpdated（编辑中的预览变化）及 committed/create/delete/graph replace；完成后用公开 updateTextEditNode 重新测量当前正文和相关父布局。校验图、节点实例和正文/样式签名，避免异步结果覆盖新内容；WeakMap 按节点实例记录尝试，撤销重建不会复用旧实例记录。组件卸载解除订阅。
- 字体异常使用 AppAlert 保留正文并提供重试；重试清除字体失败缓存。此轮只验证正常字体路径，尚未做失败注入、延迟期间切换作品与连续输入的独立边界验证，不宣称异常路径全部验收。
- notes 探针新增首次正文排版高度条件，在撤销和保存前确认两行文字已排版；不调用测试专用字体加载。22743 notes-live-preview 与最终 9579 notes-live-final 均退出 0、result passed，OS_CANVAS_NOTE_FONT_DIAGNOSTIC=0；涵盖首次输入、撤销重做、空白拖动、面板切换保留草稿、宽度/颜色及撤销、复制、长文本自适应与两次新浏览器保存重开。created-text.png、styled-export.png 和最终 properties.png 已人工查看，中英文正文实际可见。
- 38455 与最终 29342 完整 lint 退出 0，保留既有结构/类型 9/3 warnings；0033 reverse apply --check 与 git diff --check 通过。补丁以 .runtime/c06-note-live-before.vue 为组件精确前态生成，未重写旧补丁。
- 本轮所有探针和 lint 已终态。复用 24650/PID 87748 开发服务；未替换 C05 安装版，生产构建仍只覆盖至 0031。0032/0033 尚待生产整合验证；C06.3 doing，完整 C06—C12 不变。
- 下一动作：验证字体延迟/失败重试与撤销删除的异步边界，再阶段构建和生产便签回归；通过后继续富文本能力矩阵，不重复已通过的无关 C05 检查。


### C06.3 便签异步边界与生产整合（2026-10-16）

- 上轮为有效进展（0033 实现与正常路径验证），本轮读取最新现场与源码，核验开发 24650/PID87748 和生产 24750/PID56704 后复用服务；未修改运行源码。
- 新增 apps/canvas/probes/notes-font-boundaries.mjs：在开发环境通过公开字体加载器受控拒绝/延迟，实际界面重试与键盘编辑；不在产品中加入测试开关。71670 首轮失败：一次性 keyboard.insertText 多行后末行重复；原失败保留，尚未认定为字体异步缺陷或真实粘贴缺陷。改为 Enter 换行并在释放字体前断言文字，31928 notes-font-boundaries-keyboard 退出0。后续富文本任务需核查多行注入与真实粘贴的差异。
- 61671 notes-font-boundaries-graph/result.json passed、退出0：加载器拒绝时正文保留且 UI 显示错误，点击真实重试按钮恢复；延迟期间新文本与输入焦点保留，继续输入正常；删除后加载完成不复活，撤销删除后的实例正常准备；公开 replaceGraph 替换场景后无旧便签/错误写入。该项是公开接口边界测试，不冒充用户切换标签完整流程。错误提示与最新正文截图已人工查看，控制台无错误。
- 99918 scripts/canvas.ps1 build 退出0，build/note-live-fonts.exit.txt=0，日志 note-live-fonts.log；包构建、结构/类型检查、Vite/PWA 完成，生产构建现在覆盖至0033，保留原有警告。未新增公共内核改动，未重复无关 C05/公共布局测试。
- 65143 notes-production-0033/result.json passed、退出0：实际生产24750、两个诊断开关均关闭，无源码模块注入；首次正文排版、历史、空白拖动、属性颜色/宽度、面板草稿保留、复制、长文字撑高与两次新浏览器重开通过。properties.png 已查看，中英文正文可见。
- C06 能力矩阵修正“便签未找到入口”旧描述。C06.3 的便签子流程已有正常/受控异常开发验证和正常生产验证；不把受控加载器失败等同于所有真实断网/永久缺字体情况通过。C05 安装版未更新，C06—C12 目标保持。
- 本轮构建、探针全部终态，无待轮询句柄；未提交工作树。下一动作：沿 tests/e2e/text/formatting.spec.ts 的宿主能力核验实际 OS 模式富文本样式（局部选择/字体样式/撤销重做/保存）及多行粘贴，不停留在反复验证便签；C06.3 继续 doing。


### C06.3 富文本样式与粘贴路径验证（2026-10-16）

- 上轮为有效进展（异步边界与生产整合），本轮读取最新记录和宿主格式化/键盘/剪贴板源码，继续能力矩阵；没有修改产品源码或重建已通过的0033。
- 新增 apps/canvas/probes/rich-text.mjs：真实键盘局部选择、Ctrl+B/I/U、撤销/重做、保存与全新浏览器重开。首轮 rich-text 未等字体 paragraph 可用，选区不存在导致全段加粗；42040 rich-text-selection 错误要求单行 Latin 高度>22（实际合法高度22），保留失败。改为真实 paragraph 就绪后断言选区[7,11]。
- 57071 rich-text-range 的部分格式化/历史通过，重开严格比较发现格式转换显式补入继承字体 Inter，失败保留。仅将缺省fontFamily按节点继承展开，保留其他所有样式和区间；39043 rich-text-effective 退出0、passed。确认 Normal 前缀普通，Bold 仅4字符加粗/斜体/下划线，截图 restored.png 可见。
- 82630 rich-text-paste 退出0、passed：受控浏览器 clipboard.readText 提供两行中英文，由真实 Ctrl+V 触发宿主粘贴，再验证文字、撤销恢复富文本、重做和二次保存重开。没有改系统剪贴板，不冒充系统权限与外部HTML格式验收。该粘贴路径未复现前轮 keyboard.insertText 多行重复；注入差异仍留待输入诊断，不认定全部粘贴完成。
- 8660 rich-text-production 退出0、passed，同一流程在已构建0033的生产24750通过；不依赖源码模块导入。未修改产品源码，无须额外lint/构建。未替换C05安装版。
- 新视觉/生命周期待办：英文正文的便签标题中文缺字（rich-text-effective/restored.png），含中文正文时标题正常（rich-text-paste/paste-restored.png）；字体准备不能只覆盖正文。另外新浏览器重开截图出现“有未保存改动”，需要定位0033重新测量是否引起无操作脏状态。不能只因格式快照通过宣称作品恢复完全正确。
- 当前所有探针终态，无待轮询句柄。未提交，C06.3 doing，C06—C12完整范围保留。下一动作：先检查字体完成后重复updateTextEditNode与文档dirty来源，避免打开无变化作品被标记修改；同时给便签标题准备所需字符。然后继续字号/颜色/对齐等富文本属性与实际剪贴板范围，按风险补对应回归。


### C06.3 打开便签的脏状态与标题修复（2026-10-16）

- 上轮为有效进展（富文本验证及新缺陷发现）。本轮读取 local-note-fonts、local-workspace 与 io/changes：文档跟踪忽略 isApplyingLayout，但0033直接 updateTextEditNode 即使文字相同也发出内容更新，成为无历史编辑。
- 0034-note-layout-and-title.patch：以 withLayoutMutations 包住字体完成后的同文测量，抑制非编辑脏标记而保留0031普通布局的尺寸来源；没有调用 markSaved 清掉真实新编辑。标题名称参与签名，独立 ensureFallbackPack(['cjk'], name)，空正文亦准备。未改公共内核。精确前态 .runtime/c06-note-clean-before.ts；旧补丁未重写，0034反向检查通过。
- 47957 rich-text-clean-title passed、退出0：新增打开后已保存UI与 hasUnsavedChanges=false 断言，富文本/多行粘贴/历史/两次重开通过。20988 notes-clean-layout passed、退出0：中文、属性、复制及长文本高度在两次重开后保留，布局来源未回退。
- 首张 clean-title/restored.png 仍缺标题字，进一步14682 rich-text-title-ready 只读轮询 public getCJKFallbackFamilies，未执行测试字体加载；退出0、passed，restored.png 已查看，中文“便签”和英文局部样式均可见，保存状态正常。证据证明异步完成后正确，不声称首次帧没有等待。
- 42347 notes-font-boundaries-0034/result.json passed、退出0，复验受控加载器失败重试、延迟编辑/焦点、删除撤销及图替换。20029完整lint退出0，保留既有结构/类型9/3warnings。git diff --check通过。所有本轮进程终态。
- 本轮修复归档且文档更新，未提交，未更新安装版；生产构建仍至0033。C06.3 doing，C06—C12范围不变。下一动作：阶段构建0034并生产回归rich-text（诊断开关关闭），随后继续字号/颜色/对齐等属性和画板剩余能力；系统剪贴板权限/外部HTML粘贴仍待验证。


### C06.3 0034生产整合与文字属性（2026-10-16）

- 上轮为有效进展（0034修复），本轮复核当前记录与服务后复用24650/24750。72636完整build退出0，build/note-layout-title.exit.txt=0；包、结构/类型、Vite/PWA完成，保留既有警告。生产已覆盖0034，不再仅0033；安装版未更新。
- 扩展rich-text.mjs的可选OS_CANVAS_TEXT_PROPERTIES路径：实际属性面板字号18→24、水平居中、文字颜色884422，保留局部加粗/斜体/下划线；改色撤销/重做及两轮保存/新浏览器重开。快照新增字号、行高、字间距、对齐和填色，行高/字间距本轮未操作，不声称其交互已验收。
- 初次rich-text-properties失败在fill作用于div；13582 rich-text-properties-input失败在点击后spinbutton形态变化，旧定位失效。截图确认编辑输入框实际出现，改为点击后input:focus，不更改产品实现。97987 rich-text-properties-focused退出0、passed；restored.png已查看，24号棕色居中，已保存状态正确。
- 27481 rich-text-properties-production退出0、passed：真实生产24750，TITLE_DIAGNOSTIC=0，无源码模块注入；上述属性、历史、保存后hasUnsavedChanges=false、多行受控粘贴与重开通过。仅受控clipboard.readText数据，不冒充系统权限/HTML富文本粘贴。
- 首次重开截图仍可早于中文标题/斜体异步字体完成；0034先前title-ready已验证等待实际字体后正确。本轮不把第一帧渲染当完整字体加载证据，首次字体加载提示/体验仍有优化空间。
- 本轮无产品源码变更，无需新增补丁或重复构建；探针与文档更新，未提交。所有构建/探针终态，无待轮询句柄。C06.3及C06整体仍doing；C07—C12未缩减。
- 下一动作：推进C06画框/分区/命名/导航的实际UI能力，参考上游section与frame测试，覆盖布局与保存；富文本行距/字距/系统剪贴板与HTML支持仍保留在矩阵，不因当前子流程通过而标全量完成。


### C06.4 分区、嵌套画框与导航首轮（2026-10-16）

- 上轮为有效进展（0034生产与文字属性），本轮沿需求矩阵推进新能力，无产品源码更改。新增 apps/canvas/probes/sections-frames.mjs，以真实鼠标/键盘建立SECTION→FRAME→RECTANGLE，图层双击中文命名。
- 14880首轮sections-frames失败：图层面板焦点下Enter保持FRAME，未进入子层；截图表明结构创建正确。明确canvas.focus后91871 sections-frames-focus退出0、passed，验证Enter子对象、Shift+Enter父框、Shift+Right移动父框10px且子相对坐标不变、撤销/重做、保存新浏览器重开。
- 83982 sections-frames-production失败：测试假设适配选区应zoom>1；实际已居中，viewport.ts明确Math.min(...,1)。改验选中画框几何中心与canvas中心误差<1px，并保存/重开精确比较视角。77162 sections-frames-centered在生产24750退出0、passed；view={zoom:1,panX:180,panY:38}；restored.png已查看：结构正确，但画布中文标题缺字，图层树中文名称正常；数据通过不能证明标题渲染通过。无源码注入，图形均真实UI创建，仅测试配置和状态读回使用公开store。
- 新增证据写入C06 README。未新增产品补丁，无须重跑lint/构建；生产仍至0034，C05安装版未更新；未提交工作树。所有本轮探针终态。
- C06.4首轮子流程已验证，C06整体仍doing。完整窗口避让、跨分区重排、锁定/隐藏、裁切、搜索定位、画框遍历和演示尚未完成；富文本剩余项继续保留。下一动作：优先用实际属性/图层入口验证裁切、锁定/隐藏及层级重排的历史和保存，补齐对象管理；不能用当前一次嵌套成功替代完整矩阵。

- 截图复核补充：0034只覆盖便签标题，普通SECTION/FRAME的中文标题在新浏览器重开仍缺字。本轮不标中文画布标题显示通过；下一动作先将名称字体准备纳入通用画框/分区生命周期（非只便签），再继续对象管理。


### C06.4 通用标题字体准备（2026-10-16）

- 上轮为有效进展（分区验证及普通标题缺字发现），本轮新增0035-canvas-title-fonts.patch。useLocalTitleFonts统一准备FRAME/SECTION/COMPONENT/COMPONENT_SET/INSTANCE名称所需CJK/Arabic fallback，名称去重、按名称更新而不是每次几何变化加载，串行处理最新名称及图替换，卸载解除订阅。只请求重绘，不写节点/撤销/保存状态。便签移除专用重复标题加载，保留正文布局。
- UI显示标题字体加载中，失败时保留名称并允许重试；加载器返回空fallback也按失败处理。未声称覆盖其他文字脚本或真实离线缓存恢复。
- 93967 sections-title-fonts退出0、passed；重开等待产品loading消失、hasUnsavedChanges=false，restored.png已查看，“素材分区”“方案画框”均正常。99523 sections-title-retry退出0、passed：受控ensureFallbackPack返回{}，UI错误/名称保留/恢复加载器后真实重试、后续层级/历史/保存与重开通过。89590 rich-text-shared-titles退出0、passed：便签富文本/属性/受控粘贴与重开回归通过。
- 24953 lint失败在Set去重规则，改用es-toolkit uniq；22720结构检查通过、类型lint失败于跨await disposed条件收窄，改用实时active()判断保留卸载保护。最后两次仅等价实现调整，未重复浏览器流程。0035按精确前态.runtime/c06-title-before.json归档，反向apply检查通过；没有修改旧补丁。
- 生产构建仍至0034，0035尚未生产整合或更新安装版；C06.4 doing，完整目标未完成。下一动作：确认18241最终lint终态并记录，再阶段构建/生产标题回归，然后继续对象锁定/隐藏/裁切和层级重排。受控故障不替代真实网络/永久缺字体与快速切换的完整边界。

- 收尾：18241完整lint退出0，既有结构/类型9/3warnings。所有本轮探针/lint已终态，无待轮询句柄；下一步直接阶段生产整合。未提交工作树。


### C06.4 0035生产整合与对象状态/裁剪（2026-10-16）

- 上轮为有效进展（通用标题实现与回归），本轮66943完整build退出0，build/canvas-title-fonts.exit.txt=0；生产已覆盖0035，原有warnings保留。未更新C05安装版。
- 扩展sections-frames.mjs，可选OS_CANVAS_OBJECT_MANAGEMENT=1：实际Ctrl+Shift+L锁定、Ctrl+Shift+H隐藏及属性面板裁剪checkbox，各自撤销重做，并保存/新浏览器重开。快照新增visible/locked/clipsContent。99923 objects-management退出0、passed。
- 71896 objects-clipping退出0、passed：新增真实Shift+Right移动20步，使矩形越过画框右边界，分别开关裁剪并截图。clipped.png/unclipped.png已查看，30px内部部分保留、70px外部部分消失/恢复；继续锁定隐藏与保存回归通过。截图期间标题字体尚在loading不算标题完成证据，重开另等loading结束。
- 51072 objects-production退出0、passed：生产24750、故障注入关闭、不导入源码，全部对象状态/历史/裁剪/保存与精确视角恢复通过。restored.png已查看，中文标题正常、隐藏矩形不显示，hasUnsavedChanges=false。此为生产浏览器，非新桌面安装。
- 本轮仅探针与文档新增，没有产品源码变更或新增补丁；无需额外lint/构建。所有构建/探针终态，无待轮询句柄。未提交工作树，C06.4及完整目标继续。
- 边界保留：锁定对象指针拖动拒绝、隐藏对象命中排除、跨分区/画框图层重排、顺序、搜索定位/画框浏览演示尚待验收。下一动作先验证图层顺序/跨容器重排与历史保存，遇到缺口实现；不能把本轮状态字段通过当完整对象管理完成。


### C06.4 图层顺序/跨画框两种交互（2026-10-16）

- 上轮为有效进展（0035生产和对象状态），本轮新增layer-management.mjs，未改产品源码。35072开发页layer-management退出0、passed：真实画框/矩形创建、Ctrl+[同级后移、图层树dragTo跨框归属、世界几何不变、撤销重做与首次保存重开。
- 7614生产24750 layers-pointer-production退出0、passed，进一步在重开后方向键将对象移入目标框（局部x -300→100），指针向左400px拖回源框；确认父级和世界坐标、撤销重做，第二次保存/新浏览器重开。无源码注入，图形都用UI建立。canvas-drag-restored.png已查看，布局/中文标题正常。
- 该截图末尾出现“有未保存改动”，不能凭快照通过忽略生命周期。探针新增最后一次重开hasUnsavedChanges与status记录/断言；6813 layers-pointer-clean-check退出0、passed，finalDirty=false、finalSaveStatus=已保存到本机。未找到前次状态差异根因，不能把一次不复现写成已修复；原截图保留。恢复后自动保存可能影响观察，下一步诊断须记录时序并控制自动保存以暴露瞬态修改。
- 本轮所有探针终态，无待轮询句柄；生产仍0035、安装版未更新；未提交工作树。仅新增/更新探针与证据文档，无需lint或构建。
- C06.4继续doing。下一动作：为跨框重开记录node/history/viewport事件与保存时序，确认是否真实产生无操作脏状态；若定位后修复再做必要回归。随后补锁定拖动/隐藏命中与搜索/画框浏览。完整C06—C12不缩减，跨分区、多选/旋转/自动布局容器重排仍保留。


### C06.4 恢复时序与锁定/隐藏命中（2026-10-16）

- 上轮为有效进展（跨框验证及状态差异发现）。本轮扩展layer-management.mjs的OS_CANVAS_RESTORE_TRACE=1：每次新页跟踪节点/历史/视口与dirty/status转换、POST路径；10ms轮询关闭被open重启的autosave，末次重开观察1500ms（超过1000ms自动保存去抖），不靠自动保存掩盖恢复修改。仅记录路径、没有请求正文/令牌。
- 14654 layers-restore-trace在生产24750退出0、passed：只有两次显式保存POST；末次恢复仅page的os.canvas/nodeId元数据更新发生在打开流程内，随后dirty=false/已保存，观察期间无新的内容/历史/视口事件和额外保存。不能以本次不复现认定之前截图提示不存在；原证据保留为未定位偶发现象，后续以此事件探针捕获，不无限重复相同测试。
- 新增OS_CANVAS_LOCK_HIT=1：锁定子矩形后真实指针拖动。首次layers-lock-hit失败于错误期待世界坐标绝对不变；截图表明选中的是父画框，父移动30px而锁定子相对位置不变。按容器规则补验：选中源画框、子局部坐标不变、世界坐标随父30px、撤销父移动；随后解锁恢复原场景、隐藏对象在原位置点击不能选中、取消隐藏保留数据。
- 70820 layers-lock-container生产24750退出0、passed，以上命中行为及原有跨框/历史/两次保存重开全通过，finalDirty=false、finalSaveStatus=已保存到本机。仅探针和文档变化，无产品源码更改，无需构建/lint；所有本轮进程终态。
- C06.4继续doing，生产0035、安装版未更新，未提交。下一步推进画框浏览（N/Shift+N）、搜索定位/演示入口及画布视角行为；对象多选、跨分区/自动布局/旋转容器仍保留。恢复提示差异未定位，不标修复，但当前不存在阻塞其他独立功能的证据。


### C06.4 画框快捷浏览与预览遮挡（2026-10-16）

- 上轮为有效进展（恢复时序与锁定命中），本轮复核frame navigation bridge与WorkspaceView搜索逻辑。N/Shift+N已具备空间排序和循环，名称定位现有focusNodesByName仅供链接精确搜索，未找到用户画布搜索入口；不把内部方法当产品搜索完成。
- 新增frame-navigation.mjs，生产24750 frame-navigation/result.json passed（执行直接终态）：真实创建两画框、中文命名、N前进/循环、Shift+N后退，预览按钮进入play、返回编辑保持场景和图层面板。playing.png发现资产面板仍覆盖预览。
- 0036-preview-asset-panel.patch：LocalWorkspacePanel的v-show改为editing&&assetsOpen，保留组件实例、草稿及原布局选择，无卸载或隐藏任务取消。85909 frame-navigation-panel开发页退出0、passed，新增预览前目录草稿输入、预览中目录输入/图层面板隐藏、返回后草稿保留及场景一致。playing.png已查看，面板不再覆盖。
- 25480完整lint退出0，既有结构/类型9/3warnings；0036按.runtime/c06-preview-panel-before.vue精确前态生成，reverse apply检查通过。未更新生产构建（仍0035）或C05安装版，未提交；本轮所有进程终态。
- 该证据不包含交互链接、动画、逐帧幻灯/完整演示，搜索/结果/跨页定位仍缺。下一动作优先实现实际用户搜索入口，复用已有FocusStore定位和异步换页保护，覆盖中文/重名/无结果/已删除对象与跨页；之后将0036和搜索阶段合并生产构建，避免仅为单行样式重复完整构建。C06.4/完整目标继续。


### C06.4 用户搜索入口与失效结果（2026-10-16）
- 上轮只回答进度，属于无实现进展；本轮核验真实失败记录后继续搜索。新增 0037-canvas-search.patch：名称包含匹配、所有页面路径、100 项分批展开、点击选中并适配视图；修改查询或替换图使旧结果失效。定位复查对象存在、页面归属与当前隐藏状态，异步切页检查代次；错误允许重试，不改文件或强制显示隐藏对象。
- search/result.json 首轮失败：测试 addPage 内部异步切页未完成就创建对象，目标实际位于旧页；按公开 switchPage 等待后 search-page-ready 通过。未用测试修正冒充产品修复。
- search-stale（75503 退出 0）与 search-batches（29494 退出 0）通过真实搜索界面：中文部分名称、无结果、空查询、删除后旧结果、跨页定位、搜索后隐藏/移动、101 个同名对象分批展示及输入改变清空结果。跨页/批量场景通过公开编辑器接口建立数据，搜索和选择由真实 UI 操作；非全部数据均指针建立。cross-page.png 已查看，路径和选中对象可见。
- 63020 完整 lint 退出 0（首次搜索版本，既有 9/3 警告）；最终可见性/位置复查改动由后续完整构建复核。0037 reverse apply --check 通过；未修改旧补丁、未提交工作树、未更新安装版。
- 正在运行 9120 完整构建；日志 canvas-c06/build/search.log，终态 search.exit.txt。不得因日志观察超时重复启动。生产基线此前为 0035；构建通过后在 24750 运行搜索和预览面板回归。
- 边界：名称搜索不等于全文/语义搜索；异步加载竞争、图替换取消及超大结果性能尚需专项验收。C06 整体仍 doing，C07—C12 范围不变。

- 本轮收口：9120 完整构建退出 0，search.exit.txt=0；生产已覆盖 0036/0037。search-production/result.json 与 frame-navigation-production-0037/result.json 均 passed、命令退出 0：生产页验证搜索全部上述场景，并回归预览隐藏资产面板、返回保留草稿及画框导航。无新安装包，不能以浏览器生产测试冒充安装交付。
- 所有本轮构建/探针已终态，无待轮询句柄。下一动作：补搜索异步页面加载期间查询改变/画布切换的取消验收，再推进 C06 对齐、吸附及自动布局等尚未完整覆盖的能力；仍保留富文本外部剪贴板与跨容器边界，不将搜索子流程通过写作 C06 完成。


### C06.4 搜索异步边界与 C06.5 自动布局首轮（2026-10-16）
- 上轮为有效进展（0037 搜索实现及生产整合）。本轮复核文末记录，继续使用生产 24750；未修改产品源码、未重新构建或安装。
- 新增 search-races.mjs；search-races/result.json passed、命令退出 0。在生产页通过受控 loadPageNodes 延迟/拒绝验证：输入改变后旧结果不回写、加载失败有提示且恢复后真实 UI 重试成功、公开 replaceGraph 替换图后待完成搜索不能恢复旧结果。测试替换加载方法仅用于故障注入，不冒充真实慢磁盘/损坏文件验收；没有导入开发源码。
- 新增 auto-layout.mjs；auto-layout/result.json passed、命令退出 0。真实鼠标绘制两个 100×80 矩形，Ctrl+A / Shift+A 生成水平自动布局；实际属性按钮切换垂直，子对象 x 相同且 y 重排；撤销/重做恢复布局方向；实际间距输入 32，核对孩子几何间隔恰为 32px。
- 通过本机保存按钮保存后，关闭并启动全新浏览器，按作品名重开；比较完整结构、几何、layoutMode/itemSpacing，hasUnsavedChanges=false。restored.png 已查看，两个矩形纵向排列、32px 间隔及已保存状态可见。无页面错误。
- 仅新增探针与证据文档，无需重复 lint/build；git diff --check 通过（已有 LF/CRLF 提示）。所有本轮命令终态，无待轮询句柄。生产仍 0037，安装版未更新，工作树未提交。
- C06 整体 doing；下一动作优先扩展自动布局容器尺寸变化、子项填充/包裹、内边距、嵌套及指针重排的实际 UI 与保存恢复。当前首轮不证明约束/网格/环绕/完整 Figma 能力；对齐吸附、外部剪贴板、多容器等矩阵仍保留，C07—C12 不缩减。


### C06.5 尺寸适应与嵌套布局（2026-10-16）
- 上轮为有效进展（搜索异步与自动布局首轮证据）；本轮扩展 auto-layout.mjs 的 OS_CANVAS_LAYOUT_SIZING=1 路径，仍使用生产 24750、0037，不改产品源码。
- auto-layout-sizing 首次失败（97099 退出 1）在未进入编辑态前寻找宽度子 spinbutton；截图证明控件存在。改用字段 focus 后 auto-layout-sizing-focus（21607 退出 1）停在填充下拉：Enter 实际选中两个子对象，多选面板没有单项尺寸模式；随后通过图层行明确选中 Rectangle 1。两次原失败证据保留，没有调整产品以迎合错误测试假设。
- auto-layout-sizing-single/result.json passed、命令退出 0：真实水平内边距 24、垂直 16，适应内容容器宽 148、高 224；父宽 300 时单个填充子项宽 252，父宽 360 时子宽 312，撤销/重做同时恢复父子几何。
- auto-layout-nested/result.json passed、命令退出 0：图层选择第二矩形并 Shift+A 创建嵌套布局，实际属性将内层矩形高度改为 120，内层适应高度 120、外层适应高度 264；撤销恢复外高 224，重做恢复 264。全部场景由实际 UI 建立与编辑，公开 store 仅用于测试配置和只读断言。
- 保存后全新浏览器重开，比较层级、坐标尺寸、layoutMode、itemSpacing、四边内距、轴向 sizing 和子项水平 sizing；hasUnsavedChanges=false、无页面错误。restored.png 已查看，宽填充子项与增高嵌套子项布局正确、状态已保存。未重启本机服务，不据此扩大为全故障恢复验收。
- 无产品改动，无需重复 lint/build；未更新安装版、未提交工作树，本轮命令全部终态。C06 doing；下一动作：真实指针自动布局重排及历史/保存验证，接着网格/环绕/约束和对齐吸附。此轮仅证明两层垂直组合，不代表任意深度/混合尺寸或全部自动布局能力完成。


### C06.5 指针重排、自动换行与网格保存缺陷（2026-10-16）
- 上轮为有效进展（尺寸与嵌套验证）。本轮继续生产 24750/0037，扩展 auto-layout.mjs 的 OS_CANVAS_LAYOUT_DRAG=1 和 OS_CANVAS_LAYOUT_FLOW=wrap/grid，未改产品源码。
- auto-layout-drag（56581 退出 1）选中框内矩形，错误期望拖动能重排外层画框；截图仍选中 Rectangle 2。核对 select/move.ts：只有 INSTANCE 祖先有自动提升拖动目标逻辑，普通 FRAME 应按选中层级移动。添加真实 Shift+Enter 选中内层画框后 auto-layout-drag-frame（3026 退出 0）passed：实际 pointer 拖动颠倒外层两个子项顺序，父高度保持，撤销/重做精确恢复整个场景，保存后新浏览器重开通过。restored.png 已查看，顺序及状态正确。未扩大为嵌套实例拖动验收。
- auto-layout-wrap/result.json passed、命令退出 0：两个真实绘制矩形，水平布局固定宽 150 后点击自动换行，第二项落到下一行；撤销/重做、保存/新浏览器重开通过。快照新增 layoutWrap，restored.png 已查看。
- auto-layout-grid（80897 退出 1）发现真实未修复缺陷：UI 切 GRID 与撤销重做成功，保存后新浏览器打开，layoutMode 从 GRID 变 NONE、itemSpacing 从 32 变 0。失败证据保留；不能将网格布局标完成，也不能忽略字段让测试通过。
- 根因线索已定位：packages/fig/src/node-change/serialize.ts 的 serializeLayout 显式排除 GRID（约344行）；packages/fig/src 中未找到 gridTemplateColumns/gridTemplateRows/gridPosition 导出/恢复路径。convert.ts 保留的原始 Figma grid 字段不等于当前 scene graph 网格属性。需要完整网格配置与子项位置的往返方案，不能只恢复 layoutMode 或依靠几何截图。
- 下一动作优先修复网格保存：检查现有插件数据/版本约定，补齐网格模式、轨道、行列间距、子项位置以及相关布局属性的导出与导入，并验证修改后再次保存、退出网格不复活旧元数据、撤销重做、缺损元数据边界。随后回归普通/换行布局；这是 C06 内部可修复缺陷，不是需用户介入的阻塞。
- 本轮仅探针/证据/文档变化，全部进程终态，无待轮询句柄，无新构建或安装，未提交。C06 doing、整体目标未完成。


### C06.5 网格保存首轮修复与二次保存缺陷（2026-10-16）
- 本轮新增 0038-grid-layout-persistence.patch，基于 .runtime/c06-grid-before.json 精确前态。FIG 插件数据 grid-layout-v1 带 version=1、校验后的轨道/行列间距/布局尺寸对齐/内距/子项位置；serializeLayoutProps 每次导出刷新字段，nodeChangeToProps 恢复；无网格/位置时删除该扩展。采用现有 format 字段机制，不改磁盘格式版本。不能据首次成功宣布完整修复。
- 31708 完整 lint 退出 0（既有结构/类型 9/3 警告）。grid-save-fix 开发页探针（1607 退出 0）通过首次创建、网格切换与历史、保存新浏览器重开。新增 grid-layout.test.ts，Bun 2 pass/8 assertions：混合 FIXED/FR/AUTO 轨道、间距/内距、子项跨行列、记录往返后再修改/清除、坏 JSON/未来版本/非法跨度。此单元路径不替代完整应用保存。
- 探针快照扩展 gridTemplateColumns/Rows、gridColumnGap/RowGap、gridPosition，并增加重开后实际 UI 退出网格→再次保存→全新浏览器重开。grid-save-edit（65270 退出 1）发现未修复路径：退出时为 HORIZONTAL，第二次重开为 GRID，其他配置仍为原网格。记录级单测未复现，需核对应用真实导出和版本确认，不能删断言或把单测通过当整体修复。
- 0038 反向 apply 检查通过，63768 完整构建退出 0，build/grid-layout.exit.txt=0；生产产物已覆盖 0038，但没有宣称生产验收或更新安装包。全部本轮进程终态，无待轮询句柄，工作树未提交。
- 下一动作优先追踪二次保存：记录 UI 编辑后 source.editedFields/pluginData、实际 FIG 导出记录、保存版本与重开版本，区分 source 原始记录回填、保存捕获或过早重开。export/node.ts 中 applyRawFigmaNodeFields 在 serializeLayoutProps 后执行，最终又合并 pluginData；当前仅为线索，根因未定。不要直接重复构建。修复后扩展真实两轮保存回归，再跑生产及换行布局回归。
- C06 doing，完整目标未完成；本轮修复为部分有效，旧网格复活仍为当前首要缺陷。


### C06.5 二次保存根因与预览归档修复（2026-10-16）
- 上轮为有效进展（0038 首轮实现并发现二次保存失败）。grid-second-trace（20050）和 grid-baseline-trace（51819，退出1）保留失败；实际保存返回同 canvasId 的 revision 1/2，单记录导出为 HORIZONTAL 且已删除旧网格插件数据。关键诊断：archiveBaseline.before 中模式已经是 HORIZONTAL，原插件数据却为 GRID，证明差分导出的“修改前”捕获发生在预览修改之后，不是简单未等待保存。
- 0039-preview-archive-baseline.patch：SceneGraph.updateNodePreview 的真正变更回调先 willChangeNode 再通知预览观察者，让归档在首次预览修改前捕获原件；不发布 committed updated 事件，取消预览仍无 touched。保留原0038，不重写旧补丁。
- grid-preview-baseline-fix（28013退出1）证明模式已正确 HORIZONTAL，但网格退出后仍留在内存的轨道/间距/尺寸设置没有往返。进一步将扩展的 layoutMode 允许四种模式，存在轨道时保存当前真实模式与配置；只有没有轨道/位置/网格时清除扩展。不是恢复过时 GRID，也不丢弃用户仍有的数据；0038“退出即删除全部配置”的策略由本轮纠正。
- grid-two-saves（62202退出0）passed：真实UI创建网格、历史、首次保存新浏览器重开、切水平、第二次保存新浏览器重开，完整轨道/行列间距/子位置/常规布局快照一致。截图 restored.png 已查看（首次网格恢复）；两轮数据由断言验证。探针 OS_CANVAS_GRID_TRACE=1 仅开发诊断导入源模块；该通过运行未启用。
- 新增 preview-baseline.test.ts，实际 FIG 导入→预览/取消→提交→差分导出→解析；加原 node-preview 和 grid-layout 测试共14 pass/64 assertions，退出0。验证取消无 touched、历史/焦点/删除/异常预览及网格字段往返。0039反向apply检查通过。
- 12966 完整构建正在执行，日志 build/grid-preview-baseline.log，终态 grid-preview-baseline.exit.txt；需先轮询，不重复启动。生产此前0038；未更新安装版、未提交工作树。换行开发回归51149另行记录终态。下一动作构建成功后生产页运行 grid/wrap（诊断关闭），必要时修lint，再继续C06其余设计能力。C06整体未完成。

- 本轮补充：51149 换行开发回归退出0、passed。12966构建退出1，仅新增preview-baseline测试的非空断言触发no-non-null-assertion；已改显式缺失报错，并在同轮未交付的0039补丁同步准确前态。没有调整检查规则或产品逻辑。
- 当前活动构建为28381（前12966已终态），日志build/grid-preview-final.log，退出码grid-preview-final.exit.txt；必须先轮询该句柄。尚未完成0039生产整合和生产浏览器回归，不能标完整修复交付。20050/51819/28013均已终态，原失败证据保留。下一步成功后24750运行OS_CANVAS_LAYOUT_FLOW=grid和wrap、OS_CANVAS_GRID_TRACE关闭，再更新本检查点。


### C06.5 网格生产收口与间距控件（2026-10-16）
- 上轮为有效进展（0039修复和开发回归），本轮复用28381等待最终构建：退出0，build/grid-preview-final.exit.txt=0，生产已覆盖0039，结构/类型及打包通过。未因等待重启构建。
- grid-production-0039（60583退出0）与wrap-production-0039（16270退出0）均passed：真实24750生产页、GRID_TRACE=0；网格UI/历史/第一次保存重开/切水平/第二次保存重开完整快照一致，同canvasId revision1/2确认；换行布局保存恢复回归通过。此处为浏览器生产验证，不是安装版升级。
- 新增0040-grid-gap-labels.patch，为GridControls两个NumberField提供本地化列/行间距label和data-property，解决两个图标字段缺少可访问名称的问题。扩展auto-layout.mjs的OS_CANVAS_GRID_GAPS=1：第一次重开后实际UI列间距18、行间距22，行间距撤销回0/重做22，切水平并再次保存，新浏览器重开完整配置保持。grid-gap-controls（6012退出0）passed；无源码诊断注入，无页面错误。
- 0040反向apply检查通过；90040完整lint正在执行，需核对终态。生产仍0039（0040仅控件名称，待下一阶段整合），安装版未更新，工作树未提交。不得据现有测试把完整网格/设计能力标完成。
- 下一动作：核对90040后推进网格轨道增删、固定/比例/自动轨道和子项跨行列的真实UI路径，随后约束与对齐吸附；记录级单测覆盖不代替这些产品交互。C06仍doing，C07—C12完整目标保留。

- 本轮终态：90040完整lint退出0，既有结构/类型9/3警告，无错误；所有构建/探针已结束，无待轮询句柄。0040尚未生产打包，其余下一动作不变。


### C06.5 轨道模式与连续保存（2026-10-16）
- 上轮为有效进展（0039生产与0040间距入口），本轮确认90040已终态后继续轨道交互。新增0041-grid-track-labels.patch：每个轨道尺寸模式选择器具备本地化行列编号和调整大小label；反向apply检查通过，未改旧补丁。
- auto-layout.mjs新增OS_CANVAS_GRID_TRACKS=1：真实添加列/行、删除末列及撤销重做、首列固定80px、第二列2fr、首行AUTO。grid-track-controls（7269退出0）passed。扩展grid-tracks-three-saves（46269退出0）passed：保留网格模式先保存重开混合轨道并精确比较场景，再改间距18/22、撤销重做、退出网格保存重开；同canvasId连续修订，自动保存可能增加一次修订，不伪称恰好三次磁盘写入。截图edited-grid-restored.png已查看。
- 全部对象和轨道通过真实UI建立，store只作配置与状态读取，无源码注入；当前为开发24650。轨道数据往返通过不等于各种填充/溢出组合几何都验收。属性面板中未找到子项gridPosition入口，跨行列仍只有数据/单元层验证，需要后续实现真实用户路径。
- 架构文档新增网格格式和预览归档约定，明确退出网格保存真实模式、闲置轨道保留及外部FIG原生网格互操作未验；没有提高兼容性承诺。
- 58500正在完整构建0040/0041，日志build/grid-controls.log，退出码grid-controls.exit.txt；结构lint已0错误，仍需终态。不得重复启动。生产此前0039，安装版未更新，工作树未提交。下一动作构建成功后24750跑GRID_TRACKS=1、GRID_GAPS=1、GRID_TRACE=0路径，再补子项位置/跨度入口。C06/完整目标继续。

- 本轮收口：58500完整build退出0，grid-controls.exit.txt=0；60652生产轨道/间距/连续保存回归退出0，grid-tracks-production/result.json passed，诊断关闭。生产覆盖0041，未更新安装包；本轮全部进程终态，无待轮询句柄。下一动作直接补子项网格位置/跨度真实入口及历史/保存验收，不能将轨道通过当全部网格完成。


### C06.5 子项位置与跨度入口（2026-10-16）
- 上轮为有效进展（轨道生产验证）；本轮新增0042-grid-position-controls.patch，在LayoutSection加入GridPositionControls，仅普通网格子项显示（绝对定位排除），支持起始行/列、跨行/列数及恢复自动排列。整数最小1；沿用beginNodePreview预览、提交/取消，选区切换及卸载取消；恢复自动排列通过单条撤销记录清除gridPosition。
- 核对core/layout/grid.ts和上游显式位置测试，真实Yoga输入为从1开始；修正架构文档原“从零开始”误述，历史读取容忍0，不声称旧数据迁移完成。首张截图发现label与icon重复，改aria-label配可见icon文本，已查看最终position-controls.png文字不再重复。
- grid-position（96346退出0）passed：列定位x=100、跨两列宽填充200、恢复自动/撤销、两轮保存重开。扩展两轴时grid-position-both-axes（26130退出1）期望y=50但固定子项最小高80；grid-position-sized（70230退出1）期望跨两行高400，但自动兄弟占隐式第三行80。保留原失败，未调整引擎迎合假设。
- grid-position-implicit-row（24448退出0）passed：父高400，两行初始定位第二行y=200；子项跨两行两列并双轴填充，宽200、高320，兄弟y=320/高80，总高400；Escape取消跨度编辑场景不变；恢复自动gridPosition=null，撤销回显式跨度；保存/重开与退出网格再保存完整快照一致。所有操作实际UI，无源码注入。截图已查看。
- 50994初版完整lint退出0，既有9/3警告；最终去重标签后的29884 lint正在运行，需核对终态。0042反向apply检查通过。生产仍0041，0042尚未整合生产或安装；工作树未提交。下一动作完成lint及生产整合/子项回归，再补绝对定位、切换父布局/选择时的入口生命周期与其余C06约束/对齐吸附；不标全部网格完成。

- 本轮终态：29884完整lint退出0，既有结构/类型9/3警告；所有本轮进程已终态，无待轮询句柄。下一动作直接整合0042并生产回归，不重复同一开发测试。


### C06.5 子项生产整合与父布局刷新（2026-10-16）
- 上轮为有效进展（0042子项入口）；本轮14677完整构建退出0，build/grid-position.exit.txt=0。22511生产24750 grid-position-production-0042/result.json passed：实际定位、两轴跨度/填充、Escape取消、恢复自动/撤销、两轮保存重开。生产当前0042，尚未更新安装版。
- 新增grid-position-lifecycle.mjs，使用公开编辑器构造隔离网格和切换父模式/绝对定位，子项输入使用真实UI；最初生成脚本时截取header误遇回调内try，语法错误，已修复生成结果。82173真实运行失败在父容器从HORIZONTAL切回GRID后控件未出现；并非网格数据失败。
- 根因：computed依赖的父节点是普通可变对象，父布局变更且子项未变化时不触发当前选区属性刷新。0043-grid-parent-lifecycle.patch订阅父node:updated/previewUpdated，更新显示条件；条件关闭取消预览，卸载解除订阅。未修改已有0042。
- grid-position-lifecycle-fixed命令退出0、passed：保持同一子项选中，ABSOLUTE/AUTO与父HORIZONTAL/GRID切换时入口正确隐藏/恢复；在字段中输入未提交值后公开选择另一子项，旧对象gridPosition保持null，新输入仅修改新对象。无页面错误。此为公开API模拟其他编辑来源，不冒充用户点了所有切换按钮。
- 0043反向apply检查通过，13819完整lint运行中，需记录终态；0043未生产整合。未提交工作树，安装版未更新。本轮无必要重复构建0042；下一阶段整合0043后生产跑lifecycle；C06继续推进约束、对齐吸附和其他矩阵项，完整网格各种多选/隐式轨道/跨容器仍非全量验收。

- 本轮收口：13819完整lint退出0，既有结构/类型9/3警告；本轮全部进程终态，无待轮询句柄。生产0042、开发0043，后续阶段整合与lifecycle生产回归仍待完成。


### C06.5 尺寸字段未应用子项约束（2026-10-16）
- 上一轮为进度答复，无实现进展；本轮重新确认 24650 服务 PID 87748 存活后，继续实际约束验收。
- 新增 apps/canvas/probes/constraints.mjs：公开图接口创建一个 200×200 非自动布局画框及五个子对象；通过真实属性下拉框设置 MIN/MAX/CENTER/STRETCH/SCALE 双轴约束，再通过真实宽高输入框将父画框设为 400×400。后续脚本含撤销/重做、保存重开和再次缩回，但当前失败点之前未执行，不算通过。
- 53917 首次因测试写成“右/下”而非实际“右侧/底部”超时，已修正定位。74181 constraints-labels 复现几何失败；87472 constraints-parent-fields-before 再次退出 1，并额外确认父尺寸确实 400×400、五种约束字段完全正确。所有子对象仍停留 x20/y30/w40/h50；MAX 应移动到 220/230，STRETCH 应扩展到 240×250，SCALE 应变为 40/60/80/100，CENTER 应移动到 120/130。原始失败和完整快照已保存，不弱化断言。
- 根因定位：packages/vue/src/controls/layout/helpers.ts 的 updateAxisSize 只对父节点 useNodePreview.update；鼠标 resize.ts 已有 computeConstrainedResizeChanges 子树计算。尺寸字段路径缺少子项约束应用。尚未修复产品代码，不宣称约束通过。
- 下一动作：为尺寸字段接入以编辑开始快照为基准的子树约束预览，与父尺寸共用一次提交/撤销；验证 Esc、选区切换、连续输入不累积误差、自动布局不回退及新浏览器往返。需避免用当前预览后尺寸重新作为原始基准。保留文本路径/嵌套/实例边界，不以五个矩形代表全部约束。
- 本轮命令均终态，无待轮询测试；生产仍 0042，开发仍 0043，0043 生产整合仍待完成。安装版未更新，工作树未提交，C06 doing，C07—C12 完整目标保留。


### C06.5 尺寸字段约束首轮修复（2026-10-16）
- 上轮有效进展为真实复现约束缺陷。本轮新增 useSizePreview，捕获首次编辑的子树 ResizeSnapshot，父尺寸和 computeConstrainedResizeChanges 的子项变化通过同一 NodePreview 更新、提交或取消；输入继续变化时保留原始基准，已关闭或换目标时释放旧会话。helpers.ts 的尺寸编辑与提交改接此会话，其他布局属性继续原有路径。0044-size-constraint-preview.patch 已归档并通过 reverse apply 检查。
- 6973 constraints-fields-fixed/result.json passed，退出 0：真实 UI 设置五种双轴约束及父宽高，几何达到明确期望；两次撤销/重做精确恢复父子快照；真实本机保存/新浏览器重开后，父尺寸从 400×400 改回 200×200，五种子项约束再次正确生效。夹具创建/选中用公开 API，字段及约束设置为实际 UI。截图已查看：夹具未设置填充，子对象视觉呈现不作为本轮证据，仅声明属性/几何与保存验收。
- 27762 constraints-auto-layout-regression/result.json passed，退出 0（OS_CANVAS_LAYOUT_SIZING=1）：原有垂直布局、间距、padding、HUG/FILL、嵌套尺寸、撤销及保存重开未回退。49892 完整 lint 退出 0，既有结构/类型 9/3 警告，无错误。
- 尚待专项：持续预览再取消/换选区、嵌套约束、锁定子项、实例覆盖及路径文字；当前 computeConstrainedResizeChanges 的几何处理复用引擎，未额外接鼠标路径的 path-text reflow，不宣称这些边界已完成。下轮先补连续预览生命周期验收，再整合生产 0043/0044 并跑约束与网格生命周期生产回归。
- 本轮测试全部终态，无待轮询句柄。生产仍 0042，开发 0044，安装版未更新，工作树未提交。C06 doing，完整 C07—C12 目标不变。


### C06.5 约束取消、嵌套与生产整合（2026-10-16）
- 上轮为有效修复；本轮核验最新现场并继续0044验收，未改产品源码。新增 constraints-lifecycle.mjs，开发服务导入实际 useSizePreview 集成公开编辑器（明确为受控集成而非 UI）：200→300→400 连续预览保持初始基准；取消及选区切换完整恢复；嵌套 STRETCH 容器内 MAX 子项双轴正确移动；单条提交撤销/重做恢复整棵子树。constraints-lifecycle/result.json passed，命令退出0。
- 扩展 constraints.mjs 实际数字字段键盘路径：宽度输入取得焦点后两次 ArrowUp，父宽202且 MAX 子项x22；Escape完整恢复原场景。91442 constraints-escape/result.json passed，退出0，同时通过原五种约束、两轴宽高、撤销/重做、保存重开与再次缩回。
- 27057 完整 build 退出0，build/constraints.log 与 constraints.exit.txt=0；生产已整合0043/0044。8538 constraints-production-0044/result.json passed（24750，无源模块注入），包括新增真实 ArrowUp/Escape 路径与磁盘往返。grid-lifecycle-production-0044/result.json passed，证明0043父布局/绝对定位入口刷新及切换选区取消在生产版本通过（fixture使用公开API）。
- 本轮全部进程终态，无待轮询句柄；git diff --check通过。生产/开发均0044，安装包仍未更新，工作树未提交。新增集成探针不纳入生产注入；不能拿该探针代替真实指针或任意复杂节点验收。
- C06仍doing。下一动作推进对齐/等距分布/吸附的实际UI及保存；约束尚留锁定子项、实例覆盖、路径文字reflow与混合深层布局边界，不因基础矩形和二层约束通过而标全部设计能力完成。完整C07—C12目标保留。


### C06.5 对齐与等距分布生产验收（2026-10-16）
- 上轮有效进展为0044生产整合，本轮从最新现场继续。新增 apps/canvas/probes/alignment.mjs，直接在生产24750运行，不导入源码；公开API只建立/选中三个尺寸不等的着色矩形，操作均使用属性按钮、排列菜单与真实键盘。
- alignment-production/result.json passed：六种对齐分别核对位置，单步撤销/重做精确恢复整份场景；alignment-distribution-production/result.json passed：真实“排列”菜单水平/垂直等距分布保持两端，三个宽40/60/80的对象水平x为350/490/650，三个高50/70/90的对象垂直y为250/365/500，证明等边缘间距而非等中心间距；分别撤销/重做通过。
- 最终 alignment-distribution-saved/result.json passed，退出0：顶部对齐后水平等距分布，真实保存并关闭浏览器重新打开，三对象坐标为[350,250]/[490,250]/[650,250]，全场景一致。restored.png已人工查看，三橙色矩形顶边一致、间距一致、尺寸各异，无页面错误。
- 无产品源码改动，不重复build/lint；生产与开发仍0044，安装包未更新，工作树未提交。全部探针终态，无待轮询句柄。
- 此轮范围为同页面顶层、无旋转三个对象；跨父容器、旋转对象、单对象相对父容器及锁定边界尚未覆盖。下一动作实际指针吸附/缩放阈值与对齐剩余边界；C06整体doing，其他设计能力及C07—C12完整目标保留。


### C06.5 指针吸附生产验收（2026-10-16）
- 上轮有效进展为对齐/分布生产验收，本轮新增 apps/canvas/probes/snapping.mjs，直接使用生产24750；公开API仅创建着色矩形及设置缩放/视口，移动用真实鼠标down/move/up，历史和保存使用实际UI/键盘。
- 88419 snapping-production 退出1：左边缘在zoom1和0.7距目标2 CSS px均准确吸附至x600且撤销/重做通过；原测试把左边缘偏12px当作不吸附，但宽80/100的两对象中心此时只差2px，实际x610为正确中心吸附。保留原失败，修正几何预期而非修改产品。
- 48761 snapping-centers-production/result.json passed，退出0：两个缩放比例的左边缘吸附、不同宽度中心吸附、距所有候选边缘/中心足够远时x635保持自由位置、撤销/重做以及真实保存关闭浏览器重开全场景一致。restored.png已查看，两个矩形左边缘对齐且尺寸/纵向位置保留；无页面错误。
- 无产品源码改动，不重复构建/lint。生产/开发0044，安装版未更新，工作树未提交，全部探针终态。
- 当前范围为两个未旋转顶层对象的水平移动；不推断垂直/旋转/跨容器/隐藏锁定候选、智能间距或所有缩放比例通过。下一步推进C06矢量/布尔操作能力矩阵与实际编辑/保存，保留对齐吸附剩余边界；C06仍doing，C07—C12完整目标不变。


### C06.6 布尔运算与扁平化生产首轮（2026-10-16）
- 上轮有效进展为吸附验收，本轮新增 apps/canvas/probes/booleans.mjs。生产24750公开API创建/选择四对错位重叠着色矩形，真实属性下拉菜单分别执行Union/Subtract/Intersect/Exclude；每项保留两个操作数子节点、单步撤销恢复原始场景、重做恢复组。4730 booleans-production/result.json passed，磁盘保存/新浏览器重开保持四种类型及子树，截图人工核对四种轮廓正确。
- 扩展扁平化：14975 首次测试误用已关闭页面的canvas locator，已修正；3100 Alt+Shift+F后类型未变化，快捷键未通过，保留待查；76697尝试单选布尔组属性下拉，入口不存在而超时（该控件非该场景入口）。未将这些失败抹去或宣称快捷键可用。
- 改用现有真实“对象→扁平化”菜单。81996 booleans-flatten-object-menu/result.json passed：重开后选择Union，扁平化为非空VECTOR，撤销恢复完整布尔组/操作数，重做恢复矢量，再次保存并在新浏览器重开保持场景及非空矢量网络。flattened-restored.png已查看，Union轮廓保持，其余三种布尔运算不变。无页面错误。
- 此轮仅覆盖矩形组合和菜单扁平化，未声称任意曲线/描边/文字/变换布尔或矢量编辑通过；网络检查为非空，未做所有路径精确往返比较。下一动作补扁平化快捷键触发诊断及实际矢量点编辑/保存；核心白板结构化能力、组件/样式等仍待继续。
- 无产品源码修改，生产/开发仍0044，未重复build/lint；安装包未更新，工作树未提交，全部命令终态。C06 doing，完整C07—C12目标保留。


### C06.6 布尔与扁平化快捷键修复（2026-10-16）
- 上轮有效进展为四种布尔及菜单扁平化验收。本轮排查快捷键：packages/vue 的命令注册元数据已定义 Alt+Shift+U/S/I/E/F，但应用 src/app/shell/keyboard/registry.ts 的 commandShortcuts 列表漏掉五项。并非仅测试按键问题，菜单显示的快捷键实际未绑定。
- 0045-boolean-keyboard-shortcuts.patch 添加五项命令绑定，沿用已有焦点/弹窗/输入及预览守卫，不新增独立事件监听；已归档并通过反向apply检查。booleans.mjs增加OS_CANVAS_BOOLEAN_KEYS=1路径，记录input以区分菜单与按键证据。
- 57047 boolean-shortcuts-fixed/result.json passed，开发24650：四种实际Alt+Shift按键均创建正确布尔组，撤销重做和首次保存重开通过；重开后Alt+Shift+F实际扁平化为非空VECTOR，再次撤销/重做及第二次保存/新浏览器重开通过。未将菜单成功冒充按键验证。
- 26003完整lint退出0，既有结构/类型9/3警告；本轮全部命令终态，无待轮询句柄。开发0045、生产仍0044，快捷键修复尚未生产整合，安装包未更新，工作树未提交。
- 下一动作继续实际矢量点拖动、曲线编辑及保存恢复；阶段构建时合并0045并以BOOLEAN_KEYS=1生产回归。复杂矢量、样式/组件及其余C06矩阵未完成，C07—C12完整目标保留。


### C06.6 矢量顶点拖动与历史同步修复（2026-10-16）
- 上轮有效进展为快捷键修复。本轮新增 vector-editing.mjs：公开API建立带一条贝塞尔边的闭合三角路径，真实Enter进入编辑，真实鼠标将第三顶点移动35/20，检查完整vectorNetwork、尺寸、撤销/重做和保存重开。
- 79855 vector-editing失败：编辑内Ctrl+Z后作品仍为移动后的网络；40530 vector-editing-undo-diagnostic再次失败且记录undoState，编辑状态顶点已恢复400/300、600/300、500/450，history0/future1，但图中的第三顶点仍为移动后的135/207.5。确认历史只恢复编辑覆盖层而未同步已提交路径。
- 0046-vector-history-sync.patch：history.restore增加回调，由create.ts传入commitNodeEditChanges，使撤销/重做恢复后的网络同步至作品及填充几何，沿用已有提交和坐标处理。补丁归档、反向apply检查通过。
- 最初夹具曲线越出声明高度，提交时会规范化包围盒；改为切线位于盒内以精确比较同一场景，未将包围盒规范化误判为问题。11909修复后已通过撤销/重做，但重开因导入增加默认handleMirroring=NONE而比较失败；夹具显式声明NONE，未忽略路径字段。
- 67213 vector-editing-history-roundtrip/result.json passed，开发24650：真实顶点拖动、编辑态撤销/重做完整场景相等、Escape退出、实际保存新浏览器重开，顶点/切线/线段/区域及镜像模式均精确一致，无页面错误。37456完整lint退出0，既有9/3警告。
- 所有本轮命令终态。开发0046，生产仍0044；0045/0046生产整合尚待完成，安装版未更新，工作树未提交。下一动作退出编辑后的文档历史与连续撤销分支、曲线手柄编辑及阶段生产回归；未声明任意复杂路径/实例/嵌套变换验收。C06及完整C07—C12目标继续。


### C06.6 矢量会话历史与曲线手柄（2026-10-16）
- 上轮有效进展为0046编辑覆盖层与作品同步。本轮扩展退出编辑后文档撤销，vector-document-history-before退出1：一次本地撤销/重做被0046同步回调记录成额外文档修改，退出后撤销仍留多余Edit vector历史。
- 0047-vector-session-history.patch：lifecycle为每个NodeEditState分配独立coalesceKey，用现有undo.runBatch合并同一会话连续作品提交，保留第一次inverse和最后forward；不同会话键不同，若中间存在其他历史条目则不跨条目合并。补丁归档/反向apply通过。
- 36404 vector-document-history-fixed/result.json passed：本地撤销/重做后退出，一次文档撤销回到初始且canUndo=false，再重做恢复编辑结果。92607 vector-curve-history/result.json passed：新增第二会话真实选择顶点并拖动贝塞尔手柄25/-20，切线由50/50变75/30，局部撤销/重做通过；退出后两次文档撤销分别恢复第一会话和最初场景，再两次重做分别恢复，完整网络/切线/区域保存重开一致。截图已查看。
- 40641完整lint退出0，既有结构/类型9/3警告。83804正在完整生产构建0045—0047，日志build/vector-history.log、退出码vector-history.exit.txt，需核对终态，不重复启动。下一动作构建通过后生产跑vector-editing及BOOLEAN_KEYS=1 booleans；安装版未更新、工作树未提交。
- 同一会话全部撤销至原样、外部修改穿插、删除/切页等复杂历史边界仍待专项；不以两个会话代表所有历史场景。C06 doing，完整C07—C12目标保留。

- 本轮生产收口：83804完整build退出0，vector-history.exit.txt=0；生产24750 vector-history-production-0047/result.json passed（真实顶点/手柄、双会话历史、完整网络保存），73079 boolean-keys-production-0047/result.json passed（五个实际快捷键与两轮保存）。生产/开发均0047；所有进程终态，无待轮询句柄。安装包仍未更新，未提交工作树。下一动作推进矢量钢笔创建/增删点及其他C06设计矩阵；上述复杂历史边界保留。


### C06.6 钢笔创建与增删点生产验收（2026-10-16）
- 上轮有效进展为0047生产整合。本轮新增pen-editing.mjs，直接使用生产24750；只通过公开API设置文档名/自动保存，所有图形由真实键盘P及鼠标点击/拖动建立，没有API构造几何。
- 真实钢笔点击三点并点击起点形成闭合三边路径，V/Enter进入编辑，P点击边中点插入第四点；实际Ctrl+Z/重做恢复3/4点，Alt点击删除该点为3点，再撤销恢复4点，退出后作品网络保留。
- 82611 pen-editing-production首次在磁盘往返比较失败，仅因导入为三个原始顶点补默认handleMirroring=NONE；源码handle-actions.ts明确缺省按NONE处理。测试快照仅将该缺省规范化为NONE，未移除顶点/线段/切线/区域字段。pen-editing-default-mode/result.json passed。
- pen-open-curve-production/result.json passed，退出0：进一步真实钢笔中间点拖出控制柄、Enter提交开放三点两段贝塞尔路径，验证非零切线；两个路径保存后关闭浏览器重开完整网络语义一致。restored.png已查看；无页面错误。这里含开闭路径创建与增删点，不代表任意自交、多区域、变换或所有钢笔修饰键完成。
- 本轮无产品源码修改，不重复build/lint。生产/开发0047，安装包未更新、工作树未提交；全部命令终态。下一动作进入C06样式/组件/变量的实际入口与保存矩阵，保留已记录矢量复杂历史和几何边界；C06及C07—C12完整目标继续。


### C06.7 组件同步与实例分离保存（2026-10-16）
- 上轮有效进展为钢笔生产验收，本轮新增components.mjs。components-production/result.json passed（生产24750）：真实绘制矩形、Ctrl+Alt+K创建组件、对象菜单创建实例，属性宽度修改同步到实例子图形，撤销/重做整场景一致；保存重开后再改主组件仍同步。公开API仅设置文档配置/选择目标，不创建组件或实例。
- 6054 components-detach-production失败：真实菜单分离、撤销/重做均通过，但第二次保存重开恢复旧INSTANCE和旧子项宽180而非200。根因scene-graph/instances.ts直接修改type/componentId/overrides，没有走图变更通知，导入FIG归档未记录分离。
- 0048-detach-instance-save.patch改用cloneInstanceOverrideState后清除副本，经graph.updateNode统一提交FRAME/null/overrides，避免预先修改原件使before快照失真。首轮88760缺clone import导致失败，已补齐；85650更新路径后分离和宽200保存成功，但快照比较普通子图形的内部componentId来源映射时不同。现快照仅对INSTANCE比较主组件关联，其他类型仍严格比较类型、子树及几何；不承诺内部来源映射不变。
- 89884 components-detach-roundtrip/result.json passed（开发24650）：创建/同步/撤销/第一轮重开继续同步，以及分离/撤销恢复关联/重做/第二轮重开FRAME子树保留均通过，无页面错误。0048归档及反向apply通过。
- 55288完整lint正在检查类型部分，需核对终态；生产仍0047、开发0048，尚未生产整合、安装包未更新、工作树未提交。下一动作实例覆盖/重置及更复杂组件路径，阶段构建整合0048并跑components生产；样式、变量及其他C06矩阵与C07—C12仍待完成。

- 本轮终态：55288完整lint退出0，既有9/3警告，无错误；全部本轮检查终态，无待轮询句柄。0048生产整合仍待完成。


### C06.7 实例尺寸覆盖与分离生产整合（2026-10-16）
- 上轮有效进展为0048分离保存修复。本轮扩展components.mjs的OS_CANVAS_INSTANCE_OVERRIDE=1：真实属性字段将实例宽设250、主组件宽设300，实例保持250；实际保存新浏览器重开后全场景一致，再将主组件宽改320，实例仍250，随后分离/撤销/重做与再次保存重开。
- 8839首轮脚本生成遗漏PowerShell UTF-8输出设置，新增中文定位变成问号导致超时；已修复测试文本，非产品问题。86284 component-width-override-utf8/result.json passed（开发），所有宽度覆盖和分离路径通过。
- 70007完整build退出0，build/component-detach.log及component-detach.exit.txt=0。4796 components-production-0048/result.json passed（生产24750，INSTANCE_OVERRIDE=1）：组件/实例创建、子项同步及历史、重开再次同步、实例独立宽度跨主组件两次修改与保存、分离及重开全部通过，无页面错误。
- 实例重置覆盖的核心Figma API存在（packages/core/src/figma-api/overrides.ts），当前属性面板/命令尚未找到通用重置入口，不能当成已交付。下一动作明确重置范围并提供可撤销的用户入口，验证主组件跟随恢复；继续样式/变量等C06矩阵。当前验证只证明宽度覆盖，不代表全部属性/嵌套实例覆盖完成。
- 生产/开发均0048，安装包未更新，工作树未提交。本轮全部构建/探针终态，无待轮询句柄；完整C06—C12目标继续。


### C06.7 重置实例修改入口（2026-10-16）
- 上轮有效进展为0048生产整合。本轮新增ResetInstanceAction.vue并接入DesignPanel实例头部，按钮“重置实例修改”，主组件缺失或不可编辑时禁用，失败显示错误并恢复捕获的文档变更。沿用底层FigmaAPI.resetOverrides，清除所选实例及内部实例的普通覆盖，保留组件属性设定值；不复制另一套同步规则。
- 同步操作以captureDocumentChange捕获完整变更，非空才pushUndoStep，撤销/重做恢复前后图数据；调用runLayoutForNode和requestRender。0049-instance-reset-action.patch已归档并反向apply检查通过。
- components.mjs新增INSTANCE_RESET=1（配合INSTANCE_OVERRIDE=1）。13214 instance-reset/result.json passed：按钮将宽250覆盖重置为主组件320，撤销找回250、重做回320，主组件改340实例跟随。70958 instance-reset-reopen/result.json passed：再验证实例x/y保留、重置状态磁盘保存与新浏览器重开完整场景一致，主组件随后改360实例继续跟随，再走分离/撤销/重做及保存回归，无页面错误。
- 64474完整lint退出0，既有结构/类型9/3警告。开发0049、生产仍0048，尚未生产整合，安装包未更新，工作树未提交；全部本轮进程终态，无待轮询句柄。
- 目前真实测试覆盖独立宽度、位置保留和重置后继续同步；嵌套实例、组件属性值保留、主组件缺失/锁定禁用及错误回滚仍需专项，不能仅据复用API宣称全部验收。下一动作补重置入口截图/边界并阶段生产整合，继续样式/变量矩阵。C06及C07—C12完整目标保留。


### C06.7 重置可用状态、错误回滚与生产整合（2026-10-16）
- 上轮有效进展为0049重置入口。本轮新增instance-reset-boundaries.mjs，公开API创建组件/实例并模拟锁定/主组件删除，实际按钮断言。74377首次失败：getNodeEditCapability仅检查组件库只读，不含锁定。0050-instance-reset-availability.patch补实例/祖先锁定检查及实时图查找，用useSceneComputed追踪场景变化，操作前再次检查canReset；换节点清空旧错误。instance-reset-boundaries-fixed passed，无需重选即可锁定禁用、解锁恢复、删除主组件禁用。按钮截图已查看，位于实例头部，无溢出。
- 24406完整build退出0，build/instance-reset.log与instance-reset.exit.txt=0，生产整合至0050。87673 instance-reset-production-0050/result.json passed（INSTANCE_OVERRIDE=1、INSTANCE_RESET=1）：独立尺寸、重置/历史、位置保留、重开继续跟随主组件、分离保存路径通过。
- 扩展受控故障注入：临时替换公开store.runLayoutForNode，使重置已改数据后抛错。96245 instance-reset-rollback失败，回滚恢复图但清空选区，重置组件卸载导致错误提示消失。0051-instance-reset-retry-selection.patch在操作前保存选区，失败恢复数据后重新选择仍存在的原节点，保留错误提示和重试入口。
- instance-reset-rollback-fixed/result.json passed（开发）：实际点击触发受控故障、alert含错误、完整场景回滚；恢复原方法后重试成功、错误消失、撤销找回覆盖；重新选中后锁定/解锁/缺失主组件检查仍通过。测试没有把故障注入称真实磁盘错误。0050/0051补丁均归档并反向apply检查通过。
- 16567正在完成0051完整lint，需核对终态。生产0050、开发0051；错误选区修复尚未生产整合，安装包未更新，工作树未提交。下一动作继续样式/变量与组件属性矩阵，阶段整合0051并生产验证故障恢复；嵌套与组件属性保留仍非全量验收。完整C06—C12目标继续。

- 本轮终态：16567完整lint退出0，既有9/3警告；所有检查已结束，无待轮询句柄。生产0050/开发0051及后续动作不变。

### C06.7 数字变量输入修复（2026-10-16）
- 上轮仅核对并回答进度，无实现推进；本轮恢复 C06，确认开发 24650/PID 87748 存活后复用。新增 variables.mjs，真实 UI 创建集合、数字变量、改名和输入数值。
- variables/result.json 与 variables-diagnostic/result.json 均失败：输入 24 后仍存 0，诊断捕获 console TypeError: text.trim is not a function。Vue 数字输入返回 number，TokenInspector 的草稿及提交却假定 string。
- 0052-variable-number-input.patch 将数字草稿声明为 string | number，提交时 String 规范化后沿用有限数检查与单位转换；补丁反向 apply 检查通过。variables-fixed/result.json passed：真实 UI 创建/改名/数值修改、Ctrl+Z/重做、磁盘保存、新浏览器恢复集合/类型/数值及可编辑界面；截图已查看。
- 独立 lint 53290 与完整 build 22857 的包重建发生重叠，前者出现大量解析类型缺失（501 errors），不能作有效验收；后续仅以包重建完成后的完整 build 内置检查为准，不同时启动依赖构建产物的 lint。生产构建日志 build/variable-number.log，需确认终态。生产此前0050，开发0052，安装包未更新。
- 探针已扩展负小数、零、空输入恢复，等待构建后生产验证；并需生产回归0051错误选区恢复。绑定到画布属性、多模式、别名、其他类型和共享样式仍待继续，不将数字创建往返当完整变量验收。C06 doing，C07—C12保留。

- 本轮收口：22857 完整 build 退出0，build/variable-number.exit.txt=0；构建内置结构/类型检查通过，独立 lint 的并发产物错误未在顺序构建复现。43952 variables-production-0052/result.json passed：数字修改/撤销重做、负小数、零、空值恢复、磁盘保存与新浏览器重开全部通过，无页面或 console 错误。instance-reset-boundaries-production-0052/result.json passed：0051受控故障回滚/重试及锁定/主组件缺失的生产回归通过。
- 当前生产/开发均0052，安装包仍未更新，工作树未提交；全部本轮构建/探针均终态，无待轮询句柄。下一动作验证变量绑定到对象后的实时更新、保存重开及解绑，随后多模式/别名、共享样式与组件剩余矩阵。完整C06—C12尚未完成。

### C06.7 数字变量绑定与解绑持久化（2026-10-16）
- 上轮为有效进展（0052输入修复、生产构建与回归）。本轮确认生产24750/PID56704存活，新增variable-binding.mjs，直接验证0052生产，不改产品源码。
- 79600 variable-binding-production首次失败：关闭变量对话框后立即绘图未生成对象，后续等待width字段超时；截图确认空场景。探针改为先真实绘制矩形并断言已创建，再打开变量管理；关闭对话框后显式等待隐藏。未将该失败算作绑定引擎缺陷，也未用API创建图形替代手势。
- 84135 variable-binding-drawing/result.json passed：真实矩形绘制、数字变量创建和宽度选择器绑定，宽度120变24；变量编辑为180同步几何，撤销/重做恢复24/180。保存新浏览器重开后绑定名称、宽高与变量值相同，改变量为240仍更新对象。
- 实际解绑按钮保留宽度240并移除boundVariables.width；Ctrl+Z恢复绑定，重做移除；再改变量300对象仍240。81181 variable-binding-roundtrip/result.json passed，进一步第二次保存/新浏览器恢复后绑定仍为空，变量改360对象仍240。无pageerror或console error，截图已查看。
- API仅设置文档配置、读取断言和切换选区；绘制、变量创建/编辑、绑定/解绑、撤销重做及保存均真实UI。此次验证范围为单个普通矩形的数字宽度绑定，不覆盖所有属性、多选、实例、模式、别名或删除变量。
- 本轮无产品源修改，不重复build/lint；生产/开发0052，安装包未更新，工作树未提交，所有探针终态。下一动作共享样式的创建/应用/修改传播及保存路径，随后多模式/别名和组件剩余矩阵；C06仍doing，C07—C12完整目标保留。

- 截图复核发现上一张捕获了对话框退场动画中间帧；已让每次变量编辑后等待对话框hidden再继续。54595 variable-binding-stable/result.json passed，完整双轮持久化路径再次通过，最终稳定截图已查看，属性显示宽240；未改变产品代码或断言标准。

### C06.7 从对象创建共享样式（2026-10-16）
- 上轮有效进展为数字变量绑定生产验收。本轮检查上游样式实现：现有选择器仅能应用已有definition，getSharedStyles依赖internalOnly样式节点；未找到从当前对象创建入口，不能将API夹具当作完整设计复用。
- 0053-create-shared-style.patch在useSharedStyleBinding增加create，在各样式选择器加入“从当前对象创建样式”，即使尚无样式也显示入口。单选支持填充、描边绘制色、效果、文字、布局参考线；按对象名/类型生成去重名称。样式节点internalOnly，source.id使用UUID并经graph.updateNode通知，原对象关联同一标识；完整文档变更捕获实现一条创建撤销/重做，失败恢复原图和选区。锁定祖先/只读对象在执行时拒绝。
- shared-styles.mjs新增真实双矩形绘制/样式选择器创建/第二对象应用/创建撤销重做/磁盘保存新浏览器重开。88306首次往返仅因FIG的颜色float32精度和默认blendMode=NORMAL不同失败；探针规范化这两个格式语义，保留全部填充字段及引用名称比较。78354 shared-style-create-roundtrip/result.json passed，截图已查看。原版本两矩形默认同色，已扩展为真实字段将首矩形改红后再创建/应用，等待生产验证以证明颜色复制效果。
- 首次lint结构报嵌套三元和scene数组structuredClone，已改括号及专用copyFills/copyEffects/copyLayoutGrids。第二次lint日志9/3既有warning、0errors，但PowerShell外层因stderr返回1，不宣称实际退出码通过；当前60607完整生产构建使用子进程捕获真实退出码，日志build/shared-style-create.log，待终态。0053反向apply通过。
- 此轮仅填充路径实际验收；自动命名尚无重命名入口，修改共享定义后传播、其他样式类型、只读/锁定及异常回滚UI专项待继续。完整共享样式功能并未完成。生产此前0052/开发0053，安装包未更新，未提交工作树；C06doing及C07—C12全目标保留。

- 本轮生产收口：60607完整build退出0，build/shared-style-create.exit.txt=0，包含包重建/结构和类型lint/生产打包。shared-style-create-production-0053/result.json passed：真实首对象红色输入、创建/撤销重做、次对象由灰变红应用同一样式、保存新浏览器恢复definition和两引用全部通过，无pageerror/console error；生产截图已查看。生产/开发0053，安装包未更新；所有本轮命令终态。下一步补共享样式命名编辑和修改定义后传播，再扩展其他类型与边界，不将此单填充路径标成完整C06完成。

### C06.7 共享样式重命名与填充编辑（2026-10-16）
- 上轮有效进展为0053创建样式生产验收。本轮确认开发24650/PID87748，新增SharedStylesSection，在未选对象的属性面板中显示共享样式列表、名称及单一纯色填充字段；复杂填充不显示单色编辑以免丢失其他内容，其他样式可重命名。编辑沿用design.md面板与控件。
- 0054-edit-shared-styles.patch导出并复用sharedStylePatch，修改定义后遍历真实引用，统一更新填充/描边等已有引用并触发布局；捕获涉及页面的文档变更，定义与引用作为一条undo。名称/颜色校验失败不写入；异常恢复修改前快照并在面板提示，可重试。图层本地直接改色仍按既有规则解绑，不被误作修改共享定义。
- 92632 shared-style-editor/result.json passed：真实界面改名Brand/Primary、红变蓝，两个矩形同步；撤销/重做完整定义和引用，非法颜色BAD拒绝，保存新浏览器重开保留名称/颜色/引用。
- 70019 shared-style-editor-recovery/result.json passed：受控替换公开runLayoutForNode，在定义和首个引用更新后抛错；完整快照回滚、可见错误、恢复方法后重试通过；重新打开后再改绿，两个对象继续同步。故障注入非真实磁盘失败，仅验证该事务异常分支。
- 首轮lint指出无用for-of spread，已去掉。后续结构/类型日志0errors、9/3既有warnings；PowerShell重定向stderr外层返回1，实际验收以20608完整构建为准（build/shared-style-editor.log，待终态）。0054归档及反向apply通过。生产此前0053/开发0054，安装包未更新，工作树未提交。
- 本次仅实际验证单纯色填充和名称；文字/效果/网格编辑界面、渐变及多填充、跨页/描边/实例传播、只读/锁定专项未完整验收，不视为完整共享样式完成。下一步生产回归本轮，再扩展这些能力与C06其余矩阵；C07—C12完整目标继续。

- 本轮生产收口：20608完整build退出0，build/shared-style-editor.exit.txt=0。shared-style-editor-production-0054/result.json passed（STYLE_EDIT=1、STYLE_FAULT=1）：创建/应用、命名/颜色传播、单步撤销重做、非法输入拒绝、受控异常回滚/重试、磁盘新浏览器恢复及恢复后继续编辑全部通过，无pageerror/console error；编辑面板截图已查看。生产/开发均0054；安装包未更新、工作树未提交，全部本轮命令终态。下一动作扩展共享样式的描边/跨页/实例传播与其他类型编辑，随后继续C06剩余矩阵。

### C06.7 文字共享样式编辑（2026-10-16）
- 上轮有效进展为0054共享填充编辑生产验收。本轮确认开发24650存活，扩展SharedStylesSection文字样式字段：字体、字号、字重、行高（留空自动）、字间距；输入校验拒绝空字体、非正字号/行高、非法字重及非数值间距，复用同一事务更新定义与引用。
- 发现sharedStylePatch文字分支遗漏fontFeatures，0055-text-style-editor.patch补齐复制，避免应用样式时连字等设置不随定义；名称/其他未编辑文字设置继续保留。
- 新增text-styles.mjs：公开API建立两段文字夹具，实际UI创建文字样式、第二对象应用、编辑36/700/48/2、撤销重做、拒绝字号0、保存新浏览器重开、改字号40继续同步。72528首次往返因FIG为省略fontFeatures补LIGA/CALT默认true而失败；夹具显式设首对象LIGA=false/CALT=true，次对象LIGA=true，既不忽略字段也验证覆盖传播。
- 59726 text-style-features/result.json passed，字体特性与字号等完整字段往返一致；截图显示两段文字按样式变大加粗及编辑表单，已查看。探针进一步显式断言两对象LIGA=false，并加入自动行高/负字间距，待生产回归。
- lint日志0errors、既有9/3warnings，PowerShell stderr重定向外层退出1，不作为实际成功退出证据；92314完整生产构建正在运行，日志build/text-style-editor.log，待终态。0055归档及反向apply通过；生产此前0054/开发0055，安装包未更新，工作树未提交。
- 尚未将这些普通文字夹具冒充多段富文本覆盖、全部字体加载、实例或跨页验收。文字装饰/大小写/字体特性的可编辑控件仍待补齐，效果/复杂填充等共享样式范围继续；C06doing及C07—C12全目标保留。

- 本轮生产收口：92314完整build退出0，build/text-style-editor.exit.txt=0。text-style-production-0055/result.json passed：文字样式创建/应用、36/700/48/2编辑、字体特性传播、撤销重做、非法字号拒绝、磁盘新浏览器恢复、恢复后40字号与自动行高/负字间距更新通过；生产截图已查看。shared-style-regression-0055/result.json passed，填充命名/颜色传播/异常回滚/重试/保存恢复未回退。生产/开发均0055；安装包未更新，工作树未提交，所有本轮进程终态。下一动作继续共享样式多填充/效果编辑及引用边界，同时保留C06其他功能与C07—C12完整目标。

### C06.7 跨页填充/描边共享样式（2026-10-16）
- 上轮有效进展为0055文字样式编辑生产验收。本轮确认生产24750/PID56704存活，新增style-pages.mjs；公开API准备两页矩形（源红填充、远端7px内描边）并切页/选区，真实UI创建填充样式、在另一页绑定为描边、编辑颜色和解绑。
- 37127 style-pages-production 首次在保存重开比较失败：定义从普通页面迁移到内部页面。源码fig/export-setup.ts与export.ts明确把sharedStyleType节点作为internal canvas定义，实际引用仍存在。因此快照改为全局定义（名称/类型/完整受测填充属性）和普通页面对象引用分别比较，不要求内部定义挂在用户页面。一次脚本替换括号错误已修复，未改产品代码。
- 71127 style-pages-storage/result.json passed：在另一页编辑共享定义，源页填充和当前页描边同步红变蓝，保留7px与INSIDE；单步撤销/重做恢复两页及定义；真实磁盘保存新浏览器恢复后再改绿仍同步。真实“无”选项解除描边绑定，保留绿色/宽度/对齐，后续定义改红只影响源填充。
- 26793 style-pages-detach/result.json passed：再保存并开全新浏览器，定义/两页对象/已解除描边关联全部一致；再改定义为蓝，源页继续跟随而远端描边仍绿。无pageerror/console error，截图已查看。未用源码存在代替交互证据，也未宣称切页/建夹具全部由鼠标完成。
- 本轮无产品代码修改，不重复build/lint；生产/开发0055，安装包未更新，工作树未提交，全部本轮探针终态。下一动作继续共享样式多填充/效果编辑和实例边界，随后C06其余矩阵；C07—C12完整目标保留。

### C06.7 效果共享样式编辑（2026-10-16）
- 上轮有效进展为跨页填充/描边引用验收。本轮新增EffectStyleFields与effect-draft，接入SharedStylesSection：效果类型、颜色、透明度、水平/垂直偏移、模糊、扩展、可见性、添加和删除。编辑保留原效果的其他字段，使用现有统一保存事务同步定义与引用；无效颜色/空数值/负模糊/越界透明度拒绝写入。
- 0056-effect-style-editor.patch归档并反向apply通过。结构/类型lint日志0errors、既有9/3warnings；PowerShell stderr重定向外层退出1，实际构建验收使用33025的build/effect-style-editor.log与.exit.txt，当前仍在构建。
- 新增effect-styles.mjs，API准备两矩形夹具，真实UI创建/应用样式、编辑红色50%投影、偏移-8/12、模糊20、扩展3；单步撤销/重做恢复定义和两引用，负模糊拒绝；添加内阴影、删除首效果再撤销；保存新浏览器恢复两效果，改模糊24继续同步。83003 effect-style-editor/result.json passed，无pageerror/console error，截图已查看（两对象投影/内阴影可见）。
- 探针已进一步加入真实可见性开关与内阴影切换图层模糊，待生产验证。尚未验收所有模糊承载/背景采样、混合模式和投影背后显示的编辑控件、效果重排、多实例/跨页效果引用，不把此普通两对象流程当全量效果交付。
- 当前生产0055/开发0056，安装包未更新，工作树未提交。下一步确认33025终态后生产跑effect-styles与文字样式回归；完整C06—C12目标继续。

- 本轮生产收口：33025完整build退出0，build/effect-style-editor.exit.txt=0。effect-style-production-0056/result.json passed：编辑多项投影参数、撤销重做、负模糊拒绝、添加内阴影、可见性切换、删除/撤销、磁盘新浏览器恢复、再次编辑及切为图层模糊全部通过；生产模糊截图已查看。text-style-regression-0056/result.json passed，文字样式链路未回退。生产/开发均0056，安装包未更新，工作树未提交，所有本轮命令终态。下一动作继续共享样式多填充编辑与实例传播，C06及C07—C12完整目标保留。

### C06.7 多填充样式与撤销草稿同步（2026-10-16）
- 上轮有效进展为0056效果样式编辑。新增FillStyleFields/fill-draft，替代单一纯色字段：多层纯色颜色、各层透明度/可见性、添加、删除、上移/下移；保留原填充其他字段。非纯色层保留原内容并允许透明度/显隐/排序，不冒充渐变色标或图像内容编辑。
- 0057-multi-fill-style-editor.patch归档及反向apply通过。原单填充第一项名称“样式颜色”保留，兼容既有回归入口；透明度空值/越界及无效颜色拒绝整次提交。
- 72907 multi-fill-editor首次保存重开失败，得到已隐藏且少一层的旧状态；59405 multi-fill-state把断言提前到磁盘保存之前，复现修正无效输入后点击保存已写回旧数据，排除磁盘导出问题。根因style computed返回同一可变对象，撤销数据恢复未触发草稿watch；改为useSceneComputed计算数据签名，在sceneVersion变化时比较实际内容，内容未变不丢草稿。
- 86961 multi-fill-draft-fixed/result.json passed：真实添加蓝色50%层、重排、隐藏及撤销、删除及撤销、拒绝101%透明度、纠正保存，定义和两引用一致；磁盘保存全新浏览器重开保留两层顺序/颜色/透明度/可见性。80932 fill-style-regression/result.json passed（STYLE_EDIT=1、STYLE_FAULT=1），单填充编辑与故障回滚未回退。
- 84702结构/类型lint日志0errors、既有9/3warnings；PowerShell stderr外层退出1，当前59064完整build使用实际子进程退出码，日志build/multi-fill-style-editor.log，待终态。开发0057/生产此前0056，安装包未更新，工作树未提交。
- 已给effect-styles补“撤销删除后立即再次保存”断言，等待生产回归以覆盖同类草稿问题。下一动作生产验证多填充及效果，再推进渐变/其他共享样式能力和实例传播；C06doing及C07—C12全目标继续。

- 本轮生产收口：59064完整build退出0，build/multi-fill-style-editor.exit.txt=0。multi-fill-production-0057/result.json passed：多层颜色/透明度、顺序、可见性、删除、撤销、非法输入与纠正保存、磁盘新浏览器恢复通过，生产编辑面板截图已查看。effect-draft-production-0057/result.json passed，包含撤销删除后立即保存仍保留两个效果。生产/开发均0057，安装包未更新，工作树未提交，所有本轮命令终态。下一步优先核对删除最后填充对描边引用的行为（现有strokePaintsFromStyle对空可用填充返回旧描边），随后继续渐变和实例传播；未将当前普通双对象多纯色路径当完整共享样式验收。
