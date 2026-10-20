# 四类操作中断对账矩阵（B2 / PIV-15）

2026-10-20。对应计划第 5 节：流式消息、交互答复、追加预算、分支创建。每格要么有测试名，要么有本轮受控中断。矩阵外不再追加相邻时间窗。

| 操作 | 写入前失败 | 事务中回滚 | 提交后客户端未收到 / 同键重放 |
| --- | --- | --- | --- |
| 流式消息 | `tests/interrupt-boundaries.test.ts`（首块触发器）；`tests/run-stream.test.ts` | 同上，第二块失败时已提交前缀保留 | `store.command` 同块重放；`scripts/pi-runtime-ui-qa.ts` SSE 重连 |
| 交互答复 | `tests/interrupt-boundaries.test.ts`；`tests/plugin-interaction.test.ts`（reject_answer） | 状态仍为 pending，密钥未入库 | 同 `commandId` → `fresh:false`，不重发答案 |
| 追加预算 | `tests/task-budget-addition.test.ts`（非法参数） | `reject_grant` / interrupt-boundaries：无授权、无新 run | 同 `commandId` 服务端与 HTTP 重放 |
| 分支创建 | `tests/native-session.test.ts`（reject_branch_run） | interrupt-boundaries：run/conversation 计数不变 | 同 `commandId` 服务端重放；HTTP 见 `tests/pi-image-worker.test.ts` |

综合证据：`output/dev-evidence/pi-parity/loop-154/report.json`。
