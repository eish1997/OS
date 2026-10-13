# ADR-001：M0 运行时与 Pi 宿主

日期：2026-10-06（Asia/Shanghai）
状态：本地离线验证通过；真实模型接口仍待验证。

## 决策

核心 TypeScript，React 19.3.0 / Vite 8.3.2，Node.js 24.19.0，Pi coding-agent 与 pi-ai 1.0.3。完整依赖由 package-lock.json 固定；Pi npm gitHead 为 d78dc83d633229d12f8b79631384c4c2717c399f，许可 MIT，原仓库 https://github.com/earendil-works/pi。

本机默认 Node 18.16.1 不满足 Pi >=22.19.0。scripts/run.ps1 优先选可用 Node 24，否则使用已有的 Codex bundled runtime：`C:/Users/15128/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`。不修改用户的全局 Node。首次 npm.cmd 使用了邻接 Node 18 并产生 engine 警告；安装禁用生命周期脚本，后续全部运行/校验显式使用 Node 24。Windows Rolldown 原生可选依赖缺失后按错误证据单独固定安装其 binding，未清空锁文件或工作区。

服务端采用 node:sqlite、WAL、BEGIN IMMEDIATE、单实例业务写入；浏览器不打开数据库。数据库实体与事件一起持久化，revision 检测写冲突。实体、Task、Run、Operation、资产版本及会话身份分开。

Pi 在独立子进程运行；宿主独占项目业务工具执行、来源主机白名单、调用预占/结算。使用宿主 ResourceLoader，禁止发现工作区扩展/技能/提示词。只启用列出的业务工具，不提供默认 shell、文件系统或高权限插件。Pi 工具参数使用固定版本 pi-ai 导出的 TypeBox，SDK 直接使用安装包类型约束。

预算必须配置，默认为零。每次 streamSimple 请求前由宿主预占；关闭自动重试、压缩、缓存预热；输出 token 限额与保守输入费用估算限制每次请求。模型费用未知时使用预留估算；供应商计价与账单仍需真实探针核对。不能使用会吞异常的扩展事件作为预算边界。

## 已有证据

- `output/dev-evidence/pi-offline-probe.json`：真实 SDK 创建、工具白名单、abort/subscribe 接口和原生会话写入/重开。没有调用模型。
- tests/core.test.ts 与 tests/api.test.ts：持久化、租约竞争、权限、预算、文件对账、HTTP、可信子进程、节点回执和联合恢复。
- 实际 React 构建和浏览器双客户端视觉检查通过。手机 viewport 是布局证据，不是真实手机跨网络证据。

## 边界与下一步

独立进程与 cwd 都不构成 OS 沙箱。未知仓库代码/安装脚本执行保持关闭；没有 Docker 隔离验收。真实 Pi prompt、stream、取消、超时、恢复和计价要使用用户配置的 API/预算实测。完整 M0 通过前不启动 M1 插件或子代理开发。所有工程命令与基线哈希由开发证据记录。
