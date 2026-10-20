# Pi 能力计划有限剩余清单

2026-10-20。这份清单取代台账各行末尾没有终点的“仍待 / 待补 / 待做”。已有证据留在原行。没有写进这里的事项，不另开相邻修复。计划第 6 节 PIV-01–18 都在下面，没有改成可选。

## 阻断交付

这些不关闭，不能进入候选版本验证。

| 编号 | 任务 | 缺口 | 完成条件 | 验证 |
| --- | --- | --- | --- | --- |
| B1 | PIF-02 / PIV-03、PIV-14 | 已关闭。复制时会清掉字面、空白改写，以及仍含记忆关键词的转述；清不掉时整段摘要改为「已删除记忆」，原件不变 | 保持 `tests/native-session.test.ts` 中 fork 记忆用例。无新改动不重跑 | 2026-10-20 证据 `output/dev-evidence/pi-parity/loop-153/`。纯同义词且无共享词见兼容限制 |
| B2 | PIF-04 / PIV-15 | 已关闭。流式、交互、追加预算、分支各自具备写入前失败、事务回滚、提交后同键重放三格 | 保持 `doc/dev/pi-interrupt-matrix.md`。无新缺陷不改矩阵外代码 | 2026-10-20 证据 `loop-154/`；矩阵见 `pi-interrupt-matrix.md` |
| B3 | PIF-05、PIF-09 / PIV-15 | 已关闭。进程矩阵每格均有证据或使用说明；矩阵外不再改代码 | 无新缺陷不改进程回收 | 见文末矩阵与「进程回收说明」 |

## 本计划尚未完成的功能和验收

| 编号 | 任务 | 缺口 | 完成条件 | 验证 |
| --- | --- | --- | --- | --- |
| F1 | PIV-10 / PIF-08 | 已关闭。设置页可预览并确认导入；思考档位和技能、模板数量可见；原文件不变 | 保持 `npm run test:pi-settings-ui`。无新改动不重跑 | 2026-10-20 浏览器脚本通过，证据 `output/dev-evidence/pi-parity/loop-150/` |
| F2 | PIV-09 / PIF-08 | 已关闭。页面可点开始登录并看到授权地址，令牌不出现在页面；本地探测显示工具数；执行记录显示传输已连通后变为已断开；本地服务可在执行中被调用 | 保持 `npm run test:pi-mcp-login-ui`。无新改动不重跑 | 2026-10-20 证据 `output/dev-evidence/pi-parity/loop-151/` |
| F3 | PIV-07 / PIF-06 | 已关闭。页面能看到最终回复后缀，刷新后仍是同一条；工具面板能看到收尾前补上的预览，刷新后仍在 | 保持 `npm run test:pi-stream-ui`。无新改动不重跑 | 2026-10-20 证据 `output/dev-evidence/pi-parity/loop-152/` |
| F4 | PIV-01 | 已关闭。同一离线会话完成写、编辑、读、grep、find、powershell 与取消；取消后已有文件内容不变 | 保持 `tests/pi-native-tools.test.ts` 六步总检。真实模型驱动样本并入 PIV-16 | 2026-10-20 证据 `loop-156/report.json`。注明非真实模型任务 |
| F5 | PIV-02 | 已关闭。导入后的思考档位进入之后新任务 policy；导入前任务保持原档位；不支持档位有页面说明 | 保持 `npm run test:pi-settings-ui`。实际请求映射并入 PIV-16 | 2026-10-20 证据 `loop-155/report.json` |
| F6 | PIV-03 | 已关闭记录。证据路径见 `piv-records.md` | 无新压缩改动不重跑 | `piv-records.md` + LOOP-095–108、loop-153 |
| F7 | PIV-04 | 已关闭。约 120MiB 导入备份还原后可打开并追加接续；扫描耗时与 workerPeakRss 已记；127MiB 既有扫描一并收录；未提高配额 | 保持 `tests/native-import-fork-capacity.test.ts`。无新容量改动不重跑 | 2026-10-20 证据 `loop-157/report.json`；既有 `import-large/`、`import-fork/` |
| F8 | PIV-05 | 已关闭。loop-162 为 hold 机制；loop-165 模型+powershell 工具墙钟约 323s（calls≥1、工具≥1、`DONE_LONG`），随后接续写入 `CONTINUED` | 保持证据；无新时限改动不重跑 | `loop-162/` + `loop-165/report.json`（model-tool-over-5min-then-continue） |
| F9 | PIV-06 | 已关闭。页面可见 429/503 恢复两次请求与 401 单次失败；失败计入同一任务额度；401 无自动重试；追加后累计保留 | 保持 `npm run test:pi-budget-ui`。工程路径见 `tests/pi-retry-worker.test.ts` | 2026-10-20 证据 `loop-158/report.json`。无真实供应商 |
| F10 | PIV-08 | steering 和追问已有浏览器证据。本轮不重跑 | 保持 LOOP-021 证据，除非 F3 改动了同一页面 | 无新改动不重跑 |
| F11 | PIV-11 | 四类交互和两页只接受一次已有证据 | 对照记录写明测试名。页面若被 F2 改动，只补被改的那一步 | 无新改动不重跑 |
| F12 | PIV-12 | 已关闭。五种会话动作明确拒绝；终端组件/主题/编辑器列入使用说明；插件主题不可启用 | 保持 `pi-usage-notes.md` | 2026-10-20；LOOP-040；插件页「网页不支持」 |
| F13 | PIV-13 | 已关闭。工作台真实上传 `deepseek-flash` 识图：答案可核对、会话含原图像素、刷新/重开/无新附件接续、非视觉模型提交前 400 | 保持 `loop-170/`；无新识图改动不重跑 | 2026-10-20 `output/dev-evidence/pi-parity/loop-170/`（`vision-probe.json` + `vision-ui-report.json`） |
| F14 | PIV-14 | 已关闭记录。证据路径见 `piv-records.md` | 无新导入改动不重跑 | `piv-records.md` + loop-153 |
| F15 | PIV-16 / PIF-11 | 已关闭。三类对照 + 识图样本均有证据。`loop-165` 多文件/长历史/MCP；`loop-170` 真实识图 | 无新对照样本不重跑 | `loop-160`–`163`、`loop-165/`、`loop-170/`；见 `pi-comparison-prep.md` |
| F16 | PIV-17 | 已关闭。主界面完成设置、查看、纠正、交互、恢复；含窄窗、键盘、Chrome 150% 缩放与双页同步 | 保持 `npm run test:pi-sweep-ui`。无新布局改动不重跑 | 2026-10-20 证据 `loop-159/report.json` |
| F17 | PIV-18 / PIF-12 | 合并/部署未授权。交付= `dulse` 验证后合并 `main`，不另建部署位。候选：构建/探针/串行 134、识图闭环、只读合并准备已写 | 授权后按 `pi-deploy-checklist.md` 提交并合并；本阶段不改 main、不推送、不重启 | `loop-169/`、`loop-170/merge-prep.json`；`pi-usage-notes.md` |

