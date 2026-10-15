# ADR-034：窗口身份与独立对话

2026-10-15，实施中。

新 `conversation` 业务实体独立于布局实例。Task/Run 添加可选 conversationId，旧数据无需破坏性迁移。创建会话使用 commandId 去重；GET列表和消息、POST创建均通过现有认证。

Service.submit 在同一事务中为有 conversationId 的请求确定该会话最近执行；无执行明确传 null，不回退项目最近执行。显式前驱必须属于同一会话。retry 继承原 conversationId。旧任务默认接续排除有 conversationId 的执行；旧项目聚合历史仍作为兼容总览，不冒充已经按会话分离的历史。

历史查询由 Run 的 conversationId 筛选事件，分页游标沿用事件 sequence。原始 Pi sessionId/JSONL、模型策略、预算和调度机制不改；多个聊天仍排队执行。没有全局迁移脚本，不重写历史Pi会话。

`tests/workbench-conversation.test.ts`验证同项目两个会话、交叉前驱拒绝、跨项目拒绝、重复提交、重试归属、旧模式隔离及干净目录备份恢复；原生会话回归同时通过。UI已验证两次独立提交和指定聊天资料输入；调度禁用、无模型请求，不能作为在线Pi验证。
