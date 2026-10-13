# 043：授权锁创建身份与有限诊断

2026-10-07。上一轮042实际应用并核对内容，属于progress。本轮围绕042的授权交接崩溃测试423继续执行M0，既保留未知根因，又增强可验证的恢复边界。没有云资源、付费调用、发布或新增子Agent。

## 诊断事实

[诊断程序](../../../output/dev-evidence/probe-transfer-lock-diagnosis.ts)在新私有目录中连续运行5份真实进程交接故障样例，另以最多4个同时存活的自有短Node进程制造PID分配活动。每份样例5个服务进程、三处实际SIGKILL及新进程恢复，合成目标独占刷新；5次均通过，未复现原423。25个样例服务及812个短进程均记录终态，零模型请求。[完整记录](../../../output/dev-evidence/transfer-lock-diagnosis.json)

[对应记录](../../../output/dev-evidence/auth-lock-reused-pids.json)观察到9个旧服务测试PID后来由短进程复用，共13条后续终态。没有在失败的锁检查时刻取得原拥有者身份，所以不能据此宣布042根因解决。[042原失败报告](../../../output/dev-evidence/verification/history/2026-10-06T18-57-27-175Z/report.json)及当时锁均保留，未手动清锁。

[原故障探针](../../../scripts/probe-chatgpt-transfer-crash.ts)新增启动/实际close时刻及仅在失败时捕获的合成锁PID、0信号状态、活自有句柄和可获取的Windows创建时间。失败诊断不读取凭据，不对记录PID发终止信号；实际故障中断仍仅使用自己创建的ChildProcess句柄。当前五次通过不包含新生产创建身份规则的效果证明；该规则由后续专项及完整测试验证。

## 实现与复核

[ADR-025](../../adr/025-auth-lock-process-identity.md)记录Windows创建身份、Linux starttime+boot_id准备和本机/同PID命名空间约束。[授权锁](../../../server/chatgpt-lock.ts)保留存储互斥与随机操作ID，新增可获取的进程创建身份及锁文件大小/链接检查，只回收明确退出或同平台创建身份不同的旧拥有者。活/不明/旧格式活PID/损坏/链接记录保留，不靠时间强制回收，不重试授权或刷新回调。

最初相关测试9/10通过，Windows文件符号链接创建EPERM；[失败记录](../../../output/dev-evidence/auth-lock-test-initial-failure.json)保留。改用当前权限可创建的真实目录junction，10/10相关测试及类型检查通过，不提权、不跳过。它验证目录链接拒绝，不宣称文件符号链接创建能力。

第一份完整128项通过后应用到主服务；最终复核进一步要求不同平台记录在本机PID缺失时仍保留，扩展测试涵盖此条件和旧格式明确退出恢复。五项专项及第二份完整128项通过，最终版本再正常应用。中间应用和验证记录保留，没有将中间版本当最终版本：[中间应用](../../../output/dev-evidence/auth-lock-production-before-review.json)、[最终应用](../../../output/dev-evidence/auth-lock-production.json)、[收尾审计](../../../output/dev-evidence/auth-lock-final-audit.json)。

## 产品保持

两次更新都先检查无在途/未对账操作及未发送输入，通过现有管理脚本正常停止守护与主服务，再用标准本机入口恢复。最终PID52144、守护39296正常，未强杀或改变配置。专用[前后观察](../../../output/dev-evidence/observe-auth-lock.ts)核对当前工程哈希，单独保留本轮证据，不覆盖042私有核对记录。

16项目、235实体全部版本/正文指纹、44份资产原件、14份原生会话、31登录完整指纹、标准文章、模型凭据/.env和自动备份计划全程保持。ChatGPT自动模式已连接就绪，没有重新登录、授权交接或模型请求。现有浏览器自动重连，纯读取[DOM](../../../output/dev-evidence/ui/auth-lock-current-dom.txt)与[徽标记录](../../../output/dev-evidence/ui/auth-lock-current-ui.json)通过，没有页面修改。

最终128项工程、类型检查、生产构建与Pi离线探针通过，143个工程文件摘要匹配；旧042及中间版本报告固定到历史目录。真实Linux读取/权限、真实账户跨机器交接、原423根因、资源/手机/文件系统配额/WAL、独立密钥和异地恢复、OS睡眠/传输中硬杀、腾讯隔离对照及用户反馈仍待验证。完整目标active，M0继续verifying，M1仍依赖完整M0通过。
