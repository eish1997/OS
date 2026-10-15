# ADR-033：工作台布局、全局窗口与配置协议

2026-10-15，实施中。范围来自工作台骨架重构执行文档，尚未代表总验收完成。

## 选择与依据

核查两个候选的官方说明及 npm 元数据：

- Dockview React 8.5.1，MIT，React 16.8–19 peer 范围，官方仓库 https://github.com/dockview/dockview 。[浮窗](https://dockview.dev/docs/core/groups/floatingGroups/)与[序列化](https://dockview.dev/docs/core/overview/)提供成熟组管理；全局跨空间收纳和应用实例状态仍需应用层实现。
- FlexLayout React 0.11.1，MIT，React 18/19 peer 范围，官方仓库及[说明](https://github.com/caplin/FlexLayout)提供 tabset、JSON model 与页面内浮窗。其分组/标签模型比本轮单叶单窗需求更宽。
- 本轮原型采用 React/CSS 分割树＋Pointer Events，未安装上述候选，不宣称已运行其集成或性能比较。原因：需要跨空间全局浮层、图标收纳和明确的实例/视图状态模型；原型已用真实 Chrome 验证基础转换和输入保留。若后续复杂拖拽/焦点用例不通过，继续修正或改用候选，不降低验收。

应用协议独立于渲染库：`shared/workbench-layout.ts`。窗口业务状态存储在实例外部；移动只改变位置引用。上限：32空间、256窗口、512树节点、12层嵌套、180000 UTF-8字节配置、浮窗最小240×160；空分区最小180×120，含窗口分区使用注册最小尺寸加26px控制栏，视口不足时分区容器滚动。尺寸比例0.05–0.95。未知类型保留说明占位。

## 保存

`GET/PUT /api/workbench/config`，已有认证和同源检查。`workbench_config`实体保存schemaVersion=1、revision、layout与previous；沿用事务/容量/备份实体机制。PUT要求预期revision；冲突409，前端保留未保存副本并提供下载、重载及另存合并。配置损坏GET退回previous或默认值但不修改原件。

业务Project与布局Workspace独立。浮窗全局保存，不属于某空间树；关闭/复制布局不创建/删除业务记录。默认入口 `/` 与别名 `/workbench` 加载新版，`/legacy` 加载旧版。按路径异步加载CSS避免旧全局样式污染；本地入口已实际验证。

## 证据与待完成

`tests/workbench-layout.test.ts`、`tests/workbench-config.test.ts`六项通过；`scripts/workbench-ui-qa.ts`真实Chrome烟测通过：分割、浮窗、Escape、置顶、图标、整体收纳、空间切换、刷新、第二浏览器上下文。证据在`output/dev-evidence/workbench/ui`。扩展证据见 `layout-ui/report.json`（真实拖动、冲突、损坏、重启及150%浏览器缩放）、`live/report.json`（真实Pi4次请求）与 `entry/report.json`（本地默认入口）。最终覆盖以061验收记录为准。
