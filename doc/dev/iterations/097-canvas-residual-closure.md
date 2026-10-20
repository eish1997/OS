# 097：计划残余项闭合

2026-10-17。未部署、推送或模型调用。接续 095/096 列出的未完成项。

## 实现与验证

| 缺口 | 处置 | 证据 |
| --- | --- | --- |
| 管理区进程租约（双工作台） | `tests/canvas-service.test.ts` 第二宿主争用同一 `dataDir/canvas` 失败，释放后可接管 | Node 测试 |
| 编辑中备份 + 目录观察 | `tests/canvas-backup.test.ts` 在线写入/poll 期间备份，必要时 409 后重试，恢复可读 heads | Node 测试 |
| 未知备份 schema | `verifyBackup` 拒绝 schema 3 | Node 测试 |
| 真实容量 507 | `scripts/canvas-capacity-qa.ts` 用 filler 耗尽准入，观测真实 HTTP 507，清理后重试 | `capacity-ui-097` |
| 仓库外生产包、缩放、404 | `scripts/canvas-residual-qa.ts` 复制包到临时目录后启动 | `residual-097` |
| V11/V12 切换与单 iframe | 20 次项目/空间切换，iframe 数恒为 1，采样 heap/listeners | `residual-097` |
| 跨标签通知 | `BroadcastChannel` 布局保存广播；同上下文双页提示 | `client.ts` + residual |
| 使用说明 | [画板嵌入使用说明](../画板嵌入使用说明.md) | 文档 |
| 默认启用 | 隔离就绪后仍默认 `CANVAS_ENABLED=0`，需显式包路径；`.env.example` 已注明 | 配置 |

## 交付审查（计划 §9 接续）

只读核对实现与证据，不推翻 iframe 路线：

1. **架构/生命周期**：管理区锁与双宿主拒绝仍成立；功能关闭不删数据。
2. **交互/产品**：手势屏障、专注、保存文案分离已在 092–096；跨标签为软提示而非自动覆盖脏布局。
3. **数据/交付**：schema 2 白名单、真实 507、仓库外包路径已补证据；系统 IME 全路径仍属本机抽检。

## 实测摘要

- `capacity-ui-097`：`realHttp507=1`，修订保留并恢复。
- `residual-097`：仓库外包、无 404、zoom 100/150、项目切换 ≥10/20、iframe 恒 1、跨标签提示、IME composition 隔离；heap 约 59→51 MiB。
- Node：`canvas-backup`/`canvas-service` 共 11 项通过（含双宿主租约与在线备份观察）。

## 剩余限制

- OS 级中文输入法键位路径未在无头 Chrome 中完整模拟，composition 事件与焦点隔离已覆盖。
- V12 `performance.eventCounts` 会随会话累计，不能单独证明监听泄漏；以单 iframe 与进程稳定为准。
- 默认嵌入仍关闭，避免无包启动失败。
