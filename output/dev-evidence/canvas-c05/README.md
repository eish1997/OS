# C05 首版验收对照

更新：2026-10-16。进度权威仍为 `doc/dev/current.md`；本文件索引证据及适用范围，C05 已按首版范围验收；后续完整能力不包含在此结论内。

| 执行文档要求 | 当前证据 | 范围与剩余项 |
| --- | --- | --- |
| 类型/关联状态筛选，清除后恢复 | production/filtering.json、filtering-tiled.json | 生产浏览器的图形/坐标/恢复验证 |
| 隐藏后任务继续，输入保留 | production/filter-islands.json | 同一 DOM 实例持续运行；不代表 C08 的扩展隔离验收 |
| 整张作品导入全新管理区 | production/package-roundtrip/result.json | 独立目标存储、节点身份/历史/文件关联；源文件不可用时缺失与重新关联 |
| 目录、PNG 落盘、作品包、重启 | desktop/fine-pixel-installed-integration/result.json | 最新实际安装版，使用测试 URL 获取图断言；目录/落盘/作品包/重启通过 |
| 默认启动即进入画布 | performance/native/fine-pixel-installed-startup/result.json | 最新安装版正式 URL 无测试参数；新建/关闭最后标签也通过；旧安装失败保留 startup/ |
| 无既有下载字体缓存的离线流程 | desktop/offline-clean-data/result.json | 独立应用身份 release，初始数据目录不存在，下载缓存后验为空；依赖现有系统字体 |
| 10,000 文件初次索引 ≤10s | performance/directory-10000.json | 531 ms；真实磁盘，样例创建已使文件系统缓存变暖；不包含 10,000 张 UI 卡片创建 |
| 1,000 对象/200 独立图片打开 ≤5s | performance/native/scale.json | 1.94s/1.92s/1.13s；1440×900、1920×1080 图片、8 个可见预览 |
| 20 MiB 保存确认 ≤2s | performance/native/save-20mib/save-profile.json | 实际约 20.16 MiB，DOM 确认 1.698s；不承诺更大作品同样耗时 |
| 连续操作响应/绘制间隔 | performance/native/interaction-installed-frame-clock.json | 最新安装版，30 秒刷新时钟驱动 trusted CDP 滚轮，1,780 次输入、无背压跳过；每场景帧 8 图可见；响应/帧间隔 p95 49.9/17.1 ms，满足 100/33 ms。旧 host-clock 60 Hz 投递空档及原始超标保留，未删除样本或降低门槛 |
| 稳定运行 5 分钟进程树 ≤2 GiB | performance/native/memory-fine-pixel-visible-nativecapture.json | 新 release 重验 passed：11 次采样最大 1,188,208,640 字节，末次 1,025,286,144 字节；每次 8 图可见，首末原生截图已查看，pageErrors 为空；周期平移，非持续输入压力 |
| 冷/暖启动记录 | performance/native/fine-pixel-installed-startup/result.json | 空/复用 WebView profile 3.74s/2.26s，包含自动化开销；未测操作系统重启后冷缓存 |
| 声明与源码随附 | apps/canvas/third-party、package-notices.py、package-source-notices.py | 602 包、CanvasKit 补充及 5 个 MPL-only 源码包；input-frame-installation.json 已核对实际安装文件摘要 |
| Windows 安装交付 | desktop/fine-pixel-installation.json | 新滚轮修复安装包构建/安装退出 0；17 个随附资源与 98 个既有数据文件核对，旧 exe 未改；fine-pixel-installed-startup 和 fine-pixel-installed-integration 已通过 |

## 已知问题与证据边界

- 旧约 20 MiB 导入后打开超时原因未确定；`import-diagnostic-fast/result.json` 在新版本立即打开成功，不等于证明旧问题修复。
- `desktop/native-sandbox/result.json` 是早期 iframe/Tauri 失败；后续 C01.2/C01.3 原型已独立验收，具体见其报告。完整扩展和网页产品化仍归 C08/C07。
- 最新 input-frame 安装版包含默认入口、标签及输入/渲染共帧修正；默认入口和数据整合回归已通过。滚轮行为与持续负载证据来自同源正式身份 release。保存格式和服务实现未变，旧性能与间歇问题记录仍保留。
- 原始无效规模样例仅含 158 个不同图片资源，其旧数据不能替代 200 独立资源的门槛证据。

## 渲染层测量复核（2026-10-16）

发现旧 native-interaction-scale 探针仅包装 editor.renderer，即最后注册的渲染器；双画布模式下通常为覆盖层，旧结果不能单独证明实际场景层完成绘制的性能。已修改探针包装 canvasRenderers 全部实例，依据 tracksSceneSettlement 明确区分场景与覆盖层：响应/帧间隔只统计场景层完成，覆盖层事件另存时间线，并记录渲染器身份。当前用原安装包 SHA256 7bb967cc9a1ffc72cd1e89aa7f1cce65878bedc30b79ff547674e75b23f40da7 重测，输入/对象/图片/预算不变。旧记录全部保留；新测量完成前不据旧 120 Hz passed 关闭 C05。

