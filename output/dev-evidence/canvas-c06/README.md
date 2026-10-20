# C06 白板与设计能力矩阵

依据需求第 4/5 节；进度权威为 doc/dev/current.md。当前推进至 C06.5 自动布局首轮；连线、富文本、对象管理与搜索的已验范围见文末检查点；下表列出阶段范围，已验子流程见后续证据记录，未覆盖部分仍待完成。不以源码或上游测试存在冒充交付。

| 需求 | 首轮核验与缺口处理 |
| --- | --- |
| 平移/缩放/适配选区/全部内容/视角恢复 | viewport/zoom-pan 上游测试可参考；验证 OS 覆盖面板坐标及重开 |
| 框选/多选/拖动/复制粘贴/重复/快捷键 | 用真实指针与键盘；跨画布复制验证身份独立 |
| 撤销重做/对齐/吸附/等距/分组/锁定/隐藏/层级 | 记录前后对象状态，保存重开；筛选关系保持 |
| 画框/分区/命名/搜索定位/导航 | tools/section 有上游样例；我方入口/边界待验 |
| 自动保存/文件导入/剪贴板/跨画布复用 | C02/C05 基础保存已验，扩展对象与剪贴板须新验 |
| 富文本/便签/列表/样式 | 列表快捷键、有序/无序切换、缩进与重开已实测；便签专用入口、正文、尺寸/颜色、撤销、保存和重开已验证；0033 实时字体正常/异常路径开发页通过，富文本样式仍需完整验证 |
| 常用形状/画笔/线/箭头 | 自由画笔真实绘制、撤销重做和重开通过；其余逐个验证 |
| 关系连线吸附/标签/折线曲线/跟随 | 开发页已验证两端拖拽/四侧锚点、三种线形、中文标签、复制/FIG/撤销及保存恢复；0026 生产构建及标签/线形/基础编辑通过；0027 标签避让开发页通过，0028 字体异常反馈与重试开发页通过 |
| 流程图/思维导图/表格 | 编辑深度待定项保留，先确认可复用能力，缺口明确，不静默删除需求 |
| 分组/画框/区域/模板 | 结构与复用后编辑/保存分别验收 |
| 画框浏览演示/局部整图导出/图片/PDF | export/basic 可参考；文件必须实际可读，格式逐项核验 |
| 图层树/画框嵌套/裁切 | 实际选择、重排、裁切与保存 |
| 坐标/尺寸/间距/对齐/约束/自动布局 | design/live-properties 可参考；子对象随容器调整需验证 |
| 填充/描边/圆角/透明度/阴影/文字样式 | 实际像素与序列化属性同时验证 |
| 钢笔/路径/锚点/布尔运算 | 创建编辑与撤销重做、重开 |
| 组件/实例/变体/共享样式/变量 | components/variant-authoring 等仅为参考；我方实际复用、更新和保存待验 |
| 页面跳转/交互状态/演示/动画 | 按具体能力列证据，复杂项若延期必须保留范围和原因 |
| 尺寸查看/素材导出/后续代码关联 | 尺寸与导出实测；代码关联按需求为后续按需项 |

首个可交付子任务：文字、矩形、分组、画框在我方模式中通过真实操作创建/移动/撤销/保存重开，并盘点关系连线入口；不先重写已有编辑内核。透明桌面条目由 C10 实现，此处不重复验收。


## C06.1 首轮基础编辑证据

- basic-editing/result.json passed（80694 退出 0）：实际鼠标创建矩形/椭圆、键盘输入中文、Ctrl+A/Ctrl+G 分组、方向键移动、撤销/重做、右键菜单包入画框、UI 保存后全新浏览器进程打开。逐层核对类型、名称、文字、几何和子对象结构。尚非全部白板能力，也没有重启本机服务。
- 初次 76044 失败为测试选择器默认 data-testid 与上游 data-test-id 不一致，截图菜单实际存在；原件保存在 locator-result.json/locator-failure.png，修正定位后通过，不修改产品菜单。
- 截图发现裸深色画布上的新文字默认黑色。0014-canvas-text-default.patch 仅包装 OS 模式 createShape，直接位于当前页面的新 TEXT 使用 #EEEEEE；导入/已有作品和容器内新文字保留原规则，不批量修改文档颜色。42455 退出 0，readable-text/result.json passed，文本填色数值断言通过；保存重开截图人工查看仍清晰。完整容器背景自适应不在本次实现内。
- 连接能力盘点：scene-graph/types.ts 和 FIG 转换/剪贴板中有 CONNECTOR 类型，但当前 core/editor、vue 输入和应用源码未找到关系端点/吸附/跟随工具实现。不能将类型声明当作需求 4.2 连线完成；下一步沿 scene graph/历史/稳定身份方案实现实际可编辑关系连接。


