/** Persist only a known category, never registry output or credential-bearing URLs. */
export function pluginOutputDiagnostic(text: string): string | undefined {
  if (/\b(?:ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ETIMEDOUT|ECONNRESET)\b|could not resolve host|failed to connect/i.test(text)) return '无法连接插件来源，请检查网络、代理或来源地址';
  if (/\b(?:E404|ETARGET)\b|repository .+not found/i.test(text)) return '插件来源或指定版本不存在，请核对包名、仓库与版本';
  if (/\b(?:EACCES|EPERM)\b|permission denied/i.test(text)) return '插件目录或来源访问被拒绝，请检查服务权限和来源访问条件';
  if (/\bENOSPC\b|no space left on device/i.test(text)) return '插件安装磁盘空间不足，请释放空间后修复';
}
