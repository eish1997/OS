# C01.2 隔离原型验收

日期：2026-10-16。早期执行隔离原型已验证；不等于 C08 节点产品化或完整权限验收。

| 要求 | 实现与证据 |
| --- | --- |
| 真实运行实例 | QuickJS WASM/独立 Worker；runtime.json、packaged/result.json、native-canvas/result.json |
| 实例可终止 | 解释器 CPU 中断、ready 后取消运行中循环、私有管道关闭回收；runtime.json、packaged/result.json |
| 错误不拖垮画布 | 真实 Tauri 图节点运行循环期间可用可信输入绘图；报错后再次执行成功；native-canvas/result.json 与 canvas.png |
| 能力桥接可行 | 已认证本地服务→受控任务→独立解释器，仅传递 JSON；授权素材文本读出在 sandbox-service.test.mjs 通过 |
| 宿主权限边界 | 拒绝客户端 engine/assets 配置，无 token 401；guest 无 process/require/fetch/Tauri；函数 constructor 未越出 guest；越界素材标识拒绝；原生界面请求进程能力拒绝 |
| 并发与生命周期 | 两实例上限，取消后能运行新实例；迟到响应不能覆盖新实例 ID；late-response/result.json、服务测试 |
| 可独立装配 | 140 文件运行时目录及包声明，834 文件原生验证资源；原生 release 不依赖开发服务器 |

原生验证身份与 exe 摘要见 native-host.json，资源见 native-staging.json。UI 请求仍通过真实 Tauri 私有服务桥；测试 URL 仅用于图断言。正式已安装版本未替换。

边界：当前原型为同步脚本和可信文本视图。任意自定义 DOM/JSX、媒体渲染、异步 I/O、动态文件授权、安装更新回退、草稿持久化、总进程内存约束及完整恶意代码样例留在 C08；不能把它们默认为通过。旧 opaque iframe 的 Tauri 初始化错误仍保留，网页承载需 C01.3 独立验证。

失败记录：packaged/first-failure.json 与 failure.json 保留 Worker 继承父 --input-type 的诊断；已通过 execArgv=[] 修正。原生首次探针 1871 等待旧 URL 超时，观察到实际已导航至带 isolation-prototype 的入口；增加显式 initialURL 后 97229 通过，未修改产品启动行为来迎合探针。
