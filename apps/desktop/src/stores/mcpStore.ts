/**
 * MCP Store
 *
 * Manages Model Context Protocol (MCP) servers, tools, and configurations.
 *
 * Updated to Zustand v5 best practices:
 * - Middleware composition: devtools(subscribeWithSelector(...))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Better devtools integration with store name
 * - subscribeWithSelector for granular subscriptions
 *
 * Note: This store doesn't need persistence since MCP state is ephemeral
 * and should be refreshed from the backend on each app start.
 */
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { McpClient } from '../api/mcp';
import type { ConnectorManifest } from '../api/mcp';
import type {
  McpConfigLocation,
  McpExecutionHistoryEntry,
  McpExtensionInfo,
  McpExtensionPackageInfo,
  McpOAuthConnectionStatus,
  McpOAuthProvider,
  McpOAuthProviderConfig,
  McpOAuthStartResponse,
  McpOAuthTokenResponse,
  McpRegistryPackage,
  McpRuntimeServerConfig,
  McpServerHealth,
  McpServerInfo,
  McpToolExecutionStats,
  McpToolInfo,
  McpServersConfig,
} from '../types/mcp';

interface McpState {
  servers: McpServerInfo[];
  tools: McpToolInfo[];
  toolSchemas: unknown[];
  config: McpServersConfig | null;
  configLocation: McpConfigLocation | null;
  stats: Record<string, number>;
  health: McpServerHealth[];
  executionHistory: McpExecutionHistoryEntry[];
  toolExecutionStats: McpToolExecutionStats[];
  registry: McpRegistryPackage[];
  extensions: McpExtensionInfo[];
  connectorManifests: ConnectorManifest[];
  connectedProviders: string[];
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  selectedServer: string | null;
  searchQuery: string;

  // Core lifecycle methods
  initialize: () => Promise<void>;
  refreshServers: () => Promise<void>;
  refreshTools: () => Promise<void>;
  refreshStats: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  checkServerHealth: (name: string) => Promise<void>;
  refreshExecutionHistory: (limit?: number) => Promise<void>;
  refreshToolExecutionStats: () => Promise<void>;
  refreshRuntimeTelemetry: () => Promise<void>;
  upsertServerHealth: (health: McpServerHealth) => void;

  // Server connection management
  connectServer: (name: string) => Promise<void>;
  disconnectServer: (name: string) => Promise<void>;

  // Configuration management
  loadConfig: () => Promise<void>;
  updateConfig: (config: McpServersConfig) => Promise<void>;
  refreshConfigLocation: () => Promise<void>;

  // Credential management
  storeCredential: (serverName: string, key: string, value: string) => Promise<void>;
  setCredential: (serverName: string, key: string, value: string) => Promise<void>;
  deleteCredential: (serverName: string, key: string) => Promise<void>;

  // Server enable/disable
  enableServer: (name: string) => Promise<void>;
  disableServer: (name: string) => Promise<void>;

  // Tool operations
  searchTools: (query: string) => Promise<void>;
  callTool: (toolId: string, args: Record<string, unknown>) => Promise<unknown>;
  refreshToolSchemas: () => Promise<void>;

  // Registry/Install
  refreshRegistry: () => Promise<void>;
  installServer: (serverId: string) => Promise<void>;

  // Server logs
  getServerLogs: (serverName: string, lines?: number) => Promise<string[]>;

  // OAuth
  oauthStart: (provider: McpOAuthProvider) => Promise<McpOAuthStartResponse>;
  oauthCallback: (
    provider: McpOAuthProvider,
    code: string,
    callbackState: string,
  ) => Promise<McpOAuthTokenResponse>;
  oauthStatus: (provider: McpOAuthProvider) => Promise<McpOAuthConnectionStatus>;
  oauthDisconnect: (provider: McpOAuthProvider) => Promise<void>;
  oauthRefresh: (provider: McpOAuthProvider) => Promise<McpOAuthTokenResponse>;

