# 083：单实例导入、新建与真实刷新恢复

2026-10-16，EMB-03继续。未部署、推送或调用模型。

## 实现

0065补丁为嵌入模式增加文件导入路径：先解码独立文件，保存原文档，再写入新管理区副本，通过REQUEST_CONTEXT_OPEN请求宿主完成原有保存/打开事务。FIG保留原字节，其他支持格式转为FIG；不直接替换活动图，不创建额外tab。独立画板模式保持原入口。恢复读取快照后走同一副本路径，原修订不被覆盖。

“文件 → 新建”经showNewTab/newForBridge和宿主协调；OPEN_CONTEXT的draft选项在当前store内准备空图、更新独立canvasId及代次。未编辑空草稿不落盘，即使点击保存也不新增管理区文档。REQUEST_CONTEXT_OPEN有ACK，嵌套宿主PREPARE/OPEN不会占住编辑器命令队列而死锁。

## 真实证据与纠错

证据根为 `output/dev-evidence/canvas-embedding/`：

- `bridge-switch-083-final.log`：9项协议/控制器测试通过，含编辑器发起打开请求等待宿主保存/丢ACK协调的完整嵌套流程。
- `import-083/report.json`：真实文件菜单/原生文件输入导入FIG，新增管理区副本，活动store身份不变，通过。
- `import-new-083b/report.json`失败：新建返回snapshot时opening仍为true，宿主永久显示加载中。将snapshot移至finally清除opening之后返回，`import-new-083c/report.json`通过：FIG导入、空草稿、手动保存不落盘、同store及原三层交互/保存/中文/主题回归均成立。
- `reload-recovery-083b`、`reload-recovery-083c`失败：未找到恢复入口。`reload-recovery-diagnostic-083`与`reload-recovery-readable-083`进一步证明恢复断言不可靠，后者在刷新前独立读取快照为空。
- 根因是原探针使用`waitForFunction(async ...)`。当前安装的Playwright `lib/coreBundle.js:23851`实现检查Promise真值而非等待最终布尔值；它可能返回false的句柄，调用方未断言。已改为有限12秒循环，每次await frame.evaluate完成真实metadata与FIG读取，明确断言布尔值，再单独读取确认。081相关快照证据已加更正，不继续引用其通过字段。
- `reload-recovery-polled-083/report.json`通过：实际停止画板服务、503后编辑留存、自动等待快照、metadata/FIG均存在、刷新后恢复对话框出现、恢复修改x=451、复用刷新后的同一个store、新管理区副本、旧画板原修订不变。该恢复是副本恢复，不冒充原ID重连或项目隔离。
- 最新资源包 `.runtime/canvas-workbench-package-083c` 构建退出0；宿主构建083、根类型通过。083b上游完整Vue类型通过；最新上游类型句柄见current。类型感知lint083c退出0，tabs/index.ts仍有618行超过600的warning，无error。初次重复import与then缺返回的错误已修复，失败日志保留。
- 0065反向apply检查通过，证明补丁与当前checkout一致；git diff --check通过。

## 尚未完成与接续

EMB-03保持doing。当前文件菜单/导入/恢复已复用单实例，但仍须审查内部直调store.openFigFile/openDOMFile、外部storage入口及目录/历史入口是否绕过约束；不能只凭菜单测试宣称所有替换路径覆盖。当前importForBridge的不确定POST失败重试需要保留operationId/目标ID（避免重试多副本），空草稿、导入与恢复还须接入EMB-04项目归属。恢复来源当前保留，可重复显示；后续需在确认副本落盘后做可追溯的恢复完成标记，并验证内存降级提示与项目隔离。不要通过直接删除快照绕过这些门槛。

`scripts/canvas-bridge-failure-qa.ts`新增CANVAS_QA_RELOAD_RECOVERY=1；`scripts/canvas-embedding-qa.ts`新增CANVAS_QA_IMPORT=1。测试使用独立temp数据、独立临时服务；原用户服务与数据未操作。恢复测试额外记录了IDB删除调用栈用于定位，含的均为隔离样例ID和临时回环地址。
