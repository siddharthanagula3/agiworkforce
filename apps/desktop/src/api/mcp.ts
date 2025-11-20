// Updated Nov 16, 2025: Added comprehensive error handling, input validation, timeout handling, and retry logic
import { invoke } from '@tauri-apps/api/core';
import type { McpServerInfo, McpToolInfo, McpServersConfig, McpServerConfig } from '../types/mcp';

/**
 * MCP API Client - TypeScript bindings for MCP Tauri commands
 */

// Re-export types for convenience
export type { McpServerInfo, McpToolInfo, McpServersConfig, McpServerConfig };

// Updated Nov 16, 2025: Configurable timeouts for different MCP operations
const MCP_TIMEOUT_MS = 30000; // 30 seconds for most operations
const MCP_TOOL_CALL_TIMEOUT_MS = 120000; // 2 minutes for tool execution
const MCP_INIT_TIMEOUT_MS = 60000; // 1 minute for initialization

// Updated Nov 16, 2025: Retry configuration
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

// Updated Nov 16, 2025: Sleep utility for retry delays
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Updated Nov 16, 2025: Wrapper for invoke with timeout and error handling
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

// Updated Nov 16, 2025: Wrapper with retry logic for network-related operations
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

      // Don't retry on the last attempt
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

// Updated Nov 16, 2025: Input validation helper
function validateNonEmpty(value: string | undefined, fieldName: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
}

/**
 * Initialize MCP system - load config, inject credentials, connect to enabled servers
 * Updated Nov 16, 2025: Added retry logic and timeout handling
 */
export async function mcpInitialize(): Promise<string> {
  try {
    return await invokeWithRetry<string>('mcp_initialize', undefined, MCP_INIT_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`Failed to initialize MCP system: ${error}`);
  }
}

/**
 * List all configured MCP servers with their status
 * Updated Nov 16, 2025: Added error handling and timeout
 */
export async function mcpListServers(): Promise<McpServerInfo[]> {
  try {
    return await invokeWithTimeout<McpServerInfo[]>('mcp_list_servers');
  } catch (error) {
    throw new Error(`Failed to list MCP servers: ${error}`);
  }
}

/**
 * Connect to a specific MCP server
 * Updated Nov 16, 2025: Added validation, retry logic, and timeout handling
 */
export async function mcpConnectServer(name: string): Promise<string> {
  try {
    validateNonEmpty(name, 'server name');
    return await invokeWithRetry<string>('mcp_connect_server', { name });
  } catch (error) {
    throw new Error(`Failed to connect to MCP server '${name}': ${error}`);
  }
}

/**
 * Disconnect from a specific MCP server
 * Updated Nov 16, 2025: Added validation and error handling
 */
export async function mcpDisconnectServer(name: string): Promise<string> {
  try {
    validateNonEmpty(name, 'server name');
    return await invokeWithTimeout<string>('mcp_disconnect_server', { name });
  } catch (error) {
    throw new Error(`Failed to disconnect from MCP server '${name}': ${error}`);
  }
}

/**
 * Enable a server in the config and start it
 */
export async function mcpEnableServer(name: string): Promise<string> {
  try {
    validateNonEmpty(name, 'server name');
    return await invokeWithTimeout<string>('mcp_enable_server', { name });
  } catch (error) {
    throw new Error(`Failed to enable MCP server '${name}': ${error}`);
  }
}

/**
 * Disable a server and stop it if running
 */
export async function mcpDisableServer(name: string): Promise<string> {
  try {
    validateNonEmpty(name, 'server name');
    return await invokeWithTimeout<string>('mcp_disable_server', { name });
  } catch (error) {
    throw new Error(`Failed to disable MCP server '${name}': ${error}`);
  }
}

/**
 * List all available tools from all connected servers
 * Updated Nov 16, 2025: Added error handling and timeout
 */
export async function mcpListTools(): Promise<McpToolInfo[]> {
  try {
    return await invokeWithTimeout<McpToolInfo[]>('mcp_list_tools');
  } catch (error) {
    throw new Error(`Failed to list MCP tools: ${error}`);
  }
}

/**
 * Search for tools across all servers
 * Updated Nov 16, 2025: Added validation, error handling, and timeout
 */
export async function mcpSearchTools(query: string): Promise<McpToolInfo[]> {
  try {
    validateNonEmpty(query, 'search query');
    return await invokeWithTimeout<McpToolInfo[]>('mcp_search_tools', { query });
  } catch (error) {
    throw new Error(`Failed to search MCP tools: ${error}`);
  }
}

/**
 * Call an MCP tool
 * Updated Nov 16, 2025: Added validation, retry logic, and extended timeout
 */
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
      { toolId, arguments: arguments_ },
      MCP_TOOL_CALL_TIMEOUT_MS,
    );
  } catch (error) {
    throw new Error(`Failed to call MCP tool '${toolId}': ${error}`);
  }
}

