# C02 持久化进展

2026-10-15，工作区未提交状态。C02 阶段验收通过；下文按时间保留各次验证及当时尚未完成项，当前结论以本表和开发现场为准。

| C02 验收项 | 当前证据 |
| --- | --- |
| 固定存储与格式 | workspace-store.mjs / layout-store.mjs：两库独立 schema 1；不可变 FIG、SHA256、修订与操作 ID；架构第 4 节固定元数据约定 |
| 工作内容、身份与视图恢复 | history-persistence.json（文字和内嵌 PNG 字节）、identity-persistence.json（UUID、两页、父子关系、视口、未知节点 pluginData） |
| 保存与版本恢复 | persistence、session-persistence、draft-persistence、history-persistence 的 JSON：首次草稿、快捷键、并发编辑、标签绑定、历史恢复追加修订 |
| 中断与失败 | recovery-service-tests.tap：7 项通过，包括进程提交前退出、真实文件写入失败、SQLite 写入失败、幂等重试与校验损坏拒绝 |
| 独立布局边界 | layout-persistence.json 及服务测试：独立布局库、重启、丢响应重试、未来布局版本不覆盖且不阻断作品 |
| 格式样例与兼容 | local/fixtures/*.fig、metadata-persistence.json：未知字段保留，未来格式明确拒绝且兼容作品可用；未来数据库原字节保留 |
| 性能预算已确定 | 架构第 9 节：指定设备、对象/素材规模、扫描/打开/保存/响应/内存数值；规模验收按任务表归 C05，并非已通过 |
| 实际产物与回归 | build-preview.log 退出 0；production/persistence.json 与 bridge.json 验证真实生产页面保存重开与宿主桥 |

范围边界：C02 已保存现有 OpenPencil 场景及工作内容，未实现目录索引、文件关联（C03）、成果落盘（C04）、作品包迁移（C05）、自定义节点运行与依赖管理（C08）。未知节点的既有 pluginData 能往返，不代表任意将来节点类型可执行。格式 1 没有旧版迁移来源；未来格式拒绝原地覆盖。突然断电、全部媒体格式、桌面安装及性能规模测试仍按对应阶段验收，不借本表宣布全产品完成。

实现：apps/canvas/local/workspace-store.mjs（本机 SQLite + 不可变场景文件）、server.mjs（回环 HTTP 桥）。固定测试材料为 local/fixtures 中的真实 FIG 文件。

使用 Node 24.19.0 执行：

```text
node --test --test-reporter=tap apps/canvas/local/workspace-store.test.mjs apps/canvas/local/server.test.mjs
```

退出 0，3 项通过，完整记录见 [service-tests.tap](service-tests.tap)。测试使用系统临时目录 os-canvas-store-*、os-canvas-crash-*、os-canvas-http-*，不接触用户素材；测试结束关闭 HTTP 服务与数据库。

覆盖：真实 FIG/元数据写入、另一进程重开、历史版本读取、重复操作去重、修改请求复用同一操作 ID 拒绝、旧修订冲突、内容校验失败；事务 COMMIT 前子进程退出 73 后，旧修订可用、未完成操作未登记且可重试。HTTP 层覆盖保存/列举/读取/操作查询、服务关闭再打开、缺令牌/异源/空来源/伪 Host 拒绝、非法 JSON 数据和超大请求拒绝。

测试曾发现 Node fetch 忽略手写 Host 头，导致测试未发送预期伪 Host；已改用 node:http 发送真实 Host 头，断言保持 403，随后通过。没有放宽服务校验。

## UI 保存与重开

新增 `local/dev.mjs` 启动编排；Vite 开发宿主保管会话令牌并转发限定来源/请求头的保存请求，令牌不注入浏览器。编辑端新增本机保存按钮、画布列表、错误与未保存状态。源码纳入 0002-full-window-canvas.patch，当前补丁哈希见 C01/workspace.json。

`node apps/canvas/probes/persistence.mjs` 退出 0，见 [结果](persistence.json)、[保存截图](saved.png)、[新进程重开截图](reopened.png)。真实鼠标绘图→界面保存→关闭整个浏览器→新浏览器列表打开，几何一致。随后再次编辑，状态变为未保存；通过 Playwright 在服务提交后丢弃 HTTP 响应，界面提示失败，再次点击保存恢复同一修订 2，未重复提交且内容保留。

初次 UI 测试在源码热更新期间未找到预期列表按钮，失败日志保留在 persistence-failure.txt；磁盘检查确认文件已提交，稳定源码下重跑并扩展失败恢复用例后通过。类型检查曾发现 UUID 字面量类型推断过窄，已显式标注 string；未放宽网络数据校验。

C01 覆盖布局、编辑选择/移动/撤销及输入预览回归退出 0；setup 幂等应用新补丁通过。vue-tsc --noEmit 退出 0；上游完整构建仍未运行。

## 会话、快捷键与自动保存

本机绑定移入编辑器会话，组件通过会话取得状态；关闭会话时清理监听及定时器。普通保存菜单和 Ctrl+S 共用本机 saveFigFile 路径；另存为仍提供 FIG 导出。首次保存/本机打开后启用自动保存，尊重编辑器 autosaveEnabled 状态；失败停止自动重试，保留准确请求以供手动恢复。画布模式禁用旧文件来源的并行自动保存路径。

`node apps/canvas/probes/session-persistence.mjs` 退出 0，见 [结果](session-persistence.json) 和 [截图](autosave-session.png)。实际 Ctrl+S 保存修订 1；后续编辑自动提交修订 2；用网络门闩延迟其响应，同时继续绘制第三个图形，响应返回后仍有新改动，自动提交修订 3。通过真实新建标签按钮离开，再点击原标签返回，后续编辑自动提交同一画布的修订 4；存储列表中同名画布仍仅一项。普通菜单使用同一 action 的源码路径已核对，未单独点击菜单测试。

最初标签测试使用动态导入 tabs 模块，未作用于界面中的标签，断言失败；改为真实标签栏操作后通过，失败日志保留。vue-tsc --noEmit 退出 0，persistence.mjs 的保存重开及丢响应重试回归通过，更新补丁的 setup 幂等验证通过。

## 稳定身份和视口

新增 local-identity.ts：普通节点保存 UUID，运行期保留已删除节点的身份归属以支持撤销/重做；新复制/粘贴节点不能占用源节点身份。记录并恢复当前页面、panX/panY/zoom；视口有未保存变化时会进入保存状态，关闭与打开其他画布的检查也考虑这一变化。

发现 FIG 的页面元数据丢失，普通节点元数据保留。因此作品元数据 pages 清单与场景同事务提交，按当前快照页面顺序和名称校验后恢复页面 UUID；不修改上游 FIG 文件格式。清单数量、顺序或身份冲突报错，不用新随机身份冒充原页面。

`node apps/canvas/probes/identity-persistence.mjs` 退出 0，见 [结果](identity-persistence.json)。两页场景、嵌套 frame/rectangle 的真实 Ctrl+D、撤销/重做及 Ctrl+C/V 通过；6 个图形身份唯一且未知扩展内容保留；全新浏览器重开后节点身份、父子关系、两个页面身份、非默认活动页面及精确视口一致。初次剪贴板测试未等待异步复制完成，已改为等待真实剪贴板就绪；随后测试发现页面身份丢失，完成映射实现后保持原断言通过。失败记录保留。

vue-tsc --noEmit、会话保存/提交期间编辑/标签切换回归、C01 布局/交互回归及 setup 幂等均通过。当前补丁哈希见 C01/workspace.json。已有普通保存/丢响应重试测试也通过；完整应用构建仍待执行。

## 首次草稿自动保存

新画布默认启用本机自动保存，不再要求先点一次保存建立关联；未编辑空白及纯空白视口变化不自动创建作品。首次改动触发约一秒后的保存，界面只有磁盘提交确认后才显示已保存；关闭自动保存后，手动保存不会擅自重新启用。保存失败保留准确快照，等待明确重试，后续新编辑另存新修订。

`node apps/canvas/probes/draft-persistence.mjs` 验证不点保存的首次绘图落盘、全新浏览器恢复、首次服务失败后继续编辑、重试旧快照并自动保存新编辑。结果见 [draft-persistence.json](draft-persistence.json)。确认保存前仍存在约一秒加实际磁盘写入时间的未确认窗口，不声称任意瞬间强杀都零损失。

身份/视口、会话并发编辑/标签绑定、C01 布局/输入回归均通过，vue-tsc 与 setup 幂等通过。当前补丁哈希以 C01/workspace.json 为准。

## 布局独立保存

新增 layout.sqlite（独立格式版本 1、独立修订/操作去重）及 GET/POST /layout。当前只保存图层与属性面板可见性，完整窗口管理仍在 C11；客户端保留未知字段。图层/属性开关与画布文档、视口、撤销解耦。

`node apps/canvas/probes/layout-persistence.mjs` 退出 0，见 [结果](layout-persistence.json)：隐藏面板后新浏览器恢复；调整布局不改变画布场景、视口、撤销或磁盘作品修订；布局提交后丢响应、继续调整再重试保留最终配置；首次读取失败后本地调整再重试也保留用户选择。失败时有独立提示与重试/重新读取入口，画布继续可用。

Node 24 存储/HTTP/布局共 5 项测试通过，见 [日志](layout-service-tests.tap)。布局未知格式、未来数据库版本均拒绝覆盖；未来布局数据库不阻止画布服务访问。vue-tsc、C01 界面回归（连接实际本机服务 14230）及 setup 幂等通过。

本节检查点时尚未完成历史修订恢复与整体构建；后续结果见下节。存储中断测试是进程退出，不能代替突然断电验证。当前 UI 在开发宿主上运行，尚非桌面安装产物。C02 不标为 done。

## 历史恢复、工作内容和写入失败

新增历史列表与恢复按钮。恢复旧版本会新增修订，不删除或移动已有历史；场景异步加载期间如果发生内容或视口变化，在替换编辑器之前拒绝覆盖。恢复后的保存复用正常事务、并发检查及幂等操作机制。

`node apps/canvas/probes/history-persistence.mjs` 通过，见 [结果](history-persistence.json) 和 [截图](history-work-content.png)：两版文字与生成的内嵌 PNG、恢复版本 1 新增版本 3、延迟恢复期间新编辑保留、继续保存及再次恢复后产生版本 5，全新浏览器核对文字、图片字节 SHA256 与 UUID 一致。

历史实现后的 identity-persistence、persistence 回归退出 0，覆盖两页/视口/复制粘贴身份、普通保存和丢响应重试。vue-tsc 会话 33700 退出 0。上游源码已纳入 0002 补丁，最新哈希以开发现场为准，不以之前 C01 结果中的旧哈希代表本次代码。

Node 24.19.0 执行三份服务测试，7 项通过，见 [recovery-service-tests.tap](recovery-service-tests.tap)。新增未来作品数据库版本原字节不变拒绝、非法元数据格式不增加修订、历史倒序列表。真实临时目录的文件写入失败，以及 SQLite query_only 写入失败后，原 head、历史和操作表保持不变；恢复条件后同一操作成功写入新修订。此测试不模拟物理磁盘耗尽或断电。

完整构建首次失败，见 [build.log](build.log)：新增布局保存循环的常量条件触发 lint。已改为比较已提交编辑序号与当前编辑序号；layout-persistence 回归通过。完整构建重试日志为 [build-retry.log](build-retry.log)，最终结果记录在开发现场。

第二次构建的结构 lint 通过，类型 lint 将 save 首次检查后的 disposed 变量在 await 后仍视为恒假，报 3 处错误。已将生命周期与 generation 检查提取为实时读取函数，保留所有异步返回后的保护。session-persistence 回归通过（Ctrl+S、自动保存、提交期间新编辑、标签绑定），补丁 setup 幂等通过。第三次完整构建日志为 [build-final.log](build-final.log)。

剩余验收：按架构核对全部持久化字段、未支持类型/节点依赖保留、损坏恢复与格式兼容范围；不能把文字/PNG 样例扩大为全部媒体与扩展节点已完成。

第三次完整构建退出 0：依赖包、结构 lint、类型感知 lint 和 Vite 生产打包通过。保留非阻断警告（上游文件行数、模块 externalization、动态导入等），生产产物的宿主桥运行尚未验证，不代表独立安装版已交付。

## 未知元数据往返

审计发现：编辑端使用 object schema 丢弃未知元数据，且保存时重建已知字段，导致较新扩展写入的内容被静默删除。新增 metadata-persistence.mjs：先保存真实 FIG，再经本机 API 加入画布、视口及页面上的未知嵌套字段；关闭整个浏览器，在新浏览器打开、编辑图形与平移，再保存并读取磁盘修订。修改前断言失败（metadata-failure.txt），修改后通过（metadata-persistence.json）。

修复使用 looseObject 保留同格式版本的未知字段，同时保留已知字段和 formatVersion 校验；会话保存已载入元数据，新场景清空旧绑定。保存覆盖已知可编辑值，页面扩展按 UUID 关联，不能依赖页面顺序。此处仅保留数据，不加载或执行未知扩展。history-persistence 回归通过。补丁已更新；此前生产构建结果不覆盖本次变更，最新类型检查结果见开发现场。

随后扩展该探针，在真实服务列表响应中注入一条模拟的未来格式记录。修改前整个列表解析失败；修改后列表只校验基础标识与名称，打开时再完整校验版本及元数据，明确拒绝版本 99，未发送该作品的场景读取或保存请求，兼容的真实磁盘作品仍可打开。未来记录是网络故障/兼容性样例，不声称已支持未来格式或完成迁移。服务本身仍拒绝写入非 1 格式；此项不放宽保存协议。

## 生产页面与本机桥

`scripts/canvas.ps1 local-preview` 使用 Node 24 启动本机服务并托管 Vite dist；缺少 dist/index.html 时拒绝启动。开发与预览共享 os-workspace 中间件，令牌留在宿主。宿主绑定 127.0.0.1。完整 `scripts/canvas.ps1 build` 退出 0，日志 [build-preview.log](build-preview.log)，覆盖上述元数据修复和预览桥。

独立验证端口 14240/14242、数据目录 .runtime/canvas-c02-preview-data。运行 persistence.mjs，设置 OS_CANVAS_TEST_URL=http://localhost:14240 和 OS_CANVAS_EVIDENCE_DIR=output/dev-evidence/canvas-c02/production，退出 0。见 [生产结果](production/persistence.json)、[重新打开截图](production/reopened.png)：真实鼠标绘图、保存确认、新浏览器重开、响应丢失重试均通过，截图已人工查看。

[桥接检查](production/bridge.json) 确认 HTML 引用 /assets/ 且无 /@vite/client；缺自定义头或异源调用拒绝 403，合法宿主代理返回 200，直接访问存储服务无令牌返回 401。测试后关闭预览会话 96557，14240/14241/14242 无监听，保留测试数据；原开发会话未停止。该生产页面验证不是桌面安装或整体性能验收，Vite/Bun 仍是当前预览依赖。
