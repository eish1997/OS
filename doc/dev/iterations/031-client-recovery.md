# 迭代031：登录后直接工作，临时断线自动恢复

2026-10-07。完整目标active，M0 verifying、M1未启动。用户不需填写模型和执行保护参数；现有ChatGPT自动模式已就绪。本轮没有新增子Agent或模型请求。

## 实现与失败修复

按[ADR-021](../../adr/021-client-recovery.md)补齐启动、快照及实时事件流自动恢复，保留页面和未发送文字。GET有界单次超时和退避，401回登录；写入不重试。

[原始失败](../../../output/dev-evidence/client-recovery-first-failure.json)：真实启动503后后端已恢复，界面仍卡在连接中。首版读取重试修复启动，但真实服务停止/重启后事件流仍未恢复，保留[失败](../../../output/dev-evidence/client-recovery-stream-failure.json)。最终改为认证与快照恢复后显式重建EventSource。隔离探针首版只销毁上游请求，未真正关闭已开启的流；最终同时销毁请求和响应，重新验证。

## 实际验证

[浏览器证据](../../../output/dev-evidence/client-recovery.json)：Codex内置浏览器真实启动503恢复到登录页，无手动刷新；实际断流恢复后草稿计数变为2、未发送输入不变；恢复期间撤销登录返回登录页。最后localhost隔离用最终构建验证390×844断流/恢复，文档宽375无横向溢出，输入保留。恢复前后写入计数均1，仅合成账户登录；没有提交目标或运行AI。

截图：[启动](../../../output/dev-evidence/ui/client-recovery-startup.jpg)、[移动尺寸断线](../../../output/dev-evidence/ui/client-recovery-offline-mobile.jpg)、[移动尺寸恢复](../../../output/dev-evidence/ui/client-recovery-recovered-mobile.jpg)、[主工作台](../../../output/dev-evidence/ui/client-recovery-product.jpg)。截图为真实页面，历史offline-historical图不是最终实现。

[完整工程报告](../../../output/dev-evidence/verification/history/2026-10-06T16-40-51-530Z/report.json)：108测试全部通过，0失败/取消/跳过，类型、构建及Pi离线退出0；107工程文件SHA256。四项连接测试使用真实HTTP。030的104项使用[固定历史报告](../../../output/dev-evidence/verification/history/2026-10-06T16-11-07-701Z/report.json)，不混用最新版。

## 测试影响与当前服务

[Cookie事故](../../../output/dev-evidence/client-recovery-cookie-incident.json)：同浏览器127.0.0.1不同端口共享Cookie，测试导致主工作台退出登录。已正常恢复当前工作台登录，只撤销唯一对应的旧会话；其他30登录保持，总31。完整登录指纹发生变化，不能声称31原会话完全不变。后续改localhost后实际重载主页面保持登录；没有重新授权ChatGPT。

最终测试退出/关闭标签并重载主页面的CUA调用遭遇Transport closed，动作完成情况未知，保留隔离数据库会话数量，不声称优雅退出或最后重载通过。随后独立核对测试PID23056、主服务及守护进程均不存在且端口拒绝连接，原因未确认。核对没有当前明确停止意图后，通过默认身份管理[恢复服务](../../../output/dev-evidence/client-recovery-service-restoration.json)，不按保存PID强停、不因超时盲目重启。

当前服务PID7872，实例b62fbfb6-f7b4-411b-b8ac-7dc7feed6986，创建2026-10-06T16:59:36.4758360Z；守护PID35620，实例cc9b79a7-40a5-482b-bf84-a6e618c43b74。恢复后[产品观察](../../../output/dev-evidence/client-recovery-production.json)验证ChatGPT连接/自动模型、规范文章字节、调用结算与每日备份时间保持，31登录符合上述轮换后的预期，临时观察登录已退出。

收尾[审计](../../../output/dev-evidence/client-recovery-final-audit.json)核对工程与日志哈希、历史104项、真实进程身份、截图及文档引用。默认Chrome页面/真实OS登录/睡眠唤醒仍待观察；390视口不是实际跨网络手机。远程主机/公开证书、生产权限/配额/WAL、异地恢复、腾讯隔离比较及用户反馈保持原门槛，没有购买、发布或推送。
