# ADR-021：自动连接恢复与浏览器测试隔离

2026-10-07。用户只需登录并对话，临时网络故障应由工作台处理。

启动认证、快照读取和事件流恢复使用[connection-read](../../src/connection-read.ts)。只重试GET，每次8秒超时，按1/2/5秒退避；清理页面时取消请求、等待与事件流。401立即结束，回到登录，不把失效认证当网络故障。旧快照不能覆盖较新游标。任务、上传及其他写入保持原对账逻辑，不能因恢复连接自动重复执行。

失败的EventSource主动关闭；确认登录、读取新快照后显式重建。只依赖浏览器自动重连的首版在真实关闭/重启后未恢复，失败保存在[记录](../../output/dev-evidence/client-recovery-stream-failure.json)。现有内容保留，状态提示自动恢复，未发送输入继续保留。

四项[真实HTTP工程测试](../../tests/connection-read.test.ts)覆盖503恢复、连接丢失/损坏JSON、401终止及超时/取消。[隔离探针](../../scripts/probe-client-recovery.ts)提供真实后端和断流控制；浏览器操作通过CUA，测试控制令牌留在忽略目录，不加入产品功能。

同浏览器同主机名的Cookie不按端口隔离。早期127.0.0.1测试覆盖了工作台Cookie，恢复当前工作台登录并只撤销其旧会话；其余30会话保持。后续测试改localhost，主产品仍127.0.0.1，实际重新加载主页面验证仍登录。详见[事故记录](../../output/dev-evidence/client-recovery-cookie-incident.json)。

真实内置浏览器及390像素视口证据见[031](../dev/iterations/031-client-recovery.md)。这不等于默认Chrome、真实手机或公网验收；业务后台退出原因未确认，服务恢复另有记录。
