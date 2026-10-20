# PIV 验收记录索引

2026-10-20。只收录有直接证据的项。未列完成条件的项见 `pi-remaining.md`。

| ID | 状态 | 证据路径 / 测试 |
| --- | --- | --- |
| PIV-02 | 部分关闭 | 设置保存冻结：`tests/pi-settings.test.ts`、`scripts/pi-runtime-ui-qa.ts`；导入后新任务档位：`loop-155/report.json`。实际请求映射并入 PIV-16 |
| PIV-03 | 可关记录 | LOOP-095–102、106、108；记忆转述拒绝 `loop-153` |
| PIV-07 | 关闭 | `loop-152` 流式后缀与工具预览页面 |
| PIV-08 | 关闭 | LOOP-021 steering 浏览器证据 |
| PIV-09 | 部分关闭 | `loop-151` 登录/探测/传输/本地调用；持续原生面板见剩余清单兼容说明 |
| PIV-10 | 部分关闭 | `loop-150`/`loop-155` 设置导入；资源发现与技能登记 |
| PIV-11 | 关闭 | `tests/plugin-interaction.test.ts`、runtime-ui 四类交互 |
| PIV-12 | 关闭 | 五种会话动作拒绝（LOOP-040）；终端组件/主题不支持见 `pi-usage-notes.md`，插件页主题不可启用 |
| PIV-14 | 可关记录 | 分支/导入/损坏拒绝既有测试；记忆转述 `loop-153` |
| PIV-15 | 关闭 | `pi-interrupt-matrix.md`、`loop-154`；进程矩阵 B3 |
| PIV-05 | 关闭 | hold 机制 `loop-162/`；模型+工具 >5 分钟并接续 `loop-165/`（elapsedMs≈323s，continuePass） |
| PIV-16 | 关闭 | 多文件/长历史/外部 MCP：`loop-165/`（及 `160`–`163`）。识图样本：`loop-170/` |
| PIV-17 | 关闭 | `loop-159/report.json`（`npm run test:pi-sweep-ui`）；设置/查看/纠正/交互/恢复 + 窄窗/键盘/150%缩放/双页 |
| PIV-18 | 准备中 | 无合并/部署授权。交付= dulse→main。候选 `loop-169/`；识图闭环 `loop-170/`；只读合并准备 `loop-170/merge-prep.json`；清单 `pi-deploy-checklist.md` |
| PIV-01 | 部分关闭 | 离线六步总检 `loop-156/report.json`（`tests/pi-native-tools.test.ts`）。真实模型样本并入 PIV-16 |
| PIV-04 | 关闭 | `loop-157/report.json`；既有 `import-large/`、`import-fork/` |
| PIV-06 | 关闭 | `loop-158/report.json`（`npm run test:pi-budget-ui`）；工程 `tests/pi-retry-worker.test.ts` |
| PIV-13 | 关闭 | `loop-170/`：探针 + 工作台 UI 真实识图（`deepseek-flash`）；非视觉 `deepseek-v4-pro` 提交前拒绝 |