/**
 * Get current MCP configuration
 * Updated Nov 16, 2025: Added error handling for JSON parsing
 */
export async function mcpGetConfig(): Promise<McpServersConfig> {
  try {
    const config = await invokeWithTimeout<string>('mcp_get_config');
    try {
      return JSON.parse(config);
    } catch (parseError) {
      throw new Error(`Failed to parse MCP config: ${parseError}`);
    }
  } catch (error) {
    throw new Error(`Failed to get MCP configuration: ${error}`);
  }
}

/**
 * Update and save MCP configuration
 * Updated Nov 16, 2025: Added validation and error handling for JSON serialization
 */
export async function mcpUpdateConfig(config: McpServersConfig): Promise<string> {
  try {
    if (!config || typeof config !== 'object') {
      throw new Error('config must be a valid McpServersConfig object');
    }
    let configJson: string;
    try {
      configJson = JSON.stringify(config);
    } catch (stringifyError) {
      throw new Error(`Failed to serialize MCP config: ${stringifyError}`);
    }
    return await invokeWithTimeout<string>('mcp_update_config', { config: configJson });
  } catch (error) {
    throw new Error(`Failed to update MCP configuration: ${error}`);
  }
}

/**
 * Get server statistics (tool counts)
 * Updated Nov 16, 2025: Added error handling and timeout
 */
export async function mcpGetStats(): Promise<Record<string, number>> {
  try {
    return await invokeWithTimeout<Record<string, number>>('mcp_get_stats');
  } catch (error) {
    throw new Error(`Failed to get MCP statistics: ${error}`);
  }
}

/**
 * Store a credential in Windows Credential Manager
 * Updated Nov 16, 2025: Added validation and error handling
 */
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
    return await invokeWithTimeout<string>('mcp_store_credential', { serverName, key, value });
  } catch (error) {
    throw new Error(`Failed to store credential for server '${serverName}': ${error}`);
  }
}

/**
 * Get tool schemas for LLM function calling (OpenAI format)
 * Updated Nov 16, 2025: Added error handling and timeout
 */
export async function mcpGetToolSchemas(): Promise<unknown[]> {
  try {
    return await invokeWithTimeout<unknown[]>('mcp_get_tool_schemas');
  } catch (error) {
    throw new Error(`Failed to get MCP tool schemas: ${error}`);
  }
}

/**
 * MCP Client - React hook-friendly wrapper
 * Updated Nov 16, 2025: All methods now use error-handled functions
 */
export class McpClient {
  /**
   * Initialize the MCP system
   */
  static async initialize(): Promise<string> {
    return mcpInitialize();
  }

  /**
   * Get all servers with status
   */
  static async listServers(): Promise<McpServerInfo[]> {
    return mcpListServers();
  }

  /**
   * Connect to a server by name
   */
  static async connect(serverName: string): Promise<string> {
    return mcpConnectServer(serverName);
  }

  /**
   * Disconnect from a server
   */
  static async disconnect(serverName: string): Promise<string> {
    return mcpDisconnectServer(serverName);
  }

  /**
   * Enable a server (persist + start)
   */
  static async enableServer(serverName: string): Promise<string> {
    return mcpEnableServer(serverName);
  }

  /**
   * Disable a server (persist + stop)
   */
  static async disableServer(serverName: string): Promise<string> {
    return mcpDisableServer(serverName);
  }

  /**
   * Get all available tools
   */
  static async listTools(): Promise<McpToolInfo[]> {
    return mcpListTools();
  }

  /**
   * Search for tools
   */
  static async searchTools(query: string): Promise<McpToolInfo[]> {
    return mcpSearchTools(query);
  }

  /**
   * Execute a tool
   */
  static async callTool(toolId: string, args: Record<string, unknown>): Promise<unknown> {
    return mcpCallTool(toolId, args);
  }

  /**
   * Get configuration
   */
  static async getConfig(): Promise<McpServersConfig> {
    return mcpGetConfig();
  }

  /**
   * Update configuration
   */
  static async updateConfig(config: McpServersConfig): Promise<string> {
    return mcpUpdateConfig(config);
  }

  /**
   * Get server statistics
   */
  static async getStats(): Promise<Record<string, number>> {
    return mcpGetStats();
  }

  /**
   * Store a credential securely
   */
  static async storeCredential(serverName: string, key: string, value: string): Promise<string> {
    return mcpStoreCredential(serverName, key, value);
  }

  /**
   * Get tool schemas for LLM integration
   */
  static async getToolSchemas(): Promise<unknown[]> {
    return mcpGetToolSchemas();
  }
}

export default McpClient;
