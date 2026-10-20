# 079：共享桥协议核心

2026-10-16，EMB-03 进行中。只完成协议核心，尚未接入真实编辑器，不宣布桥或项目切换验收通过。

`shared/canvas-bridge.ts` 定义版本1信封、UUID实例/请求身份、上下文代次和项目/画板身份、命令与状态载荷。单消息64KiB，默认最多16个待确认命令、最多32可配置；来源窗口和精确origin先检查。消息新增单调sequence，响应缓存有界64项，缓存淘汰后旧序号也不能再次执行。

命令串行执行，出队再次核对上下文；ACK必须匹配原请求、命令和文档代次，保存处理结束前不返回确认。超时只表示未确认，不宣称取消了已在执行的持久化操作；实际保存幂等仍由 operationId 负责。实例销毁拒绝尚未确认请求，迟到响应不更新新状态。事件按代次与序号拒绝旧消息。

`bridge-079.log` 5项通过：来源/协议/实例/字段/大小；延迟保存和重复请求；队列中的上下文切换；超时、排队上限、销毁；缓存淘汰后的重放与过时状态。类型检查通过。首次检查发现 crypto.randomUUID 默认参数推断过窄，已显式标注 string；没有运行时失败被跳过。

接续需要：

1. 用可复现0062补丁将桥接入上游编辑器，并让独立模式保持；不能只修改.runtime。
2. 本机 workspace 暴露精确的 canvasId/revision/dirty/busy/error，保存屏障等待正在进行的保存/目录扫描，不用收到消息冒充落盘。空白个人草稿不落盘。
3. 宿主 CanvasLayer 握手与实例替换、状态UI、保存命令、主题/交互通知；替换直接访问子文档DOM的临时实现。版本不兼容要明确错误而非一直等待。
4. OPEN_CONTEXT 与内部本机画布入口统一处理，准备EMB-04归属协调；真实浏览器重验后再继续。

已查看入口：上游 `src/app/document/local-workspace.ts`（createLocalWorkspace、save/open、返回session）、`src/components/editor/OsCanvasWorkspace.vue`（useEditorStore）、`src/app/runtime/embedding.ts`。save目前忙时直接false，open要求当前无脏改动；需保留CAS及pending精确请求，不直接重写。applyImportedDocument先准备新图再replaceGraph，但open后续恢复视口可能失败，EMB-04需解决失败时保留旧上下文。

无在途工具命令。本轮未构建新资源包：桥核心还未进入编辑器，最新可运行候选仍为078b；未部署、推送或调用模型。
