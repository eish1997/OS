# C01.3 早期网页承载验证

结论：C01.3 的可行性原型验收完成；C07 正式媒体/网页功能未完成。

范围：Windows 当前测试机、Tauri 2.12.1 / Wry 0.57.0 / 系统 WebView2；独立 validation release，非正式安装器。真实 HTTP 受控页面设置 X-Frame-Options DENY 和 CSP frame-ancestors none；这证明独立网页承载，不证明任意公共站点、登录或防机器人策略。宿主记录各自绑定 exe SHA，后续源码模块由测试入口注入，不能声称安装版已内置正式网页节点。

| 执行文档 C01.3 必须项 | 证据 | 范围 |
| --- | --- | --- |
| 真实网页承载 | result.json、web-content.png | 独立子 WebView，真实 HTTP，不是 iframe/mock |
| 输入、焦点 | focus/focus-result.json、input-events.json、inspection.json、ime-candidate.png | 前台/焦点句柄校验后 Windows SendInput；Unicode X 和当前中文输入法 y→空格→有；不等于全输入法兼容 |
| 缩放 | layout/result.json、viewport-clip/result.json | 原生网页缩放及真实画布 0.75；原生支持 0.25—4，0.1 时暂停、回范围恢复输入 |
| 遮挡及命中 | clipping/clipped.png、scrolled.png、inspection.json | 面板洞内 OS 点击计数 0→1；露出网页 OS 滚动；unclip 恢复 |
| 画布/面板联动 | layout-visual/panel-moved.png、viewport-visual/partial.png、new-tab.png | 实际图节点平移/缩放、DOM 面板移动、部分离屏裁剪、标签栏 OS 点击及旧表面隐藏 |
| 所选宿主兼容性 | layout/native-host.json、0008 补丁、runtime/web-surface.mjs | 合并主线程布局更新、权限拒绝、关闭资源回收；无主页面错误 |

原问题和适配：普通子 WebView 覆盖主 DOM 最高 z-index（native-overlap.png）；Windows 子 HWND 区域裁剪可露出主 DOM 面板，不改作品坐标。画布顶部边界原有泄漏保留于 layout-visual/partial.png，clipTo 修正后的窗口证据为 viewport-visual/partial.png。

## C07 必须继续完成

- 正式网页节点创建/地址栏/导航/保存恢复、错误页和用户可见的受限状态；不能把注入的测试适配器当正式 UI。
- 任意画布缩放下的显示策略（原生超范围暂停只是恢复措施）；节点不应无说明地消失。
- 面板/弹窗/工具条统一注册、多个网页节点、重叠和层级、旋转/透明效果边界；完整输入法候选弹窗遮挡。
- 公共站点清单、登录/会话隔离、下载/弹窗/导航策略；对所有暴露宿主接口的权限拒绝与资源上限。
- 多 DPI、显示器切换、连续动画中的合成错位/性能；当前一组静态截图不证明每帧无闪烁。
- 生产编译接入、依赖声明复核、新安装及回归；实验性 unstable API 需保留版本固定。

接口边界：渲染后的锚点和面板矩形作为原生表面的布局输入，持久化权威仍为作品图。当前适配不要求更换 OpenPencil 或修改作品格式；扩展能力若改变这些契约须重验受影响阶段。
