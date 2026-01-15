import { invoke } from '../lib/tauri-mock';
import type {
  McpServerConfig,
  McpServerInfo,
  McpServersConfig,
  McpToolInfo,
  McpOAuthProvider,
  McpOAuthStartResponse,
  McpOAuthTokenResponse,
  McpOAuthConnectionStatus,
  McpOAuthProviderConfig,
} from '../types/mcp';

export type {
  McpServerConfig,
  McpServerInfo,
  McpServersConfig,
  McpToolInfo,
  McpOAuthProvider,
  McpOAuthStartResponse,
  McpOAuthTokenResponse,
  McpOAuthConnectionStatus,
  McpOAuthProviderConfig,
};

const MCP_TIMEOUT_MS = 30000;
const MCP_TOOL_CALL_TIMEOUT_MS = 120000;
const MCP_INIT_TIMEOUT_MS = 60000;

interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeWithTimeout<T>(
  command: string,
  args?: Record<string, unknown>,
  timeoutMs: number = MCP_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`MCP command '${command}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    invoke<T>(command, args)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(new Error(`MCP command '${command}' failed: ${error}`));
      });
  });
}

async function invokeWithRetry<T>(
  command: string,
  args?: Record<string, unknown>,
  timeoutMs: number = MCP_TIMEOUT_MS,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await invokeWithTimeout<T>(command, args, timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retryConfig.maxRetries) {
        const delay = retryConfig.delayMs * Math.pow(retryConfig.backoffMultiplier, attempt);
        await sleep(delay);
      }
    }
  }

  throw (
    lastError ||
    new Error(`MCP command '${command}' failed after ${retryConfig.maxRetries} retries`)
  );
}

function validateNonEmpty(value: string | undefined, fieldName: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
}

export async function mcpInitialize(): Promise<string> {
  try {
    return await invokeWithRetry<string>('mcp_initialize', undefined, MCP_INIT_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`Failed to initialize MCP system: ${error}`);
  }
}

export async function mcpListServers(): Promise<McpServerInfo[]> {
  try {
    return await invokeWithTimeout<McpServerInfo[]>('mcp_list_servers');
  } catch (error) {
    throw new Error(`Failed to list MCP servers: ${error}`);
  }
}

export async function mcpConnectServer(name: string): Promise<string> {
  try {
    validateNonEmpty(name, 'server name');
    return await invokeWithRetry<string>('mcp_connect_server', { name });
  } catch (error) {
    throw new Error(`Failed to connect to MCP server '${name}': ${error}`);
  }
}

export async function mcpDisconnectServer(name: string): Promise<string> {
  try {
    validateNonEmpty(name, 'server name');
    return await invokeWithTimeout<string>('mcp_disconnect_server', { name });
  } catch (error) {
    throw new Error(`Failed to disconnect from MCP server '${name}': ${error}`);
  }
}

export async function mcpEnableServer(name: string): Promise<string> {
  try {
    validateNonEmpty(name, 'server name');
    return await invokeWithTimeout<string>('mcp_enable_server', { name });
  } catch (error) {
    throw new Error(`Failed to enable MCP server '${name}': ${error}`);
  }
}

export async function mcpDisableServer(name: string): Promise<string> {
  try {
    validateNonEmpty(name, 'server name');
    return await invokeWithTimeout<string>('mcp_disable_server', { name });
  } catch (error) {
    throw new Error(`Failed to disable MCP server '${name}': ${error}`);
  }
}

export async function mcpListTools(): Promise<McpToolInfo[]> {
  try {
    return await invokeWithTimeout<McpToolInfo[]>('mcp_list_tools');
  } catch (error) {
    throw new Error(`Failed to list MCP tools: ${error}`);
  }
}

export async function mcpSearchTools(query: string): Promise<McpToolInfo[]> {
  try {
    validateNonEmpty(query, 'search query');
    return await invokeWithTimeout<McpToolInfo[]>('mcp_search_tools', { query });
  } catch (error) {
    throw new Error(`Failed to search MCP tools: ${error}`);
  }
}

export async function mcpCallTool(
  toolId: string,
  arguments_: Record<string, unknown>,
): Promise<unknown> {
  try {
    validateNonEmpty(toolId, 'tool ID');
    if (!arguments_ || typeof arguments_ !== 'object') {
      throw new Error('arguments must be a valid object');
    }
    return await invokeWithRetry<unknown>(
      'mcp_call_tool',
      { tool_id: toolId, arguments: arguments_ },
      MCP_TOOL_CALL_TIMEOUT_MS,
    );
  } catch (error) {
    throw new Error(`Failed to call MCP tool '${toolId}': ${error}`);
  }
}

export async function mcpGetConfig(): Promise<McpServersConfig> {
  try {
    return await invokeWithTimeout<McpServersConfig>('mcp_get_config');
  } catch (error) {
    throw new Error(`Failed to get MCP configuration: ${error}`);
  }
}

export async function mcpUpdateConfig(config: McpServersConfig): Promise<string> {
  try {
    if (!config || typeof config !== 'object') {
      throw new Error('config must be a valid McpServersConfig object');
    }

    return await invokeWithTimeout<string>('mcp_update_config', { new_config: config });
  } catch (error) {
    throw new Error(`Failed to update MCP configuration: ${error}`);
  }
}

export async function mcpGetStats(): Promise<Record<string, number>> {
  try {
    return await invokeWithTimeout<Record<string, number>>('mcp_get_stats');
  } catch (error) {
    throw new Error(`Failed to get MCP statistics: ${error}`);
  }
}

export async function mcpStoreCredential(
  serverName: string,
  key: string,
  value: string,
): Promise<string> {
  try {
    validateNonEmpty(serverName, 'server name');
    validateNonEmpty(key, 'credential key');
    if (value === undefined || value === null) {
      throw new Error('credential value cannot be null or undefined');
    }
    return await invokeWithTimeout<string>('mcp_store_credential', {
      server_name: serverName,
      key,
      value,
    });
  } catch (error) {
    throw new Error(`Failed to store credential for server '${serverName}': ${error}`);
  }
}

export async function mcpGetToolSchemas(): Promise<unknown[]> {
  try {
    return await invokeWithTimeout<unknown[]>('mcp_get_tool_schemas');
  } catch (error) {
    throw new Error(`Failed to get MCP tool schemas: ${error}`);
  }
}

// ============================================================================
// MCP OAuth Functions
// ============================================================================

const MCP_OAUTH_TIMEOUT_MS = 60000;

/**
 * Available OAuth providers with their display configuration
 */
export const MCP_OAUTH_PROVIDERS: McpOAuthProviderConfig[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Connect to GitHub for repository access, issues, and pull requests',
    icon: 'github',
    scopes: ['repo', 'read:user', 'read:org'],
  },
  {
    id: 'google_drive',
    name: 'Google Drive',
    description: 'Connect to Google Drive for file access and management',
    icon: 'google-drive',
    scopes: ['drive.readonly', 'drive.file'],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Connect to Slack for messaging and channel management',
    icon: 'slack',
    scopes: ['channels:read', 'chat:write', 'users:read', 'files:read'],
  },
];

/**
 * Start an OAuth flow for a provider.
 * Opens the browser with the authorization URL and returns the state for verification.
 *
 * @param provider - The OAuth provider ('github', 'google_drive', or 'slack')
 * @returns Promise resolving to the auth URL and state parameter
 */
export async function mcpOAuthStart(provider: McpOAuthProvider): Promise<McpOAuthStartResponse> {
  try {
    validateNonEmpty(provider, 'provider');
    const result = await invokeWithTimeout<{ auth_url: string; state: string }>(
      'mcp_oauth_start',
      { provider },
      MCP_OAUTH_TIMEOUT_MS,
    );
    return {
      authUrl: result.auth_url,
      state: result.state,
    };
  } catch (error) {
    throw new Error(`Failed to start OAuth flow for ${provider}: ${error}`);
  }
}

/**
 * Handle OAuth callback with authorization code.
 * Exchanges the code for access tokens and stores them securely.
 *
 * @param provider - The OAuth provider
 * @param code - The authorization code from the callback
 * @param callbackState - The state parameter from the callback (for CSRF verification)
 * @returns Promise resolving to the token response
 */
export async function mcpOAuthCallback(
  provider: McpOAuthProvider,
  code: string,
  callbackState: string,
): Promise<McpOAuthTokenResponse> {
  try {
    validateNonEmpty(provider, 'provider');
    validateNonEmpty(code, 'authorization code');
    validateNonEmpty(callbackState, 'callback state');
    const result = await invokeWithTimeout<{
      provider: string;
      connected: boolean;
      expires_at: number | null;
    }>(
      'mcp_oauth_callback',
      { provider, code, callback_state: callbackState },
      MCP_OAUTH_TIMEOUT_MS,
    );
    return {
      provider: result.provider,
      connected: result.connected,
      expiresAt: result.expires_at,
    };
  } catch (error) {
    throw new Error(`Failed to complete OAuth callback for ${provider}: ${error}`);
  }
}

/**
 * Check the connection status for a provider.
 *
 * @param provider - The OAuth provider
 * @returns Promise resolving to the connection status
 */
export async function mcpOAuthStatus(
  provider: McpOAuthProvider,
): Promise<McpOAuthConnectionStatus> {
  try {
    validateNonEmpty(provider, 'provider');
    const result = await invokeWithTimeout<{
      connected: boolean;
      user_info: {
        id: string;
        name: string | null;
        email: string | null;
        avatar_url: string | null;
      } | null;
      expires_at: number | null;
    }>('mcp_oauth_status', { provider });
    return {
      connected: result.connected,
      userInfo: result.user_info
        ? {
            id: result.user_info.id,
            name: result.user_info.name,
            email: result.user_info.email,
            avatarUrl: result.user_info.avatar_url,
          }
        : null,
      expiresAt: result.expires_at,
    };
  } catch (error) {
    throw new Error(`Failed to get OAuth status for ${provider}: ${error}`);
  }
}

/**
 * Disconnect a provider by removing stored tokens.
 *
 * @param provider - The OAuth provider to disconnect
 */
export async function mcpOAuthDisconnect(provider: McpOAuthProvider): Promise<void> {
  try {
    validateNonEmpty(provider, 'provider');
    await invokeWithTimeout<void>('mcp_oauth_disconnect', { provider });
  } catch (error) {
    throw new Error(`Failed to disconnect OAuth for ${provider}: ${error}`);
  }
}

/**
 * Refresh expired tokens for a provider.
 *
 * @param provider - The OAuth provider
 * @returns Promise resolving to the refreshed token response
 */
export async function mcpOAuthRefresh(provider: McpOAuthProvider): Promise<McpOAuthTokenResponse> {
  try {
    validateNonEmpty(provider, 'provider');
    const result = await invokeWithTimeout<{
      provider: string;
      connected: boolean;
      expires_at: number | null;
    }>('mcp_oauth_refresh', { provider }, MCP_OAUTH_TIMEOUT_MS);
    return {
      provider: result.provider,
      connected: result.connected,
      expiresAt: result.expires_at,
    };
  } catch (error) {
    throw new Error(`Failed to refresh OAuth tokens for ${provider}: ${error}`);
  }
}

/**
 * Store client credentials for a provider (client ID and secret).
 * Use this to configure OAuth credentials without environment variables.
 *
 * @param provider - The OAuth provider
 * @param clientId - The OAuth client ID
 * @param clientSecret - The OAuth client secret
 */
export async function mcpOAuthSetCredentials(
  provider: McpOAuthProvider,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  try {
    validateNonEmpty(provider, 'provider');
    validateNonEmpty(clientId, 'client ID');
    validateNonEmpty(clientSecret, 'client secret');
    await invokeWithTimeout<void>('mcp_oauth_set_credentials', {
      provider,
      client_id: clientId,
      client_secret: clientSecret,
    });
  } catch (error) {
    throw new Error(`Failed to set OAuth credentials for ${provider}: ${error}`);
  }
}

/**
 * Get the status of all OAuth providers.
 *
 * @returns Promise resolving to a map of provider statuses
 */
export async function mcpOAuthGetAllStatuses(): Promise<
  Record<McpOAuthProvider, McpOAuthConnectionStatus>
> {
  const providers: McpOAuthProvider[] = ['github', 'google_drive', 'slack'];
  const statuses: Record<string, McpOAuthConnectionStatus> = {};

  await Promise.all(
    providers.map(async (provider) => {
      try {
        statuses[provider] = await mcpOAuthStatus(provider);
      } catch {
        // If status check fails, mark as disconnected
        statuses[provider] = {
          connected: false,
          userInfo: null,
          expiresAt: null,
        };
      }
    }),
  );

  return statuses as Record<McpOAuthProvider, McpOAuthConnectionStatus>;
}

/**
 * Check if a provider's tokens are expired or about to expire (within 5 minutes).
 *
 * @param provider - The OAuth provider
 * @returns Promise resolving to true if tokens need refreshing
 */
export async function mcpOAuthNeedsRefresh(provider: McpOAuthProvider): Promise<boolean> {
  try {
    const status = await mcpOAuthStatus(provider);
    if (!status.connected || !status.expiresAt) {
      return false;
    }
    // Check if token expires within 5 minutes
    const fiveMinutesFromNow = Date.now() / 1000 + 300;
    return status.expiresAt < fiveMinutesFromNow;
  } catch {
    return false;
  }
}

export class McpClient {
  static async initialize(): Promise<string> {
    return mcpInitialize();
  }

  static async listServers(): Promise<McpServerInfo[]> {
    return mcpListServers();
  }

  static async connect(serverName: string): Promise<string> {
    return mcpConnectServer(serverName);
  }

  static async disconnect(serverName: string): Promise<string> {
    return mcpDisconnectServer(serverName);
  }

  static async enableServer(serverName: string): Promise<string> {
    return mcpEnableServer(serverName);
  }

  static async disableServer(serverName: string): Promise<string> {
    return mcpDisableServer(serverName);
  }

  static async listTools(): Promise<McpToolInfo[]> {
    return mcpListTools();
  }

  static async searchTools(query: string): Promise<McpToolInfo[]> {
    return mcpSearchTools(query);
  }

  static async callTool(toolId: string, args: Record<string, unknown>): Promise<unknown> {
    return mcpCallTool(toolId, args);
  }

  static async getConfig(): Promise<McpServersConfig> {
    return mcpGetConfig();
  }

  static async updateConfig(config: McpServersConfig): Promise<string> {
    return mcpUpdateConfig(config);
  }

  static async getStats(): Promise<Record<string, number>> {
    return mcpGetStats();
  }

  static async storeCredential(serverName: string, key: string, value: string): Promise<string> {
    return mcpStoreCredential(serverName, key, value);
  }

  static async getToolSchemas(): Promise<unknown[]> {
    return mcpGetToolSchemas();
  }

  // ============================================================================
  // OAuth Methods
  // ============================================================================

  /**
   * Get available OAuth providers configuration
   */
  static getOAuthProviders(): McpOAuthProviderConfig[] {
    return MCP_OAUTH_PROVIDERS;
  }

  /**
   * Start an OAuth flow for a provider
   */
  static async oauthStart(provider: McpOAuthProvider): Promise<McpOAuthStartResponse> {
    return mcpOAuthStart(provider);
  }

  /**
   * Handle OAuth callback with authorization code
   */
  static async oauthCallback(
    provider: McpOAuthProvider,
    code: string,
    callbackState: string,
  ): Promise<McpOAuthTokenResponse> {
    return mcpOAuthCallback(provider, code, callbackState);
  }

  /**
   * Check connection status for a provider
   */
  static async oauthStatus(provider: McpOAuthProvider): Promise<McpOAuthConnectionStatus> {
    return mcpOAuthStatus(provider);
  }

  /**
   * Disconnect a provider
   */
  static async oauthDisconnect(provider: McpOAuthProvider): Promise<void> {
    return mcpOAuthDisconnect(provider);
  }

  /**
   * Refresh tokens for a provider
   */
  static async oauthRefresh(provider: McpOAuthProvider): Promise<McpOAuthTokenResponse> {
    return mcpOAuthRefresh(provider);
  }

  /**
   * Set OAuth client credentials for a provider
   */
  static async oauthSetCredentials(
    provider: McpOAuthProvider,
    clientId: string,
    clientSecret: string,
  ): Promise<void> {
    return mcpOAuthSetCredentials(provider, clientId, clientSecret);
  }

  /**
   * Get status of all OAuth providers
   */
  static async oauthGetAllStatuses(): Promise<Record<McpOAuthProvider, McpOAuthConnectionStatus>> {
    return mcpOAuthGetAllStatuses();
  }

  /**
   * Check if a provider needs token refresh
   */
  static async oauthNeedsRefresh(provider: McpOAuthProvider): Promise<boolean> {
    return mcpOAuthNeedsRefresh(provider);
  }
}

export default McpClient;
