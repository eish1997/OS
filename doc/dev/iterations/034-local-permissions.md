# 迭代034：默认保护Windows文件与应用目录

2026-10-07。033取得环境和权限缺陷的实际证据，属于progress。本轮执行M0-04d，不新增用户配置或子Agent；完整目标active，M0 verifying、M1未启动。

## 实现与测试发现

按[ADR-022](../../adr/022-windows-local-permissions.md)保护.env、data、.runtime、开发private以及应用源代码/依赖目录。当前运行用户保留完整权限；不改变现有文件内容或服务身份。启动和初始化自动检查，不要求用户运行维护命令。

独立测试初轮发现PowerShell模块自动加载环境差异，改用固定Windows PowerShell和.NET ACL方法；第二次发现SID字符串被当成账户名称，测试使用明确SecurityIdentifier。子先父后的排序修改出现一个多余括号，解析阶段即被测试拒绝，修复后通过。失败见[记录](../../../output/dev-evidence/local-permissions-failures.json)，没有把这些失败算通过，也没有在主工作台上恢复宽权限。

最终[测试](../../../tests/local-permissions.test.ts)实际验证宽组读取、受限令牌拒绝、当前用户读取/字节保持、新文件继承、ACL恢复、保护前硬链接拒绝以及恢复前新增硬链接拒绝。最后一项在复核中补齐，随后重新执行完整检查；不是仅靠查看ACL推断访问失败。

## 主产品应用

[应用记录](../../../output/dev-evidence/local-permissions-application.json)：密码/业务/运行项460、开发private项62087、应用工作区剩余项21201在分阶段迁移中处理。这些是各阶段计数，不按相加推断唯一文件总数。原ACL快照私有保存；主.env内容不变。实际AuthenticatedUsers受限令牌由“能读取”变为“读取拒绝”，没有输出密码。应用工作区保护也防止其他普通本机账号通过替换程序绕过私有数据权限。

前两阶段是当时脚本的完整迁移，随后最终脚本加入子先父后提交、已私有子树跳过、应用目录保护和恢复硬链接拒绝。最终权限状态实际核对为当前用户规则；不能把较早阶段冒称最终版本命令已重新遍历执行。当前脚本在独立测试与完整后台服务测试中验证。

[保护后检查](../../../output/dev-evidence/deployment-environment.json)的五个私有路径均无宽组规则，应用根目录状态另记录在收尾证据中。033原检查使用[固定历史](../../../output/dev-evidence/deployment-environment-before-permissions.json)，不覆盖其缺陷证据。

[主产品前后观察](../../../output/dev-evidence/local-permissions-production.json)验证原PID7872、实例和创建时间保持，ChatGPT已连接/启用/自动模式；规范文章字节、31登录完整指纹、调用结算及每日备份时间/保留点不变。观察临时登录已退出，没有再次登录ChatGPT或模型请求。

## 最终工程与剩余范围

[完整报告](../../../output/dev-evidence/verification/history/2026-10-06T17-28-25-236Z/report.json)和[收尾审计](../../../output/dev-evidence/local-permissions-final-audit.json)是当前基线，具体通过数、工程文件与命令日志哈希以审计结果为准。原031的108项使用[历史报告](../../../output/dev-evidence/verification/history/2026-10-06T16-40-51-530Z/report.json)，032节点探针原局部证据保留；不以新报告冒充旧版。

用户无需新设置。此轮是Windows本机文件权限保护与启动接入，不是完整生产隔离或真实第二账号登录测试。真实远程HTTPS/手机、OS睡眠唤醒、Linux权限/物理配额/WAL、异地恢复、远程OAuth桥接与唯一刷新所有者、腾讯隔离比较及用户反馈继续按原门槛执行；M1依赖完整M0验收。
