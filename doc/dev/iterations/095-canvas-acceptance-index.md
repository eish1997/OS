# 095：嵌入验收证据索引

2026-10-17，EMB-07。未部署、推送或模型调用。096/097 补齐后更新本表。

## 可运行入口（隔离）

1. 编辑器包：`.runtime/canvas-workbench-package-090`
2. 宿主静态：`output/canvas-workbench-build`
3. 启用：`CANVAS_ENABLED=1` 且 `CANVAS_PACKAGE_DIR` 指向上述包；独立 `dataDir`
4. 剧本：既有 QA + `canvas-capacity-qa.ts`（真实 507）、`canvas-residual-qa.ts`、`canvas-acceptance-qa.ts`
5. Node：本仓库约定的 24.19 运行时
6. 使用说明：[画板嵌入使用说明](../画板嵌入使用说明.md)

## V01–V12

| 编号 | 状态 | 证据 |
| --- | --- | --- |
| V01 | 有 | `bridge-ui-080-final`、`interaction-ui-093` |
| V02 | 有 | `bridge-ui-080-final`、`interaction-ui-093` |
| V03 | 有 | 画板中文 `bridge-ui-080-final`；对话 composition `acceptance-ui-096`/`residual-097`；专注 `focus-ui-092` |
| V04 | 有 | `project-ui-087` |
| V05 | 有 | `project-ui-087`、`bridge-recovery-080d`、`conflict-ui-090`、`capacity-ui-097` 真实 507 |
| V06 | 有 | `conflict-ui-090`、`acceptance-ui-096`；进程租约 `canvas-service` 双宿主；跨标签 `residual-097` |
| V07 | 有 | `import-retry-084b`、`canvas-resources`、091 |
| V08 | 有 | 传输/资源越权拒绝；令牌不进前端 |
| V09 | 有 | `canvas-backup` schema2/在线观察/schema3 拒绝；`capacity-ui-097` |
| V10 | 有 | `relocation-078`；`residual-097` 仓库外包+100%/150%+无404；窄窗主题 `acceptance-ui-096` |
| V11 | 有 | `acceptance-ui-096`/`residual-097` Pi+插件+布局导入 |
| V12 | 有 | `switch-leak-095`；`residual-097` 20 次切换单 iframe + heap/listeners 采样 |

## 剩余限制

- 嵌入默认关闭；开启须显式包路径。
- OS 级中文输入法全路径仍需本机抽检；自动化为 composition 事件。
- 不包含正式部署、推送或真实模型调用。详见 [097](097-canvas-residual-closure.md)。
