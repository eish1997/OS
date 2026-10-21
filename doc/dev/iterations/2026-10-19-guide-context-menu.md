# 参考线右键菜单恢复修复

范围：用户反馈删除参考线后，任何位置右键都只显示“移除参考线”。

根因：会话状态由 `shallowReactive` 创建，`setSelectedGuide` 原地修改 `guides.selected`，未触发 CanvasMenu 的 computed 更新。菜单缓存旧选中值；取消菜单后在空白处重新打开也会复现。

修复：`0071-guide-selection-reactivity.patch` 将参考线选中修改改为替换 `state.guides`，保留其他参考线覆盖状态。保留原有删除与撤销逻辑。

验证：`node apps/canvas/probes/guide-context-menu.mjs`。使用公开 API 准备独立页面参考线及矩形，右键、取消、删除和撤销均为真实浏览器输入。修复前在取消参考线菜单后对空白处右键失败，仍只显示参考线菜单；修复后开发页和生产构建页通过：取消后空白菜单、删除后空白/矩形/原位置菜单、撤销恢复并再次删除。无 pageerror。证据：`output/dev-evidence/guide-context-menu/{before,after,production}/`。

完整 lint 被现有 theme.ts、local-workspace.ts、host-bridge.ts 等位置的 8 项错误阻挡，与本次修改的 overlays.ts 无关；未修改这些无关代码。单文件检查及最终构建状态见 current。

测试开发服务因附带 MCP 服务就绪超时启动失败，测试时使用忽略目录中的独立 Vite 配置跳过该插件；生产构建使用原配置。未使用用户作品、会话或模型调用。
