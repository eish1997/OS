# chat-ui-loop-001

时间：2026-10-21。分支：`eish1997/refactor-local-chat-interactions`。基线 HEAD（开始时）：`0f8272a`；工作区含未提交实现。

## 本轮完成

### CHAT-00 现场与范围基线

- 证据根：`output/dev-evidence/chat-ui/loop-001/`
- 候选构建：`output/chat-ui-build`（不覆盖日常 `dist`）
- `WORKBENCH_SKIP_DOTENV=1` 预加载隔离：`scripts/chat-ui/preload-isolate.ts`
- 非回环外连拒绝：`scripts/chat-ui/block-external.ts`；`isolation.json` blocked=1
- 串行 runner 支持 `-EvidenceDir` / `CHAT_UI_SERIAL_EVIDENCE`，默认仍指向历史 loop-169，避免误覆盖
- 命令：`test:chat-ui-isolation` exit 0；零模型

### CHAT-01 活动操作不丢失

- 根因：`panes.tsx` `runs.slice(-3)` 裁掉 `waiting_interaction`
- 修复：`shared/chat-visible-runs.ts` + `selectVisibleRuns`；开放状态与 `cancelRequested` 始终保留
- 验证：单元 3/3；浏览器 CHV-04 `chv04-report.json` passed；待答+三排队→4 卡、确认题、活动停止均可见
- 命令：`test:chat-visible-runs`、`test:chat-ui-chv04` exit 0

### CHAT-02 完整状态设计

- 冻结文档：`doc/dev/chat-ui-design-freeze.md`；常量：`shared/chat-ui-design.ts`
- 默认可操作原型：最大空叶放置、聊天区字号/命中补偿、输入增高/展开、纯图提示、IME 守卫骨架
- 验证：`tests/workbench-layout.test.ts` 新增放置用例；`chat02-report.json` pane≈720px、body 视觉 14px；窄窗消息区比例断言通过
- 命令：`test:chat-ui-chat02` exit 0

## 构建身份

- `vite build --outDir output/chat-ui-build` exit 0
- 当前资源：`assets/app-CkfGN2CG.js`、`assets/app-CVkxfmE-.css`（以目录内最新为准）

### CHAT-03 对话展示模型

- `shared/chat-turn-model.ts`：turnId、hostMessageId/sequence、nativeEntryState（bound/pending/unavailable，不猜测 entry）
- `ChatPane` 按 turn 渲染 `data-turn-id` / `data-host-sequence`；历史请求 generation 防竞态
- 验证：`tests/chat-turn-model.test.ts` 3/3；CHV-04 回归含 turn/anchor 断言

### CHAT-04 主区域与阅读

- 流式跟随、上滚暂停、`回到最新`：`chat04-report.json` passed
- 加载更早消息：按同一 `data-message-id` 相对视口偏移恢复（容差 8px）
- 可逆聚焦：`聚焦对话` / `还原位置`；`chat04-focus-report.json` passed

### CHAT-05 输入与运行动作

- 实现：`src/workbench/chat-pane.tsx` radiogroup、主按钮/Ctrl+Enter、停止中 disabled、「正在停止…」
- 验证：`chat05-report.json` passed；CHV-04/chat04 回归 exit 0
- 系统 IME 归 13/14

### CHAT-06 附件闭环

- 选图 + 合成粘贴/拖入（非 OS 剪贴板）、缩略图芯片、非图拒绝、资产窗「添加资料」
- `ImageUpload` 暴露 `uploadFiles`；上传阶段文案与恢复入口保留
- 验证：`chat06-report.json` passed
- 系统剪贴板归 13/14

### CHAT-07 消息与成果呈现

- `chat-markdown.tsx`：代码块复制、表格横向滚动容器
- 消息操作：复制全文、引用（带来源标注写入输入框）、定位执行；消息图片成果卡
- 验证：`chat07-report.json` passed

### CHAT-08 过程与恢复入口

