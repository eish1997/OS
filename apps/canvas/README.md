# OS 独立画布

已完成编辑基线、核心契约与本机保存验收；目录画布已接通并完成主要验收，OS 扩展尚未实现。

`upstream.json` 固定 OpenPencil 源码提交、Bun 版本和独立端口。源码在被忽略的 `.runtime/open-pencil-upstream` 中获取；不向旧 OS 的 package.json 或 node_modules 安装画布依赖。上游许可证在该源码根目录 LICENSE 中，必须随实际分发保留。

在仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/canvas.ps1 setup
powershell -ExecutionPolicy Bypass -File scripts/canvas.ps1 packages
powershell -ExecutionPolicy Bypass -File scripts/canvas.ps1 dev
```

开发地址为 `http://localhost:14220`。服务运行时，在另一个终端执行 `scripts/canvas.ps1 probe`，用已安装的 Microsoft Edge 和全新浏览器进程验证绘图、撤销/重做、真实 FIG 下载及重开；不使用个人浏览器配置。证据写入 `output/dev-evidence/canvas-c00/`。

全窗口画布原型地址为 `http://localhost:14220/?os-canvas`，使用原编辑器和覆盖式图层/属性面板。执行 `scripts/canvas.ps1 workspace` 验证布局、输入和交互预览；执行 `node apps/canvas/probes/identity.mjs` 验证业务标识的 FIG 往返与复制行为。证据及未完成边界见 [C01 报告](../../output/dev-evidence/canvas-c01/README.md)。完整浮窗管理尚未实现；目录画布与本机保存进展见下文。

本机保存原型使用 `scripts/canvas.ps1 local-dev -NodePath <Node24可执行文件路径>`：同时启动编辑器与回环存储服务，令牌只在开发宿主中传递。默认管理目录 `.runtime/canvas-data`，服务端口 14222；若已有 `dev` 占用 14220，先关闭自己的旧开发服务，或设置 `OS_CANVAS_APP_PORT`、`OS_CANVAS_MCP_PORT`、`OS_CANVAS_PORT` 使用独立端口。`OS_CANVAS_DATA_DIR` 可指定独立样例目录。

本轮实际验证环境为 14230/14231/14232，入口 `http://localhost:14230/?os-canvas`，数据目录 `.runtime/canvas-c02-test-data`。点击“保存到本机”，随后可在“本机画布”列表重开。`node apps/canvas/probes/persistence.mjs` 默认连接 14230；可用 `OS_CANVAS_TEST_URL` 改地址。验证涵盖全新浏览器恢复、改动提示及提交后响应丢失的幂等重试，详见 [C02 报告](../../output/dev-evidence/canvas-c02/README.md)。普通保存菜单/Ctrl+S 已接通本机保存；另存为仍导出 FIG。首次绘图与后续改动默认自动保存，失败保留内容并等待重试；未编辑空白不自动建作品。`node apps/canvas/probes/session-persistence.mjs` 验证快捷键、自动保存、保存期间继续编辑和标签切换绑定。

关闭开发进程后可运行 `scripts/canvas.ps1 baseline`，由上游 Playwright 配置启动测试服务器。该上游套件尚未验收；其部分快捷键使用 macOS 的 Meta，不能假定 Windows 全部适用。首次需在上游目录用固定 Bun 执行 `bun x playwright install chromium`。

完整应用构建入口为 `scripts/canvas.ps1 build`。实际执行结果与环境限制记在 `doc/dev/current.md`；这些入口的存在不代表已经全部验证。

生产页面验证：构建成功后运行 `scripts/canvas.ps1 local-preview -NodePath <Node24可执行文件路径>`，读取上游 `dist` 并同时启动本机存储服务，使用与 local-dev 相同的端口/数据目录环境变量。预览宿主复用本机桥的令牌与来源校验，不将令牌打进页面；没有 dist/index.html 时拒绝启动。此入口用于验证生产网页产物，仍依赖本地 Bun/Vite，不是桌面安装包。需要独立证据目录时，persistence.mjs 支持 `OS_CANVAS_EVIDENCE_DIR`。

原版 Windows 启动失败：headless WASM 加载将 file URL 的 pathname 当磁盘路径，得到 `/C:/...`。`patches/0001-windows-headless-wasm.patch` 使用 Node 的 fileURLToPath 修复；setup 会幂等应用，随后需重新构建 packages。许可证副本保留于 LICENSE.open-pencil。

实测限制：FIG 往返保留图形尺寸和位置，但重写节点 ID；C02 必须建立稳定业务身份，不能直接以 FIG ID 关联用户文件。基线 probe 将这一限制记录为 identityPreserved=false，不声称身份恢复已完成。

