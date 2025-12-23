import { invoke } from '../lib/tauri-mock';
import type { McpServerConfig, McpServerInfo, McpServersConfig, McpToolInfo } from '../types/mcp';

export type { McpServerConfig, McpServerInfo, McpServersConfig, McpToolInfo };

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
}

export default McpClient;
