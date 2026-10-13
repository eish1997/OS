exec(compile((__import__('pathlib').Path('E:/AI/OS/output/dev-evidence/update-local-scope.py').read_text(encoding='utf-8').split("scope = '''",1)[0]), 'scope_helpers', 'exec'))

# Retain prior evidence table without carrying outdated deployment blockers forward.
p='doc/dev/backlog.md'; original=read(p)
lines=original.splitlines()
rows=[line for line in lines if line.startswith('| M0-') or line.startswith('| M1-')]
assert len(rows)==22, len(rows)
retained_count = len(rows)
local=[]; later=[]
for row in rows:
    if row.startswith('| M0-04a |'):
        later.append('| R-02（原 M0-04a） | todo | 后续多端 | '+row.split('|')[4].strip()+' | 用户延期；远程 HTTPS/真实节点睡眠及唤醒仍未验证，已有本机 CLI 证据保留 |')
        continue
    updates={
        'M0-01a':'本地固定运行时证据有效；Linux 差异归 R-04',
        'M0-01b':'不推广为全部故障通过；本地 03b/07 按矩阵继续',
        'M0-01c':'已有真实授权/自动默认/重启/目录/文件往返；实际刷新/限流恢复和用户无痛体验仍待核对，不增加必填设置',
        'M0-01d':'本机身份保护通过；原423诊断留 L-03，跨机与 Linux 归 R-03/04',
        'M0-02a':'本地认证/来源/撤销证据纳入当前 M0-07 复核；真实跨网络认证归 R-01',
        'M0-03a':'补本机执行授权/外发/调用预算实际闭环；供应商实际费用不能由本机计数保证，未知代码保持关闭',
        'M0-03b':'本地真实模型恢复已补齐；本机03a/07权限与故障复核继续，远程部署归R阶段',
        'M0-04':'本地自动备份、混合容量及性能已有证据；仍补本机磁盘/WAL与真实体验，异地/跨机归R-03',
        'M0-04b':'应用准入已通过，不声称OS硬配额；本机WAL/剩余空间故障仍需验收',
        'M0-04c':'补本机持续使用压力、磁盘/WAL与用户体验；已有有限查询/上传测量不等同完整压力',
        'M0-04d':'当前Windows本机项通过；真实第二账号未验证，远程Linux归R-04',
        'M0-05':'L-01复核本机项目/对话/成果路径并修复；真手机归R-01，不新增用户部署前置',
        'M0-05a':'已通过本地名称/标签/UTF-8搜索；非UTF-8文档不宣称解析正文',
        'M0-06':'本地真实模型项已有证据；补用户实际工作体验和反馈',
        'M0-07':'补Windows登录/默认浏览器/睡眠唤醒、本机磁盘/WAL边界和真实任务反馈；R阶段不再阻挡本地M0',
        'M0-08':'依赖本地07；交付可追溯研究/暂缓选型结论及稿件并获得反馈；腾讯运行对比另记MEM-01，未运行不能声称有效',
    }
    fields=row.split('|'); ident=fields[1].strip()
    assert len(fields)==7, (ident,len(fields))
    if ident in updates:
        fields[5]=' '+updates[ident]+' '
    if ident=='M0-08':
        fields[2]=' verifying '
        fields[4]=' 腾讯固定commit/原文、21用例、研究ADR及初稿已导入；尚无真实组件运行证据 '
    local.append('|'.join(fields))
