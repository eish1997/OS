# 077：受管画板服务生命周期与容量计量

2026-10-16。EMB-02进行中；完整目标、未部署/未推送/零模型调用边界不变。

## 改动与证据

- `apps/canvas/local/workspace-owner.mjs` 使用独立SQLite的长事务取得管理区OS锁，不通过过期时间/PID删除锁。同目录第二个服务被拒绝；正常关闭、真实进程被杀后可重开。server.close等待请求、观察者及存储关闭；任何清理异常保留所有权至进程结束，避免未知写入者仍活着时放行。
- `CanvasService` 完成显式两次重试、并发请求合并、启动超时清理、dispose禁止重启。真实宿主进程死亡后，私有stdin断开使子服务退出，随后新实例能取得管理区。令牌不在argv/env/页面；日志只记固定类别。
- `loadCanvasPackage` 校验格式、必需入口、每个文件大小/摘要及路径/链接，再执行服务。createApp新增显式canvasPackageDir接线，从dataDir/canvas运行受管子服务；关闭宿主时dispose。尚无正式环境启用项，保持开发隔离。
- `server/storage.ts` 新增canvas容量分组，包含场景、数据库、导入暂存；`CANVAS_MAX_BYTES`默认512MiB，共用原整体配额和恢复预留。测试证明计量与宿主准入检查互相计入。**子进程实际写入尚未逐路径接入准入，不能宣称容量保护已完成。**

证据根 `output/dev-evidence/canvas-embedding/`：

| 证据 | 结果 |
| --- | --- |
| local-077.log | 本地画板60通过，包含新服务独占/真实死亡测试 |
| service-lifecycle.log | 最新5通过：并发start/独占、超时、两次重试上限、dispose取消重试、真实父进程死亡 |
| host-077.log | 当时生命周期4项与容量相关，共19通过；之后新增dispose另在上述5项中覆盖 |
| package-build-077.log | 全新676文件、35331301字节候选，打包退出0 |
| embedded-ui/report.json | 改为createApp受管bundle服务，完整绘制/中文/双向拖动/保存重开通过，0页面/网络/CSP错误 |

资源清单/静态路由/代理测试4通过，宿主tsc与diff检查通过。上述验证使用临时目录或.runtime专用候选，不操作用户数据；所有QA进程在finally关闭，打包/浏览器命令已退出。

## 接续重点

下一步是统一跨进程容量准入，不是继续增加只有计量的检查。原StorageCapacity使用 `.storage-write.lock` 独占同步写，不能把async callback塞进现有withLock（会过早释放）。画板保存/导入/SQLite日志、文件索引和DirectoryObserver均有写入，不能只拦截代理POST。应复用同一预算/锁协议或明确持久预留机制，测并发、失败释放、507后恢复与控制空间仍可用。

EMB-02仍未通过；桥协议/项目切换与所有内部画板入口归属、完整交互矩阵、一致备份和V12性能门槛均保留待办。不要将临时CanvasTransport全局管理区接口发布给真实用户，勿因已有包/页面可用就结束交付。