- 「全部执行历史」展开超出默认 3 条关闭历史；失败卡「本轮工具过程」独立于「模型请求」
- 「普通重试（不追加额度）」与「追加额度后恢复」分入口；中断未对账先提示核对
- 提交区：限制摘要 + 剩余≤1 / 费用含预留≥80% 接近上限提示
- 验证：`chat08-report.json` passed；`test:chat-ui-chat08` exit 0；零模型

### CHAT-09 提交配置与冻结信息

- `chat-connection.tsx`：对话内打开现有 ChatGPTPanel + PiExecutionSettings；legacy 仅为可选
- 未连接「打开连接设置」/已连接「下次配置与额度」；返回后输入草稿保留；不点真实 OAuth
- 旧 Run `data-chat-run-frozen` 展示本次冻结模型/思考/长任务
- 验证：`chat09-report.json` passed；`test:chat-ui-chat09` exit 0

### CHAT-10 话题管理与查找

- 新建默认标题 `对话 · {时间}`；同窗改名/切换；标题筛选本项目
- `PATCH /api/conversations/:id`；`GET .../search` 服务端全文查找（可取消）+ 定位闪烁
- 验证：`chat10-report.json` passed；跨项目同名不串；`test:chat-ui-chat10` exit 0

### CHAT-11 分支压缩导入导出

- 话题栏「分支/来源」「导入导出」「压缩入口」滚动到对应区
- 消息「从此分支」预设执行；分支话题「打开来源话题」；导出链与压缩按钮可达
- 验证：`chat11-report.json` passed；`test:chat-ui-chat11` exit 0

### 现场修复

- `server/network.ts`：Node &lt;24.14 时软加载 `setGlobalProxyFromEnv`，离线 `WORKBENCH_PROXY_MODE=direct` 可跑浏览器 QA
- 离线 500 诊断：`CHAT_UI_ISOLATED=1` 时 `app.ts` 打印非 AppError 堆栈

### CHAT-12 编辑重发与重新生成

- 契约：`shared/chat-version-ops.ts`；`POST /runs/:id/version`、`GET .../version-targets`
- 重新生成：`sessionAction=regenerate` + `agent.continue()`，基点为 user/已完成 toolResult，不重做成功工具
- 编辑重发：首条空历史；默认继承附件可勾选；独立副本，原件不改
- 验证：`chat12-report.json` passed；`test:chat-version-ops` + `test:chat-ui-chat12` exit 0

### CHAT-13 多窗口与三层适配

- **工具栏「＋ 窗口」→ Pi 对话**打开第二窗（`layoutFixtureUsed:false`）；默认可停靠空叶，同话题双窗草稿隔离
- 两话题切换不串；跨项目历史 API 隔离；聚焦还原；800×600 + zoom0.75；IME 组合键守卫
- 验证：`chat13-report.json` passed

### CHV-21 / CHV-22

- CHV-21：`chat21-report.json` — `closeAllConnections`→「正在重连」→同端口 listen 恢复；历史不假空；断线无新 run；剥离可选字段后可读
- CHV-22：`chat22-report.json` — `includesSecrets:false`，凭据/auth 不入库；干净目录还原后 API+UI 可见 `UNIQUE_BACKUP_RESTORE`

### 系统 IME / 剪贴板能力（已纠正）

- permissions API 仍报 a11y/screenshots=`unsupported`，但 **实测** `get-app-state` / `paste-text` / `type-text` / `set-value` 可用
- `chv07-09-os-gui-report.json`：OS 文本粘贴、type-text、**WinForms SetImage + Ctrl+V → image.png chip** 均 verified；工具栏「＋ 窗口」开聊；窗口按 Playwright 新 pid + title marker
- **仍不可自动**：Windows IME 候选确认（orca 无 IME surface；type-text ≠ 候选确认）
- `ime-clipboard-capability.json` 已按实证改写；合成 CompositionEvent ≠ 系统 IME

### CHAT-14 离线综合验收（done → 完整候选完成）

- `chat14-suite-report.json` **passed=true**（build→chv22）
- **CHV-07 IME 候选**已实证：`chv07-ime-candidate-probe.json`（TextInputHost + press-key 组字 + `1`→你好）
- 候选 `app-AqefWaEb.js`；当时零真实模型、未重启日常服务、未 Git
- 其后 CHAT-15/16 已授权完成（见下）

