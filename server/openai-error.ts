export interface OpenAIConnectionDiagnostic {
  stage: 'code_exchange' | 'refresh' | 'identity_keys' | 'model_catalog';
  httpStatus: number;
  bodyShape: 'json' | 'html' | 'other' | 'empty';
  errorCode?: string;
  requestId?: string;
  at: string;
}
const known = new Set(['unsupported_country_region_territory', 'invalid_grant', 'invalid_client', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused', 'access_denied', 'subscription_sharing_user_not_eligible', 'subscription_sharing_usage_limit_exceeded', 'subscription_sharing_usage_unavailable', 'subscription_sharing_invalid_user', 'chatpass_v2_scope_not_authorized', 'chatpass_v2_invalid_authorization_context', 'subscription_sharing_user_unavailable']);
export function connectionFailure(url: string, request: RequestInit, response: Response, body: string) {
  let data: unknown; try { data = JSON.parse(body); } catch {}
  const error = data && typeof data === 'object' && 'error' in data ? (data as {error: unknown}).error : undefined;
  const candidate = typeof error === 'string' ? error : error && typeof error === 'object' && 'code' in error ? (error as {code: unknown}).code : undefined;
  const code = typeof candidate === 'string' && known.has(candidate) ? candidate : undefined;
  const rawId = response.headers.get('x-request-id') || '';
  const stage: OpenAIConnectionDiagnostic['stage'] = url.endsWith('/models') ? 'model_catalog' : url.endsWith('/jwks.json') ? 'identity_keys' : new URLSearchParams(String(request.body)).get('grant_type') === 'refresh_token' ? 'refresh' : 'code_exchange';
  const diagnostic: OpenAIConnectionDiagnostic = { stage, httpStatus: response.status, bodyShape: data && typeof data === 'object' ? 'json' : /^\s*</.test(body) ? 'html' : body ? 'other' : 'empty', errorCode: code, requestId: /^req_[a-zA-Z0-9]{4,80}$/.test(rawId) ? rawId : undefined, at: new Date().toISOString() };
  const label = {code_exchange:'换取登录凭据',refresh:'刷新连接',identity_keys:'获取身份验证公钥',model_catalog:'读取账户模型'}[stage];
  let reason = code === 'unsupported_country_region_territory' ? '当前服务网络出口地区不受OpenAI支持；检查服务网络设置，不要反复登录' : code === 'invalid_grant' && stage === 'code_exchange' ? '本次授权码已失效或不匹配，请重新发起一次登录' : code === 'invalid_client' ? '客户端注册信息被拒绝，需要检查授权配置' : code === 'subscription_sharing_user_not_eligible' ? '该账户或工作区暂不允许订阅接入，不要重复授权' : response.status === 429 ? '达到服务或用量限制，请查看ChatGPT用量，稍后再操作' : response.status === 403 ? 'OpenAI拒绝了请求；需要检查服务网络、账户权限或接入政策' : response.status === 401 ? '连接身份被拒绝，请重新授权' : response.status >= 500 ? 'OpenAI服务暂不可用，连接记录保留，请稍后再操作' : '授权请求被拒绝，需要核对配置';
  if (diagnostic.bodyShape === 'html') reason += '；返回了网页而非授权JSON，可能来自网络拦截';
  return { diagnostic, message: `${label}失败（HTTP ${response.status}${code ? ' · '+code : ''}）：${reason}` };
}
