# 059 开源研究卡：成长型 Agent 的第一步

日期：2026-10-11。范围：用户在本轮澄清个人Agent方向并要求下一步，接续已有Pi/项目/资产底座，实现链接与用途到持久研究卡的首个功能切片。

## 实现

- 项目新增“开源研究”页，输入GitHub仓库根链接和具体用途；按项目保留输入，刷新保留，失败不清空，提交后显示任务进度。
- 服务端规范链接并生成研究指令，固定研究上下文；独立会话，不继承其他任务的工具许可。只开放capture_source/read_asset/save_research，不开放安装、shell或普通业务修改工具。
- save_research要求本次执行存在成功采集回执，再保存六项结构化分析、用户用途和来源链接。研究卡沿用已有资产文件、哈希、来源、备份和下载机制，记录kind=research，不新增数据库表。
- 展示明确区分执行结束、有无研究卡，以及“尚未试用/尚未接入”。研究卡可在成果阅读器阅读，来源仅放行精确UUID资产读取链接。
- 本轮未启动生产后台，未使用真实账户模型额度，未运行第三方仓库，也没有完成能力安装/接入。

## 验证与失败记录

- 类型检查、生产构建及Pi SDK离线契约检查通过。
- 新增研究HTTP/持久化/权限/重复提交和视图测试；相关旧API、草稿、阅读器测试用于回归。
- 初次研究HTTP测试发现research未进入宿主视图白名单，已修复并复验通过。
- 实际浏览器首次发现来源链接被阅读器过滤；仅放行精确资产读取地址，补测试，复验通过。
- 独立临时数据、暂停调度的真实HTTP服务和无界面Chrome验证：错误链接保留输入、刷新保留输入/页签、提交排队、研究卡出现与阅读、来源链接存在。使用受控来源和卡片，零模型调用，不等同真实研究效果。证据见[UI报告](../../../output/dev-evidence/research-059/ui.json)、[入口](../../../output/dev-evidence/research-059/entry.png)、[记录](../../../output/dev-evidence/research-059/record.png)、[卡片](../../../output/dev-evidence/research-059/card.png)。
- 标准全套检查并发运行超过既有120秒限制，报告保留failed；首个API测试亦报告失败但超时无完整堆栈。此前单独相关回归通过，随后降低并发重跑全套，结果见[本轮日志](../../../output/dev-evidence/research-059/full-tests.log)，不能以旧165项报告宣称当前全套通过。
- 本轮源文件写入受既有Windows权限限制；通过自动审批对具体源文件写入，不修改ACL或扩大目录权限。

## 下一步

选一个用户感兴趣的真实GitHub仓库与用途，验证模型实际采集、分析、保存、重新阅读的完整流程。再定义小样本试用和接入方案。M0仍待完整验收，M1与多端阶段未完成。

## 最终结果与用户选题

降低并发后全套169项测试通过（0失败，约248秒），类型检查、构建、Pi离线探针与实际浏览器受控流程均通过，见[059最终报告](../../../output/dev-evidence/research-059/report.json)。标准运行器首次120秒超时保留为失败历史，不覆盖为通过。

用户提供微信文章《马尾辫（Ponytail）——值得学习的AI编程大师》：https://mp.weixin.qq.com/s/zBbKYB-TmyKTWQsN2wvPvg 。公开文章提取出官方仓库 https://github.com/DietrichGebert/ponytail 。以下为本轮开发助手的真实资料审阅，不是工作台Pi已执行的研究任务。

- 用途假设：让助手少做过度设计，优先复用现有代码和工具，在完成需求的前提下控制复杂度；这是根据对话的推断，用户尚未逐字确认。
- 官方SKILL核心是编程工作规则，强调先理解受影响代码、使用现有能力和最小完整改动，保留关键校验。它改变工作方法，不单独提供浏览网页、执行代码或操作工作台的工具。
- 官方package.json声明MIT、版本5.1.0，并包含pi扩展与skills入口。pi-extension/index.js注册命令、保存模式状态、在执行前附加规则。未执行这些代码，未验证与本项目固定Pi1.0.3的兼容性。
- 当前工作台restrictedResources返回空skills/extensions；因此把包放进目录不会自动启用。建议先审阅固定版本规则，在隔离任务中做开/关对比，再设计显式启停与宿主加载，不直接开启任意扩展扫描。
- 小样本建议：三个相同输入任务（小功能、修复缺陷、审查），比较需求是否完成、复用程度、变更复杂度、检查结果与调用量。作者基准数据不视作本项目收益。
- 本轮研究入口只接收GitHub仓库根链接。微信文章到仓库的发现由开发助手完成，尚非产品自动能力，不能写成已支持任意文章链接。

来源：[官方说明](https://github.com/DietrichGebert/ponytail)、[规则原文](https://raw.githubusercontent.com/DietrichGebert/ponytail/main/skills/ponytail/SKILL.md)、[包声明](https://raw.githubusercontent.com/DietrichGebert/ponytail/main/package.json)、[Pi扩展源码](https://raw.githubusercontent.com/DietrichGebert/ponytail/main/pi-extension/index.js)。审阅的是main当时内容，正式试用前需固定提交版本。