## 交互测量解释（旧探针，须结合上述复核）

100 ms 输入响应和 33 ms 绘制间隔预算保持不变。120 Hz 是更密集的真实 CDP 滚轮输入，持续 30 秒，场景仍为 1,000 对象、200 独立 1920×1080 图片；不以 rAF 空回调替代绘制帧，不删除超时样本。该场景覆盖持续操作下的绘制能力。

60 Hz 的原始结果仍标 budget-exceeded。新调度下，典型长间隔的新输入在上次绘制后约 30.6—32.7 ms 才到达，渲染器按需绘制而非空闲持续刷新；因此这个原始帧间隔同时包含输入空档。它不支持宣称所有输入频率都满足墙钟绘制间隔，也不能用来要求空闲画布无意义重绘。时间线对比证明输入跨两次刷新等待已消除；进一步产品结论需保留这一适用范围。


### 可见负载复核

本轮 interaction-scene-60hz/120hz 已显式测场景层：分别 p95 33.6/33.3 ms（超标）与 49.8/17.0 ms（数值通过）。两次 measuredLayers 顺序相反，证明不能依赖 editor.renderer 的注册顺序。

但是检查 120 Hz 截图发现画面空白，timeline 最终 panX=-2572；旧 interaction-input-frame-120hz 最终 panX=-1404。两者均不能证明 8 张图片持续可见，撤回其对目标可见负载的通过推断，原始 passed 数值记录不删除。60 Hz 长间隔 110 个中 109 个含 pending=0 的空闲刷新，无至少两次 pending>0 的刷新；此诊断不删除原始间隔或改变 33 ms 门槛。

探针已增加视口初始归零、每场景绘制的 pan/zoom 时间线、200 图片矩形与每帧可见数量断言。第一次位置反馈测试 interaction-visible-scene-120hz 失败（最少可见数 0），实际 panX -1092..960。上游 Windows 整数滚轮 notch 加速路径意味着原 deltaX=4 并非固定 4 像素平移。后续明确使用 ±0.5 小数像素 wheel（触控板式）及实际视口反馈，结果另存 interaction-visible-fractional-120hz；不是 Windows 鼠标滚轮槽位性能验收，也不降低 100/33 ms 数值或 1,000 对象/200 图片规模。

import-installed-trace/result.json 在当前安装包上打开 20 MiB 新 UUID 作品成功，捕获 7 项本机请求时序、无控制台错误/页面警报。仅说明此带追踪样例通过，不证明旧首次打开超时原因已修复。


### 小幅像素滚轮分类缺陷与修复

interaction-visible-fractional-120hz 仍失败（最少 4 张可见，panX -607..587）。其原始 wheel 时间线显示多个 deltaX=0.5、wheelDeltaX=-120，合并后 deltaX=1、wheelDeltaX=-240。windowsNotches 仅排除小数，导致整数合并事件误入 notch 加速路径；不是图片加载问题。已用单元测试复现：期望 2 像素，实际 16 像素；修复前 14 pass/2 fail。

0011-fine-pixel-wheel.patch 对 pixel 模式且幅度小于既有 MIN_WHEEL_NOTCH（99）的事件采用普通像素平移/缩放，不因整数值和 legacy wheelDelta 认作刻度；line/page 及普通 100 像素刻度仍走现有路径。此为明确的小幅输入策略，不声称准确识别硬件。修复后 16 pass/45 assertions，包括旧 Windows 加速、方向切换、缩放及新合并场景。原生验证尚待新产物；不能以单元通过关闭 C05。


### 新原生修复验证（进行中）

fine-pixel-host.json：正式身份独立 release，SHA256 ca3d1423744fe012df64f3fb66dfb624bcd32bd13d4282083864bf55e8148d4f；尚未替换安装版。build:packages 完成后，修复测试的 console.log 和 Math.pow 规范问题，独立 lint 退出 0（结构 9 警告/类型 3 警告，无错误），随后实际 Vite 审计/声明/staging/native 全链退出 0，fine-pixel-package.exit.txt=0。前两次构建 exit=1 保留，分步证据见 fine-pixel-preflight.json。

