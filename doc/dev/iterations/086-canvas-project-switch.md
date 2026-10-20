# 086：顶部项目切换、请求域与刷新恢复

2026-10-16，EMB-04继续。未部署、推送或模型调用。

## 实现

CanvasController支持openContext(projectId,canvasId,draft)，只有编辑器确认新上下文（包括超时后的真实状态对账）后才发onContext。CanvasLayer转交该事件，工作台再执行现有selectProject，保留原窗口/Pi项目上下文规则。新增CanvasProjectCoordinator，串行执行并合并尚未开始/仍在解析的旧意图；失败不提交宿主项目。初始化握手后读取已保存布局的项目，并通过context API恢复最近画板。

0067补丁：workspaceFetch每次请求快照当前project header；目标metadata/scene读取使用明确目标项目，原画板保存保持旧项目。在staging验证完成且提交检查通过后才切换活动请求域；加载失败复原。打开成功异步登记最近画板，服务端保存确认也更新recent。桥能力协商增加project-scope，避免新宿主接旧包后默默串域。

导入在文件解码前捕获项目，场景写入使用该项目显式header；关键await后重新核对当前项目。解码或POST期间切换项目会停止后续自动打开，原项目已提交副本保留，不将原文件悄悄写入新项目。导入/恢复后续项目元数据和暂存清理仍需继续验证。

## 验证与失败

- `project-086-tests.log`6项通过：意图合并、失败后继续、已有控制器取消/丢ACK协调、实际API归属。
- `project-ui-086/report.json`首次失败为测试内page.evaluate嵌套函数被tsx生成__name辅助符，浏览器无该符号；改为直接循环创建样例项目，未改产品绕过。
- `project-ui-086b/report.json`通过A/B绘制、独立canvasId/列表/场景、切回同内容且同store、目标加载503保留项目A和原图、重试及刷新恢复B。
- `project-ui-086c/report.json`在最新086b包通过上述路径，并新增旧画板未保存编辑时POST503阻止切换、保留原项目及编辑、重试成功。
- `project-main-regression-086/report.json`在最新包与宿主静态构建上通过原真实Chrome回归：保存确认、中文、主题/线宽、三层交互、重新打开、FIG导入、空草稿、快捷键新建和菜单关闭同实例。
- 086b包构建、宿主构建086、根类型、完整上游Vue类型及接入4文件类型感知lint退出0，0067反向apply检查和diff检查通过。最初lint复杂度/嵌套三元问题通过提取目标读取参数及将recent检查放到workspace方法中修复，错误日志保留。

最新候选`.runtime/canvas-workbench-package-086b`，宿主`output/canvas-workbench-build`为086。canvas QA脚本默认包同步到086b，避免新project-scope宿主误用080旧包；历史证据不覆盖。

## 仍未完成

布局reload/undo/导入/跨标签更新、项目归档尚未接入切换前屏障。当前顶部选择和初始化已接入，但不能把这些证据扩展到所有布局替换。下一步检查`src/workbench/client.ts:useLayoutStorage`的reload/change/saveCopy/undo，保证项目变更先协调，失败保留原布局；提交回调已经处于目标上下文时不能递归触发新的切换。变更期间若有新的布局编辑，不能拿旧快照覆盖用户改动。

目录、文件、输出及作品包的全部反查/创建归属、旧画板关联UI、恢复项目绑定、冲突另存/重载仍待实现；快速意图合并有单元证据，真实高频切换/取消与全部V矩阵尚待验收。project coordinator目前无主动取消在途请求UI，按序完成已启动切换，再处理最新待执行意图。

本轮服务只用独立temp数据，真实用户服务未操作。70702主回归已输出通过报告，终端最终状态见current；其余构建/检查/项目浏览器均结束。
