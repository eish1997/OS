# ADR-002：腾讯 Memory 初步选型

日期：2026-10-06（Asia/Shanghai）
状态：固定版本资料审阅完成；运行实验与最终选型未完成。

## 固定资料

仓库 TencentCloud/TencentDB-Agent-Memory，commit `8b86874a2daea49e3ff0fb53d699203146c5c77d`。从 GitHub 仓库嵌入的 currentOid 获取版本，再从该 commit 下载 README_CN、INSTALL_CN、LICENSE、环境模板与启动入口脚本。来源 URL 和逐文件 SHA256 在 [manifest](../../output/dev-evidence/memory-source/manifest.json)，下载脚本没有执行下载代码。

Git ls-remote 连接被重置；Node fetch 失败；Python 的 API 请求显示 GitHub 限流，随后使用仓库 HTML 和固定版本 raw 地址成功获取资料。失败记录保留，成功结果以 manifest 为准。

## 资料观察

- 固定版本 LICENSE 为 MIT。
- 安装文档与环境模板描述 memory-core、memory-hub/knowledge 与 proxy；它是多服务组合，不只是一个嵌入 Pi 的函数。
- 环境模板的单机默认存储为 SQLite；MongoDB 路线是可选实验。这不意味着应让腾讯组件与工作台共同打开同一个 SQLite 文件。
- 记忆/知识内部模型与代理上游模型分两组配置，可能产生分别的提取、总结和生成费用。仅限制工作台 Pi 的调用数不足以约束腾讯服务自己的后台模型调用。
- 模板默认 Docker 镜像 latest。本项目实验要固定镜像 digest 并核对与源码 commit 的关系，不能只固定源码就声称运行版本也固定。
- Claude Code 路线通过 Proxy 使用客户端问答工具选择 team/agent/task，并按会话注入记忆。Pi 是否支持这条完整初始化链路尚无证据。
- start-all.sh 引入 _lib.sh、引导配置并检查模型通路。没有执行入口脚本，也没有完成其全部递归依赖和隔离审查。

## 初步决定与推断

暂不生产启用腾讯组件。优先验证显式接口适配的可行性，让工作台控制项目绑定、记忆范围、费用和撤回；代理路线可能更快接入，但会将后台提取、客户端初始化和隐藏模型调用带入执行链，需要额外适配。这里是基于资料的工程推断，尚未实测，最终路线仍由受限实验确定。

当前工作台基础记忆保留为可替代实现。候选服务不得自行赋予技能执行权限；导出、纠正、删除传播和故障退出均按专项验收集验证。

## 运行实验前置

用户模型配置与双路线总费用预算、可用隔离环境、固定服务镜像与启动脚本审查。当前本机没有 Docker 命令；只发现 wsl.exe，不能据此宣称 Linux 或容器环境可用。禁止把本地目录当作沙箱。

报告需区分官方描述、源码观察、实际测量和推断。本文不构成“验证无效”或“已完成全部选型”的结论。
