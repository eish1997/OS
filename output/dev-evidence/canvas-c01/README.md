# C01 核心契约验证

日期：2026-10-15。固定来源、补丁哈希、设备及运行结果见 [workspace.json](workspace.json)。C01.1 核心契约通过；隔离、网页、桌面以及持久化产品验收不包含在此结论中。

## 已验证

- `powershell -ExecutionPolicy Bypass -File scripts/canvas.ps1 workspace`：退出 0。全内容区画布、覆盖面板开关、输入遮挡、画布平移、真实文本输入岛、缩放保留输入及窗口调整通过。截图为 [编辑状态](overlay-editing.png)、[交互输入](interactive-node.png)。
- 最新复验补齐真实鼠标选中交互实例、方向键移动、Ctrl+Z 恢复，并在随后预览验证输入与缩放。没有用 API 直接设置位置代替该编辑验证。
- `node apps/canvas/probes/identity.mjs`：退出 0。两轮真实 FIG 下载，每轮关闭浏览器再用全新进程导入；嵌套几何、父子关系、`os.canvas/nodeId` UUID 及未知扩展配置保留。完整输入、输出与文件校验值见 [identity/result.json](identity/result.json)。
- `scripts/canvas.ps1 setup`：退出 0，两个补丁重复应用检查通过，冻结依赖安装无变化。
- 此前新增布局代码的 `vue-tsc --noEmit` 退出 0；尚未完成完整应用构建。

## 改变实现方向的发现

FIG 内部 ID 会变，但 namespaced pluginData 可以承载持久业务身份，不必为此复制另一套场景树。**上游复制节点会连同业务 UUID 一起复制**，实测 duplicateCollision=true。因此仅为首次创建节点写 UUID 不够：C02 必须覆盖复制、粘贴、导入、撤销/重做和重开，保证新副本身份独立、恢复身份稳定。资产引用与节点身份必须分开处理。

初次 probe 把导入后追加的上游 `open-pencil/layoutDirection=AUTO` 元数据误判为变化，失败记录保留在 identity/failure.txt。修正后的断言只精确比较本实验写入的两个命名空间，并在结果中保留全部导入元数据；没有忽略本业务数据的变化。

已检查上游 `src/app/document/io/source.ts`、`write.ts` 及 storage registry/types：现有保存入口已有修订捕获及自动保存，但 storage binding 的写成功首先表示 `persistStorageCanvasLocally` 完成，不能直接等同于本机工作区服务完成磁盘提交。接入自定义 provider 前必须验证这条确认路径；不得把浏览器缓存当持久化完成。

## 后续契约及未通过项

- 编辑器仍是几何、选择和撤销的唯一权威，业务使用独立 UUID 关联内容；未知扩展数据保留。
- 本地服务边界应为加载已提交修订、按预期修订保存、查询提交结果、读取内容和订阅变更；保存成功必须来自磁盘提交确认。调用超时后用操作 ID 查询，不自动重复写入。
- 原型由现有 Vue/Vite 页面承载；它不是正式桌面宿主。Node 24 本地服务与 Tauri 适配方向、保存确认语义及风险边界已在[架构第 9 节](../../../doc/全能画布架构与数据约定.md)固定。网页、隔离、透明窗口的真实原型分别在 C01.2—C01.4 验证。
- 性能结果只是本设备少量对象的启动观察，不代表规模预算验收；首期数值预算已固定于架构第 9 节，C05 必须按规模测量。
- 此报告不证明文件关联、工作内容持久化和自动身份管理已完成。C02 实现与证据独立记录。
