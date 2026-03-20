/**
 * MCP API — typed wrappers for mcp_*, mcpb_*, extension_*, and mcp_server_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface McpServerInfo {
  name: string;
  status: string;
  transport: string;
  toolCount: number;
}

export interface McpToolInfo {
  id: string;
  name: string;
  description: string;
  serverName: string;
  inputSchema?: unknown;
}

export interface McpConfigLocation {
  path: string;
  exists: boolean;
}

export interface ToolExecutionResult {
  toolId: string;
  serverName: string;
  duration: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

export interface ToolStats {
  toolId: string;
  totalCalls: number;
  successCount: number;
  avgDuration: number;
}

export interface ServerHealth {
  name: string;
  healthy: boolean;
  lastCheck: string;
  error?: string;
}

export interface RegistryPackage {
  id: string;
  name: string;
  description: string;
  version: string;
}

// ---- MCP Core ----

export async function mcpGetRegistry(): Promise<RegistryPackage[]> {
  return command<RegistryPackage[]>('mcp_get_registry');
}

export async function mcpInitialize(): Promise<string> {
  return command<string>('mcp_initialize');
}

export async function mcpListServers(): Promise<McpServerInfo[]> {
  return command<McpServerInfo[]>('mcp_list_servers');
}

export async function mcpConnectServer(name: string): Promise<string> {
  return command<string>('mcp_connect_server', { name });
}

export async function mcpDisconnectServer(name: string): Promise<string> {
  return command<string>('mcp_disconnect_server', { name });
}

export async function mcpListTools(): Promise<McpToolInfo[]> {
  return command<McpToolInfo[]>('mcp_list_tools');
}

export async function mcpSearchTools(query: string): Promise<McpToolInfo[]> {
  return command<McpToolInfo[]>('mcp_search_tools', { query });
}

export async function mcpCallTool(toolId: string, args: Record<string, unknown>): Promise<unknown> {
  return command<unknown>('mcp_call_tool', { toolId, arguments: args });
}

export async function mcpGetConfig(): Promise<unknown> {
  return command<unknown>('mcp_get_config');
}

export async function mcpGetConfigLocation(): Promise<McpConfigLocation> {
  return command<McpConfigLocation>('mcp_get_config_location');
}

export async function mcpUpdateConfig(newConfig: unknown): Promise<string> {
  return command<string>('mcp_update_config', { newConfig });
}

export async function mcpEnableServer(name: string): Promise<string> {
  return command<string>('mcp_enable_server', { name });
}

export async function mcpDisableServer(name: string): Promise<string> {
  return command<string>('mcp_disable_server', { name });
}

export async function mcpGetStats(): Promise<Record<string, number>> {
  return command<Record<string, number>>('mcp_get_stats');
}

export async function mcpGetExecutionHistory(limit?: number): Promise<ToolExecutionResult[]> {
  return command<ToolExecutionResult[]>('mcp_get_execution_history', { limit });
}

export async function mcpGetToolExecutionStats(): Promise<ToolStats[]> {
  return command<ToolStats[]>('mcp_get_tool_execution_stats');
}

export async function mcpGetServerLogs(serverName: string, lines?: number): Promise<string[]> {
  return command<string[]>('mcp_get_server_logs', { serverName, lines });
}

export async function mcpStoreCredential(
  serverName: string,
  key: string,
  value: string,
): Promise<string> {
  return command<string>('mcp_store_credential', { serverName, key, value });
}

export async function mcpGetToolSchemas(): Promise<unknown[]> {
  return command<unknown[]>('mcp_get_tool_schemas');
}

export async function mcpGetHealth(): Promise<ServerHealth[]> {
  return command<ServerHealth[]>('mcp_get_health');
}

export async function mcpCheckServerHealth(serverName: string): Promise<ServerHealth> {
  return command<ServerHealth>('mcp_check_server_health', { serverName });
}

export async function mcpSetCredential(
  serverName: string,
  key: string,
  value: string,
): Promise<string> {
  return command<string>('mcp_set_credential', { serverName, key, value });
}

export async function mcpDeleteCredential(serverName: string, key: string): Promise<string> {
  return command<string>('mcp_delete_credential', { serverName, key });
}

export async function mcpInstallServer(serverId: string): Promise<string> {
  return command<string>('mcp_install_server', { serverId });
}

export async function mcpUpdateFilesystemDirectories(directories: string[]): Promise<string> {
  return command<string>('mcp_update_filesystem_directories', { directories });
}

// ---- MCP OAuth ----

export interface OAuthStartResponse {
  authUrl: string;
  state: string;
}

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface OAuthConnectionStatus {
  connected: boolean;
  provider: string;
  expiresAt?: string;
}

export interface ConnectorManifest {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  authType: string;
}

export async function mcpOauthStart(provider: string): Promise<OAuthStartResponse> {
  return command<OAuthStartResponse>('mcp_oauth_start', { provider });
}

export async function mcpOauthCallback(
  provider: string,
  code: string,
  callbackState: string,
): Promise<OAuthTokenResponse> {
  return command<OAuthTokenResponse>('mcp_oauth_callback', { provider, code, callbackState });
}

export async function mcpOauthStatus(provider: string): Promise<OAuthConnectionStatus> {
  return command<OAuthConnectionStatus>('mcp_oauth_status', { provider });
}

export async function mcpOauthDisconnect(provider: string): Promise<void> {
  return command<void>('mcp_oauth_disconnect', { provider });
}

export async function mcpOauthRefresh(provider: string): Promise<OAuthTokenResponse> {
  return command<OAuthTokenResponse>('mcp_oauth_refresh', { provider });
}

export async function mcpOauthSetCredentials(
  provider: string,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  return command<void>('mcp_oauth_set_credentials', { provider, clientId, clientSecret });
}

export async function mcpListConnectedProviders(): Promise<string[]> {
  return command<string[]>('mcp_list_connected_providers');
}

export async function mcpConnectConnector(connectorId: string): Promise<void> {
  return command<void>('mcp_connect_connector', { connectorId });
}

export async function saveApiKey(provider: string, key: string): Promise<void> {
  return command<void>('save_api_key', { provider, key });
}

export async function getConnectorManifests(): Promise<ConnectorManifest[]> {
  return command<ConnectorManifest[]>('get_connector_manifests');
}

// ---- MCP Extensions ----

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  status: string;
  enabled: boolean;
}

export interface ExtensionPackageInfo {
  valid: boolean;
  name?: string;
  version?: string;
  errors: string[];
}

export async function extensionList(): Promise<ExtensionInfo[]> {
  return command<ExtensionInfo[]>('extension_list');
}

export async function extensionGet(extensionId: string): Promise<ExtensionInfo> {
  return command<ExtensionInfo>('extension_get', { extensionId });
}

export async function extensionInstall(filePath: string): Promise<ExtensionInfo> {
  return command<ExtensionInfo>('extension_install', { filePath });
}

export async function extensionUninstall(extensionId: string): Promise<string> {
  return command<string>('extension_uninstall', { extensionId });
}

export async function extensionEnable(extensionId: string): Promise<string> {
  return command<string>('extension_enable', { extensionId });
}

export async function extensionDisable(extensionId: string): Promise<string> {
  return command<string>('extension_disable', { extensionId });
}

export async function extensionGetConfig(extensionId: string): Promise<Record<string, unknown>> {
  return command<Record<string, unknown>>('extension_get_config', { extensionId });
}

export async function extensionSetConfig(
  extensionId: string,
  config: Record<string, unknown>,
): Promise<string> {
  return command<string>('extension_set_config', { extensionId, config });
}

export async function extensionValidate(filePath: string): Promise<ExtensionPackageInfo> {
  return command<ExtensionPackageInfo>('extension_validate', { filePath });
}

export async function extensionListByStatus(status: string): Promise<ExtensionInfo[]> {
  return command<ExtensionInfo[]>('extension_list_by_status', { status });
}

export async function extensionStartAll(): Promise<string> {
  return command<string>('extension_start_all');
}

export async function extensionStopAll(): Promise<string> {
  return command<string>('extension_stop_all');
}

export async function extensionGetDirectory(): Promise<string> {
  return command<string>('extension_get_directory');
}

export async function extensionSelectPackage(): Promise<string | null> {
  return command<string | null>('extension_select_package');
}

// ---- MCP Bundles ----

export interface McpBundle {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  installed: boolean;
  servers: string[];
}

export async function mcpbFetchRegistry(): Promise<McpBundle[]> {
  return command<McpBundle[]>('mcpb_fetch_registry');
}

export async function mcpbSearchBundles(query: string, category?: string): Promise<McpBundle[]> {
  return command<McpBundle[]>('mcpb_search_bundles', { query, category });
}

export async function mcpbGetBundleDetails(bundleId: string): Promise<McpBundle> {
  return command<McpBundle>('mcpb_get_bundle_details', { bundleId });
}

export async function mcpbInstallBundle(bundleId: string): Promise<string> {
  return command<string>('mcpb_install_bundle', { bundleId });
}

export async function mcpbUninstallBundle(bundleId: string): Promise<string> {
  return command<string>('mcpb_uninstall_bundle', { bundleId });
}

export async function mcpbGetInstalledBundles(): Promise<McpBundle[]> {
  return command<McpBundle[]>('mcpb_get_installed_bundles');
}

export async function mcpbCheckUpdates(): Promise<McpBundle[]> {
  return command<McpBundle[]>('mcpb_check_updates');
}

export async function mcpbUpdateBundle(bundleId: string): Promise<string> {
  return command<string>('mcpb_update_bundle', { bundleId });
}

export async function mcpbGetCategories(): Promise<string[]> {
  return command<string[]>('mcpb_get_categories');
}

export async function mcpbGetFeatured(): Promise<McpBundle[]> {
  return command<McpBundle[]>('mcpb_get_featured');
}

// ---- MCP Server (self-hosted) ----

export async function mcpServerStart(): Promise<void> {
  return command<void>('mcp_server_start');
}

export async function mcpServerStop(): Promise<void> {
  return command<void>('mcp_server_stop');
}

export async function mcpServerStatus(): Promise<boolean> {
  return command<boolean>('mcp_server_status');
}

export async function mcpServerGetConfig(): Promise<unknown> {
  return command<unknown>('mcp_server_get_config');
}

export async function mcpServerUpdateConfig(port?: number, enabledTools?: string[]): Promise<void> {
  return command<void>('mcp_server_update_config', { port, enabledTools });
}

export async function mcpServerListTools(): Promise<unknown> {
  return command<unknown>('mcp_server_list_tools');
}
