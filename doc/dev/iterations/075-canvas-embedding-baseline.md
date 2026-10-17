# 075：画板接入环境基线与嵌入入口

2026-10-16，目标仍为 EMB-00–07 完整交付。当前完成 EMB-00，EMB-01进行中；没有正式部署、推送或模型调用。

## 本轮事实

- 初始本工作树没有上游checkout和Bun。新取固定commit并应用57补丁；首次安装观测句柄退出-1时确认Bun子进程仍存活，没有重启它。确认该进程终止后重新执行冻结安装，退出0，2076 installs / 2443 packages，无变更。
- PowerShell重定向原生stderr会将Bun正常进度当作终止错误。`scripts/canvas.ps1` 的 Invoke-Checked 改为暂时允许输出、恢复错误策略后按原生退出码检查；packages和完整build随后均退出0，没有降低构建检查。
- Node24运行画板本地测试58通过、0失败。此前缺fig构建产物的两处失败消除；以前57计数包含文件加载失败，本次使用实际测试报告数量。
- 新增 `apps/canvas/probes/embedding-baseline.mjs`，要求显式指定测试URL；真实Chrome完成指针绘图、自动保存、刷新后重开，并比较图形几何。首轮load 2402.6ms、10步绘制381.6ms、无pageerror或失败HTTP；这是单矩形样本，不能用来宣称大场景性能通过。截图已检查。
- 0058补丁增加 `/canvas/` 构建base和router base、嵌入API路径、隐藏重复tab栏、嵌入构建不注册PWA。实现已同时记录到版本化patch，reverse-check通过；不是只留在.runtime。
- 新增 `server/canvas-static.ts`，通过createApp显式canvasStaticDir启用，默认关闭。登录后才可取资源；只在画板路由设置SAMEORIGIN/self，宿主仍DENY；WASM MIME、缺失资源404、路径拒绝、服务worker不可取均有测试。尚未暴露画板业务代理，当前也没有前端挂载。

## 证据

`output/dev-evidence/canvas-embedding/`：

- `pre-existing.json`：开发前未提交源码/文档摘要，保留既有插件工作。
- `baseline-manifest.json`：HEAD、固定上游、Node/Bun、57补丁摘要与验证结果。
- `setup.log`、`packages.log`、`build.log`：实际日志；首次setup观测不完整，以后续冻结安装终态和成功构建为证据。
- `local-baseline.log`：58/58。
- `standalone/report.json`、`standalone/saved.png`：真实浏览器结果与CDP指标。
- `embedded-build.log`：使用OS_CANVAS_EMBEDDED_BUILD=1，Vite构建至 `.runtime/canvas-embedded-dist`，退出0；index资源引用 `/canvas/assets/`。
- `static-test.log`：真实宿主HTTP测试1/1；宿主tsc退出0；git diff --check通过。

## 下一轮

独立预览仍用于后续对比，会话42580，地址 `http://localhost:14630/?os-canvas`，服务14632，隔离目录 `.runtime/canvas-embedding-baseline-data`。原工作台和bluegill进程未停止、未借用。再次操作前检查实际监听者和进程创建身份。

EMB-01剩余：真实宿主CanvasLayer挂载、隔离保存接口、中文编辑、双向跨层拖动、模态与资源CSP实测。仅静态路由测试不能代表完整编辑器CSP已通过。生产服务管理、项目隔离、统一配额、桥和备份均未实施，继续按原依赖推进。EMB-01中固定V12可比较样本和阈值；后续20次切换及较大样本仍待验证。
