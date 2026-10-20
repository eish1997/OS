import { McpOAuthProvider, OAuthCallbackServer, authorizeMcp, adaptOAuthProvider, type McpOAuthState, type McpOAuthStateStore } from '@earendil-works/pi-mcp/oauth';
import type { McpManifest } from '../shared/mcp.js';
import { AppError } from './store.js';
import { PrivateFiles } from './private-files.js';
import { usesOAuth } from './mcp-probe.js';
import type { McpServerEntry } from '@earendil-works/pi-coding-agent';

const fileName = 'mcp-oauth.json';

class FileOAuthStore implements McpOAuthStateStore {
  constructor(private files: PrivateFiles, private serverUrl: string) {}
  load() {
    const all = this.files.read<Record<string, McpOAuthState>>(fileName) ?? {};
    const state = all[this.serverUrl];
    return state?.serverUrl === this.serverUrl ? state : undefined;
  }
  save(state: McpOAuthState) {
    const all = this.files.read<Record<string, McpOAuthState>>(fileName) ?? {};
    all[this.serverUrl] = state;
    this.files.save(fileName, all);
  }
}

function serverUrl(entry: McpServerEntry) {
  if (!('url' in entry.config)) throw new AppError(409, '该服务不是需要登录的 HTTP MCP');
  return entry.config.url;
}

export function mcpOAuthProvider(files: PrivateFiles, entry: McpServerEntry) {
  const url = serverUrl(entry);
  const store = new FileOAuthStore(files, url);
  return new McpOAuthProvider({
    serverUrl: url,
    redirectUrl: 'http://127.0.0.1/oauth/callback',
    clientMetadata: { client_name: 'Dulse', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' },
    store,
    onRedirect() { /* Probe only refreshes a stored grant. A missing grant stays needs_auth. */ }
  });
}

export async function oauthAuthProvider(files: PrivateFiles, entry: McpServerEntry) {
  if (!usesOAuth(entry)) return undefined;
  const provider = mcpOAuthProvider(files, entry);
  return (await provider.tokens())?.access_token ? adaptOAuthProvider(provider) : undefined;
}

/** Start Pi's MCP OAuth flow. The authorization URL is for the user to open; this process does not launch a browser. Tokens stay in the private file. */
export async function startMcpOAuth(input: { manifest: McpManifest; name: string; files: PrivateFiles; fetch?: typeof fetch }) {
  const entry = input.manifest.servers.find(server => server.name === input.name);
  if (!entry || entry.config.enabled === false) throw new AppError(404, '未找到已启用的该MCP服务');
  if (!usesOAuth(entry)) throw new AppError(409, '该服务不是需要 OAuth 登录的 HTTP MCP');
  const url = serverUrl(entry);
  const callback = await OAuthCallbackServer.listen({ host: '127.0.0.1', timeoutMs: 120000 });
  const redirects: URL[] = [];
  const provider = new McpOAuthProvider({
    serverUrl: url,
    redirectUrl: callback.redirectUrl,
    clientMetadata: { client_name: 'Dulse', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' },
    store: new FileOAuthStore(input.files, url),
    onRedirect(next) { redirects.push(next); }
  });
  try {
    const result = await authorizeMcp(provider, { serverUrl: url, fetch: input.fetch });
    if (result === 'AUTHORIZED') { await callback.close(); return { authorized: true as const }; }
    const authorizationUrl = redirects[0];
    if (!authorizationUrl) { await callback.close(); throw new AppError(502, '授权服务没有返回登录地址'); }
    const state = authorizationUrl.searchParams.get('state') ?? '';
    void callback.waitForCallback(state).then(async (landed) => {
      await authorizeMcp(provider, { serverUrl: url, authorizationCode: landed.code, iss: landed.iss, fetch: input.fetch });
    }).catch(() => undefined).finally(() => { void callback.close(); });
    return { authorized: false as const, authorizationUrl: authorizationUrl.href };
  } catch (error) {
    await callback.close();
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'MCP 登录没有完成，令牌未保存');
  }
}
