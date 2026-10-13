# 迭代035：Linux安装依赖与后台部署文件

2026-10-07。上一轮034实际完成Windows文件保护与完整工程，属于progress。本轮继续M0远程部署准备，未购买主机、域名或备份资源，未启动M1；目标仍active。

## 实际改动

根package.json直接要求Windows原生构建组件，Linux所需的平台差异没有交给上游处理。本轮去掉这项重复的直接依赖，保留rolldown自身已有的可选平台包与原版本锁。216个已锁定包的版本、下载地址和完整性字段逐一对照保持，见[锁核对](../../../output/dev-evidence/linux-lock-versions.json)。主node_modules、正在运行的服务和凭据没有重装或替换。

新增[Linux部署文件](../../../deployment/linux/README.md)：两个专用账号的systemd服务、业务和代理环境模板、只读启动前置检查及运行时版本锁。Agent负责生成环境文件，不给用户增加参数填写。应用与数据分目录，业务端口回环；模板代理仍回环。独立挂载的备份卷是本机恢复点落地点，异地转存/恢复仍需完成。

Node24.19.0 Linux x64归档的SHA256实际从官方HTTPS清单获取；没有下载或执行该Linux归档，也没有验证签名。Caddy复用030固定版本锁。后台配置、权限、内存上限及启动拒绝不是未知代码隔离的证明，真实Linux行为仍未验收。

## 实际验证与纠正

[安装探针](../../../scripts/probe-linux-install.mjs)只复制源码或包清单到自有私有目录，不复制.env、业务数据和模型凭据。固定npm11.21.0，验证其锁内完整性，使用空用户/全局配置与私有缓存；所有依赖安装禁用生命周期脚本，不调用模型。

最初探针错误地预期在Windows传入--os=linux会使必装Windows包直接报错：dry-run和实际安装都退出0，断言失败。实际npm源代码显示必装包检查仍使用真实宿主平台，目标选择影响可选包。记录真实失败，不把Windows安装退出0冒充Linux兼容性。随后用npm自身checkPlatform对实际Windows组件元数据传入Linux环境，得到EBADPLATFORM；这是库契约校验，仍不是Linux进程执行。

修正依赖后，实际npm ci的Linux目标选择跳过Windows组件，安装Linux x64 glibc组件，核对ELF文件头、版本和文件哈希；未加载该二进制。另一个干净Windows目录实际npm ci、Vite构建通过，证明本机构建并非仅依靠旧node_modules。证据见[安装记录](../../../output/dev-evidence/linux-install.json)，原始日志保留在私有目录。

前置检查实际在当前Windows运行时拒绝LINUX_X64_REQUIRED；语法检查通过。这个拒绝仅证明平台保护，没有把Linux服务、systemd或Linux权限算通过。没有新建镜像、安装虚拟机、修改本机环境配置或打开防火墙。

## 验收状态

最终完整回归、文件哈希和主产品观察由[收尾审计](../../../output/dev-evidence/linux-preparation-final-audit.json)记录。主产品观察起点在本轮文件准备后、完整回归前；原034观察可供核对历史实例，不能把起点说成035开发前采样。

本轮只完成部署文件与安装兼容准备。真实Linux安装/构建/系统服务、权限及物理配额/WAL、远程ChatGPT回调、公开证书与手机不同网络、OS睡眠唤醒、异地恢复、腾讯独立隔离比较及用户反馈均保留原门槛。M0继续verifying，M1依赖完整M0。
