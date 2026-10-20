# 插件管理交付审计

状态：工程验收与本机交付通过（2026-10-15）。证据根为 `output/dev-evidence/plugins/`；最终源码及证据摘要见 `manifest.json`。下表按执行文档PV01–18核对；旧失败日志保留，失败原因及修复见071迭代，不把旧失败记录当作当前结果。

| 要求 | 当前证据 | 覆盖与边界 |
| --- | --- | --- |
| PV01 工具与生命周期 | plugin-runtime/plugin-execution；tool-error-cancel-recheck.log；live/report.json | 真实SDK工具错误回执/AbortSignal已通过；错误取消探针使用确定性provider流，不计为真实模型调用 |
| PV02 许可与重名 | 原生工具冲突、动态set冲突、命令与模板/Skill冲突 | 已复核worker按原policy与已启用扩展生成激活列表；注册保护先检查再写入；动态来源由scheduler核对；生命周期错误中止并记录失败 |
| PV03 Skills模板命令 | 真实SDK参数展开与命令，真实worker精确参数 | dispatch截取未伪称真实模型调用 |
| PV04 发现与来源 | 默认Skill保持、resources_discover、界面来源记录 | 已核对loader的Skills/prompts诊断经worker与scheduler进入页面；显示最近10次，每次500资源/100诊断；最新浏览器检查通过 |
| PV05 三来源安装 | plugin-npm/plugin-git/plugin-manager；真实本地安装 | 当前证据可用 |
| PV06 开关与实际使用 | live/report.json，live/entry.json；3次模型请求；runtime-capacity-recheck.log | 已验证加载失败对应Run且未调用模型 |
| PV07 环境读写互斥 | real-worker-lock.log、runtime-capacity-recheck.log | 真实Pi命令阻塞时更新等待，新任务排队，worker退出后更新才执行 |
| PV08 排队重试接续 | manifest签名、changed-continuation、原生会话全套回归、实际排队后更新 | 后续任务保存新environmentRevision，历史manifest保持；Service.retry保留taskId/policy，reserveCall累加同taskId全部尝试，scheduler先检查父运行manifest；task-budget覆盖失败/取消/中断及并发重试 |
| PV09 幂等与并发 | http-contract.log、浏览器丢响应重试、双客户端修订 | 当前证据可用 |
| PV10 实际进程中断 | all-operation-crashes.log 5/5；job-guard.log | 真实杀宿主覆盖安装preparing/committing/completed以及更新/卸载committing；核对原租约过期、未知状态隔离及显式修复；npm脚本后代回收另有Job测试 |
| PV11 缺包离线超时 | prerequisites.log、offline-network.log、failure-boundaries.log、npm超时 | 真实worker缺npm/git在写入前失败；真实不可达registry显示安全网络类别 |
| PV12 本地源变更与卸载 | fingerprint变更、local-relocation.log | 实际移动源目录后缺失/拒绝加载、卸载旧登记、从新路径安装启用，源文件保持 |
| PV13 刷新断连关窗重启 | ui-pending-close.log、响应丢失、真实宿主中断恢复 | 等待更新时关闭/重开恢复同操作，完成一次，无新增重复操作 |
| PV14 单例与空间 | ui/report.json、plugin-layout、跨空间设置定位与复制导入 | 当前证据可用 |
| PV15 可达性 | 窄窗键盘、真实Chrome150%、错误保留输入，截图已检查 | 当前证据可用 |
| PV16 恢复容量清理 | capacity-restore.log、runtime-capacity-recheck.log | npm脚本实际写20MiB超过18MiB组配额后终止；提高配额显式修复，干净恢复不联网，显式重装后再启用 |
| PV17 既有能力回归 | final-regression.log 211/211、原工作台三组浏览器、final-pi-probe.log | 最新运行代码全套通过，零失败/跳过；final-types.log与final-candidate-build.log通过；最终插件浏览器也通过 |
| PV18 模型浏览器闭环 | live/report.json 与entry.json，真实工具返回随机标记 | 已通过；不要重复消耗模型额度 |

部署：`deployment/before.json` 与 `after.json` 证明应用前后原业务摘要一致，`candidate.json` 指向私有备份和逐文件摘要。服务地址为 `http://127.0.0.1:4310/`，使用“设置 → 打开插件管理”或添加窗口入口。实际模型验收新增的独立项目已归档，不应将这两项验收任务误判为部署改写原业务。

最终增量：`deployment/final-candidate.json`记录25个文件，独立保存原文件与业务备份；`deployment/final/before.json`与`after.json`证明22项目、41任务、42执行、56资产、5记忆、16草稿等全部业务摘要一致。`live/entry.json`在增量应用后重新验证实际入口、历史真实回复、工具来源和用户保存布局未改变。最新真实模型证据共3请求、7078 tokens；本轮审计没有新增模型请求。

范围内无未关闭阻断项。Pi终端主题/交互终端UI不转换为网页功能；扩展为可信代码而非系统沙箱；本地源可变；环境变化需新会话；修复是显式重新安装而非跨介质原子回滚。这些是执行文档既定边界，已在使用说明中呈现。用户审美认可不冒称已获得。
