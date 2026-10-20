# 082：迟到加载取消与提交前身份校验

2026-10-16。EMB-03继续，未部署、推送或调用模型。

## 实现

共享桥新增有界优先 CANCEL_SWITCH，以 switchId 取消待提交加载并返回真实上下文；它经过来源、实例、序号校验，但允许旧代次查询已提交结果。宿主 PREPARE_SWITCH/OPEN_CONTEXT 使用同一操作身份及25秒提交截止时间。超时后核对真实上下文：已提交则收敛到目标，未提交则保留原上下文，不凭超时假定取消。

0064补丁在替换真实图之前准备目标页面并验证页面身份清单，移除替换后的异步切页；提交前再检查取消、截止时间及原图版本/视口。桥不再把新图状态发布成旧canvasId。打开失败提示与握手/连接失败分开，业务失败不伪造离线状态或要求重连。

## 验证与失败记录

证据均在 `output/dev-evidence/canvas-embedding/`：

- `bridge-switch-082c.log`：协议及控制器8项通过，包括丢失成功OPEN确认后按真实上下文收敛、待加载超时取消后迟到任务不替换原上下文。丢ACK是端点测试，不是浏览器丢ACK实验。
- `package-build-082c.exit`为0，候选 `.runtime/canvas-workbench-package-082c`；宿主类型、完整上游Vue类型、4个接入源码的类型感知lint通过。`host-build-082d.log`是业务错误提示修复后的宿主构建。
- `bridge-switch-082c/report.json`通过：真实Chrome中延迟目标FIG请求26秒，原图/名称保留，交互恢复，再次打开成功；原保存、中文、主题/线宽、双向拖动、模态和重开回归通过。
- `bridge-switch-invalid-082c/report.json`失败，attempt 1：测试在宿主查找iframe内的错误文本，20秒超时。截图也发现业务错误被宿主误报连接失败。已保留报告与截图，修正frame定位并区分操作提示。
- `bridge-switch-invalid-082d/report.json`通过：上述全部回归，加损坏页面身份清单被拒绝、当前图和名称不变、不误报连接失败或出现重连按钮。页面异常、console error和失败HTTP响应均0。

最初lint发现可选索引冗余及switchLease空值收窄不足（editor-lint-082.log），修复后082b/082c退出0。082b资源包已结束，最新验证使用082c；不覆盖旧候选。

## 复核与接续

EMB-03尚未完成。新建/FIG和DOM导入/恢复仍可能经tabs或applyImportedDocument更换图而绕过宿主上下文流程；新增publish身份检查仅防止错误标记，不能替代这些入口的保存与身份协调。恢复快照仍缺单实例恢复和项目归属，进入EMB-04前须补齐。

已定位：`src/app/tabs/index.ts`的reusableTabStore（约205行）在非空白文档会createTab；restoreRecoverySnapshot（约524行）经showImportedGraph，图替换后还有异步prepare/switchPage。`document/io/read.ts`、`io/dom.ts`也调用applyImportedDocument。当前OsCanvasWorkspace只应持有一个store，不能直接沿用多tab恢复。后续应为嵌入模式集中处理新文档/导入/恢复的保存门槛与身份事务，独立运行模式保持。

全部本轮验证进程结束：58802构建、51905Vue类型、88509第一浏览器、99612失败探针、97243修复验证。原用户服务未操作，真实用户数据未用于验证。继续EMB-03及04–07，不将本记录当完整交付。
