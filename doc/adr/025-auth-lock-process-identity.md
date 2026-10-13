# ADR-025：授权锁绑定进程创建身份

2026-10-07。Windows本机实现与隔离进程测试通过，真实Linux及跨机器部署仍待验证。它增强授权锁恢复，不改变会话交接协议，也不证明042的一次423根因已定位。

## 依据

原授权锁仅含PID和随机操作ID。Windows进程编号只在该进程生存期间有效，[微软进程标识说明](https://learn.microsoft.com/en-us/windows/win32/procthread/process-handles-and-identifiers)。固定Node24.19.0的libuv1.52.1对信号0检查的是该PID当前指向的进程，[固定源码](https://raw.githubusercontent.com/libuv/libuv/v1.52.1/src/win/process.c)。这不能证明它仍是创建授权锁的旧进程。

043有限诊断没有复现原423，但实际自有进程记录中有9个旧测试PID被后续短进程复用，共13条对应记录。因此新增创建身份；不将这一现象直接归因为042失败。

## 选择与边界

[ProcessBirth](../../server/process-birth.ts)读取Windows Process.StartTime转换的FILETIME字符串，避免JavaScript数字精度损失；Windows的创建时间与FILETIME含义见[微软时间接口说明](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes)。PowerShell固定脚本只经环境变量接收整数PID，使用系统目录程序、隐藏窗口、5秒上限和4KiB输出上限；不传模型或业务配置。只缓存本进程已成功观察的身份。

Linux组合/proc/pid/stat的第22项starttime及本次启动boot_id：[Linux进程字段](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html)、[内核随机目录说明](https://docs.kernel.org/admin-guide/sysctl/kernel.html#random)。解析考虑进程名的空格和括号。当前仅验证解析和合成边界，没有实际Linux执行证据。

[授权锁](../../server/chatgpt-lock.ts)在原存储互斥内写入PID、操作ID和可获取的创建身份。回收规则：

- 新旧记录来自不同平台时保持待诊断，本机找不到PID不能证明其他平台进程退出。
- PID明确ESRCH时可回收同平台记录和旧格式记录。
- PID仍存在时，只在同平台创建身份明确不同的情况下认定旧拥有者已退出；不发送终止信号。
- 活拥有者、观察权限/时限不明确、旧格式活PID、损坏/超大/链接记录均保留。
- 无法获得本进程身份时保留旧格式的保守规则；不编造创建时间，不根据锁的年龄回收。

独立随机操作ID继续控制释放，旧操作不会主动删除新操作的锁。新身份检查不重试外部刷新、授权或交接回调；读取创建身份不是执行模型请求。锁记录按实际UTF-8字节数计入容量。

它仅适用于一台主机和一个PID命名空间中的本地权威目录。不能在多台机器/容器之间共享授权目录，不能作为对抗同用户恶意修改文件的OS隔离。其他存储/转存锁没有统一改成这一身份协议；不声称所有历史残留都能自动修复。

## 证据

[五项测试](../../tests/chatgpt-lock.test.ts)涵盖活操作互斥、记录字节保持、构造的旧创建身份与同PID新身份、真实自有子进程退出恢复、旧格式/跨平台（含本机PID已不存在）保留、损坏/超大/真实目录链接拒绝，以及Linux字段解析。构造旧时间不是实际强迫OS复用PID；实际PID复用来自单独的诊断记录。

最初Windows文件符号链接创建因EPERM失败，改用无需提权的真实目录junction验证链接拒绝，不跳过测试或修改系统权限；这不等于验证了Windows文件符号链接的创建能力。

[043迭代](../dev/iterations/043-auth-lock-process-identity.md)、[完整工程及应用审计](../../output/dev-evidence/auth-lock-final-audit.json)保存最终源文件摘要、故障及前后状态证据。真实账户跨机器交接、Linux身份权限、断电、未知残留诊断及原完整M0/M1仍按原门槛验收。