heading='''# 权威开发台账

更新：2026-10-07，所有者 root。用户已将当前范围改为[本地电脑版优先](本地电脑版执行范围.md)。原远程前置转 R 阶段，延期不等于通过。历史完整台账逐字保存为[调整前快照](../../output/dev-evidence/local-scope-before/doc__dev__backlog.md.txt)，逐轮记录在 [iterations](iterations/045-local-desktop-first.md)。下表原证据仍保留，状态不因缩减范围自动改 done。

任务来源：主文档20/22/23、执行文档6、范围文档；验证方式为对应证据中的工程/真实Pi/实际UI及本机故障测试。M0任务依赖简写均为M0前缀，所有者root；表中最后一列为剩余验收与下一步，当前没有唯一 doing 任务。本地M0仍 verifying，M1尚未启动。

## 本地 M0 与 M1

| ID | 状态 | 依赖 | 验收/证据 | 阻塞/下一步 |
| --- | --- | --- | --- | --- |
'''
extras='''

## 当前补齐任务

| ID | 状态 | 依赖 | 验收/验证 | 下一步 |
| --- | --- | --- | --- | --- |
| L-01 日常电脑体验 | ready | 已有05/06原型与成果 | 实际页面核对打开项目、上下文对话、成果查看、保存与导出；页面与执行状态一致，Factory + ASCII；保存截图/差异/问题，不消耗模型额度做视觉观察 | 下一轮唯一主任务；先观察现有成果再最小修复 |
| L-02 Windows生命周期 | todo | 本机05/07基础 | 登录启动、正常默认浏览器、睡眠唤醒和后台恢复；保留会话与原件，未知外部结果不重放 | 按实际可观测环境拆分，不能用服务脚本调用代替真实OS登录/睡眠 |
| L-03 原423故障诊断 | ready | 043身份增强 | 保留042失败与043诊断；查清根因或给出有证据的限制及受影响范围 | 不强清锁、不以自动重试通过掩盖首次失败 |
| MEM-01 腾讯候选实验 | blocked | 受支持隔离、固定版本/输入/同模型预算 | 实际运行、21例、同模型基线、成本、隔离/删除/回退及采用结论；资料审阅不能代替 | 隔离前置缺失；TCG不能作为安全隔离；未取消用户选题，也不把它绑到云部署 |

## 用户延期的多端阶段

| ID | 状态 | 依赖 | 验收/证据 | 阻塞/下一步 |
| --- | --- | --- | --- | --- |
| R-01 远程入口/手机 | todo | 用户恢复多端阶段 | 已有030本机TLS/HTTP2和浏览器尺寸证据；真实不同网络手机/HTTPS/冲突/事件/撤销仍待验收 | 用户延期，不采购或安装网络客户端 |
'''
extras+='\n'.join(later)+'''
| R-03 跨机与异地恢复 | todo | 用户恢复多端阶段 | 已有本机加密交接、转存故障和C/E恢复；真实两机/账户迁移与异地恢复未完成 | 用户延期，现有转存未配置 |
| R-04 Linux部署 | todo | 用户恢复部署阶段 | 固定版本/配置/目标安装准备已完成；未实际执行Linux或启动VM | 用户延期，Node/MSYS2私有缓存保留，停止部署预演 |

未列成已完成的全新电脑安装、独立桌面打包、真正远程或组件安全执行，不得据历史工程通过数宣称支持。当前128项基线见[工程验证](../../output/dev-evidence/verification/report.json)，本轮只改文档并核对源码哈希，未重跑模型任务。
'''
write(p,heading+'\n'.join(local)+extras)

p='doc/dev/acceptance.md'; original=read(p)
start=original.index('| 要求 | 任务 |'); end=original.index('\n工程证据',start)
table=original[start:end]
rows=table.splitlines(); updated=[]
for row in rows:
    if not row.startswith('| ') or row.startswith('| 要求') or row.startswith('| ---'):
        updated.append(row);continue
    f=row.split('|');assert len(f)==6, len(f)
    name=f[1].strip()
    pending={
        '固定样例及真实价值':'实际用户目标、可追溯结论/稿件和反馈待补；腾讯运行对比归MEM-01，合成样例与未运行组件不伪报效果',
        '会话/命令/事件':'本机OS故障和权限恢复仍需验证；跨机器/远程环境归R阶段，正常管理停机不能代表全部故障',
        '资产/联合恢复':'026大正文1899ms、025实际上传期间读取325/435ms和024建档121秒已有证据；仍补本机磁盘/WAL/持续压力。真实跨机/异地归R-03，同机双盘不能冒充异地',
        '调度/预算/权限':'补本机权限、授权外发和实际预算闭环；供应商费用/硬输出限制不能由本机保证；未知代码保持关闭',
        'ChatGPT订阅接入':'已有真授权/目录/文件往返及重启；实际账户限流/刷新恢复和用户无痛体验待核对；远程接入归R-03',
        'Windows':'真实Windows登录、默认浏览器可用页面、睡眠唤醒待验证；跨机恢复归R-03',
        '多设备':'用户延期至R-01/02/03；真实手机、不同网络、远程断线/节点重启及异地仍未验证，不再作为当前M0前置',
        '腾讯Memory选型':'MEM-01 blocked：受支持隔离、实际运行/同模型基线/成本/删除回退待完成；M0-08研究可交付明确未运行的暂缓结论，不能声称已采用',
    }
    if name in pending:f[4]=' '+pending[name]+' '
    if name=='多设备':f[2]=' R-01/02/03（原02a/04a/05/07多端部分） '
    if name=='腾讯Memory选型':f[2]=' MEM-01；M0-08研究与实际使用 '
    updated.append('|'.join(f))
write(p,'''# 验收矩阵

更新：2026-10-07，所有者root。当前范围：[本地电脑版](本地电脑版执行范围.md)。当前M0未通过，M1未开始；R项为用户明确延期，MEM-01实验单独blocked，不改为通过。前版完整记录保存在[原始快照](../../output/dev-evidence/local-scope-before/doc__dev__acceptance.md.txt)。

阶段门槛：本地M0-07工程闭环＋M0-08真实使用/反馈＋本地矩阵全部要求；本地M1继续依赖M0。当前保留权限、故障/停止/对账、本机存储和备份恢复、Windows生命周期及用户价值。手机/云资源不阻挡本地阶段，也不作为本轮证据。

当前代码对应[128项工程验证](../../output/dev-evidence/verification/report.json)，包含类型检查、构建及Pi离线探针。真实模型与UI证据另见[文件往返](../../output/dev-evidence/pi-real-probe.json)、[停止](../../output/dev-evidence/pi-real-lifecycle.json)、[恢复/排队](../../output/dev-evidence/pi-real-recovery-queue.json)、[真实记忆/内容](../../output/dev-evidence/pi-real-content.json)、[项目交互](../../output/dev-evidence/ui/project-interactions.json)、[独立硬盘恢复](../../output/dev-evidence/independent-backup.json)。本轮不新增通过数，仅核对未变源码基线和文档链接。

'''+ '\n'.join(updated)+'''

下一轮按L-01实际复查本机使用路径；观察已保存内容后修复，不用模型自评或概念图作为可用性验收。未知代码执行尚无OS隔离验收，保持关闭。腾讯21例为冻结合成输入，不计入128项已执行组件实验；手机尺寸/同机双客户端/TLS探针不冒充真手机或远程上线。
''')

