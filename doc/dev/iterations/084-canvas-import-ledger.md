# 084：导入不确定响应、入口复核与项目登记起步

2026-10-16，EMB-03阶段门槛通过，EMB-04开始。不是整体交付；未部署、推送或模型调用。

## 实现与验证

新增共享`canvas-import.ts`：以原始文件字节摘要、名称、项目构造导入键，IndexedDB事务同时保存操作ID、目标canvasId和转换后实际场景字节。Web Locks串行同源同键操作；不确定POST保留记录，确认宿主已打开后清理。最多32条未完成记录，浏览器配额/事务失败时不发送未受记录保护的POST。原始文件摘要区分源文件，暂存场景字节避免HTML等格式再次转换产生不同身份而破坏幂等请求。

0066补丁将这一机制用于管理区导入；新增`setBridgeProject`待EMB-04接入实际上下文。键当前仍使用个人域，不能宣称项目隔离已经工作。快捷键createHomeTab及closeTab在嵌入模式进入同一保存/空草稿流程，保持原store，独立模式不变。

- `import-084-tests.log`：10项共享协议、控制器和导入身份测试通过。
- `import-retry-084/report.json`首次故障探针失败在最后console检查：预期503也产生文件打开失败console，原断言只允许网络503。该次记录已经证明刷新重试没有新增副本，但不当作整轮通过。修正为严格要求且只允许这两条已知故障日志。
- `import-retry-084b/report.json`完整通过：真实POST已由服务写入，代理将确认替换成503；原图不变，管理区仅新增一个副本；刷新后重选文件，操作仍收敛到同一副本；菜单导入/新建、空草稿不落盘、快捷键新建/菜单关闭同store，以及原保存、三层、中文和主题回归通过。HTTP失败恰好1个503；console恰好对应2条；页面异常0。
- 084b资源包构建退出0；根类型、084上游Vue类型、084-final接入源码类型感知lint退出0（tabs仍有626行warning）；0066反向apply检查通过。最新运行候选`.runtime/canvas-workbench-package-084b`，宿主构建仍083。
- 初次lint拒绝local-workspace直接localStorage访问，已改为共享专用IndexedDB存储模块；日志084保留，不将失败当通过。

入口复核：应用内openFigFile直接调用仅独立demo；openDOMFile直接调用在tabs的独立分支，嵌入文件入口先返回；openStorageDocumentInNewTab仅HomeWorkspace使用，而osCanvas跳过home。作品包导入先存管理区、提示从本机列表打开，打开仍经桥；目录openMount最终经workspace.open。这些入口的服务端资源归属、目录创建、作品包和外部storage能力限制继续由EMB-04/05完成，不等同于已获得项目隔离。

## EMB-04新增基础

新增宿主`CanvasBindings`，使用现有Store.guardDatabase与SQLite事务创建独立画板归属表及最近打开表，不写layout/window.view。一个canvas只能属于一个项目/个人域；prepared记录只保留创建身份，不能冒充场景已提交；confirm核验操作ID并记录单调修订。准备记录跨宿主关闭/重开可恢复，项目归档拒绝继续选用。

`bindings-084.log`2项通过：真实SQLite关闭重开、prepared拒绝读、跨项目/个人访问拒绝、重复操作不能用于不同canvas、修订不回退、各域recent隔离、归档拒绝；另含导入身份基础验证。当前类尚未接入app/transport，因此HTTP项目隔离仍未实现，绝不能把类测试当API验收。

下一步：将归属表接入需认证的项目上下文解析/创建登记/最近打开API；代理逐请求校验项目与canvas，并反查所有子资源归属。保留prepared→服务写入→confirm的中断对账，不直接把未绑定旧画板当新建自动归属。客户端project切换必须等旧保存及新加载确认后才同步资产/Pi视图。原代理有限路由缺mount/file/output写操作，需按资源归属逐条开放，而不是扩大通配转发。

恢复来源完成标记、内存降级提示、浏览器导入暂存清理入口继续留在04/06；项目header、bridgeProjectId与恢复数据归属尚待连接。所有本轮命令已结束，无在途句柄，用户真实服务未操作。