### CHAT-15 真实模型联调（CHV-23）

- DeepSeek `deepseek-flash`；密钥仅环境变量
- `chat15-report.json`：工具 `write_asset`、图片 smoke、取消/恢复；首轮 steer/queue UI 名未对齐后由 `chat15-steer-queue-report.json` 补过
- 累计账本 `chat15-budget-ledger.json`：**16** 次 / ≈**$0.00675**（≈**¥0.049**），上限 50 / ¥10

### CHAT-16 日常应用（CHV-24）

- `chat16-report.json` **passed=true**；备份 `AI-OS-Backups\chat16-20261022-112312`；在途 run 空；八类业务 digest 与 before 一致
- 日常 `F:\AI\OS\dist` = 候选（`index-Be7gnRRk.js` / `app-AqefWaEb.js`）；workbench 200
- 启动阻塞：PATH Node 24.5 缺代理 API → 修 `local-service.ps1` 取最新 Node24（实际 24.19）后 ready
- 自动备份 API 仍报路径/权限需查（`lastSuccessAt` 仍为 2026-10-21），业务数据未改写；未 Git

### 本轮续补

- CHV-01/05/06/08/10/12/14/18/20–22 及 CHV-13 页内选文均有报告
- npm 增补：`chv01` / `chv06` / `chv08` / `chv12` / `chv13-select` / `chv14-deep` 等；suite 已挂入

### CHV-03 / 15 / 16 / 19（离线续补）

- CHV-03：`chv03-report.json` — 展开「本轮工具过程」后阅读锚点 offsetΔ=0（容差 8px）
- CHV-15：`chv15-report.json` — `appendCompaction` 后 `afterCompaction=true`，UI「位于压缩之后」；`native-version-ops` 改为沿全 entry 父链检测
- CHV-16：`chv16-report.json` — 导出字节一致→导入预览→restore 建话题→「切换话题」重开；压缩/导入入口可达；原件保留；取消排队 run，零模型
- CHV-19：`chv19-report.json` — 候选包宿主三层（canvas 注入/留白穿透/浮窗不透明/工具栏 chrome）；iframe 真挂载记嵌入前置
- npm：`test:chat-ui-chv03|chv15|chv16|chv19`；suite 已挂入

### CHV-10 / 17

- CHV-10：`chv10-upload-refresh-report.json` — PUT 中断→恢复 UI→同文件续传；刷新保草稿+附件；迟到 `/api/tasks` 不清新输入（叠加既有幂等报告）
- CHV-17：以 `chat13-report.json` 工具栏双窗路径标通过（无 layout fixture）

### CHV-07 / 09 OS 路径

- 脚本：`scripts/chat-ui/chv07-09-os-gui-qa.ts`（`npm run test:chat-ui-chv07-09-os`）
- 证据：`chv07-09-os-gui-report.json`、`chv09-os-paste.png`、`chv07-os-type.png`、`chv09-os-image-paste.png`
- 通过：OS `paste-text`、`type-text`、系统图片剪贴板；未过：IME 候选确认

### CHV-11 受控订阅（已补）

- `chat09-report.json`：`chv11.cancel/failure/successThenSendEnabled/disconnectInvalidates`；`realOAuth:false`
- 符合计划：离线受控认证，不发起真实账户登录

### CHV-07 IME 候选探测

- `scripts/chat-ui/chv07-ime-candidate-probe.ts`；证据 `chv07-ime-candidate-probe.json` / `.png`
- 软组字（DOM 暂空）→ 按 `1` →「你好」；`imeHostApp=TextInputHost`

### 使用说明

- [对话窗口使用说明](../对话窗口使用说明.md)（完整候选可见入口；从 doc/README 可达）

## 未做 / 下一步

- **整体本机交付完成**；待用户体验反馈
- 未 Git 提交/合并/推送；未提高模型预算；未云部署
- 可选跟进：日常自动备份路径/权限报错（与 digests 无关）

## 资源

CHAT-15 临时服务已关；CHAT-16 日常服务现 ready 于 `http://127.0.0.1:4310`。