  // Extensions
  refreshExtensions: () => Promise<void>;
  installExtension: (filePath: string) => Promise<McpExtensionInfo>;
  uninstallExtension: (extensionId: string) => Promise<void>;
  enableExtension: (extensionId: string) => Promise<void>;
  disableExtension: (extensionId: string) => Promise<void>;
  validateExtensionPackage: (filePath: string) => Promise<McpExtensionPackageInfo>;
  startAllExtensions: () => Promise<void>;
  stopAllExtensions: () => Promise<void>;

  // Connectors
  refreshConnectedProviders: () => Promise<void>;
  connectConnector: (connectorId: string) => Promise<void>;
  refreshConnectorManifests: () => Promise<void>;

  // Runtime server management
  runtimeServerConfig: McpRuntimeServerConfig | null;
  runtimeServerStatus: boolean;
  runtimeServerTools: unknown[];
  getRuntimeServerConfig: () => Promise<McpRuntimeServerConfig>;
  startRuntimeServer: () => Promise<void>;
  stopRuntimeServer: () => Promise<void>;
  updateRuntimeServerConfig: (port?: number, enabledTools?: string[]) => Promise<void>;
  refreshRuntimeServerStatus: () => Promise<void>;
  refreshRuntimeServerTools: () => Promise<void>;

  // Filesystem directories
  updateFilesystemDirectories: (directories: string[]) => Promise<void>;

  // API key management
  saveApiKey: (provider: string, key: string) => Promise<void>;

  // OAuth credentials management
  oauthSetCredentials: (
    provider: McpOAuthProvider,
    clientId: string,
    clientSecret: string,
  ) => Promise<void>;
  oauthGetAllStatuses: () => Promise<Record<McpOAuthProvider, McpOAuthConnectionStatus>>;
  oauthNeedsRefresh: (provider: McpOAuthProvider) => Promise<boolean>;
  getOAuthProviders: () => McpOAuthProviderConfig[];

  // Extension detail operations
  getExtension: (extensionId: string) => Promise<McpExtensionInfo>;
  selectExtensionPackage: () => Promise<string | null>;
  listExtensionsByStatus: (status: string) => Promise<McpExtensionInfo[]>;
  getExtensionsDirectory: () => Promise<string>;
  getExtensionConfig: (extensionId: string) => Promise<Record<string, unknown>>;
  setExtensionConfig: (extensionId: string, config: Record<string, unknown>) => Promise<void>;

  // UI state management
  setSelectedServer: (name: string | null) => void;
  setSearchQuery: (query: string) => void;
  clearError: () => void;

  // AUDIT-006-019: Cleanup function for logout
  resetOnLogout: () => void;
}

