import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const read=f=>readFileSync(f,'utf8').replace(/^\uFEFF/,'');
const json=f=>JSON.parse(read(f));
const put=(f,v)=>writeFileSync(f,JSON.stringify(v,null,2));
const base='output/dev-evidence/';
const product=json(base+'client-recovery-production.json');
const supervisor=json('.runtime/supervisor-workbench.json');
const report=json(base+'verification/report.json');
const pictures=['client-recovery-startup.jpg','client-recovery-offline-mobile.jpg','client-recovery-recovered-mobile.jpg','client-recovery-product.jpg'].map(file=>({file:'ui/'+file,sha256:createHash('sha256').update(readFileSync(base+'ui/'+file)).digest('hex')}));
const db=new DatabaseSync(base+'private/client-recovery-isolated/data/workbench.sqlite',{readOnly:true});
let counts;try{counts={sessions:db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,runs:db.prepare("SELECT COUNT(*) AS count FROM entities WHERE kind='run'").get().count,inbox:db.prepare("SELECT COUNT(*) AS count FROM entities WHERE kind='inbox'").get().count};}finally{db.close();}
put(base+'client-recovery-cookie-incident.json',{at:new Date().toISOString(),cause:'Same browser profile and hostname share session cookies across ports',correctedFixtureHostname:'localhost',productHostname:'127.0.0.1',currentBrowserSessionReplaced:true,totalUserSessions:product.totalUserSessions,preservedOtherUserSessions:product.preservedOtherUserSessions,originalCompleteFingerprintPreserved:false,chatgptReauthorization:false,mainReloadAfterIsolatedLoginVerified:true,modelRequests:0});
put(base+'client-recovery-stream-failure.json',{status:'failed-before-final-fix',cause:'Reading auth and snapshot alone did not reopen an errored EventSource after actual backend stop/restart',unsentInputPreserved:true,freshDraftNotYetVisible:true,resolution:'Close failed stream, verify auth, reload snapshot, explicitly recreate stream with backoff',modelRequests:0});
put(base+'client-recovery.json',{at:new Date().toISOString(),status:'passed-with-stated-limitations',browser:'Codex in-app browser',engineeringVerification:report.at,engineeringFiles:Object.keys(report.baseline).length,tests:108,modelRequests:0,checks:{startup503ToLoginWithoutReload:true,closedStreamRecoveryWithoutReload:true,freshSnapshotDrafts:2,unsentInputPreserved:true,mobileViewport:{width:390,height:844,documentWidth:375},revocationDuringRecoveryReturnsLogin:true,hostnameIsolationMainReloadAuthenticated:true,automaticWritesDuringRecovery:0},fixture:{hostname:'localhost',lastPid:23056,processObservedAbsent:true,exitCode:'unknown after tool transport closed',logoutCompletion:'unknown; retained database session count below',databaseCounts:counts},screenshots:pictures,product:'client-recovery-production.json',cookieIncident:'client-recovery-cookie-incident.json',serviceRestoration:'client-recovery-service-restoration.json',limitations:['In-app browser only; default Chrome page not verified','390px viewport is not a physical remote phone','Final fixture logout/tab close and final main reload interrupted by tool transport; no graceful-exit claim','Unknown reason main service and monitor also exited; restored only after identity status and authoritative process absence checks','Full original M0/M1 development objective remains incomplete']});
const lead='031：[断线自动恢复](iterations/031-client-recovery.md)已通过真实内置浏览器启动503、关闭事件流、恢复新内容、保留未发送文字及恢复期间撤销登录验证。108项测试、类型/构建/Pi离线通过，零模型请求。ChatGPT已连接且自动就绪。测试Cookie碰撞导致当前工作台登录轮换，其他30个登录保持、总数31；主服务和守护实际退出后已恢复，原因未确认。公网/真手机、生产/异地、腾讯和反馈门槛保持。';
function prepend(f,text){let s=read(f);const p=s.indexOf('\n');writeFileSync(f,s.slice(0,p+1)+'\n'+text+'\n'+s.slice(p+1));}
for(const f of ['doc/dev/current.md','doc/dev/backlog.md','doc/dev/acceptance.md'])prepend(f,lead);
for(const f of ['doc/dev/backlog.md','doc/dev/acceptance.md'])writeFileSync(f,read(f).replaceAll('104项集成','108项集成').replaceAll('104项测试通过，代码','108项测试通过，代码').replaceAll('104项为工程测试','108项为工程测试'));
let current=read('doc/dev/current.md');
current=current.replace(/^当前产品服务：.*$/m,`当前产品服务：PID${product.service.pid}，创建${product.service.creationUtc}，实例${product.service.instanceId}，启动标记${product.service.launchId}，所有者local-service.ps1，健康 http://127.0.0.1:4310/api/health。031工具传输结束后核对实际进程及监听均不存在，再通过默认守护恢复；退出原因未确认。ChatGPT自动模式、文章、调用/备份时间保持；当前浏览器登录已轮换，其他30登录保持，总31。030及更早身份为历史。`);
current=current.replace(/当前守护PID50748，创建[^；]+；/,`当前守护PID${supervisor.pid}，创建${supervisor.creationUtc}，实例${supervisor.instance}；`);
current=current.replace('- 104项测试、类型检查、生产构建、Pi离线探针通过。','- 108项测试、类型检查、生产构建、Pi离线探针通过。');writeFileSync('doc/dev/current.md',current);
const history='verification/history/2026-10-06T16-11-07-701Z/report.json';
let old=read('doc/dev/iterations/030-https-proxy.md');old=old.replace('../../../output/dev-evidence/verification/report.json','../../../output/dev-evidence/'+history);writeFileSync('doc/dev/iterations/030-https-proxy.md',old);
let index=read('doc/README.md');index=index.replace('[104 项工程基线](../output/dev-evidence/verification/report.json)',`[当时104项工程基线](../output/dev-evidence/${history})`);writeFileSync('doc/README.md',index);
prepend('doc/README.md','最新执行：[031自动恢复](dev/iterations/031-client-recovery.md)、[ADR-021](adr/021-client-recovery.md)、[真实浏览器证据](../output/dev-evidence/client-recovery.json)、[108项工程基线](../output/dev-evidence/verification/report.json)。登录一次、直接对话；测试登录轮换和服务恢复已明确记录，完整开发尚未验收。');
prepend('doc/deployment.md','031补齐[客户端自动恢复](dev/iterations/031-client-recovery.md)：服务短暂不可用后页面自动恢复读取和事件流，保留输入。独立浏览器测试必须使用独立主机名或配置文件；不同端口不能隔离Cookie。108项工程通过；真实远程入口仍待验收。');
prepend('doc/dev/接入与上线解决计划.md','031已补齐[断线自动恢复](iterations/031-client-recovery.md)。现有ChatGPT自动模式已就绪，无需填写模型/保护参数。真实内置浏览器已验证503恢复和输入保留；测试登录轮换、服务实际退出后恢复如实记录，未将其算作公网/手机验收。');
prepend('README.md','连接短暂中断时，页面会自动重连并保留未发送文字；服务恢复后刷新内容和事件流。登录真正失效时回到登录页。任务提交和上传不自动重发。实现与真实验证见[031](doc/dev/iterations/031-client-recovery.md)。');
writeFileSync('doc/adr/021-client-recovery.md',`# ADR-021：自动连接恢复与浏览器测试隔离

2026-10-07。用户只需登录并对话，临时网络故障应由工作台处理。

启动认证、快照读取和事件流恢复使用[connection-read](../../src/connection-read.ts)。只重试GET，每次8秒超时，按1/2/5秒退避；清理页面时取消请求、等待与事件流。401立即结束，回到登录，不把失效认证当网络故障。旧快照不能覆盖较新游标。任务、上传及其他写入保持原对账逻辑，不能因恢复连接自动重复执行。

失败的EventSource主动关闭；确认登录、读取新快照后显式重建。只依赖浏览器自动重连的首版在真实关闭/重启后未恢复，失败保存在[记录](../../output/dev-evidence/client-recovery-stream-failure.json)。现有内容保留，状态提示自动恢复，未发送输入继续保留。

四项[真实HTTP工程测试](../../tests/connection-read.test.ts)覆盖503恢复、连接丢失/损坏JSON、401终止及超时/取消。[隔离探针](../../scripts/probe-client-recovery.ts)提供真实后端和断流控制；浏览器操作通过CUA，测试控制令牌留在忽略目录，不加入产品功能。

同浏览器同主机名的Cookie不按端口隔离。早期127.0.0.1测试覆盖了工作台Cookie，恢复当前工作台登录并只撤销其旧会话；其余30会话保持。后续测试改localhost，主产品仍127.0.0.1，实际重新加载主页面验证仍登录。详见[事故记录](../../output/dev-evidence/client-recovery-cookie-incident.json)。

真实内置浏览器及390像素视口证据见[031](../dev/iterations/031-client-recovery.md)。这不等于默认Chrome、真实手机或公网验收；业务后台退出原因未确认，服务恢复另有记录。
`);
writeFileSync('doc/dev/iterations/031-client-recovery.md',`# 迭代031：登录后直接工作，临时断线自动恢复

2026-10-07。完整目标active，M0 verifying、M1未启动。用户不需填写模型和执行保护参数；现有ChatGPT自动模式已就绪。本轮没有新增子Agent或模型请求。

## 实现与失败修复

按[ADR-021](../../adr/021-client-recovery.md)补齐启动、快照及实时事件流自动恢复，保留页面和未发送文字。GET有界单次超时和退避，401回登录；写入不重试。

[原始失败](../../../output/dev-evidence/client-recovery-first-failure.json)：真实启动503后后端已恢复，界面仍卡在连接中。首版读取重试修复启动，但真实服务停止/重启后事件流仍未恢复，保留[失败](../../../output/dev-evidence/client-recovery-stream-failure.json)。最终改为认证与快照恢复后显式重建EventSource。隔离探针首版只销毁上游请求，未真正关闭已开启的流；最终同时销毁请求和响应，重新验证。

## 实际验证

[浏览器证据](../../../output/dev-evidence/client-recovery.json)：Codex内置浏览器真实启动503恢复到登录页，无手动刷新；实际断流恢复后草稿计数变为2、未发送输入不变；恢复期间撤销登录返回登录页。最后localhost隔离用最终构建验证390×844断流/恢复，文档宽375无横向溢出，输入保留。恢复前后写入计数均1，仅合成账户登录；没有提交目标或运行AI。

截图：[启动](../../../output/dev-evidence/ui/client-recovery-startup.jpg)、[移动尺寸断线](../../../output/dev-evidence/ui/client-recovery-offline-mobile.jpg)、[移动尺寸恢复](../../../output/dev-evidence/ui/client-recovery-recovered-mobile.jpg)、[主工作台](../../../output/dev-evidence/ui/client-recovery-product.jpg)。截图为真实页面，历史offline-historical图不是最终实现。

[完整工程报告](../../../output/dev-evidence/verification/report.json)：108测试全部通过，0失败/取消/跳过，类型、构建及Pi离线退出0；107工程文件SHA256。四项连接测试使用真实HTTP。030的104项使用[固定历史报告](../../../output/dev-evidence/${history})，不混用最新版。

## 测试影响与当前服务

[Cookie事故](../../../output/dev-evidence/client-recovery-cookie-incident.json)：同浏览器127.0.0.1不同端口共享Cookie，测试导致主工作台退出登录。已正常恢复当前工作台登录，只撤销唯一对应的旧会话；其他30登录保持，总31。完整登录指纹发生变化，不能声称31原会话完全不变。后续改localhost后实际重载主页面保持登录；没有重新授权ChatGPT。

最终测试退出/关闭标签并重载主页面的CUA调用遭遇Transport closed，动作完成情况未知，保留隔离数据库会话数量，不声称优雅退出或最后重载通过。随后独立核对测试PID23056、主服务及守护进程均不存在且端口拒绝连接，原因未确认。核对没有当前明确停止意图后，通过默认身份管理[恢复服务](../../../output/dev-evidence/client-recovery-service-restoration.json)，不按保存PID强停、不因超时盲目重启。

当前服务PID${product.service.pid}，实例${product.service.instanceId}，创建${product.service.creationUtc}；守护PID${supervisor.pid}，实例${supervisor.instance}。恢复后[产品观察](../../../output/dev-evidence/client-recovery-production.json)验证ChatGPT连接/自动模型、规范文章字节、调用结算与每日备份时间保持，31登录符合上述轮换后的预期，临时观察登录已退出。

收尾[审计](../../../output/dev-evidence/client-recovery-final-audit.json)核对工程与日志哈希、历史104项、真实进程身份、截图及文档引用。默认Chrome页面/真实OS登录/睡眠唤醒仍待观察；390视口不是实际跨网络手机。远程主机/公开证书、生产权限/配额/WAL、异地恢复、腾讯隔离比较及用户反馈保持原门槛，没有购买、发布或推送。
`);
console.log(JSON.stringify({status:'written',engineeringFiles:Object.keys(report.baseline).length,fixtureCounts:counts,servicePid:product.service.pid}));
