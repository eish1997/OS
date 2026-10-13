# 045 本地电脑版优先

日期：2026-10-07。所有者root。用户主动调整当前范围：先把工作台做好，多端连接以后增加，目前只做本地电脑版。

## 交付

新增本地执行范围和ADR-026，同步主开发文档v0.6、执行文档v0.6、存储文档v1.2、README/索引与部署计划。当前本机主服务/单Pi worker/SQLite/资产/备份/项目标签/对话/内容导出先做好，再按本地门槛进入M1。远程入口/手机、远程节点、跨机/异地、Linux部署移为R-01至04，不改成done。MEM-01组件实验保留blocked；M0-08先验证可追溯研究、明确局限/暂缓结论及用户价值，不伪报腾讯效果。

current改为最新恢复摘要，backlog和acceptance保留此前证据表并更新剩余条件；调整前每个被修改文档逐字保存在output/dev-evidence/local-scope-before/*.txt并记录哈希。下轮ready任务L-01复查实际本机路径，不消耗模型做视觉观察。当前本地M0及M1未完成。

## 调整前已发生的可信工具准备

原部署任务准备了42,860,696字节MSYS2便携归档，SHA256与官方匹配，14526条目录项检查后仅在开发私有缓存解压；GPG2.4.9/Pacman6.1.0版本检查及归档签名通过，固定主密钥0EBF782C5D53F7E5FB02A66746BD761F7A49B0EC。见[准备记录](../../../output/dev-evidence/msys2-portable.json)与[签名日志](../../../output/dev-evidence/msys2-signature.log)。无全局PATH/注册表安装、无pacman依赖安装、无Hypervisor变更。

失败诊断保留：GitHub公共API额度已耗尽，改用官方静态校验和；HTTP二进制内容不能Trim，显式UTF-8解码修正；无profile的bash找不到head，改成绝对工具路径后版本检查通过。它们不是实际归档哈希或签名失败。首次安全文本逐字匹配因换行失配，归一空白后与固定v11.1.2政策一致。

发现QEMU TCG不提供未知guest安全隔离保证，guest内存也不是宿主硬限制；已纠正原路线，只准可信Linux预演，腾讯实验另需受支持隔离。依据[官方政策](https://www.qemu.org/docs/master/system/security.html)与[固定原文](../../../output/dev-evidence/qemu-11.1.2-security.rst)。

用户调整后停止所有部署准备。私有homedir的GPG-agent通过gpgconf正常停止，进程核对无残留；没有下载QEMU/Ubuntu、启动VM、运行腾讯代码、安装网络客户端或购买资源。缓存保留，不混入普通业务资产或恢复包。

## 验证与局限

本轮为文档/范围调整，没有产品源码改变；只读健康接口仍ready、原PID52144/实例保持，没有服务重启、模型请求或数据迁移。复用044的128项完整工程基线，核对143文件哈希及所有本地文档引用，结果见[范围审计](../../../output/dev-evidence/local-scope-audit.json)。不因范围缩减宣布本地M0、M1或原开发目标完成；Windows真实登录/默认浏览器/睡眠、本机磁盘/WAL、用户实际成果与反馈继续待验收。