### C06.1 默认文字色收口

12615 完整结构/类型 lint 退出 0（既有 9/3 警告）。59459 和 81413 的入口行数失败保留在现场，不修改检查规则；最终 helper 独立且入口 260 行。

34960 text-container-regression/result.json passed：提取后的实现完成整个基础编辑流程，并用真实指针在白色画框内创建文字，断言 parent=FRAME、fill={r:0,g:0,b:0,a:1}。快照增加填色断言（六位小数归一化处理 FIG 精度），保存后新浏览器恢复完整嵌套结构和颜色；restored.png 已查看，深底浅字与白框黑字同时可读。没有更改已有作品颜色。此证据为开发服务/浏览器，不是新的安装包或容器背景自动识别完整功能。

C06.1 基础文字/形状/分组/画框编辑与重开子流程完成；C06 其余能力继续未完成。下一子任务 C06.2 关系连线：先实现两对象端点关联、跟随、删除与撤销、保存恢复，再补标签/折线曲线/交互吸附，不能用普通独立直线替代。


## C06.2 关系连接首轮

0015-local-connections.patch 增加选两对象后的“连接对象”入口，以 VECTOR+稳定 UUID 元数据保存，右中点→左中点变换到连接父空间。监听端点更新/预览/删除/重挂载和作品重开；同轮微任务合并，重算不写独立撤销项。端点删除保留静态几何和关联并提示，恢复身份后自动跟随。

80621 connections-basic/result.json passed，截图 restored.png 已查看：实际 UI 建立连接，键盘移动源对象，撤销/重做，删除端点保留连接且提示，撤销恢复，保存后新浏览器重开，继续移动仍跟随。首次 92042 在重开断言失败：FIG 为顶点补入 handleMirroring=NONE；first-import-defaults-failure.json 保留，探针将缺省 NONE 显式归一后验证，没有忽略坐标或端点身份。

该功能仍在开发，**不能作为 C06 连线整体完成**：复制关联重映射、筛选/跨页/祖先变换边界、连接自身删除恢复、翻转缩放、端点重选、吸附、标签、折线曲线未验收。当前查询全图重算，规模预算需后续扩展。尚未进入安装包。


### 复制关联重映射

0016-connection-copy.patch 在编辑器复制/内部粘贴建立节点后、撤销快照之前发出 clipboard:nodes-copied 通知，提供该次操作的源 pluginData 与目标内部 ID。应用身份管理先分配新 UUID（跨文档无碰撞也必须是新身份），关系模块再按同次操作的 UUID 映射重写端点；未被复制的端点保留原引用。没有用异步全局队列猜测哪些节点属于同一次复制。

- 93878 connections-copy/result.json passed：Ctrl+A/Ctrl+D 同时复制两端与连线，两端都指向新身份；撤销重做后身份与关联不变；原移动/保存路径仍通过。
- 78054 connections-cross-canvas/result.json passed：用应用真实 prepareCopy/pasteSnapshot 接口跨新标签粘贴，三实例均为新 UUID，两端正确关联副本，撤销/重做保持。未操作系统剪贴板，不能据此宣称浏览器权限或跨应用 FIG 剪贴板路径通过。
- 21065 完整 lint 退出 0，结构/类型既有 9/3 警告，无错误。bun test packages/core/tests/editor/clipboard：100 pass/0 fail/375 assertions，18 文件，退出 0；覆盖既有层级/实例/粘贴/撤销回归，不替代我方实际连线 UI 证据。
- 0016 反向 apply 检查与 diff 检查通过。外部 FIG 粘贴、重复/缺损来源身份、只复制连线或部分端点、复制嵌套容器、筛选与跨页语义仍需补验；C06.2 不标完成。


### 部分复制与筛选

