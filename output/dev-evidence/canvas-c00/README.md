# C00 OpenPencil 基线证据

日期：2026-10-15。源码 78355fd3890cc9da9539235ee3b38beb917f2ed6；Bun 1.4.2；Windows；Edge 150.0.4078.105。

## 结果

- frozen-lockfile 安装成功，2009 packages；再次 setup 无依赖变化。
- scripts/canvas.ps1 packages 成功。原版 dev 在 Windows 的 headless WASM 路径加载失败。
- 应用 apps/canvas/patches/0001-windows-headless-wasm.patch 后重新构建 core，dev 成功，端口 14220 / 14221。
- scripts/canvas.ps1 probe 成功：鼠标画 240×160 矩形、Control+Z 撤销、Control+Shift+Z 重做、实际下载 OS-C00.fig，关闭浏览器进程，在全新进程/上下文导入，形状与几何保持；pageerror 为 0。
- 保存/导入调用实际编辑器 API，未覆盖系统文件选择器 UI；鼠标与快捷键为真实浏览器输入。并非原版全套测试或 Tauri 验收。

[结构化结果](baseline.json)记录节点、修订来源、补丁 SHA256 与浏览器版本。[导出作品](OS-C00.fig)、[重启前截图](before-restart.png)、[重启后截图](after-restart.png)可复核。

## 已发现缺口

FIG 往返重写节点 ID，首次严格身份断言失败，原始结果见 failure.txt。复核确认原版几何保存正确，但不能据此声称 OS 稳定身份已实现。后续 probe 分别报告几何通过和 identityPreserved=false；C02 必须解决业务身份与场景格式映射。

原版桌面 EditorWorkspace 使用左右 SplitterPanel 挤占中央画布，不符合全窗口底层画布要求。C01.1 将保留编辑器与侧面板组件，验证覆盖层适配及焦点边界。

上游自动保存测试存在模拟句柄，其结果不能代替本次磁盘往返。上游部分测试用 Meta 快捷键，Windows 需要单独验证。完整 build、全套测试、节点隔离、网页承载及透明桌面尚未验收。