正式扩展应纳入 OS 版本管理并记录来源和修改范围，不能把唯一实现留在被忽略的运行目录中。

`node apps/canvas/probes/identity-persistence.mjs` 验证本机快照的节点/页面身份、复制粘贴、撤销重做与视口恢复；默认连接独立验证环境 14230。

`node apps/canvas/probes/draft-persistence.mjs` 验证首次内容不点保存也可落盘、空白不误建作品，以及首次失败后继续编辑和重试恢复。

`node apps/canvas/probes/layout-persistence.mjs` 验证面板配置独立落盘、重开恢复、丢响应和首次读取失败后的重试；当前仅保存两面板可见性，完整窗口配置仍属 C11。

C03 目录原型：输入本地绝对目录路径并点击“加入目录”，登记实际目录身份，为它预留唯一画布 ID 并保存初始场景；重复加入打开同一张画布。“我的目录”读取已有登记，重开对应作品。当前使用路径输入，尚未提供系统目录选择器。mounts.sqlite 独立保存目录身份与画布关联；目录离线或同路径被替换时不删除关联。已接入直属文件扫描、文件卡片和手动刷新，保留重命名/缺失/离线状态及节点布局；已接入自动监听及定期补扫，文件与目录显式重新关联已接通。`node apps/canvas/probes/mount-persistence.mjs` 使用临时样例目录验证创建、去重、工作内容保存及新浏览器重开。

中文渲染补丁 `0003-font-subset-fallback.patch` 为远程字体补充分片登记独立渲染别名，避免同字体同样式只选中不含中文的分片；不改作品中的字体名称。`node apps/canvas/probes/file-nodes.mjs` 覆盖中文文件名重命名、状态标签、布局/撤销/工作内容保留及新浏览器重开；截图见 canvas-c03/file-nodes.png。当前在线字体路径已验证，桌面字体缓存及完整离线加载尚待验证。

子目录画布入口：选中文件夹节点或其中的标签，点击“打开选中文件夹”；有未保存内容时先保存，失败则留在当前画布。子目录有独立画布，重复进入恢复原内容，可从“我的目录”返回父目录。`node apps/canvas/probes/child-folders.mjs` 验证真实父子画布往返。链接和身份发生替换的目录暂不通过此入口打开，需要明确处理关联。

同路径原件被替换时，选中“需要重新关联”的文件节点，点击“重新关联原件”，核对路径与大小后确认或取消。确认保留资产标识和节点位置，不改磁盘文件；`node apps/canvas/probes/replacement.mjs` 验证预览/取消、丢响应重试与保存。此入口支持文件和子目录同路径替换；缺失文件选择其他位置见下文。

文件换了位置：选中原文件节点，在“目标文件完整路径”中填写新位置，点击“预览其他位置的原件”，核对后确认。仅改变当前节点引用，可撤销/重做，保留位置和节点身份；确认后登记目标父目录供自动同步，不导入该目录其他文件。`node apps/canvas/probes/relink.mjs` 验证跨目录关联、撤销、目标外部修改和重开恢复。

原目录失效或同路径被其他目录替换：从“我的目录”打开原画布，在目录路径框填目标目录，点击“恢复当前目录关联”并核对确认。原画布、工作内容、布局保留；目标已关联另一画布时拒绝合并，同名新文件仍需单独确认。`node apps/canvas/probes/mount-relink.mjs` 验证恢复、丢响应重试与重开。父画布里的被替换子目录节点也可通过“重新关联原件”恢复，保留原子画布及工作内容；目录内同名新文件仍需单独确认。跨数据库恢复中断后可重新预览并确认继续，见 local/README.md。

C04 落盘原型：在目录画布中选中一个成果，填写“成果文件名”，点击“保存选中成果到目录”。当前支持 PNG 快照及文字节点 TXT，默认拒绝覆盖；同一请求失败可重试。文件来源可关联原节点，选中时显示本地路径/状态。首期 PNG/TXT 的批量、同名、丢响应重试、进程中断恢复及重开已验收；磁盘满/写保护使用明确故障注入，未宣称所有磁盘平台兼容。选中原节点可查看当前内容与原导出快照是否一致，修改后另存不覆盖旧文件。

打开目录画布后可查看“未完成的成果”，点击“继续保存”会用该操作的原内容版本继续写入，保留画布里的后续修改。恢复列表不会自动创建文件；已完成操作不再显示。开发与生产界面已验证刷新后恢复及保留较新编辑；支持取消后续提交或更名保存原快照；不删除已存在的文件。


