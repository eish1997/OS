# 迭代010：真实账户登录及模型目录

2026-10-06。用户完成自己的ChatGPT授权。主Agent核对实际连接，修复模型目录读取问题；没有代替用户确认额度。

## 实际结果

专属OAuth凭据已保存，真实连接connected=true。读取公开账户模型端点得到HTTP200及models数组，但响应361056字节，包含较大的指令/模板字段，超过原256000字节读取限制；工作台因而误报502。该响应形状与[官方模型目录说明](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)一致。

仅成功模型目录读取允许最多2MiB；授权、公钥及上游错误仍保持256000字节限制。超限取消读取并给出明确错误。目录只向客户端返回可显示且固定Pi兼容的模型ID/名称，不保存原始目录或模板。实际可选模型：GPT-6-Astra、GPT-5.6-Sol、GPT-5.6-Terra、GPT-5.6-Luna。

62项测试、类型检查、生产构建及Pi离线探针通过，见[基线与日志](../../../output/dev-evidence/verification/report.json)。新增大目录可显示且不泄露模板、不隐式启用任务、过大目录拒绝但保留登录、授权响应限制不扩大等测试。

按管理脚本验证进程身份后重启。实际连接保留且API目录正常，见[非秘密连接证据](../../../output/dev-evidence/chatgpt-real-connection.json)。实际Chrome访问生产页面读取四个可选模型，确认未勾选时不能保存，390宽布局无横向溢出、无浏览器异常，见[实际目录界面](../../../output/dev-evidence/ui/chatgpt-real-catalog.json)。浏览器测试只读取目录，没有勾选额度确认或执行任务。

## 尚待完成

当前enabled=false、model为空、maxCalls=0。已向用户提出具体建议：GPT-5.6-Sol、本连接累计最多10次请求、单任务120秒，确认后开始最多2次请求的非敏感文件探针。登录成功不等于模型任务启用或真实推理通过，不自行制造consent=true。

M0-01c保持verifying，01b等待明确模型和用量；真实工具/终态/取消/超时及03b原生继续仍需完成。完整M0/M1目标未完成。此前008的三轮阻塞为历史，用户新的授权已改变条件，本轮get_goal实际返回active，不沿用旧阻塞计数。
