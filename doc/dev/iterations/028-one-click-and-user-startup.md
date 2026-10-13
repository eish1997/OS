# 迭代028：桌面一键打开与用户登录后启动

2026-10-06。承接027后台守护及最新免配置要求，继续原M0 Windows可用性门槛。无新子Agent、外部软件安装、公开监听或模型请求。

## 实现与失败修复

按[ADR-019](../../adr/019-one-click-and-user-startup.md)新增`open-workbench.ps1`和`desktop-entry.ps1`：隐藏启动/复用守护，验证健康服务后请求默认浏览器打开；生成桌面入口与当前用户Startup入口，严格核对快捷方式归属后才创建/移除。Startup只启动后台，不自动打开浏览器。

首轮入口测试1通过/1失败：PowerShell5默认输出编码导致Node读错中文路径。显式UTF-8控制台输出与UTF-8 BOM分别保护回执和脚本文字；新增实际原中文数据目录的SQLite文件断言，防止仅因两处同样读错而假通过。见[失败1](../../../output/dev-evidence/desktop-entry-first-failure.json)。

第二轮1通过/1失败：清理观察到正在退出的守护信息残缺，拒绝停止；测试的连续清理被打断，留下自有服务和管道。通过原身份管理器认证停止该测试服务，原测试句柄实际退出1，再修复守护身份复查并让清理finally独立执行。没有根据保存的PID杀进程。见[失败2](../../../output/dev-evidence/desktop-entry-second-failure.json)。修复后两项入口测试全部通过，再运行完整回归。

## 完整工程

[工程报告](../../../output/dev-evidence/verification/history/2026-10-06T15-43-07-620Z/report.json)实际退出0：103项全部通过，0失败/取消/跳过；类型、生产构建、Pi离线探针通过。原守护实际崩溃/恢复测试继续通过。两项新增验证真实.lnk、中文路径、实际存储目录、隐藏窗口设置、相同后台服务复用、重复配置，以及拒绝覆盖/移除外来快捷方式且两个文件逐字节保持。

027原101项报告已[固定归档](../../../output/dev-evidence/verification/history/2026-10-06T15-30-46-133Z/report.json)，当前103项报告不用于证明过去101项的代码版本。未在工程验证进行中修改工程文件。

## 当前电脑

实际创建`C:\Users\15128\Desktop\打开工作台.lnk`和当前用户Startup中的`AIOS-43cc99262901.lnk`；没有覆盖现有文件、请求管理员权限或写入任何账户密码。原后台服务PID47124继续运行，只更换守护以使用最新身份复查代码。

[实际入口观察](../../../output/dev-evidence/desktop-entry.json)：读取并核对两个真实快捷方式，执行保存的Startup命令及加NoBrowser的打开命令，均实际退出0。最终守护PID40816，创建2026-10-06T15:47:38.7351930Z，实例7bb4d564-738b-4a45-8dab-6724dccc9dbc，状态ready。Startup已配置，但真实注销/登录事件和默认浏览器页面尚未观察；不能宣称二者已通过。

辅助观察先因漏写-ExecutionPolicy的横线退出1，随后正确调用取得回执但Node观察进程仍因分离守护继承的额外管道存活。核对并停止当时自有守护，留下工作台运行，两个已保留工具句柄实际退出0；观察器改为子进程实际退出后关闭自己持有的输出流，再重跑观察，实际约5.3秒退出0。业务工程不因此修改，未重启工作台。证据：[参数失败](../../../output/dev-evidence/desktop-entry-observation-failure.json)、[管道观察与修复](../../../output/dev-evidence/desktop-entry-observer-pipe.json)。

[产品前后观察](../../../output/dev-evidence/desktop-entry-production.json)通过：原产品进程/创建时间/实例/启动标记、ChatGPT自动连接和模型、规范文章字节、31登录完整指纹、模型调用/结算/token记录、每日备份原时间与保留点数保持。观察登录已退出，零模型请求。

[收尾审计](../../../output/dev-evidence/desktop-entry-final-audit.json)通过：103项日志与全部101工程文件SHA256匹配；对比027只有守护身份复查改动及三个新增入口/测试文件。原101项归档报告与027记录SHA256一致；当前守护经实际身份核验存活且持续检查，真实桌面/Startup快捷方式归属和保存参数保持。产品健康与原实例一致，文档本地引用可解析。审计明确保留真实Windows登录与默认浏览器未观察的边界。

下一步补真实默认浏览器/Windows登录反馈、睡眠唤醒；继续远程手机HTTPS、生产权限/物理配额/WAL、异地或独立机器恢复、腾讯隔离运行比较与用户反馈。原M0 verifying、M1未启动，完整目标active，不能将当前本机入口当作全部开发完成。