C05 筛选：展开右上“筛选”，按文件关联、内容类型以及名称/文件名组合筛选。同类多选为或，不同条件为且；复合对象任一实际内容匹配时保留整组。隐藏对象退出选区、不可被点选；清除恢复原位置。筛选仅改变会话视图，保存保留全部工作内容，重开默认全部显示。开发/生产联调见 `output/dev-evidence/canvas-c05/`；整张作品包已通过独立管理区开发/生产恢复测试；独立安装包与规模性能仍待验收。


C05 作品包：展开“作品包”，点击“导出作品包”会先保存当前画布，下载 .oscanvas；包内包含全部已保存历史、内嵌图片、页面/节点身份、未知扩展数据、布局与文件引用，不包含外部原件。选择作品包导入后，从“本机画布”打开，不替换当前编辑内容。已有画布/目录身份冲突时拒绝覆盖；目标管理区缺原件时保留工作内容并显示缺失，通过现有目录/文件确认入口重新关联。

上传或导入中断后可重试，重开应用后在“导入记录”继续已准备的操作。包内布局单独保留，“应用包内布局”明确切换；已有本机配置不被导入覆盖。作品包格式 1 与解析器依赖当前固定上游构建，桌面封装仍待完成。生产恢复证据见 output/dev-evidence/canvas-c05/production/package-roundtrip/，包含两页、内嵌图片摘要、未知扩展、全部历史、原件离线与重新关联；不是安装版验收。


桌面服务打包准备：先完成上游依赖构建，再运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/canvas.ps1 bundle-service`。输出 `.runtime/canvas-desktop-service/workspace-service.mjs` 与摘要清单；服务及固定 FIG 解析器已合并，运行时仍需 Node 24。用 Node 24 执行 `apps/canvas/probes/bundled-service.mjs` 可在仓库外独立子进程验证鉴权、画布读取/保存和历史作品包导出。该文件只是安装资源之一，尚不是桌面安装包。Rust 编译环境使用 `scripts/canvas-rust.ps1 setup`，固定 1.99.0；环境位于本项目 .runtime，`version`/`check` 分别检查版本和桌面源码。


桌面服务私有入口为同目录的 `desktop-service.mjs`：原生宿主通过 stdin 一行 JSON 传入 directory/token/origin，stdout 只返回 ready/protocolVersion/url，不回传令牌；服务绑定回环随机端口。stdin 必须保持打开，宿主退出导致管道 EOF 后服务释放监听和存储。Tauri 侧启动与转发已接入，并已通过安装版保存重开整合验证。普通环境变量 CLI 入口迁至 `local/service-cli.mjs`，`local/server.mjs` 仅导出服务 API，防止打包合并后误执行另一入口。


资源预装配：运行 `scripts/canvas.ps1 stage-desktop -NodePath <Windows-x64-Node-24.19.0.exe>`，将现有生产 UI、桌面服务、执行该命令的 Node 和许可文件复制到新的 `.runtime/canvas-desktop-staging/resources-*`。先准备 `.runtime/canvas-desktop-service/LICENSE.node`，来源必须为 Node v24.19.0 官方仓库 LICENSE（本次从 GitHub contents API 获取并解码）；脚本不会联网获取或覆盖已有资源目录。resources.json 列出每个文件的大小/摘要和明确未完成项。设置 OS_CANVAS_STAGED_DIR 为输出目录后运行 `node --test apps/canvas/probes/desktop-service.test.mjs`，可验证实际包内运行时。尚需原生执行文件、服务桥、第三方前端许可整理及完整离线字体验证，不能作为已完成安装版发布。


原生调试版构建入口：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/canvas-desktop.ps1 -ResourcesPath <资源预装配目录>`。先安装固定 Rust，再生成最新 UI/服务和资源目录；脚本校验所有已登记资源摘要，使用生成的 tauri.os.generated.json 构建 debug/no-bundle，不启用 native-test。配置将产品标识设为 local.os.canvas，打开根路由 ?os-canvas，清空上游更新 endpoint、文件关联和深链接注册。当前已通过原生编译和真实 WebView2 保存/退出/重启恢复测试，已有安装器测试产物，完整首版交付尚未验收。运行 debug 宿主时需同时设置 OS_CANVAS_RESOURCE_DIR 和独立 OS_CANVAS_DATA_DIR；不使用原有 OpenPencil 数据。


