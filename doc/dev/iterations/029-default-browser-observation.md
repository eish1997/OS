# 迭代029：默认浏览器实际启动观察

2026-10-06。上一轮028实现桌面/Startup并通过103项完整工程，归类progress。本轮补实际默认浏览器启动，未修改工程代码或提交模型任务。

## 已取得的实际证据

当前Windows默认HTTP处理程序为ChromeHTML。实际运行`open-workbench.ps1`（不加NoBrowser），命令退出0，回执browserRequested=true，原工作台PID47124保持。随后后台health核对原实例/启动标记且ready；实际守护状态仍running/ready、PID40816且restartCount=0。

Chrome浏览器连接的getState与getTab失败，错误为nodeRepl.fetch request failed。可选择的原in-app标签返回“正在连接工作台”，没有因此推定页面正常或已登录。

通过computer-use技能的Windows应用列表取得唯一Chrome窗口“工作台 / Studio - Google Chrome”。尝试进一步读取窗口时，Computer Use策略保护报告无法可靠确认当前浏览器URL，停止本轮界面自动检查；没有取得截图或页面内容，也没有进一步输入、绕过保护或自动操作认证对话框。技能来源：[SKILL.md](C:/Users/15128/.codex/plugins/cache/openai-bundled/computer-use/26.930.41038/skills/computer-use/SKILL.md)。

## 结论与恢复

[观察记录](../../../output/dev-evidence/browser-opening-observation.json)区分已验证的实际打开命令/窗口存在与未验证的页面可用性。原103项工程基线继续有效，未重复工程或真实模型探针；当前后台不重启，不因浏览器连接错误再开新的后台实例。

真实默认浏览器页面、认证状态、Windows注销/登录和睡眠唤醒门槛仍未通过。之后仅通过正常可用的浏览器连接或用户直接反馈补验，不能采用低层浏览器抓取或跳过URL策略作为替代。完整目标active；远程手机/物理配额/WAL、异地恢复、腾讯和用户反馈、M1原范围保持。
