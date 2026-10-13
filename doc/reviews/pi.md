# Pi 底座与执行集成审查

审查对象：主开发文档 v0.1。范围：第 3、6—12、14—18 节。只读主文档；未安装或运行 Pi。官方 main 分支资料随版本变化，以下发现需在所选发布版本复核。

## 主要结论

Pi 选型可以保留，但现有文档仍停留在分层方向，缺少执行宿主、会话生命周期、事件契约和受信任代码边界。最重要的具体修订是：固定版本后比较官方 MCP 支持与社区适配器；把 cwd 隔离和安全隔离明确分开；定义工作台如何拦截及对账 Pi 的原生文件与 shell 操作。

## 发现与修订建议

### P1：第 7 节的 MCP 选型需要更新为版本化验证

证据：本次读取的官方 SDK 文档已描述内置 MCP 扩展；CLI 与 SDK 的默认加载不同，SDK 需要显式接入。当前文档只列 pi-mcp-adapter 社区候选，容易导致重复接入。建议改为“先固定 Pi 版本，验证该版本官方 MCP 接口；不足时再评估社区包”，并登记各自来源、能力差异和迁移代价。[官方 SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)

### P1：第 6.3、7 节没有选定执行宿主与进程边界

SDK 是进程内 TypeScript 集成；RPC 是长期子进程的 JSONL 控制。它们不能只作为并列名词。建议阶段一形成 ADR：前端不直接持有模型密钥或加载执行扩展；执行在后台 worker；明确一 worker 多 session 或一 session 一进程的选择、崩溃影响和最大并发。RPC 子进程隔离不等于 OS 沙箱。[官方 RPC](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)

### P1：第 9 节“所有修改通过操作入口”与默认编码工具存在落差

Pi 可直接读写文件并调用 shell。代码或第三方工具可能绕过工作台的业务操作入口，改动不会自动变成业务事件。建议声明两条通道：结构化业务工具提交事务；开发工具在受限工作目录产生文件变更，再由文件监听、Git 差异和资产扫描对账。未发现/未验证的文件不得自动认定为任务成果。此项是架构推断，需在原型实际验证。

### P1：第 10、11 节把独立目录/副本写成隔离措施，但未说明安全边界

扩展实际与 Pi 进程具有同等 OS 权限，能接触文件和凭据。cwd、worktree 和分支用于上下文及变更隔离，不能限制越目录访问、网络或加载恶意代码。建议在运行环境对象中定义 OS 用户/容器/沙箱、挂载白名单、网络策略、凭据注入；未建立这些边界时明确标注“逻辑隔离，具有宿主用户权限”。候选扩展不得自动从项目目录加载到生产 worker。[官方扩展](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)

### P1：第 8—10 节缺少 Project / Task / Run / Pi Session / Process 的映射

标签页不是执行会话；一个项目可有多个会话和多次运行。建议新增 SessionBinding：projectId、taskId、runId、piSessionId、sessionPath、processId、runtimeVersion、cwd、资源配置快照。恢复会话须通过 Pi SessionManager，不能仅把 UI 聊天消息塞回模型。区分“继续已有会话”与“重跑任务”，避免重开页面自动重复操作。[官方 SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)

### P1：第 9、14 节缺少 Pi 完成事件的精确定义

RPC 的 prompt 成功响应只表示接受/排队；agent_end 之后可能还有恢复或继续工作。适配层应以所选版本的最终空闲事件确认执行停止，再由业务验收判断 Task 成功。每个业务事件需要 runId、序号、时间和来源，消息流与成果状态分开。验证快速完成、自动重试、取消、进程崩溃和断线恢复，不能把收到文本或 agent_end 直接当成任务完成。[官方 RPC](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)

### P1：第 11 节自我升级缺少资源加载与版本锁定方案

技能说明、可执行扩展、客户端页面插件是不同交付物。建议 Capability 分成这些类型，建立 manifest、API 版本、依赖锁、产物哈希、允许权限、前端组件绑定和回滚信息。每次 Run 固定已批准的能力快照；升级后创建新 worker，不让运行中的任务发现刚改写的扩展。需要验证扩展自动发现与热重载规则，防止开发副本被生产环境意外加载。

### P2：第 7、10 节社区子代理兼容性需要扩展到非 TUI 模式

候选包有前台/后台执行，部分状态以 TUI 展示，研究角色还依赖其他网络能力。其现有文档只能证明提供这些接口，不能证明我们选定的 Windows + SDK/RPC 组合能用。建议补兼容矩阵：宿主版本、SDK/RPC、Windows 原生/WSL、子进程启动、事件可观测性、取消、递归上限、额外依赖。先用同一真实任务对比 SDK 原生创建子 session 与社区包，记录维护成本。[候选包](https://github.com/nicobailon/pi-subagents)

### P2：第 14、16 节 Windows 只写“验证兼容性”，缺少可执行清单

官方区分 Windows 原生和 WSL；原生默认使用 Git Bash，也有可选 PowerShell 工具。建议首轮锁定一种环境，明确 Node/Bun、Git、shell、Pi 与社区包版本；测试中文/空格路径、CRLF、路径映射、符号链接与 junction、取消进程树、文件占用及重命名、端口释放、睡眠唤醒。原生与 WSL 的路径/凭据/安装目录不可混用。[官方 Windows 指南](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/windows.md)

### P2：第 16 节将部署形态留待确定，影响后台执行基本语义

需要尽早区分“关闭标签页”“关闭窗口”“退出程序”“电脑睡眠”。建议第一版默认本地后台 worker，与 UI 生命周期分离；退出或睡眠后持久化 checkpoint，重启进行对账，不承诺原进程自动续跑。若选远程后端，再定义文件同步、密钥位置、远程环境、认证和网络连接。此为建议，不是用户已确认决策。

### P2：第 14 节图片对比自我升级验收缺少垂直切片

生成 UI 并不能证明增加了 Agent 能力。建议要求：新组件与 registerTool 对应同一 compare 操作；处理真实图片；输出结构化 comparison Asset；版本已注册；用户和 Agent 都能调用；重启可恢复；回滚后旧项目数据仍可读取。把插件代码回滚与数据库/资产模式回滚分别验证。

## 阶段一应交付的具体附件

1. Pi 版本与依赖锁清单，附 commit/tag 和安装环境。
2. SDK/RPC 决策记录及最小程序，包含事件、取消和会话恢复。
3. SessionBinding 和版本化业务事件 schema。
4. 资源发现白名单、工具注册与业务操作适配方案。
5. Windows 环境矩阵与失败恢复测试记录。

这些补充可以保留产品愿景，同时让开发 Agent 不必自行猜测关键执行行为。