connections-partial-copy/result.json passed：只复制连线保留原两端，源+线只重映射源，复制撤销重做正确，删除连接本身后撤销恢复。连接筛选 0017 按显示树联动端点，不写作品 visible 或几何，线条分类识别关联向量；根项计数与嵌套隐藏集合分开。

connections-filter/result.json passed，实际查询使目标端点隐藏而源/连接名字仍匹配，连接也隐藏；局部截图像素改变，清除后像素完全恢复，作品快照不变。截图已查看。local-filter 单测 4 pass/18 assertions；17505 lint 完整通过，既有警告；之后仅调整面板计数和说明。嵌套变换、跨页、外部 FIG 与完整交互仍待验。


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


## 生产整合与标签避让（2026-10-16）

- build/integration.exit.txt=0：0014—0026 整合构建通过。production-labels、production-routes、production-basic-editing/result.json 均 passed，使用独立生产页 24750 与独立数据目录；不是原生安装包验收。
- labels-overlap-before 失败：标签下缘 94，进入路径包围盒；0027 将文字放在路径上方并保留描边间距。
- labels-overlap-fixed passed：三种线形间距、原标签输入/撤销/复制、短线及长文本导出、清空删除撤销、保存新浏览器恢复；export.png 人工查看文字与曲线分离。当前对陡线留白较大，未实现贴近曲线路径的自适应布局。
- 完整 lint 通过，既有结构/类型 9/3 警告。0027 尚未重新构建或安装；生产证据只覆盖至 0026。


## 标签字体异常恢复

labels-font-retry/result.json passed：受控 fontManager.loadFont 一次拒绝，真实 UI 提示、保留文字、点击重试恢复、撤销历史不增加；后续原标签回归与保存重开通过。font-failed.png 已查看。不是所有离线/缺字场景验收，未进入安装包。完整 lint 通过（既有 9/3 警告）。


## C06.3 列表与自由画笔

- lists-pencil-roundtrip/result.json passed：真实键盘中文两段文本、Ctrl+Shift+8 无序列表、Ctrl+Shift+7 有序列表、Tab/Shift+Tab 缩进；Shift+P 后真实鼠标多段绘制、撤销重做；保存到本机、新浏览器恢复列表语义及曲线路径。restored.png 已查看，编号和笔迹均可见。
- lists-pencil/result.json 保留首次失败：FIG 曲线存储采用 float32（packages/fig/src/node-change/vector/network.ts），重开另补齐描边默认值。探针对网络数值采用 Math.fround 的格式精度规范化，并按实际渲染器 stroke.cap/join 回退规则比较描边；未改变产品或放宽为仅比较对象数量。
- 便签搜索无专用入口；富文本样式、画笔设置/取消/容器和其它图形尚未据此验收。本轮没有产品代码改动，未重跑无关 lint/build。


## C06.3 便签首轮

0029 实现新建便签、原生正文编辑及创建批量撤销。notes/result.json passed，含中文输入、两级撤销重做、复制、方向键移动及保存新浏览器恢复。完整 lint 通过。notes-drag 和 notes-title-drag 均 failed：真实指针拖动未移动，待诊断；颜色/尺寸、长文和重开后编辑未完成，便签不能标 done。安装包未更新。


## 便签拖动与长文边界

0030 使用原生垂直自动布局，使便签空白处可拖动。notes-layout-drag/result.json passed，包含真实指针位移、复制、撤销和保存重开。notes-long-reedit 证明重开双击编辑、长文撑高可运行，但第二次保存重开纸面高度 890→200，正文高度仍保留；此失败待修，不算完整便签验收。完整 lint 通过，安装包未更新。


## 长便签再次保存恢复

0031 修复普通布局变更未标记来源尺寸编辑，保留派生加载的原文件保护。notes-long-source 为失败诊断；notes-long-layout-source passed，含长文第二次保存重开。155 项场景图基础/FIG patch/文字回归通过；初次 4 项 Windows WASM 初始化失败用显式 locateFile 测试预加载解决。公共布局影响仍需相关 layout 与连线回归，尚未生产整合或安装。


## 0031 生产整合

- layout-regression.log：71 项布局、保存几何、派生文字及 FIG 布局测试通过。
- build/notes-integration.exit.txt=0，完整构建覆盖至 0031。
- notes-production/result.json passed：生产页便签编辑、拖动、复制/撤销、长文撑高及两次磁盘保存重开。
- labels-production-0031/result.json passed：生产页连线标签编辑/导出/历史/保存恢复。
- 安装产物未更新；便签颜色/尺寸交互仍待完成，C06 未整体收口。


