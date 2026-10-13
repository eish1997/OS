# 迭代009：实际登录失败的网络修复

2026-10-06。用户报告“OpenAI授权服务未完成请求，请稍后重试”，并要求考虑复用统一模型网关和本地Agent接入组件。主Agent修复连接；未安装新网关或Agent。

## 诊断与改动

旧实现把非401响应全部换成通用502，不能定位环节/上游状态。没有保存那次登录原始响应；本轮使用不含真实授权码或凭据的诊断复现：直连身份元数据/公钥均403，授权token端点返回403及unsupported_country_region_territory，证明服务出口受地区限制，不能把它描述成普通暂时错误。

Windows当前用户静态系统代理已启用127.0.0.1:7890，Node没有代理环境且未采用系统设置。通过用户已有代理，公开身份元数据和公钥均200。新增server/network.ts，复用Node24.19原生setGlobalProxyFromEnv：显式环境优先，auto在Windows复用现有静态系统HTTP代理，environment/direct可选，本机请求绕过，执行worker只继承选定网络配置；不改Windows设置或TLS，不添加网关依赖。PAC/SOCKS自动解析不支持，地区/账户资格仍由供应商判定。

自动配置后用无效诊断client/code向token端点发一次请求，得到正常JSON400 invalid_client，而非地区403。诊断没有真实登录码、模型调用或账户额度消费，不等于实际OAuth已成功。重启将结束尚未完成的旧回调尝试，用户需重新登录。

新增server/openai-error.ts：保留上游步骤/HTTP状态/已知错误码/响应形状/受限request ID；地区、授权码失效、客户端拒绝、429、HTML拦截和临时故障给出不同说明。只暴露白名单诊断，不记录/回显原始响应、授权码、令牌或服务任意错误文本。SDK/工具权限、调用上限及阶段门槛不放宽。

## 验证与结果

59项测试、类型检查、生产构建与Pi离线探针通过：[基线及命令](../../../output/dev-evidence/verification/report.json)。新增代理选择/直连覆盖、真实Node fetch经受控本机代理及回环绕过、错误诊断无秘密、真实HTTP回调403拒绝等用例；授权Chrome受控流程回归通过：[界面证据](../../../output/dev-evidence/ui/chatgpt-interactions.json)。初次代理测试遗漏Node的CONNECT隧道响应，超时失败；补齐受控代理协议后通过，没有以真实外网替代此测试。

主服务按所属进程身份认证重启，新身份记录在.runtime/local-service-workbench.json/current。数据与现有.env不修改，未登录/读取账户模型/执行真实模型或API。下一步由用户重新授权、读取实际模型并确认用量，再按原01b/03b依赖验证真实任务。模型/多Agent复用候选见[ADR-005](../../adr/005-provider-and-agent-reuse.md)，仅保存建议，不把协议或账户API转换器当整个工作台。
