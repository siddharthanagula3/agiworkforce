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

export interface McpConfigLocation {
  path: string;
  source: 'project' | 'global' | string;
  projectFolder: string | null;
  exists: boolean;
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

// MCP Event types from Rust backend
export type McpEventType =
  | 'mcp:connection_changed'
  | 'mcp:tools_updated'
  | 'mcp:tool_execution_started'
  | 'mcp:tool_execution_completed'
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
  | McpSystemInitializedPayload;

// MCPB Bundle Types
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
  configTemplate: McpServerConfig;
  requiredCredentials: RequiredCredential[];
  rating: number;
  downloads: number;
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
  key: string;
  displayName: string;
  description: string;
  required: boolean;
  envVar?: string;
  placeholder?: string;
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

// MCP OAuth Types for GitHub, Google Drive, and Slack integrations

/**
 * Supported OAuth providers for MCP server authentication
 */
export type McpOAuthProvider = 'github' | 'google_drive' | 'slack';

/**
 * Response from starting an OAuth flow
 */
export interface McpOAuthStartResponse {
  /** The URL to open in the browser for authorization */
  authUrl: string;
  /** The state parameter for CSRF protection */
  state: string;
}

/**
 * Response from completing an OAuth flow (callback)
 */
export interface McpOAuthTokenResponse {
  /** The provider that was authenticated */
  provider: string;
  /** Whether the connection was successful */
  connected: boolean;
  /** When the access token expires (Unix timestamp) */
  expiresAt: number | null;
}

/**
 * User information from the OAuth provider
 */
export interface McpOAuthUserInfo {
  /** The user's ID on the provider */
  id: string;
  /** The user's display name */
  name: string | null;
  /** The user's email address */
  email: string | null;
  /** URL to the user's avatar */
  avatarUrl: string | null;
}

/**
 * Status of an OAuth connection
 */
export interface McpOAuthConnectionStatus {
  /** Whether the provider is connected */
  connected: boolean;
  /** User information if connected */
  userInfo: McpOAuthUserInfo | null;
  /** When the access token expires (Unix timestamp) */
  expiresAt: number | null;
}

/**
 * Provider configuration for display in UI
 */
export interface McpOAuthProviderConfig {
  id: McpOAuthProvider;
  name: string;
  description: string;
  icon: string;
  scopes: string[];
}
