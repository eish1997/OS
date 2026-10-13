# ADR-022：Windows 数据与应用目录的文件权限

2026-10-07。033实际检查发现.env、业务数据和运行记录继承宽组权限，Windows的Node chmod不能建立预期的私有DACL。采用当前运行用户SID的明确访问规则，不增加日常设置。

## 决策

复用Windows文件ACL，通过[固定PowerShell脚本](../../scripts/protect-local-data.ps1)管理自有路径。[启动入口](../../server/index.ts)和[初始化](../../scripts/setup.ts)通过[宿主包装](../../server/local-permissions.ts)调用，不拼接shell代码，不传密码。仅Windows接入此保护；Linux生产权限另验。

保护密码、数据、运行目录和应用工作区，防止非运行身份读私有文件或替换应用代码。开发证据目录也已单独完成迁移。启动检查已有私有根目录，新增内容继承其规则；不会每次遍历六万份历史开发文件。此缓存假设当前用户/管理员没有主动改宽已迁移子树的权限，不把它称为防篡改监控。

完整迁移先核对所有待修改项的所有者、路径、reparse point和硬链接，超过100000项拒绝。ACL快照保存在私有运行目录，只包含权限元数据。最终实现按子项到父目录的顺序应用，根目录最后提交；中途退出仍可从未完成根目录继续。错误尝试恢复原ACL；恢复操作也在任何修改前检查范围、所有者、链接和快照身份。失效快照不删除或重建成果。

初始化密码先写入已保护的运行目录，再在同一文件系统移到.env并完成保护；已有.env内容不重写。脚本不删除业务文件，不停服务、不提权。链接拒绝和所有者检查不等于可执行未知代码的OS隔离。

## 实际证据

[工程测试](../../tests/local-permissions.test.ts)使用实际Windows restricted token及文件打开：宽ACL时可读，保护后拒绝，原字节保持，新文件继承，旧ACL可恢复。恢复前增加硬链接也必须拒绝，且不部分恢复。创建/模拟身份失败立即失败，不能把调用失败当拒绝读取。API依据：[CreateRestrictedToken](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken)、[ImpersonateLoggedOnUser](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-impersonateloggedonuser)。

[主产品应用](../../output/dev-evidence/local-permissions-application.json)证明AuthenticatedUsers限制令牌在保护前能实际读取密码文件，保护后被系统拒绝，未打印内容。它是当前用户的受限令牌，不是另一个实际登录的Windows账号，也不能证明管理员无法接管权限。

工程、当前产品保持和历史版本边界见[034](../dev/iterations/034-local-permissions.md)。完整远程部署、物理配额/WAL、独立恢复、腾讯与反馈门槛保持。