- performance/native/fine-pixel-wheel/result.json passed：真实 WebView trusted CDP 输入，混合 0.5/1/2/4/-1/-0.5 事件累计位移符合像素规则；普通 100 像素滚轮刻度保持 16 像素移动；反向、Shift 平移、Ctrl 缩放锚点和面板边界回归通过。
- interaction-fine-pixel-120hz.json passed：30 秒，1,000 对象/200 独立图片，每场景帧完整可见图片 min=max=8；panX -70..-1。输入响应 p95 66.9 ms、场景帧间隔 p95 17.1 ms；预算仍 100/33 ms。测量前后截图已查看，图片正常显示，无遮住图像的面板。此证据覆盖持续的触控板式输入，不是物理设备或屏幕扫描测量。
- 60 Hz 对照和可见负载下 5 分钟内存回归尚待终态。原始失败及旧可见负载不充分的记录不删除。C05 继续 verifying。


60 Hz 新可见负载对照 interaction-fine-pixel-60hz.json：响应 p95 33.9 ms、绘制间隔 p95 33.4 ms，仍 budget-exceeded；8 图逐帧可见。fine-pixel-60hz-gaps.json：126 个长间隔中 124 个含空闲刷新，1 个含至少两次等待输入的刷新。保留原始门槛和失败状态。memory-fine-pixel-visible.json 当前为进行中，5 分钟结束前不视为通过。


### 内存收尾截图失败与重验

memory-fine-pixel-visible.json 已终态 failed：300 秒 11 次实际采样均 ≤2 GiB（最大 1,133,686,784 字节，最终 1,014,734,848 字节，均有 8 张图像位于视口），但最后 CDP screenshot 等待 30 秒后超时。memory-fine-pixel-visible-failure-analysis.json 分离采样事实和整支探针失败，不将 failed 改成 passed。

探针现在在首末恢复并捕获自有原生窗口，保存窗口 JSON/截图，同时始终保存 pageErrors；以 memory-fine-pixel-visible-nativecapture.json 新文件重验，不覆盖失败。安装器脚本要求新记录达到 native-host-passed 才能开始。

fine-pixel-pending-gap-explanation.json 补充 60 Hz 唯一两次 pending 刷新案例：-0.5/+0.5 输入相抵，30995.9 ms 场景帧无位移，探针未清理旧 pending 时间戳；下个有效输入 31028.2 ms 到达，31029.3 ms 绘制完成。旧 pending 数量不是宿主实际任务队列，不能据此宣称渲染器拖延两帧；原 33.4 ms 时钟间隔及超标状态仍保留。


当前输入延迟采用事件 timeStamp 到下一次发生位移的场景完成；相反输入抵消时旧时间戳可能计入下一次变化，属于保守观察值，不是精确的输入任务队列耗时。不会据“pending”数组自动推断应用仍有工作未处理。原 60 Hz 帧间隔数据含实际投递空档；其原始 budget-exceeded 保留，不能用空闲重绘制造通过。


fine-pixel-delivered-response.json 从既有时间线独立计算“事件已到达应用 → 下一次发生位移的场景完成”：60 Hz p95 14.8 ms、120 Hz p95 15.6 ms，无剩余事件；相反输入抵消仍可能延后计数，因此是保守诊断。它不能取代原始 timeStamp 总延迟或墙钟帧间隔指标；用于定位投递等待与应用处理边界，不修改性能预算。


memory-fine-pixel-visible-nativecapture.json 已终态 native-host-passed，探针退出 0，首末原生截图均已查看。先前 CDP 截图失败记录仍保留。fine-pixel-installer 正在基于同一 resources-XkD9jT 构建安装包，完成前不声称已安装或交付。


### 新安装包交付验证

fine-pixel-installer-artifact.json 固定安装器归档（SHA256 a4c68b1269c626eec18660d9499c594b7ac1d5ffb314ac937af5fc88378ad4de）；fine-pixel-installation.json 固定实际安装 exe（SHA256 ca92497c9863cc3bec4e1f76dac8fccf0225b5eb57d32382bd3b0c2b062bfe21）。独立测试目录安装退出 0，旧 exe 与 98 个应用数据文件摘要保持，17 个运行资源/声明文件验证通过。

fine-pixel-installed-startup/result.json 完成正式默认 URL、空/复用 WebView profile、新建/关闭最后标签测试，截图已查看；3.735/2.256 秒为含自动化开销的观察值，不是 OS 重启冷启动。fine-pixel-installed-integration/result.json passed：目录、PNG 落盘/原件保留与扫描去重、作品包下载上传、重新启动恢复身份/关联和导入作品均通过。此整合使用测试 URL 读取图断言，与默认启动证据分开。

这些结果不把 60 Hz 原始超标或旧未定位导入超时改写成已修复；C05 验收审查仍待收口。


### 刷新时钟连续输入与导入保护恢复（2026-10-16）