## 属性面板切换与便签样式

0032 消除资产面板对属性面板的遮挡。notes-properties-input、notes-properties-history 数据回归 passed：原生宽度/填充控件、撤销重做、草稿保留、保存及长文两次重开。properties.png 人工检查发现正文即时不可见，重开恢复；因此视觉验收未通过，待定位。完整 lint 通过，0032 尚未整合构建。


## 便签首次输入缺字定位

阶段截图证明首次输入后已缺字，属性操作不是首因，直接 PNG 也空白。notes-font-content-diagnostic 通过测试端对实际正文 ensureGraphFonts + layoutAuthoredNodes 后恢复可见中英文，高度22→52；该测试干预仅用于诊断，不计产品验收。空文本创建时准备字体的尝试无效已恢复，当前源码仍至0032。下一步产品化正文字体准备。


### 便签实时文字显示修复（0033）

notes-live-final/result.json 为最终开发页回归（passed）；首次正文排版后再进行历史/属性/保存操作，FONT_DIAGNOSTIC=0，无测试字体加载干预。首次中英文显示、属性变更与 PNG 正文已查看。0033 添加正文预览变化监听及异步字体准备，正常流程通过。早期 notes-live-fonts 失败记录保留；异常字体重试、延迟切换边界和生产构建待验，当前安装版尚未包含此修复。


### 便签字体异步边界（0033，开发环境）

notes-font-boundaries-graph/result.json passed：受控 fontManager.loadFont 拒绝后正文仍在、真实 UI 重试恢复；延迟期间更新正文后仍保留最新内容和输入焦点；延迟期间删除后不复活、撤销删除重新准备字体；调用公开 replaceGraph 替换场景后不写入旧便签或错误。失败提示和最新正文截图已查看。测试通过宿主加载器注入故障，不代表真实网络断开、字体永久不可用或安装环境已验。

初次 notes-font-boundaries 在多行 keyboard.insertText 出现末行重复，保留 failed；改为真实 Enter 分段输入，并在释放字体前先断言正文，notes-font-boundaries-keyboard 与最终 graph 运行通过。多行注入/真实剪贴板的差异仍需在富文本粘贴任务核查，未声称修复粘贴。


### 0033 生产整合

build/note-live-fonts.exit.txt=0，完整构建覆盖至0033。notes-production-0033/result.json passed：生产24750、无诊断模块注入，首次排版、历史、属性/面板、复制、长文自适应与两次保存重开通过，properties.png 已查看。桌面安装包尚未更新。便签正常子流程已验证，C06 富文本样式及粘贴继续开发。


### C06.3 局部富文本与多行粘贴

新增 probes/rich-text.mjs，以真实键盘建立 [7,11] 选区，对 Bold 子串加粗/斜体/下划线，核对其余 Normal 前缀继承普通样式；撤销下划线及重做、保存新浏览器重开验证通过。rich-text-effective 和 rich-text-paste/result.json passed。FIG 重开会显式补入局部 fontFamily，比较时保留全部样式字段并将省略字体按节点继承字体展开；原始不等失败 rich-text-range 保留。首轮 rich-text 选区未建立导致全段加粗；rich-text-selection 使用了不适用于单行拉丁字的高度门槛22，后改为等待编辑器真实 paragraph 就绪并断言实际选区。

Ctrl+V 测试通过受控 navigator.clipboard.readText 返回两行中英文，按实际快捷键粘贴、撤销恢复旧富文本、重做并保存重开，正文没有重复行；没有修改用户剪贴板，未证明真实系统权限或外部 HTML 富文本粘贴。restored.png 中局部三种样式可见，paste-restored.png 两行文本正确。

视觉缺口：仅英文正文时中文便签标题显示缺字，加入中文正文后标题正常；标题字体准备仍需修复。另外重开后的截图存在“有未保存改动”状态，需核查0033重新测量是否对未变化作品造成脏标记；暂不声称便签整个生命周期已验收。

rich-text-production/result.json passed：同样局部样式与受控多行粘贴流程在生产24750通过，未导入源码模块。上述标题字体和重开脏状态缺口仍保留。


### 0034 便签字体布局与标题

