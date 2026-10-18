import type { McpServerConfig } from '@agiworkforce/mcp';

export type { McpServerConfig } from '@agiworkforce/mcp';

export interface McpStoredSecretReference {
  kind: 'apiKey' | 'signIn';
  provider: string;
}

export interface McpServerInfo {
  name: string;
  enabled: boolean;
  connected: boolean;
  toolCount: number;
  command?: string;
  local?: boolean;
  sandboxed?: boolean;
  /** Why a server the user let out of the sandbox is being kept in it. */
  sandboxNotice?: string;
  /** The user's own stored secrets this server names and is handed. */
  receivesSecrets?: McpStoredSecretReference[];
  /** For a server from the open project's MCP file: the files its approval covers. */
  approvalCoversFiles?: string[];
  /** For such a server: why its files cannot be pinned, so it is approved one start at a time. */
  approvalNotice?: string;
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
  oauth_client_id?: string;
  oauth_client_secret?: string;
  oauth_token_url?: string;
}

export interface DesktopMcpStdioTransportConfig {
  type: 'stdio';
}

export type DesktopMcpTransportConfig =
  DesktopMcpHttpTransportConfig | DesktopMcpStdioTransportConfig;

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

export interface McpRuntimeServerConfig {
  port: number;
  token: string;
  enabled_tools: string[];
  running: boolean;
}

export interface McpCredentialSlot {
  serverName: string;
  key: string;
  stored: boolean;
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
  'pending' | 'downloading' | 'installing' | 'configuring' | 'completed' | 'failed';

export type McpExtensionStatus =
  'disabled' | 'enabled' | 'running' | 'error' | 'updating' | 'pending_removal';

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