interaction-installed-frame-clock.json 固定最新安装版 ca92497c…，探针会话 86674 已不存在，结果为 passed。rAF 仅驱动 Node 向真实 WebView 投递 CDP wheel，不直接变更场景；30,008.8 ms 内 1,780 tick（约 59.3 Hz）、无背压跳过，收到 1,779 次输入、1,778 次变化场景绘制。所有绘制的 8 张图片完整可见，末截图人工查看无面板遮挡。响应 p95 49.9 ms、绘制间隔 p95 17.1 ms；没有空闲强制重绘，没有删去慢帧。此结果证明约定负载下连续操作预算，不承诺物理输入/显示扫描或所有投递节奏；host-clock 60 Hz 原始 33.4 ms 不改写。

native-import-diagnostic.mjs 新增 OS_CANVAS_IMPORT_GUARD_RECOVERY=1：在作品包导入后、打开前插入未保存哨兵图形，断言拒绝提示、原图形及原文档保持；用户保存后再次打开，核对目标作品名称和 1,000 个对象。最新安装版会话 18170 退出 0，desktop/import-installed-guard-recovery/result.json 为 guard-recovery-passed，consoleErrors 为空。该受控样例证明保护路径及恢复可用，不证明旧 first-load-failure 的原因就是保护拒绝。旧记录没有 UI/请求证据，根因继续记未知。

视觉审查发现剩余 C05 缺口：os-canvas-workspace 的灰色面板 token 已定义，但选中工具仍继承上游蓝色 accent；当前截图底部选中工具明显为蓝，与 design.md 黑白暖灰主色和浅底深字按钮不一致。下一步补齐工作区 accent 作用域并实际验证，不能仅以深色面板宣称视觉验收完整。


### Factory 主题修复

0013-factory-theme.patch 已修复工作区与 Teleport 菜单的主题继承，使用浅底深字的选中工具及中性色选区；原 OpenPencil 配色偏好保持。theme/result.json 为开发浏览器通过，theme/menu.png 已查看，theme/lint.exit.txt=0（完整结构/类型检查，既有 9/3 警告）。原生新产物仍在构建，不能将浏览器证据当作已安装版本已更新。


## 首版收口审查（2026-10-16）

C05 done，判定依据为顶部逐项矩阵及以下最终产物验证，不是把所有历史失败改为成功：

- 筛选/清除恢复/隐藏交互任务、独立目标管理区作品包恢复、丢失文件重关联的原始 JSON 均复核 passed，测试明确包含真实对象、内容本体、身份和历史。安装版目录/落盘/包导入/进程重启整合已通过 fine-pixel-installed-integration；其后 0013 仅修改主题，存储/服务/筛选/输入调度代码不变，此证据继续有效。
- 性能按架构原 10s/5s/2s/100ms/33ms/2GiB 和约定规模逐项验收。保存证据虽名 diagnostic-complete，但实际 snapshot 21,144,041 字节、DOM 确认 1,698ms、saveBudgetPassed=true。连续输入证据采用真实刷新驱动 CDP 投递和场景层完成，输入 p95 49.9ms、帧间隔 17.1ms；旧 host-clock 60Hz 空档超标原件保留，不用空闲重绘填数。主题变化不改渲染调度和负载，既有性能证据继续适用；不扩张到视频/网页/透明模式。
- 27446 release 构建退出 0，factory-theme-host.json 独立产物 SHA 349dc631…；19005 原生主题测试退出 0，theme-native/result.json passed，菜单截图已查看。
- 39946 NSIS 构建退出 0，归档安装器 SHA 92ec555bd6a2c7ed0c62ad3de3b4ab71ac5f7bb24f36803604d7978caa6d9ee7。install-factory-theme.py 退出 0，factory-theme-installation.json installed-data-preserved，旧安装及数据文件摘要一致、随附资源核对通过。最新安装目录 oscanvas-verified-install-gxb2283z，exe SHA 0ce2b61eae34ddffbfae0b690d2d6fc784bf9420c86e2f8d5e1a0e8a1929bdcc。
- 94482 安装后默认启动退出 0，theme-installed-startup/result.json：空/复用 WebView profile 3.12/2.14s（包含自动化观察开销），正式 URL 无测试重载，新标签/关闭最后标签/输入通过。81720 安装后主题退出 0，theme-installed/result.json passed，实际窗口截图已查看；工具、菜单、原模式主题偏好均符合预期。
- 历史 20MiB 首次打开超时仍为未定位记录，不宣称修复。当前大包正常打开追踪和未保存保护→保存→重试路径均已独立通过；现无可复现的未完成打开故障。若再次出现，按证据重开 C05 并捕获请求/警报/脏状态，不将旧未知原因静默删除。

此为当前 Windows 测试设备上的基础画布首版。完整白板/设计、媒体网页、节点/agent、透明交互及 OS 窗口仍按 C06—C12 开发；C12 的新环境/升级回退/整体交付不能由本次安装替代。
