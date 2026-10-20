# 096：验收矩阵补齐（V03/V06/V10–V12）

2026-10-17，EMB-07 继续。未部署、推送或模型调用。

## 验证

隔离 Chrome `output/dev-evidence/canvas-embedding/acceptance-ui-096/report.json` 通过：

- V03：对话输入处于 composition 时 Delete/Backspace 不改画板；结束后可写入中文草稿。
- V06：双页面同项目，A 先保存后 B 再保存得到版本冲突，远端修订不变，并提供另存冲突副本。
- V10：980×720 窄窗下四套主题与线宽可切换，画板 iframe 与专注入口仍可见。
- V11：Pi 对话与插件管理与画板同屏，仍为单个画板 iframe，布局可保存。
- V12：嵌入加载约 2452ms，对照 `standalone/report.json` 约 2403ms，比值约 1.02。

## 剩余限制

已由 [097](097-canvas-residual-closure.md) 补齐租约、真实 507、仓库外包、V12 采样与跨标签；OS 级 IME 全路径仍见使用说明本机抽检。
