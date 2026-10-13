# Studio / 个人 AI 工作台

云端准备：[Linux后台服务与配置](deployment/linux/README.md)已落盘，依赖按平台选择；真实云主机、手机访问和远程授权仍待验收。用户日常使用不需要填写部署参数。

Windows启动和初始化自动保护密码、数据、运行及应用目录，现有文件内容保留；ACL维护/恢复由Agent处理。见[权限决策](doc/adr/022-windows-local-permissions.md)和[实际验证](doc/dev/iterations/034-local-permissions.md)。

连接短暂中断时，页面会自动重连并保留未发送文字；服务恢复后刷新内容和事件流。登录真正失效时回到登录页。任务提交和上传不自动重发。实现与真实验证见[031](doc/dev/iterations/031-client-recovery.md)。

当前是开发中的 M0 工程，功能与未验证项见 [开发现场](doc/dev/current.md)。产品规范位于 [doc](doc/README.md)。采用 TypeScript、React、Node.js 24、Pi SDK 1.0.3 与服务端 SQLite；Factory + ASCII 界面。

## Windows 启动

当前电脑桌面已有 **打开工作台** 快捷方式，默认隐藏启动后台并请求默认浏览器打开；已有服务会复用。当前用户登录Windows后启动后台的入口也已配置。新浏览器仍需已有工作台认证，不会重新配置ChatGPT。入口保存命令已实际验证，物理注销/登录、默认浏览器新页面与睡眠唤醒仍待观察，见[028](doc/dev/iterations/028-one-click-and-user-startup.md)。下面命令主要供开发维护和新环境部署使用。

本机默认 Node 18 不适用。脚本优先选 Node 24+，否则使用本机已有的 Codex bundled Node；不修改系统 Node 安装。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run.ps1 setup
powershell -ExecutionPolicy Bypass -File scripts/run.ps1 build
powershell -ExecutionPolicy Bypass -File scripts/run.ps1 start
```

打开 http://127.0.0.1:4310。首次密码保存在本机 `.env` 的 `WORKBENCH_PASSWORD`，不要提交或发送到聊天。首次启动后保存加盐密码摘要；改 `.env` 不会覆盖已存在登录凭据。需要重置密码时停止服务，备份后重新配置凭据文件，不能以覆盖整个数据目录重置。

默认`run.ps1 start`已启动隐藏后台守护，关闭启动终端后继续运行；服务意外退出时自动恢复。维护时使用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run.ps1 start
powershell -ExecutionPolicy Bypass -File scripts/supervise-service.ps1 -Action status
powershell -ExecutionPolicy Bypass -File scripts/local-service.ps1 -Action status
powershell -ExecutionPolicy Bypass -File scripts/local-service.ps1 -Action stop
```

后台身份记录和日志在忽略的 `.runtime`；停止前核对 PID、创建时间、程序、启动标记与服务实例，再用登录密码认证退出。身份不符不强停。明确停止后守护也退出，之后主动启动可恢复；健康暂时不可达不触发重启。默认15秒检查，10分钟最多5次启动尝试。只停守护可用`supervise-service.ps1 -Action stop`，工作台保持运行。停止脚本需要当前有效密码；首次配置后的凭据重置需同步本机配置。已配置当前用户登录后后台启动，尚未安装系统服务或验收真实登录/睡眠唤醒。维护移除两个快捷方式可运行`desktop-entry.ps1 -Action remove -ShortcutDir ([Environment]::GetFolderPath('Desktop'))`，不会停止正在运行的服务。

标准 Node 24 环境可 `npm ci --ignore-scripts`、`npm run build`、`npm start`。依赖全部固定版本；Windows 原生构建依赖已固定在锁文件。只绑定回环地址，部署说明见 [deployment](doc/deployment.md)。

## 使用

主页新建/打开项目，上传资料，再从下方提交目标。关闭标签页不取消任务。任务页面查看进度、取消、新尝试与中断对账。成果为真实文件，草稿可编辑、保存和导出 Markdown；冲突保留本机草稿，不能覆盖另一设备版本。

项目摘要记录目标、进展、已确认决定、下一步及资料来源。确认后才进入后续任务，已提交任务固定原版本、视图和选中文件。助手可以提出摘要或记忆建议，界面确认之前不当作已确认背景。每个项目分别保留未发送文字和执行方式；切换项目不混用输入。对话记录从数据库分页读取，刷新不丢失早期用户指令与助手输出。

草稿编辑后自动保存，手动保存也可用。保存期间继续输入不会被返回结果覆盖；离线修改保留在本机，重连后检测版本再同步。冲突可先下载本机修改，再载入服务端版本合并。导出使用已同步版本。

成果页可按名称、标签与 UTF-8 文本内容查找；PDF、图片等当前仅搜索名称和标签。文件信息修改保留资产身份与内容哈希，已有任务继续使用固定资料版本。各项目独立保留页签、选中文件和搜索条件；“恢复默认视图”清除这些选择。设置页显示磁盘及各类内容用量：500 MB 资产配额不涵盖数据库、会话、暂存和备份，部署整体容量与保留策略仍需确认。

