import {readFileSync,writeFileSync} from 'node:fs';
const brief='030：[真实 HTTPS 底座](iterations/030-https-proxy.md)与 Caddy 官方配置已通过独立 Windows TLS/HTTP2 探针：认证、10 MiB 上传、双端冲突、65 秒事件流和撤销；修复远程接受开发来源问题。104 项完整工程/类型/构建/Pi 离线通过。当前本机已应用，ChatGPT 自动模式、文章、31 登录、用量与备份时间保持，零模型请求。仍无公网入口/真手机证据，远程资源、生产/异地、腾讯和反馈门槛保持。\n\n';
function lead(file,text){let s=readFileSync(file,'utf8');const i=s.indexOf('\n');s=s.slice(0,i+1)+'\n'+text+s.slice(i+1).replace(/^\s*\n/,'');writeFileSync(file,s);}
lead('doc/dev/current.md',brief);
lead('doc/dev/backlog.md',brief);
lead('doc/dev/acceptance.md',brief);
lead('doc/dev/接入与上线解决计划.md','030 已准备 [Caddy HTTPS 入口](iterations/030-https-proxy.md)，用户无需填代理/证书参数。真实独立 TLS/HTTP2 上传、冲突、事件流和撤销通过，104 项完整工程通过并应用；现有自动 ChatGPT 与原登录/内容保持。当前仍只提供本机入口，真实跨网络手机和远程主机尚未验收。\n\n');
lead('doc/README.md','最新执行：[030 HTTPS 底座](dev/iterations/030-https-proxy.md)、[ADR-020](adr/020-https-proxy.md)、[实际 TLS/HTTP2](../output/dev-evidence/https-proxy.json)、[当前产品保持](../output/dev-evidence/https-production.json)、[104 项工程基线](../output/dev-evidence/verification/report.json)。免配置原则保持，公网/真手机及完整开发仍待验收。\n\n');
lead('doc/deployment.md','最新 [030](dev/iterations/030-https-proxy.md)：复用 Caddy 2.11.7 的 [入口配置](../deployment/Caddyfile)与[版本锁](../deployment/caddy-lock.json)，默认回环监听。真实隔离 TLS/HTTP2、认证、10 MiB 上传、双端冲突及65秒事件/撤销通过，104 项工程检查通过并应用来源修复；主 .env 未变，自动 ChatGPT 和原登录/内容保持。下面部署参数供开发 Agent 使用，用户日常不需配置。真实远程主机、公开证书/跨网络手机和生产门槛仍未通过。\n\n');
function replace(file,from,to){const s=readFileSync(file,'utf8');if(!s.includes(from))throw Error('Missing doc anchor '+file);writeFileSync(file,s.replace(from,to));}
replace('README.md','103项工程测试','104项工程测试');
replace('doc/dev/backlog.md','103项集成与故障测试','104项集成与故障测试');
replace('doc/dev/acceptance.md','更新：2026-10-06。103项测试通过','更新：2026-10-07。104项测试通过');
replace('doc/dev/acceptance.md','99项为工程测试','104项为工程测试');
replace('doc/dev/backlog.md','更新：2026-10-06。来源','更新：2026-10-07。来源');
replace('doc/dev/current.md','更新：2026-10-06（Asia/Shanghai）','更新：2026-10-07（Asia/Shanghai）');
const oldReport='../../../output/dev-evidence/verification/report.json';
replace('doc/dev/iterations/028-one-click-and-user-startup.md',oldReport,'../../../output/dev-evidence/verification/history/2026-10-06T15-43-07-620Z/report.json');
replace('doc/README.md','[103项工程基线](../output/dev-evidence/verification/report.json)','[当时103项工程基线](../output/dev-evidence/verification/history/2026-10-06T15-43-07-620Z/report.json)');
let current=readFileSync('doc/dev/current.md','utf8');
current=current.replace(/^当前产品服务：.*$/m,'当前产品服务：PID36672，创建2026-10-06T16:13:40.6383890Z，实例2d9265a6-f8eb-4e78-b19e-e34282bd257c，启动标记3247c5ff-cd2d-4dd9-b074-005959bbbbd7，cwd E:\\AI\\OS，Node24 tsx server/index.ts，健康 http://127.0.0.1:4310/api/health，所有者local-service.ps1。030通过身份管理更新来源检查；主 .env、自动模型、文章、31登录、调用计数及每日备份时间保持。原026等身份描述为历史。');
current=current.replace('当前守护PID40816，创建2026-10-06T15:47:38.7351930Z，实例7bb4d564-738b-4a45-8dab-6724dccc9dbc','当前守护PID50748，创建2026-10-06T16:13:39.0070060Z，实例339bd16d-fd11-4c16-98ff-03ebcd7662c5');
current=current.replace('- 103项测试、类型检查','- 104项测试、类型检查');writeFileSync('doc/dev/current.md',current);
replace('doc/dev/backlog.md','登录/撤销、事件与文件鉴权、CSRF、流撤销测试 | 远程HTTPS及实际设备认证','登录/撤销、事件与文件鉴权、CSRF、流撤销；030独立真实TLS/HTTP2与开发来源边界 | 公网证书/真实跨网络设备认证');
replace('doc/dev/acceptance.md','真手机/不同网络/HTTPS、远程断线、受监督重启','030已补独立真实TLS/HTTP2认证/上传/冲突/65秒事件/撤销；公网入口及真手机/不同网络、远程断线/重启仍待验证');
replace('doc/deployment.md','代理必须保留事件流、禁用 SSE 缓冲，并设置上传 10 MB 上限和超时','代理必须保留事件流、及时刷新 text/event-stream，并设置上传 10 MiB 上限及读取/上游响应头超时；事件流不设置固定总写入超时');
console.log('030 documentation and historical verification links updated');
