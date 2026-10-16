# 本机工作区服务

C03 新增目录资产登记：`POST /mounts` 接收绝对路径、`GET /mounts` 列举；`POST /mounts/:id/scan` 扫描直属项、`GET /mounts/:id/files` 读取已登记资产。所有入口沿用宿主认证。扫描不递归、不跟随链接，64 项一批读取元数据；部分失败保留此前快照，不把未读到的项标为删除。

前端目录打开后扫描，也可点“刷新目录”。local-file-nodes.ts 用原生 FRAME/TEXT 表示文件，fileLink 元数据连接稳定资产 ID；更新只改外部文件标签与关联，不改几何及撤销栈。knownFileAssets 记录已展示资产，用户移除展示后不会被刷新立即重建；已有副本可引用同一资产。外部扫描属于观测同步，不进入作品撤销，也不撤销原件变化。文件节点不是媒体预览的最终实现。

`probes/file-nodes.mjs` 验证重命名/缺失、用户移动与已提交 Nudge 撤销、普通工作内容、移除展示、离线及重开。最初撤销测试未等上游合并移动形成历史，诊断日志保留；等待实际 Nudge 记录后验证通过，不以固定延时替代。中文文件名与状态标签已通过字体分片补丁修复并截图验证；自动监听与失败恢复已验证，见后文。

`mounts.sqlite` 保存目录身份及唯一画布 ID；`files.sqlite` 保存稳定资产 UUID、相对路径、类型、系统身份线索、修订及状态。后者含不可随意丢弃的资产身份，不是可整体删除的缩略图缓存；可重建的是文件观察字段。首次同内容文件保持不同身份，可靠的一对一文件身份匹配才推断重命名，硬链接歧义不自动合并；同路径身份改变标为 replaced，保留原关联等待后续显式重新关联。missing/离线记录不删除，扫描不写原件，也不改场景几何。前端文件节点与自动监听已接入。

Node 24 测试入口增加 `file-index.test.mjs`。最新 11 项存储/目录/HTTP 回归见 `output/dev-evidence/canvas-c03/index-service-tests.tap`。临时目录测试涵盖增改删、可靠重命名、同内容独立身份、同名替换、链接边界、硬链接歧义、离线恢复与服务重启后保留资产 ID。

C02 已通过验收。`workspace-store.mjs` 使用 Node 24 内置 SQLite 和不可变 FIG 内容文件；`server.mjs` 提供可信本机 HTTP 桥。已接通开发界面的保存、Ctrl+S、普通保存菜单与重开；首次绘图及后续改动默认自动保存；未编辑空白不会自动建作品。文件关联已接通；桌面桥仍待实现。

`fixtures/` 是本项目 identity probe 生成的两个嵌套图形样例，无用户素材；固定保留，用于跨进程恢复与中断测试。

```powershell
node --test apps/canvas/local/workspace-store.test.mjs
node --test apps/canvas/local/server.test.mjs
```

以上需要 Node 24；系统 Node 版本不符合时显式使用 Node 24 路径，不修改旧 OS 的运行配置。本机已验证的 Node 24 路径记录在开发现场。

接口：`save({canvasId, operationId, expectedRevision, scene, metadata})` 返回确认提交的修订；`read(canvasId, revision?)` 读取并校验内容；`operation(id)` 查询提交结果以处理超时重试；`list()` 仅列出已提交画布。metadata 格式版本从 1 开始，界面窗口配置必须单独保存，不混入作品快照。

存储先刷新不可变场景文件，再用 SQLite FULL 同步事务提交元数据、当前修订及操作结果。旧版本保留；重复操作返回原结果，修改旧修订会报冲突。崩溃可能留下未引用文件，当前保留而不清理。恢复验证覆盖进程退出，不声称已验证突然断电/文件系统故障。格式 1 的文字和内嵌图片随 FIG 保存；未知版本拒绝读取，同版本未知元数据保留。未来格式迁移及节点包版本清单仍需后续实现。

服务入口为 `node apps/canvas/local/service-cli.mjs`。启动环境必须提供 `OS_CANVAS_DATA_DIR`（独立管理目录）及 `OS_CANVAS_TOKEN`（每次会话生成、至少 32 字符的随机令牌）；可选 `OS_CANVAS_PORT`（默认 14222）与 `OS_CANVAS_ORIGIN`（默认 http://localhost:14220）。日志不会打印令牌。当前需调用方设置 `Authorization: Bearer <会话令牌>`，dev.mjs 已编排开发编辑端与服务启动，令牌留在宿主代理；独立调用方仍需提供令牌。