安装产物构建使用同一命令追加 `-Installer`（release + NSIS）。Windows NSIS 已生成，独立目录安装后的普通绘图/保存/退出/重开已验证；完整首版性能、离线和交付验收未完成，未发布。原生探针可设 OS_CANVAS_NATIVE_CRASH=1 验证强制终止后服务回收与保存恢复；OS_CANVAS_NATIVE_SANDBOX=1 是独立诊断，当前会记录 sandbox-incomplete，不能把进程退出 0 当作隔离功能完成。


安装验证证据：output/dev-evidence/canvas-c05/desktop/installed-workspace/result.json。安装版服务从安装目录 canvas/runtime/node.exe 与 canvas/service/desktop-service.mjs 启动，数据在系统 AppLocalData/local.os.canvas/canvas；开发资源/数据环境变量不影响 release 版。Windows canonicalized 路径通过 file URL 作为模块入口传给 Node，避免直接脚本参数触发 EISDIR。安装器摘要和测试安装位置见 desktop/installation.json。

安装版整合探针：使用 Node 24 执行 `apps/canvas/probes/native-integration.mjs`，依据 `desktop/installation.json` 启动已安装程序，使用新建临时素材目录和新作品身份。验证目录、PNG 落盘去重、真实作品包下载/导入及进程重启恢复；结果见 `output/dev-evidence/canvas-c05/desktop/installed-integration/result.json`。探针不清空应用存储，不将此场景冒充全新管理区恢复测试。

第三方声明收集入口：先用固定私有 Rust 的 `cargo metadata --offline --locked --filter-platform x86_64-pc-windows-msvc --format-version 1 --manifest-path .runtime/open-pencil-upstream/desktop/Cargo.toml` 将 JSON 保存到 `output/dev-evidence/canvas-c05/desktop/cargo-metadata.json`，再用 Node 24 执行 `apps/canvas/collect-notices.mjs`。输出 `.runtime/canvas-third-party/`，包含依赖版本、声明、原始文本摘要和未解决项；它是待核对的保守依赖清单，不代表最终打包依赖精确清单或已完成许可验收。


### 当前首版验证入口（2026-10-16）

进度以 `doc/dev/current.md` 末尾记录为准。早期段落中的“尚需”描述对应当时原型；已安装的默认入口修复版本见 `output/dev-evidence/canvas-c05/desktop/delivery-installation.json`，输入与渲染共帧修正的独立 release 见 `input-frame-host.json`，后者的实际 NSIS 安装记录见 `input-frame-installation.json`，默认入口与整合回归已通过。不能将这些不同产物混称同一安装版本。

`patches/0005-input-render-frame.patch` 保留滚轮合并，但先消费输入再执行同帧绘制；没有改动作品格式或本机服务。设置 `OS_CANVAS_INTERACTION_HOST_RECORD` 为目标 host record，用 Node 24 执行 `probes/native-wheel-regression.mjs` 检查平移/缩放/面板输入边界；`probes/native-interaction-scale.mjs` 可指定 `OS_CANVAS_INPUT_HZ=60` 或 `120`、独立 `OS_CANVAS_MEASUREMENT_FILE` 与 `OS_CANVAS_INTERACTION_TIMELINE` 保存规模测量，避免覆盖旧证据。

完整生产构建后，以 `OS_CANVAS_AUDIT_DIST=1` 执行 `audit-ui-build.mjs` 更新真实产物/模块记录，再运行 `map-build-notices.py`、`package-notices.py`、`stage-desktop.mjs`。依赖改变时先重新 collect 并生成源码包；仅 UI 自有源码改动仍需更新模块映射。最终 NSIS 使用 `scripts/canvas-desktop.ps1 -ResourcesPath <新资源目录> -Installer`，需另做实际安装验证。


### 当前安装验证产物（2026-10-16）

最新小幅像素滚轮修复的正式身份 release 见 `output/dev-evidence/canvas-c05/desktop/fine-pixel-host.json`；对应 NSIS 归档见 `fine-pixel-installer-artifact.json`，实际安装见 `fine-pixel-installation.json`。默认入口 `performance/native/fine-pixel-installed-startup/` 和目录/落盘/重启整合 `desktop/fine-pixel-installed-integration/` 已通过。旧 input-frame 安装记录继续保留，不与新产物混用。

持续 8 图可见的新 120 Hz 场景性能和 5 分钟内存回归已通过；60 Hz 原始帧间隔仍略超门槛，旧导入首次打开超时原因未确定。C05 尚在验收，完整 C06—C12 功能并未交付。运行验证脚本时显式传入新安装记录，避免使用默认的早期 `installation.json`。命令参数和详细范围见 C05 证据 README 与 `doc/dev/current.md`。
