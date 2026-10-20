# C01.4 桌面承载原型证据

状态：C01.4 早期可行性原型通过；C10 完整产品化仍未开始。

## 已有证据

| 验证项 | 证据 | 边界 |
| --- | --- | --- |
| 其它普通窗口获得焦点时，全局快捷键隐藏/恢复 | basic/result.json；transparent/result.json | Ctrl+Alt+F10 固定原型键，尚无配置 UI |
| 隐藏后键盘输入交给下层窗口 | 两份 result.json 与 target 子目录 | 真实 WinForms 窗口读回 X，不是仅检查内部状态 |
| 主窗口和网页子窗口一起隐藏/恢复 | transparent/result.json | 检查实际 HWND 可见性 |
| 画布草稿与网页输入恢复 | transparent/result.json | 未证明长期任务、媒体播放或全部网页 |
| 透明合成保留实际场景和网页 | transparent/layer-propagation.json、layers-transparent.png | 新统一入口原生回归见 layers-native 三张截图 |
| 新渲染器继承透明模式、两层切换且页面颜色不变 | transparent-lifecycle-test.json；上游 desktop-transparency.test.ts | 真实 CanvasKit 渲染器的注册/移除/新建测试，不替代 Windows 合成 |
| 快捷键重复注册拒绝及停止后释放 | basic/result.json；transparent/result.json | 完整冲突提示与备用找回界面归 C10 |

## 新包联合验证

transparent-layers-host.json 固定 exe 摘要；transparent-layers-build.exit.txt 与 transparent-layers-package.exit.txt 均为 0。

- layers-native/result.json：实际快捷键、主/子 HWND 可见性、下层键盘输入与鼠标按钮点击读回、草稿/网页保留、两层透明切换、停止后重新注册通过。探针退出 0。
- layers-native/node-coexistence.json：在节点 UI 发起执行，窗口隐藏期间短时同步 QuickJS 任务完成，恢复后结果保留。未验证长任务及媒体播放。
- layers-native/transparent.png、opaque.png、restored.png：真实 Windows 合成截图，已查看；透明时底层蓝色窗口可见，真实节点与网页保留；关闭透明遮住底层，再开启后恢复。
- transparent-lifecycle-test.json：真实 CanvasKit 小尺寸离屏渲染器，8 项断言通过，覆盖新注册渲染器继承、双层切换和作品背景颜色不变；不代替 Windows 合成验证。

早期契约可行：展示设置归编辑器统一管理；主窗口隐藏同时隐藏子网页并让出输入；保留节点执行及网页状态。仅 Windows 当前显示环境与受控页面实测，完整产品范围仍归 C10。

## 完整产品仍需完成

全屏叠加及窗口层级、飞出/飞入动画、连续切换和中途反转、减少动画、可配置快捷键与冲突提示、独立找回入口、任务/输入/选择/坐标/撤销完整保留、性能预算及混合内容回归。多显示器、不同 DPI 和显示器拔插未验证。展开时空白区域是否穿透仍是独立待定交互选项，不能把背景透明解释为自动穿透。

透明模式暂绕过场景 retained backing/tile 缓存，尚未做规模性能验收。所有原型使用独立 validation 身份，未替换正式安装。
