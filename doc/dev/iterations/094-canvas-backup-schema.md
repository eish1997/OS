# 094：画板纳入备份 schema 2

2026-10-17，EMB-06 开始。未部署、推送或模型调用。

## 实现

`backup` 在数据根存在 `canvas/` 时，用只读 `VACUUM INTO` 快照允许的 SQLite，并复制 `scenes/*.fig`。不包含 `service-owner.sqlite` 与 WAL 附属文件。含画板的备份使用 schema 2；无画板仍为 schema 1。`verifyBackup` 接受 1 和 2，拒绝未知路径与未知 schema。

## 验证

`tests/canvas-backup.test.ts` 3 项通过：绑定与场景恢复后可读；关闭功能后源数据仍在；受管服务就绪时也可快照。`tests/canvas-capacity.test.ts` 既有 507 配额断言保留。旧 schema 1 清单仍可校验。

## 仍未完成

容量耗尽后的用户清理/重试浏览器剧本，以及 V01–V12 全量证据索引仍待 EMB-07。
