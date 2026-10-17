# 085：宿主归属代理与两库创建对账

2026-10-16，EMB-04进行中。未部署、推送或模型调用。

## 已实现

受管资源包模式的app现在在启动子进程前建立CanvasApi/CanvasBindings。认证后的画板请求携带逐请求`X-Canvas-Project`（UUID或personal，未提供时为个人域），不使用服务器全局选中项目。未启用受管包的旧显式注入transport测试入口保持技术探针语义，不作为产品隔离入口；生产配置仍须提供校验资源包且默认关闭。

画板POST检查项目存在/归档、画板归属和创建操作。新ID先查询原管理区是否已有场景，已有但未绑定的画板不能隐式占用；新场景写入前登记prepared，原生保存确认后confirm归属。宿主确认写入失败返回失败，不冒充提交；相同operationId重试使用原生幂等结果完成确认。prepared读通过原生operations反查已提交结果，未提交仍返回409。

列表只返回当前域ready画板；场景、历史、outputs列表和作品包导出路径先检查canvas归属；operations按返回canvas反查；mount/package-import列表按canvas归属过滤。尚未具备反查的子资源写入口保持拒绝，不能直接扩大通配代理。layout仍是个人界面配置，与项目内容分开。

新增认证接口 `/api/canvas/context`、`/context/opened`、`/unbound`、`/associate`：解析最近已确认画板或临时空草稿ID，登记已打开画板，列出未绑定旧画板，显式关联旧画板。关联在宿主单一事务里prepare/confirm，不修改旧场景。近期记录仍待前端真正调用。

## 验证

- `scoped-api-085-final.log`：5项通过。新增测试用真实CanvasService子进程、真实HTTP代理及独立SQLite，覆盖A/B/个人域列表与canvas/scene/history/operation读写拒绝、旧画板不能自动绑定、显式关联不能夺走其他项目归属、prepared未提交拒绝、原生已提交后对账、宿主确认507后重试仍为修订1、非法来源、项目归档、各项目context隔离；含原transport来源/凭据剥离及开关验证。
- `scoped-personal-ui-085/report.json`：实际createApp受管资源包入口的真实Chrome全路径通过。保存、中文、主题、三层交互、导入已落盘丢响应后刷新重试、单store新建/关闭、空草稿不落盘均通过，只有明确注入的1个503及两条对应console记录。当前浏览器上下文是personal，不宣称项目选择UI已完成。
- 根类型和git diff --check通过。最新编辑器资源仍084b、宿主静态构建083；本轮修改服务端源码，无新上游补丁。

## 待继续

前端顶部setProjectId仍直接写layout，尚未接入异步项目协调。下一步改共享CanvasController为openContext(projectId,canvasId,draft)，编辑器目标元数据/场景读取显式携带目标project，提交前才更新活动请求域；旧画板保存必须保持旧域，不能先修改全局header再异步加载。成功提交后才同步项目、资产/Pi视图和recent，失败维持原项目。刷新、布局导入/跨标签更新和归档仍需同一入口，快速意图合并/取消须验证。

目录/文件/output/package-import的写入、重试和跨引用归属未完成；当前代理没有开放这些入口。作品包导出虽然已检查根canvas，后续仍要核对引用目录/文件的归属，不能仅根ID授权整个包。恢复和导入暂存的项目绑定、旧画板关联UI、冲突另存/重载也待完成。

所有本轮命令结束，80290浏览器退出0；真实用户服务与数据未操作。EMB-04仍doing，不把HTTP部分测试当全项目隔离验收。
