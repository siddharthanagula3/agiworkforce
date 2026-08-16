import type { McpServerConfig } from '@agiworkforce/mcp';

export type { McpServerConfig } from '@agiworkforce/mcp';

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
  mcpServers: Record<string, DesktopMcpServerConfig>;
}

export interface DesktopMcpHttpTransportConfig {
  type: 'http';
  url: string;
  api_key?: string | null;
  bearer_token?: string | null;
  headers?: Record<string, string>;
  timeout_secs?: number;
  verify_ssl?: boolean;
}

export interface DesktopMcpStdioTransportConfig {
  type: 'stdio';
}

export type DesktopMcpTransportConfig =
  | DesktopMcpHttpTransportConfig
  | DesktopMcpStdioTransportConfig;

export interface DesktopMcpServerConfig extends Omit<McpServerConfig, 'env' | 'transport'> {
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  transport?: DesktopMcpTransportConfig;
}

export interface McpConfigLocation {
  path: string;
  source: 'project' | 'global' | string;
  projectFolder: string | null;
  exists: boolean;
}

export interface McpRegistryPackage {
  id: string;
  name: string;
  version?: string;
  description: string;
  author: string;
  category: 'automation' | 'data' | 'search' | 'productivity' | 'development' | 'integration';
  npm_package?: string;
  github?: string;
  tools: string[];
  rating?: number;
  downloads?: number;
  installed: boolean;
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

export interface McpRuntimeServerConfig {
  port: number;
  token: string;
  enabled_tools: string[];
  running: boolean;
}

export interface McpServerHealth {
  server_name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  last_check: string;
  error_message: string | null;
  response_time_ms: number | null;
  tool_count: number;
  consecutive_failures: number;
}

export interface McpExecutionHistoryEntry {
  tool_id: string;
  server_name: string;
  result: unknown;
  duration_ms: number;
  timestamp: number;
  success: boolean;
  error: string | null;
}

export interface McpToolExecutionStats {
  tool_id: string;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  avg_duration_ms: number;
  last_execution: number | null;
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
  | 'mcp:server_unhealthy'
  | 'mcp:system_initialized'
  | 'mcp:configuration_updated';

export interface McpToolExecutionStartedPayload {
  type: 'tool_execution_started';
  tool_id: string;
  server_name: string;
}

export interface McpToolExecutionCompletedPayload {
  type: 'tool_execution_completed';
  tool_id: string;
  server_name: string;
  success: boolean;
  duration_ms: number;
}

export interface McpConnectionChangedPayload {
  type: 'server_connection_changed';
  server_name: string;
  connected: boolean;
  error?: string;
}

export interface McpToolsUpdatedPayload {
  type: 'tools_updated';
  server_name: string;
  tool_count: number;
}

export interface McpServerUnhealthyPayload {
  server_name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  last_check: string;
  error_message?: string | null;
  response_time_ms?: number | null;
  tool_count?: number;
  consecutive_failures?: number;
}

export interface McpSystemInitializedPayload {
  type: 'system_initialized';
  server_count: number;
  tool_count: number;
}

export type McpEventPayload =
  | McpToolExecutionStartedPayload
  | McpToolExecutionCompletedPayload
  | McpConnectionChangedPayload
  | McpToolsUpdatedPayload
  | McpServerUnhealthyPayload
  | McpSystemInitializedPayload;

export interface McpBundle {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: McpBundleCategory;
  iconUrl?: string;
  npmPackage?: string;
  githubUrl?: string;
  documentationUrl?: string;
  tools: BundleTool[];
  configTemplate: DesktopMcpServerConfig;
  requiredCredentials: RequiredCredential[];
  rating?: number;
  downloads?: number;
  verified: boolean;
  featured: boolean;
  tags: string[];
  installed: boolean;
  installedVersion?: string;
  updateAvailable: boolean;
}

export type McpBundleCategory =
  | 'search'
  | 'automation'
  | 'data'
  | 'productivity'
  | 'development'
  | 'communication'
  | 'ai'
  | 'analytics'
  | 'other';

export interface BundleTool {
  name: string;
  description: string;
  parameters: BundleToolParam[];
}

export interface BundleToolParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface RequiredCredential {
  key?: string;
  displayName: string;
  description: string;
  required: boolean;
  envVar?: string;
  placeholder?: string;
  helpUrl?: string;
}

export interface BundleInstallProgress {
  bundleId: string;
  status: BundleInstallStatus;
  progress: number;
  message: string;
  error?: string;
}

export type BundleInstallStatus =
  | 'pending'
  | 'downloading'
  | 'installing'
  | 'configuring'
  | 'completed'
  | 'failed';

export interface McpbEventPayload {
  type: 'install_started' | 'install_progress' | 'install_completed' | 'install_failed';
  bundleId: string;
  bundleName?: string;
  progress?: number;
  message?: string;
  error?: string;
}

export type McpExtensionStatus =
  | 'disabled'
  | 'enabled'
  | 'running'
  | 'error'
  | 'updating'
  | 'pending_removal';

export interface McpExtensionInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  status: McpExtensionStatus;
  lastError: string | null;
  installPath: string;
  toolCount: number;
  tools: string[];
  requiresConfig: boolean;
  configComplete: boolean;
  configSchema: unknown | null;
  category: string | null;
  iconPath: string | null;
  installedAt: string;
  updatedAt: string;
  useCount: number;
}

export interface McpExtensionPackageInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  toolCount: number;
  tools: string[];
  requiresConfig: boolean;
  fileCount: number;
  totalSize: number;
  hasDependencies: boolean;
}

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

export interface McpOAuthProviderConfig {
  id: McpOAuthProvider;
  name: string;
  description: string;
  icon: string;
  scopes: string[];
}
