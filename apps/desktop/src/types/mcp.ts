/**
 * MCP (Model Context Protocol) Type Definitions
 */

export interface McpServerInfo {
  name: string;
  enabled: boolean;
  connected: boolean;
  tool_count: number;
}

export interface McpToolInfo {
  id: string;
  name: string;
  description: string;
  server: string;
  parameters?: string[];
}

export interface McpServersConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface McpServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

export interface McpToolResult {
  success: boolean;
  data: unknown;
  error?: string;
}

export interface McpToolParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
}

export interface McpToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: McpToolParameter[];
  server: string;
}

export interface McpStats {
  serverName: string;
  toolCount: number;
  connected: boolean;
}

export interface McpCredential {
  serverName: string;
  key: string;
  value: string;
}

/**
 * MCP Tool Execution Status
 */
export enum McpToolExecutionStatus {
  Pending = 'pending',
  Running = 'running',
  Success = 'success',
  Failed = 'failed',
}

/**
 * MCP Tool Execution Event
 */
export interface McpToolExecutionEvent {
  toolId: string;
  status: McpToolExecutionStatus;
  result?: unknown;
  error?: string;
  timestamp: number;
}

/**
 * MCP Server Connection Status
 */
export enum McpServerStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

/**
 * MCP Server Connection Event
 */
export interface McpServerConnectionEvent {
  serverName: string;
  status: McpServerStatus;
  error?: string;
  timestamp: number;
}

/**
 * MCP Error Types
 */
export enum McpErrorType {
  ServerNotFound = 'server_not_found',
  ToolNotFound = 'tool_not_found',
  ExecutionFailed = 'execution_failed',
  ConfigurationError = 'configuration_error',
  ConnectionFailed = 'connection_failed',
  CredentialError = 'credential_error',
}

/**
 * MCP Error
 */
export interface McpError {
  type: McpErrorType;
  message: string;
  serverName?: string;
  toolId?: string;
  details?: unknown;
}