0034-note-layout-and-title.patch 将异步字体完成后的同文重测放在 graph.withLayoutMutations 中；这是布局而非内容编辑，避免打开后触发无历史内容修改。仍保留普通编辑布局的尺寸来源标记，未改为全部 derived，长文尺寸保存不回退。便签标题单独按名称准备 CJK fallback，空正文也会准备，名称参与签名。

rich-text-clean-title/result.json passed，新增打开后 local-save-status 与 hasUnsavedChanges=false 检查；notes-clean-layout/result.json passed，长文两次保存重开仍通过。rich-text-title-ready/result.json passed，诊断仅轮询现有 getCJKFallbackFamilies（不加载字体）并等渲染帧；截图 restored.png 已查看，中文标题与英文富文本均可读，已保存状态正确。首次截图仍可能早于异步字体完成，不代表字体可用性没有等待。完整 lint 20029 退出0，既有9/3 warnings；0034 reverse apply 检查通过。此修复尚未生产构建/安装。


### 0034 构建与文字属性

build/note-layout-title.exit.txt=0，完整包/结构/类型/Vite/PWA构建覆盖0034。rich-text.mjs 增加可选 OS_CANVAS_TEXT_PROPERTIES=1：实际打开属性面板，将字号18改24、文本水平居中、填色改884422，再验证改色撤销/重做、保存重开、局部字重/斜体/下划线仍保留、多行粘贴及再次保存重开。快照增加字号/行高/字间距/对齐/颜色，其中颜色六位小数归一化，未忽略内容。

rich-text-properties-focused/result.json passed，restored.png 已查看，24号居中棕色文字可见、状态已保存。两次初始探针失败分别是尝试fill非input和编辑后沿旧spinbutton定位，原证据保留在rich-text-properties、rich-text-properties-input；最终按点击后focus输入框填写，无强制点击或产品注入。首次重开截图可能仍在等待标题/斜体字体，0034异步完成后的标题证据见上一节，不宣称首帧无缺字。

rich-text-properties-production/result.json passed：0034生产24750同样流程通过，诊断关闭，重开hasUnsavedChanges=false。桌面安装版未更新。


### C06.4 分区/画框/层级导航首轮

新增 probes/sections-frames.mjs。真实Shift+S拖动创建SECTION，F创建内部FRAME，R创建画框内矩形，图层名双击输入中文“素材分区”“方案画框”；Enter/Shift+Enter进出层级，Shift+Right移动父框并验证子对象相对几何不变，撤销重做，保存新浏览器重开。sections-frames-focus/result.json开发页passed。首轮sections-frames在图层面板仍有焦点时Enter不进入子层，原失败保留；测试明确将键盘焦点交给canvas，再验证画布命令，不宣称面板Enter同义。

生产24750的sections-frames-centered/result.json passed，另增Shift+2使选中画框中心与画布中心误差<1px，重开精确恢复zoom/panX/panY。首次sections-frames-production错误期待zoom>1，源码zoomToBounds最大1，截图已经居中；改验实际几何居中，不改缩放策略。restored.png已查看：名称数据、嵌套与恢复视角正确，但画布中文标题缺字，图层树名称正常；0034便签专用标题处理未覆盖普通SECTION/FRAME，需修复。

该子流程不等于完整导航/分区交付：跨分区拖动/层级重排、锁定隐藏、裁切、搜索定位、下一个画框/演示以及大画框被覆盖面板遮挡的适配仍需验证。当前分区部分在资产面板背后，符合画布底层但不能据此宣称所有内容适配均避开面板。


### 0035 通用画布标题字体

0035-canvas-title-fonts.patch 新增通用标题字体准备，覆盖 FRAME/SECTION/COMPONENT/COMPONENT_SET/INSTANCE 名称，按名称字符选择CJK/Arabic fallback；创建、重命名、删除和换图触发，名称去重并串行加载，异步结果不写作品数据。UI显示加载中及失败重试。便签移除重复标题加载，正文测量仍保留原逻辑。其他脚本标题未声明覆盖。

sections-title-fonts/result.json passed，等待标题loading状态消失后截图restored.png已查看，分区/画框中文正常且hasUnsavedChanges=false。sections-title-retry/result.json passed：受控fallback返回空集合时显示错误、名称保留，恢复加载器并点击重试后正常；继续导航/历史/重开通过。此为受控故障，真实网络失败缓存/永久缺字体需额外验证。rich-text-shared-titles/result.json passed：便签局部样式、字号/颜色/对齐、受控多行粘贴、两次重开仍正常。

