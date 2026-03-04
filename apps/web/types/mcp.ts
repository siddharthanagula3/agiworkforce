/**
 * MCP (Model Context Protocol) types for the web app
 * Mirrors the desktop app's MCP types for type safety
 */

export interface McpServerInfo {
  name: string;
  enabled: boolean;
  connected: boolean;
  tool_count: number;
  command?: string;
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

export enum McpToolExecutionStatus {
  Pending = 'pending',
  Running = 'running',
  Success = 'success',
  Failed = 'failed',
}

export interface McpToolExecutionEvent {
  toolId: string;
  status: McpToolExecutionStatus;
  result?: unknown;
  error?: string;
  timestamp: number;
}

export enum McpServerStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

export interface McpServerConnectionEvent {
  serverName: string;
  status: McpServerStatus;
  error?: string;
  timestamp: number;
}

export enum McpErrorType {
  ServerNotFound = 'server_not_found',
  ToolNotFound = 'tool_not_found',
  ExecutionFailed = 'execution_failed',
  ConfigurationError = 'configuration_error',
  ConnectionFailed = 'connection_failed',
  CredentialError = 'credential_error',
}

export interface McpError {
  type: McpErrorType;
  message: string;
  serverName?: string;
  toolId?: string;
  details?: unknown;
}

export type McpEventType =
  | 'mcp:connection_changed'
  | 'mcp:tools_updated'
  | 'mcp:tool_execution_started'
  | 'mcp:tool_execution_completed'
  | 'mcp:system_initialized'
  | 'mcp:configuration_updated';

export type McpOAuthProvider = 'github' | 'google_drive' | 'slack';

export interface McpOAuthStartResponse {
  authUrl: string;
  state: string;
}

export interface McpOAuthTokenResponse {
  provider: string;
  connected: boolean;
  expiresAt: number | null;
}

export interface McpOAuthUserInfo {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface McpOAuthConnectionStatus {
  connected: boolean;
  userInfo: McpOAuthUserInfo | null;
  expiresAt: number | null;
}
