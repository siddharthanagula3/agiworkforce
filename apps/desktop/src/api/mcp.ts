import { invoke } from '@tauri-apps/api/core';
import type { McpServerInfo, McpToolInfo, McpServersConfig, McpServerConfig } from '../types/mcp';

/**
 * MCP API Client - TypeScript bindings for MCP Tauri commands
 */

// Re-export types for convenience
export type { McpServerInfo, McpToolInfo, McpServersConfig, McpServerConfig };

/**
 * Initialize MCP system - load config, inject credentials, connect to enabled servers
 */
export async function mcpInitialize(): Promise<string> {
  return await invoke('mcp_initialize');
}

/**
 * List all configured MCP servers with their status
 */
export async function mcpListServers(): Promise<McpServerInfo[]> {
  return await invoke('mcp_list_servers');
}

/**
 * Connect to a specific MCP server
 */
export async function mcpConnectServer(name: string): Promise<string> {
  return await invoke('mcp_connect_server', { name });
}

/**
 * Disconnect from a specific MCP server
 */
export async function mcpDisconnectServer(name: string): Promise<string> {
  return await invoke('mcp_disconnect_server', { name });
}

/**
 * List all available tools from all connected servers
 */
export async function mcpListTools(): Promise<McpToolInfo[]> {
  return await invoke('mcp_list_tools');
}

/**
 * Search for tools across all servers
 */
export async function mcpSearchTools(query: string): Promise<McpToolInfo[]> {
  return await invoke('mcp_search_tools', { query });
}

/**
 * Call an MCP tool
 */
export async function mcpCallTool(
  toolId: string,
  arguments_: Record<string, unknown>,
): Promise<unknown> {
  return await invoke('mcp_call_tool', { toolId, arguments: arguments_ });
}

/**
 * Get current MCP configuration
 */
export async function mcpGetConfig(): Promise<McpServersConfig> {
  const config = await invoke<string>('mcp_get_config');
  return JSON.parse(config);
}

/**
 * Update and save MCP configuration
 */
export async function mcpUpdateConfig(config: McpServersConfig): Promise<string> {
  const configJson = JSON.stringify(config);
  return await invoke('mcp_update_config', { config: configJson });
}

/**
 * Get server statistics (tool counts)
 */
export async function mcpGetStats(): Promise<Record<string, number>> {
  return await invoke('mcp_get_stats');
}

/**
 * Store a credential in Windows Credential Manager
 */
export async function mcpStoreCredential(
  serverName: string,
  key: string,
  value: string,
): Promise<string> {
  return await invoke('mcp_store_credential', { serverName, key, value });
}

/**
 * Get tool schemas for LLM function calling (OpenAI format)
 */
export async function mcpGetToolSchemas(): Promise<unknown[]> {
  return await invoke('mcp_get_tool_schemas');
}

/**
 * MCP Client - React hook-friendly wrapper
 */
export class McpClient {
  /**
   * Initialize the MCP system
   */
  static async initialize(): Promise<string> {
    return await mcpInitialize();
  }

  /**
   * Get all servers with status
   */
  static async listServers(): Promise<McpServerInfo[]> {
    return await mcpListServers();
  }

  /**
   * Connect to a server by name
   */
  static async connect(serverName: string): Promise<string> {
    return await mcpConnectServer(serverName);
  }

  /**
   * Disconnect from a server
   */
  static async disconnect(serverName: string): Promise<string> {
    return await mcpDisconnectServer(serverName);
  }

  /**
   * Get all available tools
   */
  static async listTools(): Promise<McpToolInfo[]> {
    return await mcpListTools();
  }

  /**
   * Search for tools
   */
  static async searchTools(query: string): Promise<McpToolInfo[]> {
    return await mcpSearchTools(query);
  }

  /**
   * Execute a tool
   */
  static async callTool(toolId: string, args: Record<string, unknown>): Promise<unknown> {
    return await mcpCallTool(toolId, args);
  }

  /**
   * Get configuration
   */
  static async getConfig(): Promise<McpServersConfig> {
    return await mcpGetConfig();
  }

  /**
   * Update configuration
   */
  static async updateConfig(config: McpServersConfig): Promise<string> {
    return await mcpUpdateConfig(config);
  }

  /**
   * Get server statistics
   */
  static async getStats(): Promise<Record<string, number>> {
    return await mcpGetStats();
  }

  /**
   * Store a credential securely
   */
  static async storeCredential(serverName: string, key: string, value: string): Promise<string> {
    return await mcpStoreCredential(serverName, key, value);
  }

  /**
   * Get tool schemas for LLM integration
   */
  static async getToolSchemas(): Promise<unknown[]> {
    return await mcpGetToolSchemas();
  }
}

export default McpClient;