write('doc/dev/current.md','''# 开发现场

更新：2026-10-07。所有者root。最新人类指令：先做好本地电脑版，多端以后增加。已同步主开发/执行/存储/部署文档和台账，见[本地范围](本地电脑版执行范围.md)与[045](iterations/045-local-desktop-first.md)。原部署下载/VM预演停止，不购买资源，不安装网络客户端。本地M0仍待验收，M1未启动，完整开发工作尚未完成。

## 可用产品

TypeScript / React / Node24.19.0 / Pi SDK1.0.3 / SQLite。本机项目画廊/标签、上下文对话、单worker队列、取消/中断对账、文件版本、UTF-8搜索/来源、记忆/摘要、草稿自动保存/导出和本地备份已有工程及真实运行证据。ChatGPT已由用户连接，自动默认模型沿用；日常入口为桌面“打开工作台”，地址 http://127.0.0.1:4310/ 。密码/凭据在本机受保护目录，不写入开发记录。

最后只读健康观察：主服务ready，PID52144，实例975f5a08-dbd3-44a0-b088-179895604ffa；实际身份以后以[主服务记录](../../.runtime/local-service-workbench.json)和健康接口复核。不能使用旧迭代PID接管/停止进程。守护按[本机启动说明](../../README.md)运行。关闭页面不停止后台；关机/睡眠影响执行，OS登录与睡眠唤醒尚未实测。

当前最新[工程基线](../../output/dev-evidence/verification/report.json)：2026-10-07T04:48:58.345Z，128项、143文件及四类检查通过。本轮无产品源码变更、无模型调用、无重启；基线哈希和链接审计另记045。同机备份不是异地，远程转存未配置。历史实际文章见[保存成果](../../output/dev-evidence/content-final-draft.md)，不以工程合成内容替代用户反馈。

## 下一轮

唯一优先任务L-01（ready）：读[台账](backlog.md)/[验收](acceptance.md)，复查本机“打开→项目→对话→成果→编辑导出”路径和Factory + ASCII界面，记录真正影响日常使用的问题，最小修改并验证。先观察现有资料，避免无必要模型消费。随后L-02 Windows生命周期、本地M0-07和08实际任务；本地M0通过后进入受控子代理/插件M1。

L-03保留042首次423失败，043身份增强未定位原根因；不得删除锁或自动重试掩盖。MEM-01腾讯运行实验仍blocked：无可用受支持隔离，不执行未知代码。QEMU TCG安全限制已纠正，便携MSYS2仅私有开发缓存；其本轮自有GPG-agent已正常停止，没有QEMU/Ubuntu或VM执行。R-01至04全部延期，不继续占用当前主任务。

## 恢复约束

用户和历史工程改动均保留；Git尚未提交/推送，不重置工作区。运行管理使用Windows PowerShell5和身份核对，普通文档修改不重启服务。修改产品代码后按影响验证，保持项目/登录/凭据/原件/备份计划，不复制全局Codex授权。调整前current逐字存为[历史快照](../../output/dev-evidence/local-scope-before/doc__dev__current.md.txt)；历史事实见iterations，不把历史“下一步部署”当作最新指令。
''')

p='doc/README.md';s=read(p);pos=s.index('\n')+1
s=s[:pos]+'''\n当前（045）：用户决定先做本地电脑版，多端后续。以[本地执行范围](dev/本地电脑版执行范围.md)、[当前现场](dev/current.md)、[权威台账](dev/backlog.md)、[验收矩阵](dev/acceptance.md)与[ADR-026](adr/026-local-desktop-first.md)为准。下文旧“最新执行”均为历史记录；远程准备不再作为当前前置。\n'''+s[pos:]
s=replace(s,'远程主服务、电脑节点、共享资产、同步与备份。','当前本地存储与后续远程/电脑节点、同步和备份。')
write(p,s)

write('doc/dev/iterations/045-local-desktop-first.md','''# 045 本地电脑版优先

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
''')

manifest=json.loads(read('output/dev-evidence/local-scope-changes.json'))
manifest['changes'].extend(changes)
(root/'output/dev-evidence/local-scope-changes.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'trackingDocsWritten':len(changes),'tasksRetained':retained_count},ensure_ascii=False))