初轮lint因Set去重写法违反仓库规则失败；改用es-toolkit uniq，不更改检查规则。补丁反向检查与diff检查通过。尚未生产构建/桌面安装。


### C06.4 对象状态与裁剪，0035生产整合

build/canvas-title-fonts.exit.txt=0，完整构建覆盖0035。sections-frames.mjs增加OS_CANVAS_OBJECT_MANAGEMENT：锁定/隐藏快捷键和裁剪实际checkbox，各自撤销重做；快照纳入visible/locked/clipsContent，新浏览器重开保留隐藏且锁定的子对象及裁剪状态。objects-management/result.json passed。

objects-clipping/result.json passed：真实方向键将矩形移动至画框边缘外，裁剪开/关截图已查看，溢出70px部分消失/恢复。不是只断言布尔字段。几何与容器关系保留；锁定后的拖动拒绝、隐藏对象命中排除和跨容器重排尚未完整实测。

objects-production/result.json passed：生产24750同流程通过，标题故障注入关闭，无源码模块注入；重开等待标题加载提示消失，中文标题可见、hasUnsavedChanges=false，隐藏/锁定/裁剪/视角均恢复。桌面安装包未更新。


### C06.4 图层顺序与跨画框移动

新增probes/layer-management.mjs，真实创建两画框和重叠矩形；Ctrl+[调整同级顺序，撤销重做；图层树真实dragTo将矩形拖入另一画框，确认parent改变而世界坐标/尺寸不变（局部x为负属于保留原位置），撤销重做及新浏览器重开。layer-management/result.json开发页passed。

layers-pointer-production/result.json生产页passed，扩展恢复后用真实方向键移入目标框，再用指针向左拖400px进入源框，验证父级自动改变与世界坐标移动，撤销重做及第二次保存重开。canvas-drag-restored.png已查看，两矩形返回源框、目标框空。此轮快照通过但截图出现“有未保存改动”，原件保留。

新增最后一次重开dirty/status检查后，layers-pointer-clean-check/result.json生产页passed，finalDirty=false、finalSaveStatus=已保存到本机。尚未解释前一截图状态差异，不能以单次不复现宣称不存在问题；需记录自动保存和恢复的时序再定位。跨分区、多选/旋转/自动布局容器和图层树同级指针排序仍不在本轮范围。


### 恢复事件跟踪与锁定/隐藏命中

layers-restore-trace/result.json生产passed：禁用自动保存并观察重开后1500ms，记录仅两次显式保存POST，最终dirty=false；末次恢复只有页面身份元数据写入，载入后没有内容/历史/视口更新。先前截图“有未保存改动”的差异仍未定位，不据单次不复现标修复。

layers-lock-container/result.json生产passed：实际点击拖动锁定子矩形会选中并移动父画框，子局部位置保持，世界坐标随父变化；撤销父移动后恢复，子不能被直接拖动。隐藏子对象后点击原位置不能选中它，取消隐藏保留场景；原跨框与两次保存重开继续通过。首次layers-lock-hit的世界坐标不变假设失败原件保留，容器行为不应误判为锁定失效。


### C06.4 画框浏览与预览面板

frame-navigation/result.json生产0035 passed：真实创建/命名两个画框，N按空间顺序前进并循环，Shift+N后退；预览入口进入play、返回编辑保留场景和图层面板。截图发现资产面板在play仍覆盖画布，不能视为完整预览体验。

0036-preview-asset-panel.patch 将资产面板v-show条件与editing对齐，不卸载实例；frame-navigation-panel/result.json开发页passed，真实输入目录草稿后进入预览，目录输入和图层面板隐藏，返回编辑保留草稿且场景不变。playing.png已查看资产面板不再遮挡；未测试正在执行的落盘任务。补丁反向检查通过，尚未生产构建。

当前验证只证明画框快捷浏览与进入/退出play，不证明交互链接、逐帧幻灯播放、动画或完整演示。搜索仅找到内部focusNodesByName（链接精确名称定位），未找到用户画布搜索入口；名称搜索/结果选择/跨页定位仍需实现和验收。


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