## 回归债（已关闭）

| 项 | 说明 | 验证 |
| --- | --- | --- |
| 强停/MCP | 强制终止忽略竞态 `done`；worker 退出即标 `interrupted`；重开未对账 failed 工具；树确认仍挡 acknowledge | `faults`、`pi-mcp-worker`、`pi-nested-mcp-force-stop`、`pi-stream-crash` |
| 备份 `.output` | `verifyBackup` 允许会话路径中含点的目录段（如 `sessions/.../.output/.../processes.jsonl`） | `tests/pi-native-output-worker.test.ts` |
| draft 接续 | 只能从任务最新 attempt 重试；夹具对齐 `task-budget-addition` | `tests/draft-agent.test.ts` |
| 串行全套 | Node 24 需 `--test-timeout=180000`；134 文件串行 exit=0 | `npm run test:serial` → `loop-169/`（failed=0） |

## 可以写明的兼容限制

这些不是未做的必做项。使用说明里要出现，不能拿它们代替上面的表。

- 技能和模板不跟随符号链接。`node_modules` 和点开头的目录不登记。
- 不安装 npm 或 git 包，不执行扩展脚本。用户启用的 MCP 仍须按 F2 实际调用。
- 不把原版设置切到另一个模型提供商，不读取 `auth.json`，不把凭据写入普通配置或数据库。
- 不支持任意终端组件、主题和快捷键。页面不提供看起来已接通的开关。
- codemode 的额外模型入口保持关闭，直到单独授权。
- 创建时间对不上、或从未由本次执行启动的进程不结束。见下方进程说明。
- 摘要里若只用同义词、且与已删除记忆没有任何共享关键词，复制时无法识别，可能仍留在副本中。不要把已删除机密写进可能被摘要的正文。

## 进程回收验收矩阵

只关这张表，不再为相邻时刻加代码。

| 格 | 必须结果 | 证据 |
| --- | --- | --- |
| 本次启动记录里的进程，创建时间仍相符 | 结束 | LOOP-141 |
| 记录时 shell 还在，其后出现的子进程；shell 退出后仍在 | 结束 | LOOP-144 |
| 根进程还在时，第一次列表之后出现的子进程 | 结束 | LOOP-134 |
| 创建时间不符 | 保持运行 | LOOP-141；见说明 |
| 从未由本次执行启动 | 不结束 | 见说明；不另做探测 |
| 进程在创建时间记下之前已经退出 | 不按 PID 补杀 | LOOP-141 |
| 快照时根进程已经消失 | 不结束无关 PID | 见说明 |

### 进程回收说明

强停只会结束「本次执行启动记录里、且创建时间仍相符」的进程。创建时间对不上的进程会保持运行，需要你在系统里自行确认后再处理。从未由本次执行启动的进程不会被结束。若强停时根进程已经消失，工作台不会去结束无关 PID；界面会按未完全清理处理，请在任务记录里核对后再重试或手动结束残留进程。

## 原版对照准备

见 `pi-comparison-prep.md`。
