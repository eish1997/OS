# OS · 全能画布资产管理器

OS 正在重构为个人优先、本机运行的画布式资产管理器。加入本地文件夹后自动建立画布，文件与工作内容共同组织；结合白板、设计编辑、多媒体、网页以及可由 agent 开发和发布的节点。

底座已选择 OpenPencil。先交付独立画布，再接入重构 OS。已固定并运行 OpenPencil，完成编辑与真实 FIG 文件重开基线（含 Windows 兼容补丁）。独立画布开发入口见 [apps/canvas](apps/canvas/README.md)；文件夹资产管理及扩展能力仍在开发。仓库根应用仍是旧 OS 工作台。

## 开发入口

从[文档索引](doc/README.md)开始，按顺序阅读：

1. [需求与验收](doc/全能画布需求文档.md)
2. [架构与数据约定](doc/全能画布架构与数据约定.md)
3. [agent 循环开发执行文档](doc/开发执行文档.md)
4. [开发现场与下一步](doc/dev/current.md)

视觉与工作台布局继续遵循 [design.md](doc/design.md)：底层全窗口画布，上层可分割、停靠、浮动及图标化的窗口。完整窗口管理随后开发。

## 现有 OS 的维护

保留旧工作台及其数据、会话、账号和备份能力。不要把重构文档清理理解为删除运行数据。维护细节见[旧系统运行说明](doc/deployment.md)。

现有仓库使用 Node.js 24+；以下是旧 OS 的检查入口，并非尚未建立的 OpenPencil 命令：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run.ps1 build
powershell -ExecutionPolicy Bypass -File scripts/run.ps1 test
powershell -ExecutionPolicy Bypass -File scripts/run.ps1 probe
```

启动已有服务会影响运行环境，应按实际部署说明操作。新画布的安装、启动和验证命令在 C00 建立可复现基线后写入现场。