export const useMcpStore = create<McpState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      servers: [],
      tools: [],
      toolSchemas: [],
      config: null,
      configLocation: null,
      stats: {},
      health: [],
      executionHistory: [],
      toolExecutionStats: [],
      registry: [],
      extensions: [],
      connectorManifests: [],
      connectedProviders: [],
      runtimeServerConfig: null,
      runtimeServerStatus: false,
      runtimeServerTools: [],
      isInitialized: false,
      isLoading: false,
      error: null,
      selectedServer: null,
      searchQuery: '',

      initialize: async () => {
        set({ isLoading: true, error: null }, undefined, 'mcp/initialize/start');
        try {
          await McpClient.initialize();
          await get().refreshServers();
          await get().refreshTools();
          await Promise.all([
            get().refreshStats(),
            get().refreshHealth(),
            get().refreshExecutionHistory(),
            get().refreshToolExecutionStats(),
          ]);
          await get().loadConfig();
          await get().refreshConfigLocation();
          set({ isInitialized: true, isLoading: false }, undefined, 'mcp/initialize/success');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Initialization failed',
              isLoading: false,
            },
            undefined,
            'mcp/initialize/error',
          );
        }
      },

      refreshServers: async () => {
        try {
          const servers = await McpClient.listServers();
          set({ servers, error: null }, undefined, 'mcp/refreshServers');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to list servers' },
            undefined,
            'mcp/refreshServers/error',
          );
        }
      },

      refreshTools: async () => {
        try {
          const tools = await McpClient.listTools();
          set({ tools, error: null }, undefined, 'mcp/refreshTools');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to list tools' },
            undefined,
            'mcp/refreshTools/error',
          );
        }
      },

      refreshStats: async () => {
        try {
          const stats = await McpClient.getStats();
          set({ stats, error: null }, undefined, 'mcp/refreshStats');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to get stats' },
            undefined,
            'mcp/refreshStats/error',
          );
        }
      },

      refreshHealth: async () => {
        try {
          const health = await McpClient.getHealth();
          set({ health, error: null }, undefined, 'mcp/refreshHealth');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to get MCP health' },
            undefined,
            'mcp/refreshHealth/error',
          );
        }
      },

      checkServerHealth: async (name: string) => {
        try {
          const health = await McpClient.checkServerHealth(name);
          get().upsertServerHealth(health);
          set({ error: null }, undefined, 'mcp/checkServerHealth');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : `Failed to check health for ${name}`,
            },
            undefined,
            'mcp/checkServerHealth/error',
          );
        }
      },

      refreshExecutionHistory: async (limit = 20) => {
        try {
          const executionHistory = await McpClient.getExecutionHistory(limit);
          set({ executionHistory, error: null }, undefined, 'mcp/refreshExecutionHistory');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to get MCP execution history',
            },
            undefined,
            'mcp/refreshExecutionHistory/error',
          );
        }
      },

      refreshToolExecutionStats: async () => {
        try {
          const toolExecutionStats = await McpClient.getToolExecutionStats();
          set({ toolExecutionStats, error: null }, undefined, 'mcp/refreshToolExecutionStats');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to get MCP tool execution statistics',
            },
            undefined,
            'mcp/refreshToolExecutionStats/error',
          );
        }
      },

      refreshRuntimeTelemetry: async () => {
        await Promise.all([
          get().refreshStats(),
          get().refreshHealth(),
          get().refreshExecutionHistory(),
          get().refreshToolExecutionStats(),
        ]);
      },

      upsertServerHealth: (health: McpServerHealth) => {
        set(
          (state) => {
            const existingIndex = state.health.findIndex(
              (entry) => entry.server_name === health.server_name,
            );
            if (existingIndex === -1) {
              return { health: [...state.health, health] };
            }
            const nextHealth = [...state.health];
            nextHealth[existingIndex] = { ...nextHealth[existingIndex], ...health };
            return { health: nextHealth };
          },
          undefined,
          'mcp/upsertServerHealth',
        );
      },

      connectServer: async (name: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/connectServer/start');
        try {
          await McpClient.connect(name);
          await get().refreshServers();
          await get().refreshTools();
          await get().refreshRuntimeTelemetry();
          set({ isLoading: false }, undefined, 'mcp/connectServer/success');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : `Failed to connect to ${name}`,
              isLoading: false,
            },
            undefined,
            'mcp/connectServer/error',
          );
        }
      },

      disconnectServer: async (name: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/disconnectServer/start');
        try {
          await McpClient.disconnect(name);
          await get().refreshServers();
          await get().refreshTools();
          await get().refreshRuntimeTelemetry();
          set({ isLoading: false }, undefined, 'mcp/disconnectServer/success');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : `Failed to disconnect from ${name}`,
              isLoading: false,
            },
            undefined,
            'mcp/disconnectServer/error',
          );
        }
      },

      enableServer: async (name: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/enableServer/start');
        try {
          await McpClient.enableServer(name);
          await get().refreshServers();
          await get().refreshHealth();
          set({ isLoading: false }, undefined, 'mcp/enableServer/success');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : `Failed to enable ${name}`,
              isLoading: false,
            },
            undefined,
            'mcp/enableServer/error',
          );
        }
      },

      disableServer: async (name: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/disableServer/start');
        try {
          await McpClient.disableServer(name);
          await get().refreshServers();
          await get().refreshHealth();
          set({ isLoading: false }, undefined, 'mcp/disableServer/success');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : `Failed to disable ${name}`,
              isLoading: false,
            },
            undefined,
            'mcp/disableServer/error',
          );
        }
      },

      loadConfig: async () => {
        try {
          const [config, configLocation] = await Promise.all([
            McpClient.getConfig(),
            McpClient.getConfigLocation(),
          ]);
          set({ config, configLocation, error: null }, undefined, 'mcp/loadConfig');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to load config' },
            undefined,
            'mcp/loadConfig/error',
          );
        }
      },

      updateConfig: async (config: McpServersConfig) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/updateConfig/start');
        try {
          await McpClient.updateConfig(config);
          set({ config, isLoading: false }, undefined, 'mcp/updateConfig/success');
          await get().refreshConfigLocation();
          await get().refreshServers();
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to update config',
              isLoading: false,
            },
            undefined,
            'mcp/updateConfig/error',
          );
        }
      },

      storeCredential: async (serverName: string, key: string, value: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/storeCredential/start');
        try {
          await McpClient.storeCredential(serverName, key, value);
          set({ isLoading: false }, undefined, 'mcp/storeCredential/success');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to store credential',
              isLoading: false,
            },
            undefined,
            'mcp/storeCredential/error',
          );
        }
      },

      setCredential: async (serverName: string, key: string, value: string) => {
        if (!serverName.trim() || !key.trim()) {
          set(
            { error: 'Server name and key are required', isLoading: false },
            undefined,
            'mcp/setCredential/validationError',
          );
          return;
        }
        set({ isLoading: true, error: null }, undefined, 'mcp/setCredential/start');
        try {
          await McpClient.setCredential(serverName, key, value);
          set({ isLoading: false }, undefined, 'mcp/setCredential/success');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to set credential',
              isLoading: false,
            },
            undefined,
            'mcp/setCredential/error',
          );
        }
      },

      deleteCredential: async (serverName: string, key: string) => {
        if (!serverName.trim() || !key.trim()) {
          set(
            { error: 'Server name and key are required', isLoading: false },
            undefined,
            'mcp/deleteCredential/validationError',
          );
          return;
        }
        set({ isLoading: true, error: null }, undefined, 'mcp/deleteCredential/start');
        try {
          await McpClient.deleteCredential(serverName, key);
          set({ isLoading: false }, undefined, 'mcp/deleteCredential/success');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to delete credential',
              isLoading: false,
            },
            undefined,
            'mcp/deleteCredential/error',
          );
        }
      },

      refreshConfigLocation: async () => {
        try {
          const configLocation = await McpClient.getConfigLocation();
          set({ configLocation, error: null }, undefined, 'mcp/refreshConfigLocation');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to get MCP config location' },
            undefined,
            'mcp/refreshConfigLocation/error',
          );
        }
      },

      searchTools: async (query: string) => {
        set({ searchQuery: query }, undefined, 'mcp/searchTools/start');
        if (!query.trim()) {
          await get().refreshTools();
          return;
        }
        try {
          const tools = await McpClient.searchTools(query);
          set({ tools, error: null }, undefined, 'mcp/searchTools');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to search tools' },
            undefined,
            'mcp/searchTools/error',
          );
        }
      },

      // --- Tool execution ---

      callTool: async (toolId: string, args: Record<string, unknown>) => {
        try {
          const result = await McpClient.callTool(toolId, args);
          await get().refreshRuntimeTelemetry();
          return result;
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : `Failed to call tool '${toolId}'` },
            undefined,
            'mcp/callTool/error',
          );
          throw error;
        }
      },

      refreshToolSchemas: async () => {
        try {
          const toolSchemas = await McpClient.getToolSchemas();
          set({ toolSchemas, error: null }, undefined, 'mcp/refreshToolSchemas');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to get tool schemas' },
            undefined,
            'mcp/refreshToolSchemas/error',
          );
        }
      },

      // --- Registry/Install ---

      refreshRegistry: async () => {
        try {
          const registry = await McpClient.getRegistry();
          set({ registry, error: null }, undefined, 'mcp/refreshRegistry');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to get MCP registry' },
            undefined,
            'mcp/refreshRegistry/error',
          );
        }
      },

      installServer: async (serverId: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/installServer/start');
        try {
          await McpClient.installServer(serverId);
          await get().refreshServers();
          await get().refreshRegistry();
          set({ isLoading: false }, undefined, 'mcp/installServer/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error ? error.message : `Failed to install server '${serverId}'`,
              isLoading: false,
            },
            undefined,
            'mcp/installServer/error',
          );
        }
      },

      // --- Server logs ---

      getServerLogs: async (serverName: string, lines?: number) => {
        try {
          return await McpClient.getServerLogs(serverName, lines);
        } catch (error) {
          set(
            {
              error:
                error instanceof Error ? error.message : `Failed to get logs for '${serverName}'`,
            },
            undefined,
            'mcp/getServerLogs/error',
          );
          return [];
        }
      },

      // --- OAuth ---

      oauthStart: async (provider: McpOAuthProvider) => {
        try {
          return await McpClient.oauthStart(provider);
        } catch (error) {
          set(
            {
              error:
                error instanceof Error ? error.message : `Failed to start OAuth for '${provider}'`,
            },
            undefined,
            'mcp/oauthStart/error',
          );
          throw error;
        }
      },

      oauthCallback: async (provider: McpOAuthProvider, code: string, callbackState: string) => {
        try {
          return await McpClient.oauthCallback(provider, code, callbackState);
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to complete OAuth for '${provider}'`,
            },
            undefined,
            'mcp/oauthCallback/error',
          );
          throw error;
        }
      },

      oauthStatus: async (provider: McpOAuthProvider) => {
        try {
          return await McpClient.oauthStatus(provider);
        } catch (error) {
          console.warn('[mcpStore] Failed to check OAuth status:', error);
          return { connected: false, userInfo: null, expiresAt: null };
        }
      },

      oauthDisconnect: async (provider: McpOAuthProvider) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/oauthDisconnect/start');
        try {
          await McpClient.oauthDisconnect(provider);
          await get().refreshConnectedProviders();
          set({ isLoading: false }, undefined, 'mcp/oauthDisconnect/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to disconnect OAuth for '${provider}'`,
              isLoading: false,
            },
            undefined,
            'mcp/oauthDisconnect/error',
          );
        }
      },

      oauthRefresh: async (provider: McpOAuthProvider) => {
        try {
          return await McpClient.oauthRefresh(provider);
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to refresh OAuth for '${provider}'`,
            },
            undefined,
            'mcp/oauthRefresh/error',
          );
          throw error;
        }
      },

      // --- Extensions ---

      refreshExtensions: async () => {
        try {
          const extensions = await McpClient.listExtensions();
          set({ extensions, error: null }, undefined, 'mcp/refreshExtensions');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to list extensions' },
            undefined,
            'mcp/refreshExtensions/error',
          );
        }
      },

      installExtension: async (filePath: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/installExtension/start');
        try {
          const info = await McpClient.installExtension(filePath);
          await get().refreshExtensions();
          set({ isLoading: false }, undefined, 'mcp/installExtension/success');
          return info;
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to install extension',
              isLoading: false,
            },
            undefined,
            'mcp/installExtension/error',
          );
          throw error;
        }
      },

      uninstallExtension: async (extensionId: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/uninstallExtension/start');
        try {
          await McpClient.uninstallExtension(extensionId);
          await get().refreshExtensions();
          set({ isLoading: false }, undefined, 'mcp/uninstallExtension/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to uninstall extension '${extensionId}'`,
              isLoading: false,
            },
            undefined,
            'mcp/uninstallExtension/error',
          );
        }
      },

      enableExtension: async (extensionId: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/enableExtension/start');
        try {
          await McpClient.enableExtension(extensionId);
          await get().refreshExtensions();
          set({ isLoading: false }, undefined, 'mcp/enableExtension/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to enable extension '${extensionId}'`,
              isLoading: false,
            },
            undefined,
            'mcp/enableExtension/error',
          );
        }
      },

      disableExtension: async (extensionId: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/disableExtension/start');
        try {
          await McpClient.disableExtension(extensionId);
          await get().refreshExtensions();
          set({ isLoading: false }, undefined, 'mcp/disableExtension/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to disable extension '${extensionId}'`,
              isLoading: false,
            },
            undefined,
            'mcp/disableExtension/error',
          );
        }
      },

      validateExtensionPackage: async (filePath: string) => {
        try {
          return await McpClient.validateExtensionPackage(filePath);
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to validate extension' },
            undefined,
            'mcp/validateExtensionPackage/error',
          );
          throw error;
        }
      },

      startAllExtensions: async () => {
        set({ isLoading: true, error: null }, undefined, 'mcp/startAllExtensions/start');
        try {
          await McpClient.startAllExtensions();
          await get().refreshExtensions();
          set({ isLoading: false }, undefined, 'mcp/startAllExtensions/success');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to start all extensions',
              isLoading: false,
            },
            undefined,
            'mcp/startAllExtensions/error',
          );
        }
      },

      stopAllExtensions: async () => {
        set({ isLoading: true, error: null }, undefined, 'mcp/stopAllExtensions/start');
        try {
          await McpClient.stopAllExtensions();
          await get().refreshExtensions();
          set({ isLoading: false }, undefined, 'mcp/stopAllExtensions/success');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to stop all extensions',
              isLoading: false,
            },
            undefined,
            'mcp/stopAllExtensions/error',
          );
        }
      },

      // --- Connectors ---

      refreshConnectedProviders: async () => {
        try {
          const connectedProviders = await McpClient.listConnectedProviders();
          set({ connectedProviders, error: null }, undefined, 'mcp/refreshConnectedProviders');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to list connected providers',
            },
            undefined,
            'mcp/refreshConnectedProviders/error',
          );
        }
      },

      connectConnector: async (connectorId: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/connectConnector/start');
        try {
          await McpClient.connectConnector(connectorId);
          await get().refreshServers();
          await get().refreshTools();
          await get().refreshConnectedProviders();
          set({ isLoading: false }, undefined, 'mcp/connectConnector/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to connect connector '${connectorId}'`,
              isLoading: false,
            },
            undefined,
            'mcp/connectConnector/error',
          );
        }
      },

      refreshConnectorManifests: async () => {
        try {
          const connectorManifests = await McpClient.getConnectorManifests();
          set({ connectorManifests, error: null }, undefined, 'mcp/refreshConnectorManifests');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to get connector manifests' },
            undefined,
            'mcp/refreshConnectorManifests/error',
          );
        }
      },

      // --- Runtime server management ---

      getRuntimeServerConfig: async () => {
        try {
          const runtimeServerConfig = await McpClient.getRuntimeServerConfig();
          set({ runtimeServerConfig, error: null }, undefined, 'mcp/getRuntimeServerConfig');
          return runtimeServerConfig;
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to get runtime server config',
            },
            undefined,
            'mcp/getRuntimeServerConfig/error',
          );
          throw error;
        }
      },

      startRuntimeServer: async () => {
        set({ isLoading: true, error: null }, undefined, 'mcp/startRuntimeServer/start');
        try {
          await McpClient.startRuntimeServer();
          set(
            { runtimeServerStatus: true, isLoading: false },
            undefined,
            'mcp/startRuntimeServer/success',
          );
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to start runtime server',
              isLoading: false,
            },
            undefined,
            'mcp/startRuntimeServer/error',
          );
        }
      },

      stopRuntimeServer: async () => {
        set({ isLoading: true, error: null }, undefined, 'mcp/stopRuntimeServer/start');
        try {
          await McpClient.stopRuntimeServer();
          set(
            { runtimeServerStatus: false, isLoading: false },
            undefined,
            'mcp/stopRuntimeServer/success',
          );
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to stop runtime server',
              isLoading: false,
            },
            undefined,
            'mcp/stopRuntimeServer/error',
          );
        }
      },

      updateRuntimeServerConfig: async (port?: number, enabledTools?: string[]) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/updateRuntimeServerConfig/start');
        try {
          await McpClient.updateRuntimeServerConfig(port, enabledTools);
          await get().getRuntimeServerConfig();
          set({ isLoading: false }, undefined, 'mcp/updateRuntimeServerConfig/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error ? error.message : 'Failed to update runtime server config',
              isLoading: false,
            },
            undefined,
            'mcp/updateRuntimeServerConfig/error',
          );
        }
      },

      refreshRuntimeServerStatus: async () => {
        try {
          const runtimeServerStatus = await McpClient.getRuntimeServerStatus();
          set({ runtimeServerStatus, error: null }, undefined, 'mcp/refreshRuntimeServerStatus');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to get runtime server status',
            },
            undefined,
            'mcp/refreshRuntimeServerStatus/error',
          );
        }
      },

      refreshRuntimeServerTools: async () => {
        try {
          const result = await McpClient.listRuntimeServerTools();
          set(
            { runtimeServerTools: result.tools, error: null },
            undefined,
            'mcp/refreshRuntimeServerTools',
          );
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to list runtime server tools',
            },
            undefined,
            'mcp/refreshRuntimeServerTools/error',
          );
        }
      },

      // --- Filesystem directories ---

      updateFilesystemDirectories: async (directories: string[]) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/updateFilesystemDirectories/start');
        try {
          await McpClient.updateFilesystemDirectories(directories);
          await get().refreshServers();
          set({ isLoading: false }, undefined, 'mcp/updateFilesystemDirectories/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error ? error.message : 'Failed to update filesystem directories',
              isLoading: false,
            },
            undefined,
            'mcp/updateFilesystemDirectories/error',
          );
        }
      },

      // --- API key management ---

      saveApiKey: async (provider: string, key: string) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/saveApiKey/start');
        try {
          await McpClient.saveApiKey(provider, key);
          set({ isLoading: false }, undefined, 'mcp/saveApiKey/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error ? error.message : `Failed to save API key for '${provider}'`,
              isLoading: false,
            },
            undefined,
            'mcp/saveApiKey/error',
          );
        }
      },

      // --- OAuth credentials management ---

      oauthSetCredentials: async (
        provider: McpOAuthProvider,
        clientId: string,
        clientSecret: string,
      ) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/oauthSetCredentials/start');
        try {
          await McpClient.oauthSetCredentials(provider, clientId, clientSecret);
          set({ isLoading: false }, undefined, 'mcp/oauthSetCredentials/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to set OAuth credentials for '${provider}'`,
              isLoading: false,
            },
            undefined,
            'mcp/oauthSetCredentials/error',
          );
        }
      },

      oauthGetAllStatuses: async () => {
        try {
          const statuses = await McpClient.oauthGetAllStatuses();
          set({ error: null }, undefined, 'mcp/oauthGetAllStatuses');
          return statuses;
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to get all OAuth statuses',
            },
            undefined,
            'mcp/oauthGetAllStatuses/error',
          );
          throw error;
        }
      },

      oauthNeedsRefresh: async (provider: McpOAuthProvider) => {
        try {
          return await McpClient.oauthNeedsRefresh(provider);
        } catch {
          return false;
        }
      },

      getOAuthProviders: () => {
        return McpClient.getOAuthProviders();
      },

      // --- Extension detail operations ---

      getExtension: async (extensionId: string) => {
        try {
          const extension = await McpClient.getExtension(extensionId);
          set({ error: null }, undefined, 'mcp/getExtension');
          return extension;
        } catch (error) {
          set(
            {
              error:
                error instanceof Error ? error.message : `Failed to get extension '${extensionId}'`,
            },
            undefined,
            'mcp/getExtension/error',
          );
          throw error;
        }
      },

      selectExtensionPackage: async () => {
        try {
          return await McpClient.selectExtensionPackage();
        } catch (error) {
          set(
            {
              error:
                error instanceof Error ? error.message : 'Failed to open extension file picker',
            },
            undefined,
            'mcp/selectExtensionPackage/error',
          );
          return null;
        }
      },

      listExtensionsByStatus: async (status: string) => {
        try {
          return await McpClient.listExtensionsByStatus(status);
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to list extensions by status '${status}'`,
            },
            undefined,
            'mcp/listExtensionsByStatus/error',
          );
          return [];
        }
      },

      getExtensionsDirectory: async () => {
        try {
          return await McpClient.getExtensionsDirectory();
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to get extensions directory',
            },
            undefined,
            'mcp/getExtensionsDirectory/error',
          );
          throw error;
        }
      },

      getExtensionConfig: async (extensionId: string) => {
        try {
          return await McpClient.getExtensionConfig(extensionId);
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to get config for extension '${extensionId}'`,
            },
            undefined,
            'mcp/getExtensionConfig/error',
          );
          throw error;
        }
      },

      setExtensionConfig: async (extensionId: string, config: Record<string, unknown>) => {
        set({ isLoading: true, error: null }, undefined, 'mcp/setExtensionConfig/start');
        try {
          await McpClient.setExtensionConfig(extensionId, config);
          await get().refreshExtensions();
          set({ isLoading: false }, undefined, 'mcp/setExtensionConfig/success');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : `Failed to set config for extension '${extensionId}'`,
              isLoading: false,
            },
            undefined,
            'mcp/setExtensionConfig/error',
          );
        }
      },

      // --- UI state ---

      setSelectedServer: (name: string | null) => {
        set({ selectedServer: name }, undefined, 'mcp/setSelectedServer');
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query }, undefined, 'mcp/setSearchQuery');
      },

      clearError: () => {
        set({ error: null }, undefined, 'mcp/clearError');
      },

      // AUDIT-006-019 fix: Add resetOnLogout function for cleanup
      resetOnLogout: () => {
        set(
          {
            servers: [],
            tools: [],
            toolSchemas: [],
            config: null,
            configLocation: null,
            stats: {},
            health: [],
            executionHistory: [],
            toolExecutionStats: [],
            registry: [],
            extensions: [],
            connectorManifests: [],
            connectedProviders: [],
            runtimeServerConfig: null,
            runtimeServerStatus: false,
            runtimeServerTools: [],
            isInitialized: false,
            isLoading: false,
            error: null,
            selectedServer: null,
            searchQuery: '',
          },
          undefined,
          'mcp/resetOnLogout',
        );
      },
    })),
    { name: 'McpStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectMcpServers = (state: McpState) => state.servers;
export const selectMcpTools = (state: McpState) => state.tools;
export const selectMcpToolSchemas = (state: McpState) => state.toolSchemas;
export const selectMcpConfig = (state: McpState) => state.config;
export const selectMcpConfigLocation = (state: McpState) => state.configLocation;
export const selectMcpStats = (state: McpState) => state.stats;
export const selectMcpHealth = (state: McpState) => state.health;
export const selectMcpExecutionHistory = (state: McpState) => state.executionHistory;
export const selectMcpToolExecutionStats = (state: McpState) => state.toolExecutionStats;
export const selectMcpRegistry = (state: McpState) => state.registry;
export const selectMcpExtensions = (state: McpState) => state.extensions;
export const selectMcpConnectorManifests = (state: McpState) => state.connectorManifests;
export const selectMcpConnectedProviders = (state: McpState) => state.connectedProviders;
export const selectMcpRuntimeServerConfig = (state: McpState) => state.runtimeServerConfig;
export const selectMcpRuntimeServerStatus = (state: McpState) => state.runtimeServerStatus;
export const selectMcpRuntimeServerTools = (state: McpState) => state.runtimeServerTools;
export const selectMcpIsInitialized = (state: McpState) => state.isInitialized;
export const selectMcpIsLoading = (state: McpState) => state.isLoading;
export const selectMcpError = (state: McpState) => state.error;
export const selectMcpSelectedServer = (state: McpState) => state.selectedServer;
export const selectMcpSearchQuery = (state: McpState) => state.searchQuery;

// Derived selectors
export const selectConnectedServers = (state: McpState) =>
  state.servers.filter((server) => server.connected);
export const selectDisconnectedServers = (state: McpState) =>
  state.servers.filter((server) => !server.connected);
export const selectServerByName = (name: string) => (state: McpState) =>
  state.servers.find((server) => server.name === name);
export const selectToolsByServer = (serverName: string) => (state: McpState) =>
  state.tools.filter((tool) => tool.server === serverName);
export const selectToolCount = (state: McpState) => state.tools.length;
export const selectServerCount = (state: McpState) => state.servers.length;