HTTP 协议：`GET /health`、`GET /canvases`、`GET /canvases/:id?revision=N`（元数据）、`GET /canvases/:id/scene?revision=N`（FIG 二进制）、`GET /operations/:id`（已提交操作）。`POST /canvases/:id` 的 JSON 包含 operationId、expectedRevision、metadata、sceneBase64。成功 200、版本冲突 409、非法输入 400、未找到 404、过大 413；失败不返回成功修订。默认请求上限 350 MiB，存储场景上限 256 MiB；这些是协议拒绝上限，不代表性能预算。

`GET /canvases/:id/revisions` 按修订倒序返回历史。界面“历史版本”恢复旧场景时沿用当前最新修订作为并发检查基准，提交为新修订，保留已有历史。读取期间若用户继续编辑或改变视口，提交到编辑器之前中止替换并保留当前内容；未保存内容先保存后才能恢复历史。文字和内嵌 PNG 的原始字节、节点身份已通过全新浏览器重开验证。历史目前不分页，也不自动清理。

同一 metadata 格式版本内，编辑端保留不认识的画布、视口和页面字段，保存时仅更新负责的已知字段；页面按稳定 UUID 匹配附加数据。未知格式版本仍拒绝读取，不用丢字段的方式降级。保留扩展描述不表示加载或执行扩展。

这层服务只供可信宿主使用。监听仅限 127.0.0.1，核对 Host、Origin 和会话令牌；不携带 Origin 的可信本机调用仍需令牌。未知节点代码不能直接获得令牌，桌面桥与独立开发页使用同一保存语义。权限拒绝测试通过不等于节点隔离已实现。

布局独立保存在 `layout.sqlite`，不进入画布 FIG 或作品修订。`GET /layout` 返回 revision 与 layout；`POST /layout` 接收 operationId、expectedRevision、layout，具备独立冲突与幂等重试。当前 layout 格式 1 仅保存 panels.layers/properties 可见性并保留未知字段；完整分割/浮窗及命名配置在 C11 扩展。未知格式/损坏布局不覆盖原数据，界面保持可用并提示，作品服务仍可使用。测试入口为 `node --test apps/canvas/local/layout-store.test.mjs`。

目录自动更新：`POST /mounts/:id/poll` 与其他本机接口使用同一认证。DirectoryObserver 使用非递归 fs.watch，事件触发下次轮询扫描；每 10 秒补扫兜底，首次连接必扫，离线恢复重新建立监听。客户端每次请求结束后间隔 1.5 秒轮询；30 秒无请求释放监听，服务关闭统一释放。扫描仍经 FileIndex 身份校验和串行化，不跟随链接。自动扫描失败保留当前画布且不阻止独立保存。`directory-observer.test.mjs` 验证真实事件、离线、漏事件和资源释放；`node apps/canvas/probes/automatic-files.mjs` 验证实际画布自动同步。大目录规模性能仍属 C05。

子目录：`POST /mounts/:mountId/files/:assetId/open` 根据已索引身份打开直属目录；补扫并重新核对类型和身份，拒绝符号链接、不可用或被替换的目录。返回 Mount；重复打开和目录改名复用原 canvasId。节点来自其他挂载时拒绝，不接受客户端提供任意相对路径。

文件或子目录同路径替换确认：`POST /mounts/:mountId/files/:assetId/replacement-preview` 返回目标路径、大小、修订和短期 token；`replacement-confirm` 接收 `{token}`。预览不写关联，确认时复核原件身份、修改签名、源修订和目录可用性，成功保留资产 ID 并增加一次修订。相同 token 精确重试返回已提交结果；原件再次变化拒绝。token 最多 256 项、5 分钟失效，服务重启需重新预览；已确认关联保存在 files.sqlite。此入口不写磁盘原件；其他路径及目录恢复见下文。

跨目录目标：`POST /file-targets/preview` 接收 `{path}`（绝对普通文件路径），只读预览，不登记目录。`POST /file-targets/confirm` 接收 `{token}`，重新检查目标身份和修改签名；确认后登记目标父目录，扫描并返回可引用的 FileEntry，重复确认复用已有资产。若已有目标需确认同路径替换则拒绝，不能绕过替换确认。前端将单个节点引用改为目标 FileEntry，使用编辑器文档变更记录提供撤销/重做，随后纳入原保存事务。原资产记录及其他引用不合并、不删除。外部目标挂载仅同步画布实际引用的文件。

