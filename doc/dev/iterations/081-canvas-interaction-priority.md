# 081：保存并发的交互控制与恢复快照核实

> 083复核更正：本轮自动快照探针使用`waitForFunction(async ...)`，当前Playwright实现将Promise作为真值，未验证最终布尔值。因此下文“自动快照落盘通过”不构成有效证据；083改为逐次await读取并明确断言后重验。保存/重启及交互证据不依赖这个异步谓词，保留原范围。原报告保留，不能继续引用其快照字段作为完成依据。

2026-10-16，EMB-03继续；未部署、推送或调用模型。

## 实现与证据

共享桥将 SET_INTERACTION 从持久化命令串行队列中分离，仍校验来源、实例、代次、请求和序号。控制通道最多4个待确认请求，保存等业务命令仍为默认16个；两侧都保留有界准入。控制只修改交互外壳，不取消持久化、不提前ACK保存。

- `bridge-081.log`：6项通过，新增满16个保存请求时仍能阻挡/恢复编辑，保存须待实际处理结束才确认。
- `.runtime/canvas-workbench-package-081` 构建退出0，宿主构建通过。`bridge-ui-081/report.json`：真实保存请求保持未返回时打开/关闭模态，2秒内分别确认inert及解除；保存仍显示“画板保存中”。之后实际落盘、主题/线宽、双向拖动、中文和重开全部通过。
- `recovery-snapshot-081/report.json`：真正停止画板服务，修改节点并保存失败后，不调用手动快照API，等待上游自动快照；IndexedDB中出现本次编辑后的metadata与同ID实际FIG二进制，字节数一致。重启服务保存原canvas、提交后列表失败重试不增修订继续通过。
- 宿主类型和diff检查通过。没有新改上游源码，0062/0063保持，081资源包包含新的共享桥。

快照落盘不等于完整恢复验收。代码核实：`document/recovery/controller.ts` 默认3秒防抖/10秒maxWait，`io/source.ts`在没有文件handle/path/storageBinding时启用；`recovery/store.ts`在IndexedDB失败时降级内存并console.warn，当前产品还需明确提示这时无法保证刷新恢复。`tabs/index.ts:reusableTabStore`在首页或未编辑Untitled文档复用store，其他情况创建新tab；所以原RecoveryDialog不能直接当嵌入模式单实例恢复入口。必须继续验证恢复内容、身份及项目归属。

## 下轮切换事务的具体现场

当前 OPEN_CONTEXT 等待workspace.open成功后更新context，host等ACK更新自己的context；如果ACK超时但加载稍后提交，双方可能不一致。现有 `local-workspace.openDocument` 调用 `applyImportedDocument` 后还可能await切页，错误时也会重置canvasId，不能当作事务。

已查实际实现：

- `document/io/imported-document.ts` 用stagingEditor.preparePage先准备首个页面，然后同步replaceGraph。
- `packages/core/src/editor/create.ts:replaceGraph` 当前始终选择首个页面。
- `pages.ts` 有preparePage与同步commitPageSwitch，但prepared.generation属于各自editor，不能拿stagingEditor的凭证直接提交liveEditor。

可实现方向：准备目标时就准备metadata指定页面；让replaceGraph支持已验证的目标pageId，随后同步恢复metadata/viewport，移除图替换后的异步切页。提交前检查操作ID、deadline、取消标记及旧图版本。新增同实例的有界优先取消/核对命令，以switchId取消对应未提交加载并返回实际context；若已提交，宿主按实际结果收敛，不能凭timeout自行认定取消。最终仍需真实延迟加载/取消/重试浏览器证据。

新图/FIG导入的身份协调、单实例恢复及项目隔离尚未解决。不得把本轮快照写入或优先通道通过当作EMB-03完成。

所有本轮命令已结束：52241资源包、65680浏览器，恢复快照探针直接退出0，无在途句柄。最新可运行候选081，隔离验证目录见各report；旧用户服务未操作。
