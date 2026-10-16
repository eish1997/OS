# Windows 局部遮挡原型

当前状态：源码实现，尚未通过真实窗口验收。

依据：
- Microsoft SetWindowRgn：区域相对窗口左上角；成功后系统取得 region 所有权。https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowrgn
- Tauri PlatformWebview 暴露 Windows controller。https://docs.rs/tauri/latest/x86_64-pc-windows-msvc/tauri/webview/struct.PlatformWebview.html
- 本机固定 wry 0.57.0 src/webview2/mod.rs 中 child 使用独立 container HWND；不是对整应用顶层窗口裁剪。

实现：仅 main validation 命令可提交最多 64 个有限矩形。with_webview 在正确线程获取 controller ParentWindow；核对其父句柄为应用窗口且不等于应用窗口。以实际 DPI 换算逻辑矩形，用完整子窗口区域减去覆盖矩形，再 SetWindowRgn；失败释放 GDI 对象，成功交给系统。oneshot 回传实际完成结果。其他平台返回未支持，不伪装成功。

验证必须包含：部分遮挡后露出网页仍显示、裁剪洞中宿主按钮可点击、移除裁剪恢复网页且输入保留、窗口/画布移动后重算、不同 DPI。当前矩形由诊断客户端显式提供，尚未自动连接产品面板生命周期。不能声称完整合成、任意旋转或半透明面板混合已支持。

诊断：OS_CANVAS_WEB_INSPECT=1；OS_CANVAS_WEB_HOST_RECORD 指定新产物记录；OS_CANVAS_WEB_EVIDENCE 指向独立目录。使用 TTY 执行 native-webview.mjs，stdin clip/unclip/hide/show/status/finish。截图必须取原生窗口，CDP 子页面截图不证明裁剪生效。