挂载目录恢复：`POST /mounts/:id/relink-preview` 接收 `{path}`，返回原路径、目标路径及短期 token；`relink-confirm` 接收 `{token}`。复核源登记和目标目录身份后单事务更新 mounts.sqlite，保留挂载/画布 ID，拒绝目标已属于另一画布。预览 5 分钟有效、最多 256 个，重启需重新预览；提交后重试返回同一挂载。扫描与目录监听同步检查挂载身份，已开始的旧扫描不得覆盖新目录观察；原文件身份、作品和布局不被清空，同名新文件继续要求确认。父画布中被替换的子目录节点确认时，若已登记子画布，会先恢复其挂载，再更新父节点的资产身份，保留原 canvasId。两个数据库不构成共同原子事务：中断可能暂留父节点 replaced，重新预览并确认可完成恢复；不建立重复子画布。子目录内同名新文件仍需单独确认。replacement.test.mjs 已验证父索引写入失败、重新打开索引及重试；child-replacement.mjs 验证真实界面往返。

最新 C03 后端回归共 18 项通过，证据 all-service-tests.tap；生产页面自动同步与本机画布列表重开通过，见 output/dev-evidence/canvas-c03/production。目录离线、被替换、不可访问分别显示对应状态。

C04 开发中：output-store.mjs 以独立 outputs.sqlite 记录落盘意图和内容，刷新同目录临时文件后用硬链接无覆盖发布；支持发布后日志中断的身份核对与重试。output-store.test.mjs 覆盖真实目录中的幂等、重名竞争和恢复。服务已接通，界面、正式成果扫描去重和关联确认尚未接通，不能作为已交付落盘功能；硬链接兼容性、进程强杀、磁盘满/写保护仍待验收。

落盘接口沿用本机认证：POST /outputs 接收 operationId、canvasId、nodeId、sourceRevision、mountId、name、contentBase64，仅接受已经保存的画布修订；POST /outputs/:id/commit 提交；GET /canvases/:id/outputs 返回该画布操作日志（目前含已提交待关联项）。临时文件名单持久记录并从直属扫描排除，无关同前缀文件仍正常索引。重启后可查询和继续提交，尚未实现界面自动恢复及原节点关联确认。最新后端回归 24 项通过。

正式成果的扫描条目可包含 outputOrigin（操作 ID、来源画布/节点 UUID、来源修订）。该映射从落盘日志与文件系统身份推导，重开及无歧义改名可恢复；同名替换和硬链接别名不冒认来源。编辑端尚未消费此字段，原节点关联和去重仍未完成。后端完整回归现为 25 项通过。

编辑器已消费 outputOrigin：同一画布中无现有文件关联的来源节点直接附加引用，保留名称/几何/内容，避免创建额外卡片。适配层真实浏览器保存重开已验证；完整导出 UI、可见关联提示和端到端落盘仍待完成。已有显式引用不会被扫描覆盖。

中断验证增加 output-recovery.test.mjs：独立子进程在部分写入、目标发布后退出，再由父进程重开真实存储恢复；ENOSPC/EACCES 用测试子进程专用 fs 故障注入，未填满磁盘或修改用户目录权限。恢复后内容一致且操作不重复；完整后端 29 项通过。未完成临时文件会保留并排除扫描，尚无自动清理。

生产 PNG/TXT 和普通保存重开回归已通过（canvas-c04/production）。本机成功提交后通过独立 protectSavedRecovery 确认当前编辑器恢复草稿已受保护，避免重开误弹“未保存工作”；未保存内容的恢复及其他会话草稿保留。

未发布操作支持 POST /outputs/:id/cancel，以及 POST /outputs/:id/replace（replacementId、name）。取消保留原内容与现有文件，后续 commit 拒绝；更名以同一数据库事务停止旧操作并建立原快照的新操作，精确重试不重复创建。原件已发布时拒绝取消/更名，需继续确认恢复。界面在未完成列表提供对应按钮，更名使用上方成果文件名且保持原扩展名。最新后端 32 项及开发 UI 验证通过；生产状态见开发现场。

落盘日志当前 schema 2：旧 schema 1 在升级前通过 SQLite VACUUM INTO 生成一致性备份；旧版本会拒绝 schema 2，避免错误重新提交 cancelled 操作。新增迁移回归后完整后端 33 项通过。取消/失败/完成后的 onIdle 会恢复被暂停的自动保存调度，延迟取消响应测试已验证无需再次编辑或手动保存。
