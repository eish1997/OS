# Linux部署文件：待真实主机验收

供开发Agent使用。用户只确认采购费用、必要授权和手机体验。当前没有Linux主机、域名或部署权限资料；这些文件尚未安装，没有修改本机系统或开放端口。

## 文件和版本

后端使用[workbench.service](workbench.service)，HTTPS使用[workbench-proxy.service](workbench-proxy.service)。两个固定专用账号分别为workbench与workbench-proxy，不使用root运行，不共享模型凭据。应用与运行时安装到root所有、普通账号不可写的/opt/workbench/app与/opt/workbench/runtime；数据在/var/lib/workbench，不随应用版本替换。

Node版本与官方HTTPS校验和见[runtime-lock.json](runtime-lock.json)，Caddy固定版本与Linux归档校验和复用[已有锁](../caddy-lock.json)。044已下载固定Node Linux归档，实际SHA256同时匹配官方HTTPS校验和与版本锁，见[下载证据](../../output/dev-evidence/linux-runtime-download.json)。归档保存在本机开发私有缓存，尚未解压或在Linux执行；目标主机仍须自己下载并复核。发布签名尚未验证，不能把官网取得的哈希称为签名验证。Pi及依赖仍以根目录package-lock.json为准，未升级依赖。

Agent在目标Linux主机用固定npm11.21.0执行npm ci --ignore-scripts并构建，保留构建依赖：后台入口使用tsx，不能以--omit=dev安装后直接运行此入口。按目标平台安装本机原生依赖，禁止从Windows复制node_modules到Linux。

## Agent准备顺序

1. 确认目标主机、费用和部署授权；核对发行版、systemd、cgroup支持与实际持久卷。准备专用账号和root所有的应用/运行时；下载固定Node/Caddy归档并校验，再验证版本。未知仓库不在生产账号中运行。
2. 只传递应用源码与依赖锁，不传递本机.env、数据、模型凭据、登录会话、node_modules或开发私有证据。首次合成数据部署与生产迁移分开处理。
3. 创建独立挂载的/srv/workbench-backup-volume，归workbench所有、0700。其子目录workbench首次由应用创建并声明归属；不要预先创建没有归属记录的子目录，否则已有保护会拒绝启用自动备份。systemd声明挂载依赖；[只读前置检查](preflight.mjs)拒绝数据与备份同文件系统、root账号、可写应用及占位域名。另须证明卸载/只读/空间耗尽时的行为。
4. 根据[业务环境模板](workbench.env.example)由Agent生成随机密码与真实域名，安装/etc/workbench/workbench.env，root:root、0600。根据[代理模板](proxy.env.example)配置/etc/workbench/proxy.env；不把配置作为shell代码source，不输出密码，不在应用目录放.env。
5. 在真实主机执行systemd-analyze verify，对Node应用、代理配置、cgroup与文件权限做实际验证。预检查需要由workbench身份运行；StateDirectory由systemd建立，所以不能把缺目录时裸跑的失败当成系统服务失败。
6. 先回环检查合成数据，再验证域名、证书、入站规则，最后由Agent切换PROXY_BIND。当前模板默认127.0.0.1；填域名并不会自动公开服务。业务4310仅回环。Caddy当前使用HTTP证书挑战时还需要80端口，浏览器业务入口使用HTTPS；不要盲目只开放443后声称证书可用。
7. 验证系统服务启动、实际异常退出恢复、正常停止不自动恢复、子进程排空、日志与重启；真实手机、ChatGPT回调桥接、异地恢复和文件系统配额/WAL按[部署规范](../../doc/deployment.md)另验，通过后才迁移生产。

## 已实现与未证明的边界

服务模板设置只读系统目录、私有临时目录、UMask0077、有限自动重启，以及Node退出排空时间210秒；没有关闭V8所需的JIT。后端内存上限3GiB、代理512MiB是初始配置，需要在目标机器实测，并不能据此宣布4GiB主机性能通过。systemd环境文件会进入应用及必要子进程环境，这是运行凭据，不构成未知代码沙箱。

独立备份卷是自动备份落地点，仍位于同一主机；还需转存到独立机器或对象存储并做灾难恢复。不能把两个文件系统、云盘快照或此模板算作异地恢复完成。磁盘配额与WAL、完整应用文件所有权遍历、真正的第二身份拒绝、公开证书、Linux服务行为、未知代码隔离均待真实验证。

040已接入[可选加密自动转存](../offsite/README.md)：三个路径配置默认注释，StateDirectory另准备workbench-offsite；等待确认的本机副本保留，转存用独立租约和后台进程。Windows本地crypt合成验证不能代替Linux或云桶验收。配置/密钥在普通备份之外保护，独立保存恢复材料。

准备参考：[systemd执行环境手册](https://manpages.debian.org/bookworm/systemd/systemd.exec.5.en.html)、[服务生命周期手册](https://manpages.debian.org/bookworm/systemd/systemd.service.5.en.html)、[Caddy服务说明](https://caddyserver.com/docs/running#using-the-service)。本仓库的单实例服务模板适配既有路径与关闭协议，没有把静态审阅当成systemd验收。
