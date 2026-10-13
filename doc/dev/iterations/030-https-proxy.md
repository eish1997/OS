# 迭代030：免配置要求下的 HTTPS 部署底座

2026-10-07（Asia/Shanghai）。完整开发目标仍 active，M0 verifying、M1 未启动。用户日常只需登录、对话；专业配置由 Agent 准备，无新增子 Agent。

## 实现与真实失败

按[ADR-020](../../adr/020-https-proxy.md)复用官方 Caddy 2.11.7。[配置](../../../deployment/Caddyfile)默认回环绑定、关闭管理接口、不安装本地根证书；上传 10 MiB，保留实时事件流和断开行为。[版本锁](../../../deployment/caddy-lock.json)及配置均纳入工程文件 SHA256 基线。

[首轮实际失败](../../../output/dev-evidence/https-first-failure.json)：独立真实 TLS 后端接受 `http://127.0.0.1:4311` 来源写入，返回 201 而非 403。两份独立进程由保留句柄关闭，未操作主产品。修复 server/app.ts：仅 HTTP 回环模式允许 Vite 开发来源，其他模式只接受配置入口。新增回归覆盖 HTTPS 域名、HTTP 远程域名及 HTTPS localhost，验证拒绝请求没有创建项目。

官方下载曾误用 SHA256 比较官方 SHA512 清单，校验拒绝，未提取执行；改用官方算法比较通过后只提取 zip 根目录的单一 exe。[下载记录](../../../output/dev-evidence/caddy-release.json)保留实际版本与哈希；未验证发布签名，未下载或执行 Linux 包，未安装系统软件。

## 实际 HTTPS 与工程检查

[真实探针](../../../output/dev-evidence/https-proxy.json)退出 0：官方 Windows Caddy、独立真实 Node、临时双登录和独立数据目录，证书验证始终开启，未信任的证书实际拒绝；页面和构建 JS、Secure/HttpOnly/SameSite Cookie、未认证 401、两类来源 403；10 MiB 原件全字节和 SHA256 一致、超限 413；旧版本修改 409、导出资料引用保持。真实 worker 生成两个成果，零模型调用。

HTTP/2 ALPN 实际协商成功，事件流首心跳 116ms，持续 65018ms、65 个心跳、17 个有序事件；撤销会话后 707ms 内结束既有事件流，新请求 401，另一会话继续可用。后端通过实例认证停止，实际退出 0；Caddy 经持有的子进程句柄停止，实际 SIGTERM 退出。探针运行前后主产品原实例保持。

[完整工程报告](../../../output/dev-evidence/verification/history/2026-10-06T16-11-07-701Z/report.json)：104 项全部通过、0 失败/取消/跳过；类型检查、生产构建及 Pi 离线检查退出 0，104 个工程/部署文件 SHA256。未在完整验证运行期间改工程。028 原 103 项[固定归档](../../../output/dev-evidence/verification/history/2026-10-06T15-43-07-620Z/report.json)，不能用新报告冒充旧版本。

## 应用与保持

[应用记录](../../../output/dev-evidence/https-fix-application.json)：完整检查通过后先停止自有守护、认证停止原工作台，再由默认守护启动更新后的服务。没有根据保存 PID 强停，主 .env 完整哈希保持。新服务 PID36672、创建2026-10-06T16:13:40.6383890Z、实例2d9265a6-f8eb-4e78-b19e-e34282bd257c、启动标记3247c5ff-cd2d-4dd9-b074-005959bbbbd7；守护 PID50748、创建2026-10-06T16:13:39.0070060Z、实例339bd16d-fd11-4c16-98ff-03ebcd7662c5。

[产品前后观察](../../../output/dev-evidence/https-production.json)：ChatGPT 自动模式/模型、规范文章字节、31 个原登录完整指纹、模型调用/结算/token 记录、每日备份时间及点数保持。观察临时登录已退出，零模型请求。无需用户重新登录 ChatGPT 或填写模型/保护参数，桌面及 Startup 入口继续使用原路径。

[收尾审计](../../../output/dev-evidence/https-final-audit.json)核对全部104工程/部署文件和四份命令日志哈希、原103项归档哈希、实际守护/服务身份及文档本地引用。审计初轮误以为守护 status 回执有 servicePid 字段；修正观察器，使用真实身份核验后的 status 与同实例的新鲜记录核对，没有修改业务代码或重跑未变化的工程测试。

## 尚未完成

实际本机仍是 HTTP 回环入口；配置和真实隔离 TLS 通过不等于公网或真手机已可访问。继续准备具体远程主服务与入口，真实域名/公开证书、跨网络手机、远程订阅授权与唯一刷新所有者、节点断线/唤醒、生产权限/物理配额/WAL、异地恢复、腾讯比较和用户反馈保持原验收范围。029 默认浏览器读取的 URL 策略停止仍未解除，不用本次接口检查替代 UI 验收。无购买、发布、提交或推送。