现在已增加应用写入限制：数据目录2 GiB、数据库/索引768 MiB、原文件500 MiB、上传暂存20 MiB、代理会话128 MiB、工作目录64 MiB、运行日志4 MiB，磁盘至少保留64 MiB；另有4 MiB用于登录、取消、撤销和对账。可在服务端按.env.example调整，重启生效。达到上限时阻止新增内容，已有文件仍可读取/导出；不会自动删除成果。SQLite主文件有页数限制，整体限制属于应用写入检查，生产文件系统硬配额/WAL物理增长与保留策略仍需部署实测。

电脑节点独立目录默认64 MiB，同机数据目录内的节点还受主服务整体限制。回执采用暂存后重命名，中断保留旧版。设置页“登录设备”可撤销其他浏览器会话，撤销后客户端返回登录；最多32个有效会话。临时存储锁仅在原PID确认不存在时自动恢复；未知/残缺锁或遗留恢复锁先核对进程，不根据超时强停或删除资产。详细边界见[存储写入ADR](doc/adr/004-storage-admission.md)。

没有启用模型连接时可选“工程样例 · 非 AI”，独立进程计算固定资料并保存报告、图表和带来源的草稿。它不代表真实模型或腾讯 Memory 验证通过。

优先使用 ChatGPT 订阅连接：在运行工作台的电脑上打开“设置 → 用你的 ChatGPT 额度”，点击 **Continue with ChatGPT**，在浏览器完成自己的账户授权；登录完成后会自动准备好可用模型，直接回到项目对话即可。首次仅告知正在使用ChatGPT额度；模型和额外限额调整在折叠的高级设置里。登录本身不提交任务。是否有权使用及可用额度以实际账户授权为准。[官方说明](https://developers.openai.com/siwc/token-sharing-open-source)

服务网络默认 `WORKBENCH_PROXY_MODE=auto`：先使用显式HTTP_PROXY/HTTPS_PROXY环境配置，Windows没有显式配置时复用当前用户已启用的静态系统HTTP代理。不会修改Windows代理或TLS验证，本地工作台/回调绕过代理；执行worker只继承宿主选定的网络配置。`environment`仅使用环境代理，`direct`明确直连；PAC/SOCKS自动解析不支持，可配置受信任HTTP(S)代理并重启。不能用代理配置保证账户/地区资格；真实授权仍以供应商判断为准。授权错误现在区分实际HTTP状态、步骤和已知错误码，不记录原始响应/授权码/令牌，地区拒绝不提示无限重试。

默认每个任务最多20次模型请求、300秒，防止失控循环；整个连接不会因为累计使用十次而停用。一项任务可能请求多次。高级设置可额外配置连接累计上限，重新登录和修改上限不重置已经消耗的调用记录。账户限制以 [ChatGPT 用量设置](https://chatgpt.com/settings/usage) 为准，工作台计数不是账户剩余额度。订阅模式不显示美元费用；流未返回完整用量时标记不完整，不把未知用量记成已确认零消耗。没有启用付费API后备。断开会移除本机凭据并尝试远端撤销，撤销失败会提示去ChatGPT设置处理。

普通API是另行选择的计费途径：未选择订阅连接的实例可在服务器 `.env` 设置 `PI_PROVIDER`、`PI_MODEL`、`PI_API_KEY`、`PI_MAX_CALLS`、`PI_BUDGET_USD`、单次预留与超时，再重启。默认调用上限和费用为零。未知API费用按预留估算，供应商账单仍是实际计费依据。选择过订阅的实例不会因取消、失效或断开而回退到API；切换方案需明确配置，当前没有自动迁移功能。

订阅凭据在数据目录 `private-model` 中原子保存并限制本机用户访问，刷新由宿主负责，worker仅获取运行所需的内存令牌；凭据不进入浏览器状态、SQLite事件、原生会话或联合备份。授权仅绑定工作台发起登录的有效会话。迁移到远程主服务时需单独完成主机注册及凭据迁移，不能直接复制全局Codex登录文件。订阅预览的输出参数和托管工具有兼容限制，本机调用/超时控制不能保证供应商的输出硬上限，生图授权须另行接入。见[接入与上线解决计划](doc/dev/接入与上线解决计划.md)。

Pi 使用独立进程、宿主拥有的资源加载器与明确业务工具白名单，禁用默认 shell/编码工具、自动资源发现、自动重试、压缩与缓存预热。当前不会执行未知仓库或任意扩展；工作目录不被声称为 OS 安全隔离。

“记忆”页面管理带来源和范围的明确偏好；腾讯 Memory 尚未生产接入。电脑节点配对在设置页完成，令牌只显示一次，存入节点 `.env` 后运行 `scripts/run.ps1 node`。首版节点仅允许可信文件验证，不是任意桌面控制。

## 验证与恢复

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run.ps1 test
powershell -ExecutionPolicy Bypass -File scripts/run.ps1 probe
```

关闭产品服务后，使用 Node 24 执行：

```text
node --import tsx scripts/backup.ts create <新备份目录>
node --import tsx scripts/backup.ts restore <备份目录> <新的数据目录>
```

联合备份包含数据库、被引用资产和原生 JSONL 会话，校验清单用于恢复。登录摘要、模型密钥、设备会话和节点令牌不导出；恢复后重新连接账户并配对。已在不同物理硬盘的C盘创建专用备份，并从新的恢复目录启动临时HTTP工作台，全部40个成果及5个已完成原生会话验证通过，见[恢复记录](doc/dev/iterations/015-recovery-and-independent-backup.md)。已启用每天空闲自动备份，默认保留最近7个有效恢复点，新副本先实际恢复检查再清理自有旧副本；手动备份保留。019已改为后台维护，界面可继续使用、任务暂时排队；384MiB三次备份/轮转的数据接口重测最高约50ms。见[自动备份](doc/adr/008-automatic-independent-backup.md)与[后台维护](doc/adr/010-background-backup.md)。同机双硬盘不等于异地备份，真实手机跨网络访问仍待完成。

开发证据在 `output/dev-evidence/`，台账和验收在 `doc/dev/`。104项工程测试、类型检查、构建及Pi离线通过；真实ChatGPT文件往返、停止/恢复/排队及记忆内容已有证据。默认混合容量、后台启动及025实际HTTP上传期间读取325/435ms通过；[026](doc/dev/iterations/026-bounded-ascii-search.md)最终完整大正文搜索1899ms/期间数据25ms通过本轮门槛，已应用到当前产品，原连接/文章/登录/用量/备份时间保持。生产压力/物理配额、远程部署、异地恢复、用户反馈、腾讯实验和M1仍须达到完整阶段门槛才能宣布完成。维护停止只注销脚本自己的临时登录，保留浏览器登录。

中文和空格Windows目录的完整代码部署已通过：复制依赖后实际构建/启动/重启、运行电脑节点、自动备份及干净恢复。新节点成果保留开头空格、CRLF及末尾换行，上传文件与本地原件字节一致；旧回执可重传而不重复建文件。详见[部署验证020](doc/dev/iterations/020-windows-deployment.md)。这项验证不需要你额外配置，也不替代真实跨网络手机或全新电脑安装验收。

过期资产清理：停止服务后运行 `node --import tsx scripts/cleanup-assets.ts` 只预览，显式加 `--commit` 才清理超过30天且无引用的回收站内容。此操作不清除历史备份。真实 Pi 基础探针：配置并重启后运行 `node --import tsx scripts/probe-real.ts`；缺配置时只记录 blocked，不运行模型。

022已应用后台只读搜索、单次候选查询及每次准入单次容量遍历，保留原件哈希/权限/配额与恢复预留。95项工程检查通过。完整场景小资料搜索最高1633毫秒、期间数据读取最高23毫秒；50份8 MiB正文页仍2757毫秒超过2秒门槛。独立项目29份32 KiB新写入共14.8秒，不等同整批建档已通过。用户无需新增设置，原ChatGPT自动连接、文章、31登录完整指纹、调用计数及每日备份时间保持。 混合容量/归档/七点启动前轮证据保持；完整性能、生产/远程等继续推进，见[022](doc/dev/iterations/022-search-performance.md)。


最新[023](doc/dev/iterations/023-search-mapping.md)：023已应用只读搜索数据库映射和UTF-8索引字节校验，原件完整哈希、损坏修复/权限/分页和存储边界保持。96项工程检查通过。完整容量小资料搜索最高1434毫秒、大正文页2057毫秒仍超过2000毫秒；期间数据读取最高23毫秒。用户无需新增设置，原ChatGPT自动连接、文章、31登录完整指纹、调用计数及每日备份时间保持。 最大两个只读进程各1 GiB虚拟映射不是OS内存/文件隔离。完整建档、生产物理配额/WAL、监督/唤醒、真实跨网络手机、异地恢复、腾讯和用户反馈继续按原门槛验收。


最新[024](doc/dev/iterations/024-batch-write.md)：024已应用同一次上传前置容量合并测量，没有跨阶段缓存或扩大配额。98项工程检查通过。同脚本新建661资产/约499 MiB原件及原生会话，完整建档172.4秒→121.0秒（约29.8%改善），两批内容清单一致、各661哈希和16条SDK消息重开通过。单次写入峰值596ms、完整大正文2057ms及实际HTTP期间数据响应仍待验收。无需新增设置，ChatGPT自动连接、文章、原31登录完整指纹、调用计数与每日备份时间保持。 这次为本机各一次完整建档，不能推广为生产HTTP延迟或OS容量隔离已通过。真实跨网络手机、监督/唤醒、异地恢复、腾讯运行和用户反馈仍按原门槛推进。
