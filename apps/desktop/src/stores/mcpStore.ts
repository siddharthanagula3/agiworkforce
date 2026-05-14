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
import { isTauri, invoke } from '../lib/tauri-mock';
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
  activeOperations: number;
  /** Derived from activeOperations > 0. Do not set directly. */
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
    subscribeWithSelector((set, get) => {
      /** Increment the active-operation counter; derives isLoading. */
      function startOp(): void {
        const next = (get().activeOperations ?? 0) + 1;
        set({ activeOperations: next, isLoading: true });
      }
      /** Decrement the active-operation counter; derives isLoading. */
      function endOp(): void {
        const next = Math.max(0, (get().activeOperations ?? 1) - 1);
        set({ activeOperations: next, isLoading: next > 0 });
      }

      return {
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
        activeOperations: 0,
        isLoading: false,
        error: null,
        selectedServer: null,
        searchQuery: '',

        initialize: async () => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/initialize/start');
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
            endOp();
            set({ isInitialized: true }, undefined, 'mcp/initialize/success');
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : 'Initialization failed',
              },
              undefined,
              'mcp/initialize/error',
            );
          }
        },

        refreshServers: async () => {
          if (!isTauri) return;
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
          if (!isTauri) return;
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
          if (!isTauri) return;
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
          if (!isTauri) return;
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
          if (!isTauri) return;
          try {
            const health = await McpClient.checkServerHealth(name);
            get().upsertServerHealth(health);
            set({ error: null }, undefined, 'mcp/checkServerHealth');
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error ? error.message : `Failed to check health for ${name}`,
              },
              undefined,
              'mcp/checkServerHealth/error',
            );
          }
        },

        refreshExecutionHistory: async (limit = 20) => {
          if (!isTauri) return;
          try {
            const executionHistory = await McpClient.getExecutionHistory(limit);
            set({ executionHistory, error: null }, undefined, 'mcp/refreshExecutionHistory');
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error ? error.message : 'Failed to get MCP execution history',
              },
              undefined,
              'mcp/refreshExecutionHistory/error',
            );
          }
        },

        refreshToolExecutionStats: async () => {
          if (!isTauri) return;
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
          if (!isTauri) return;
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
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/connectServer/start');
          try {
            await McpClient.connect(name);
            await get().refreshServers();
            await get().refreshTools();
            await get().refreshRuntimeTelemetry();
            endOp(); // mcp/connectServer/success
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : `Failed to connect to ${name}`,
              },
              undefined,
              'mcp/connectServer/error',
            );
          }
        },

        disconnectServer: async (name: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/disconnectServer/start');
          try {
            await McpClient.disconnect(name);
            await get().refreshServers();
            await get().refreshTools();
            await get().refreshRuntimeTelemetry();
            endOp(); // mcp/disconnectServer/success
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : `Failed to disconnect from ${name}`,
              },
              undefined,
              'mcp/disconnectServer/error',
            );
          }
        },

        enableServer: async (name: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/enableServer/start');
          try {
            await McpClient.enableServer(name);
            await get().refreshServers();
            await get().refreshHealth();
            endOp(); // mcp/enableServer/success
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : `Failed to enable ${name}`,
              },
              undefined,
              'mcp/enableServer/error',
            );
          }
        },

        disableServer: async (name: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/disableServer/start');
          try {
            await McpClient.disableServer(name);
            await get().refreshServers();
            await get().refreshHealth();
            endOp(); // mcp/disableServer/success
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : `Failed to disable ${name}`,
              },
              undefined,
              'mcp/disableServer/error',
            );
          }
        },

        loadConfig: async () => {
          if (!isTauri) return;
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
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/updateConfig/start');
          try {
            await McpClient.updateConfig(config);
            endOp();
            set({ config }, undefined, 'mcp/updateConfig/success');
            await get().refreshConfigLocation();
            await get().refreshServers();
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to update config',
              },
              undefined,
              'mcp/updateConfig/error',
            );
          }
        },

        storeCredential: async (serverName: string, key: string, value: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/storeCredential/start');
          try {
            await McpClient.storeCredential(serverName, key, value);
            endOp(); // mcp/storeCredential/success
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to store credential',
              },
              undefined,
              'mcp/storeCredential/error',
            );
          }
        },

        setCredential: async (serverName: string, key: string, value: string) => {
          if (!isTauri) return;
          if (!serverName.trim() || !key.trim()) {
            set(
              { error: 'Server name and key are required' },
              undefined,
              'mcp/setCredential/validationError',
            );
            return;
          }
          startOp();
          set({ error: null }, undefined, 'mcp/setCredential/start');
          try {
            await McpClient.setCredential(serverName, key, value);
            endOp(); // mcp/setCredential/success
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to set credential',
              },
              undefined,
              'mcp/setCredential/error',
            );
          }
        },

        deleteCredential: async (serverName: string, key: string) => {
          if (!isTauri) return;
          if (!serverName.trim() || !key.trim()) {
            set(
              { error: 'Server name and key are required' },
              undefined,
              'mcp/deleteCredential/validationError',
            );
            return;
          }
          startOp();
          set({ error: null }, undefined, 'mcp/deleteCredential/start');
          try {
            await McpClient.deleteCredential(serverName, key);
            endOp(); // mcp/deleteCredential/success
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to delete credential',
              },
              undefined,
              'mcp/deleteCredential/error',
            );
          }
        },

        refreshConfigLocation: async () => {
          if (!isTauri) return;
          try {
            const configLocation = await McpClient.getConfigLocation();
            set({ configLocation, error: null }, undefined, 'mcp/refreshConfigLocation');
          } catch (error) {
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to get MCP config location',
              },
              undefined,
              'mcp/refreshConfigLocation/error',
            );
          }
        },

        searchTools: async (query: string) => {
          if (!isTauri) return;
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
          if (!isTauri) return undefined;
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
          if (!isTauri) return;
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
          if (!isTauri) return;
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
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/installServer/start');
          try {
            await McpClient.installServer(serverId);
            await get().refreshServers();
            await get().refreshRegistry();
            endOp(); // mcp/installServer/success
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error ? error.message : `Failed to install server '${serverId}'`,
              },
              undefined,
              'mcp/installServer/error',
            );
          }
        },

        // --- Server logs ---

        getServerLogs: async (serverName: string, lines?: number) => {
          if (!isTauri) return [];
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
          if (!isTauri) throw new Error('OAuth not available outside Tauri');
          try {
            return await McpClient.oauthStart(provider);
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to start OAuth for '${provider}'`,
              },
              undefined,
              'mcp/oauthStart/error',
            );
            throw error;
          }
        },

        oauthCallback: async (provider: McpOAuthProvider, code: string, callbackState: string) => {
          if (!isTauri) throw new Error('OAuth not available outside Tauri');
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
          if (!isTauri) return { connected: false, userInfo: null, expiresAt: null };
          try {
            return await McpClient.oauthStatus(provider);
          } catch (error) {
            console.warn('[mcpStore] Failed to check OAuth status:', error);
            return { connected: false, userInfo: null, expiresAt: null };
          }
        },

        oauthDisconnect: async (provider: McpOAuthProvider) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/oauthDisconnect/start');
          try {
            await McpClient.oauthDisconnect(provider);
            await get().refreshConnectedProviders();
            endOp(); // mcp/oauthDisconnect/success
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to disconnect OAuth for '${provider}'`,
              },
              undefined,
              'mcp/oauthDisconnect/error',
            );
          }
        },

        oauthRefresh: async (provider: McpOAuthProvider) => {
          if (!isTauri) throw new Error('OAuth not available outside Tauri');
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
          if (!isTauri) return;
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
          if (!isTauri) throw new Error('Extensions not available outside Tauri');
          startOp();
          set({ error: null }, undefined, 'mcp/installExtension/start');
          try {
            const info = await McpClient.installExtension(filePath);
            await get().refreshExtensions();
            endOp(); // mcp/installExtension/success
            return info;
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to install extension',
              },
              undefined,
              'mcp/installExtension/error',
            );
            throw error;
          }
        },

        uninstallExtension: async (extensionId: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/uninstallExtension/start');
          try {
            await McpClient.uninstallExtension(extensionId);
            await get().refreshExtensions();
            endOp(); // mcp/uninstallExtension/success
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to uninstall extension '${extensionId}'`,
              },
              undefined,
              'mcp/uninstallExtension/error',
            );
          }
        },

        enableExtension: async (extensionId: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/enableExtension/start');
          try {
            await McpClient.enableExtension(extensionId);
            await get().refreshExtensions();
            endOp(); // mcp/enableExtension/success
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to enable extension '${extensionId}'`,
              },
              undefined,
              'mcp/enableExtension/error',
            );
          }
        },

        disableExtension: async (extensionId: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/disableExtension/start');
          try {
            await McpClient.disableExtension(extensionId);
            await get().refreshExtensions();
            endOp(); // mcp/disableExtension/success
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to disable extension '${extensionId}'`,
              },
              undefined,
              'mcp/disableExtension/error',
            );
          }
        },

        validateExtensionPackage: async (filePath: string) => {
          if (!isTauri) throw new Error('Extensions not available outside Tauri');
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
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/startAllExtensions/start');
          try {
            await McpClient.startAllExtensions();
            await get().refreshExtensions();
            endOp(); // mcp/startAllExtensions/success
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to start all extensions',
              },
              undefined,
              'mcp/startAllExtensions/error',
            );
          }
        },

        stopAllExtensions: async () => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/stopAllExtensions/start');
          try {
            await McpClient.stopAllExtensions();
            await get().refreshExtensions();
            endOp(); // mcp/stopAllExtensions/success
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to stop all extensions',
              },
              undefined,
              'mcp/stopAllExtensions/error',
            );
          }
        },

        // --- Connectors ---

        refreshConnectedProviders: async () => {
          if (!isTauri) return;
          try {
            const connectedProviders = await McpClient.listConnectedProviders();
            set({ connectedProviders, error: null }, undefined, 'mcp/refreshConnectedProviders');
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error ? error.message : 'Failed to list connected providers',
              },
              undefined,
              'mcp/refreshConnectedProviders/error',
            );
          }
        },

        connectConnector: async (connectorId: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/connectConnector/start');
          try {
            await McpClient.connectConnector(connectorId);
            await get().refreshServers();
            await get().refreshTools();
            await get().refreshConnectedProviders();
            endOp(); // mcp/connectConnector/success
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to connect connector '${connectorId}'`,
              },
              undefined,
              'mcp/connectConnector/error',
            );
          }
        },

        refreshConnectorManifests: async () => {
          if (!isTauri) return;
          try {
            const connectorManifests = await McpClient.getConnectorManifests();
            set({ connectorManifests, error: null }, undefined, 'mcp/refreshConnectorManifests');
          } catch (error) {
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to get connector manifests',
              },
              undefined,
              'mcp/refreshConnectorManifests/error',
            );
          }
        },

        // --- Runtime server management ---

        getRuntimeServerConfig: async () => {
          if (!isTauri) throw new Error('Runtime server not available outside Tauri');
          try {
            const runtimeServerConfig = await McpClient.getRuntimeServerConfig();
            set({ runtimeServerConfig, error: null }, undefined, 'mcp/getRuntimeServerConfig');
            return runtimeServerConfig;
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error ? error.message : 'Failed to get runtime server config',
              },
              undefined,
              'mcp/getRuntimeServerConfig/error',
            );
            throw error;
          }
        },

        startRuntimeServer: async () => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/startRuntimeServer/start');
          try {
            await McpClient.startRuntimeServer();
            endOp();
            set({ runtimeServerStatus: true }, undefined, 'mcp/startRuntimeServer/success');
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to start runtime server',
              },
              undefined,
              'mcp/startRuntimeServer/error',
            );
          }
        },

        stopRuntimeServer: async () => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/stopRuntimeServer/start');
          try {
            await McpClient.stopRuntimeServer();
            endOp();
            set({ runtimeServerStatus: false }, undefined, 'mcp/stopRuntimeServer/success');
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to stop runtime server',
              },
              undefined,
              'mcp/stopRuntimeServer/error',
            );
          }
        },

        updateRuntimeServerConfig: async (port?: number, enabledTools?: string[]) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/updateRuntimeServerConfig/start');
          try {
            await McpClient.updateRuntimeServerConfig(port, enabledTools);
            await get().getRuntimeServerConfig();
            endOp(); // mcp/updateRuntimeServerConfig/success
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error ? error.message : 'Failed to update runtime server config',
              },
              undefined,
              'mcp/updateRuntimeServerConfig/error',
            );
          }
        },

        refreshRuntimeServerStatus: async () => {
          if (!isTauri) return;
          try {
            const runtimeServerStatus = await McpClient.getRuntimeServerStatus();
            set({ runtimeServerStatus, error: null }, undefined, 'mcp/refreshRuntimeServerStatus');
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error ? error.message : 'Failed to get runtime server status',
              },
              undefined,
              'mcp/refreshRuntimeServerStatus/error',
            );
          }
        },

        refreshRuntimeServerTools: async () => {
          if (!isTauri) return;
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
                error:
                  error instanceof Error ? error.message : 'Failed to list runtime server tools',
              },
              undefined,
              'mcp/refreshRuntimeServerTools/error',
            );
          }
        },

        // --- Filesystem directories ---

        updateFilesystemDirectories: async (directories: string[]) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/updateFilesystemDirectories/start');
          try {
            await McpClient.updateFilesystemDirectories(directories);
            await get().refreshServers();
            endOp(); // mcp/updateFilesystemDirectories/success
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : 'Failed to update filesystem directories',
              },
              undefined,
              'mcp/updateFilesystemDirectories/error',
            );
          }
        },

        // --- API key management ---

        saveApiKey: async (provider: string, key: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/saveApiKey/start');
          try {
            await McpClient.saveApiKey(provider, key);
            endOp(); // mcp/saveApiKey/success
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to save API key for '${provider}'`,
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
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/oauthSetCredentials/start');
          try {
            await McpClient.oauthSetCredentials(provider, clientId, clientSecret);
            endOp(); // mcp/oauthSetCredentials/success
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to set OAuth credentials for '${provider}'`,
              },
              undefined,
              'mcp/oauthSetCredentials/error',
            );
          }
        },

        oauthGetAllStatuses: async () => {
          if (!isTauri) throw new Error('OAuth not available outside Tauri');
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
          if (!isTauri) return false;
          try {
            return await McpClient.oauthNeedsRefresh(provider);
          } catch (error) {
            console.warn('[mcpStore] oauthNeedsRefresh failed:', error);
            return false;
          }
        },

        getOAuthProviders: () => {
          return McpClient.getOAuthProviders();
        },

        // --- Extension detail operations ---

        getExtension: async (extensionId: string) => {
          if (!isTauri) throw new Error('Extensions not available outside Tauri');
          try {
            const extension = await McpClient.getExtension(extensionId);
            set({ error: null }, undefined, 'mcp/getExtension');
            return extension;
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to get extension '${extensionId}'`,
              },
              undefined,
              'mcp/getExtension/error',
            );
            throw error;
          }
        },

        selectExtensionPackage: async () => {
          if (!isTauri) return null;
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
          if (!isTauri) return [];
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
          if (!isTauri) throw new Error('Extensions not available outside Tauri');
          try {
            return await McpClient.getExtensionsDirectory();
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error ? error.message : 'Failed to get extensions directory',
              },
              undefined,
              'mcp/getExtensionsDirectory/error',
            );
            throw error;
          }
        },

        getExtensionConfig: async (extensionId: string) => {
          if (!isTauri) throw new Error('Extensions not available outside Tauri');
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
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/setExtensionConfig/start');
          try {
            await McpClient.setExtensionConfig(extensionId, config);
            await get().refreshExtensions();
            endOp(); // mcp/setExtensionConfig/success
          } catch (error) {
            endOp();
            set(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : `Failed to set config for extension '${extensionId}'`,
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
              activeOperations: 0,
              isLoading: false,
              error: null,
              selectedServer: null,
              searchQuery: '',
            },
            undefined,
            'mcp/resetOnLogout',
          );
        },
      };
    }),
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

// ============================================================================
// MCP App Store (absorbed from mcpAppStore.ts — task-w58)
// ============================================================================

export interface McpAppContent {
  type: 'html' | 'url';
  payload: string;
  height?: number;
  allowedOrigins?: string[];
}

export interface McpInteraction {
  timestamp: number;
  type: 'user_action' | 'data_update';
  data: Record<string, unknown>;
}

export interface McpApp {
  id: string;
  toolName: string;
  mcpServer: string;
  content: McpAppContent;
  timestamp: number;
  interactionLog: McpInteraction[];
}

interface McpAppState {
  apps: Record<string, McpApp>;
  registerApp: (toolName: string, mcpServer: string, content: McpAppContent) => string;
  updateApp: (id: string, content: Partial<McpAppContent>) => void;
  recordInteraction: (id: string, interaction: McpInteraction) => void;
  removeApp: (id: string) => void;
  clearAll: () => void;
  getAppsArray: () => McpApp[];
}

export const useMcpAppStore = create<McpAppState>()(
  devtools(
    (set, get) => ({
      apps: {},
      registerApp: (toolName, mcpServer, content) => {
        const id = `mcp-app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const app: McpApp = {
          id,
          toolName,
          mcpServer,
          content,
          timestamp: Date.now(),
          interactionLog: [],
        };
        set((state) => ({ apps: { ...state.apps, [id]: app } }), undefined, 'mcpApp/registerApp');
        return id;
      },
      updateApp: (id, contentUpdate) => {
        set(
          (state) => {
            const existing = state.apps[id];
            if (!existing) return state;
            return {
              apps: {
                ...state.apps,
                [id]: { ...existing, content: { ...existing.content, ...contentUpdate } },
              },
            };
          },
          undefined,
          'mcpApp/updateApp',
        );
      },
      recordInteraction: (id, interaction) => {
        set(
          (state) => {
            const existing = state.apps[id];
            if (!existing) return state;
            return {
              apps: {
                ...state.apps,
                [id]: { ...existing, interactionLog: [...existing.interactionLog, interaction] },
              },
            };
          },
          undefined,
          'mcpApp/recordInteraction',
        );
      },
      removeApp: (id) => {
        set(
          (state) => {
            const next = { ...state.apps };
            delete next[id];
            return { apps: next };
          },
          undefined,
          'mcpApp/removeApp',
        );
      },
      clearAll: () => set({ apps: {} }, undefined, 'mcpApp/clearAll'),
      getAppsArray: () => Object.values(get().apps).sort((a, b) => b.timestamp - a.timestamp),
    }),
    { name: 'McpAppStore', enabled: import.meta.env.DEV },
  ),
);

export const selectMcpApps = (state: McpAppState) => state.apps;
export const selectMcpAppCount = (state: McpAppState) => Object.keys(state.apps).length;
export const selectMcpAppById = (id: string) => (state: McpAppState) => state.apps[id];
export const selectMcpAppsByServer = (server: string) => (state: McpAppState) =>
  Object.values(state.apps).filter((app) => app.mcpServer === server);

// ============================================================================
// MCPB Bundle Store (absorbed from mcpbStore.ts — task-w58)
// ============================================================================

import { listen as mcpbListen } from '../lib/tauri-mock';
import type {
  McpBundle,
  McpBundleCategory,
  BundleInstallProgress,
  BundleInstallStatus,
} from '../types/mcp';

interface McpbInstallProgressEvent {
  bundleId: string;
  phase: string;
  progress: number;
  message: string;
}

const mcpbApi = {
  fetchRegistry: () => invoke<McpBundle[]>('mcpb_fetch_registry'),
  searchBundles: (query: string) => invoke<McpBundle[]>('mcpb_search_bundles', { query }),
  installBundle: (bundleId: string) => invoke<void>('mcpb_install_bundle', { bundleId }),
  uninstallBundle: (bundleId: string) => invoke<void>('mcpb_uninstall_bundle', { bundleId }),
  getBundleDetails: (bundleId: string) =>
    invoke<McpBundle>('mcpb_get_bundle_details', { bundleId }),
  checkUpdates: () => invoke<McpBundle[]>('mcpb_check_updates'),
  updateBundle: (bundleId: string) => invoke<void>('mcpb_update_bundle', { bundleId }),
  getInstalledBundles: () => invoke<McpBundle[]>('mcpb_get_installed_bundles'),
  getCategories: () => invoke<McpBundleCategory[]>('mcpb_get_categories'),
  getFeaturedBundles: () => invoke<McpBundle[]>('mcpb_get_featured'),
};

interface McpbState {
  bundles: McpBundle[];
  installedBundles: McpBundle[];
  featuredBundles: McpBundle[];
  categories: McpBundleCategory[];
  selectedCategory: McpBundleCategory | null;
  searchQuery: string;
  isMcpbLoading: boolean;
  isInstalling: boolean;
  installProgress: BundleInstallProgress | null;
  mcpbError: string | null;
  fetchRegistry: () => Promise<void>;
  searchBundles: (query: string) => Promise<void>;
  filterByCategory: (category: McpBundleCategory | null) => void;
  installBundle: (bundleId: string) => Promise<void>;
  uninstallBundle: (bundleId: string) => Promise<void>;
  getBundleDetails: (bundleId: string) => Promise<McpBundle | null>;
  checkUpdates: () => Promise<void>;
  updateBundle: (bundleId: string) => Promise<void>;
  clearMcpbError: () => void;
  setInstallProgress: (progress: BundleInstallProgress | null) => void;
  resetOnLogout: () => void;
}

export const useMcpbStore = create<McpbState>()(
  devtools(
    subscribeWithSelector((set) => ({
      bundles: [],
      installedBundles: [],
      featuredBundles: [],
      categories: [],
      selectedCategory: null,
      searchQuery: '',
      isMcpbLoading: false,
      isInstalling: false,
      installProgress: null,
      mcpbError: null,

      fetchRegistry: async () => {
        set({ isMcpbLoading: true, mcpbError: null });
        try {
          const [bundles, categories, featuredBundles, installedBundles] = await Promise.all([
            mcpbApi.fetchRegistry(),
            mcpbApi.getCategories(),
            mcpbApi.getFeaturedBundles(),
            mcpbApi.getInstalledBundles(),
          ]);
          set({ bundles, categories, featuredBundles, installedBundles, isMcpbLoading: false });
        } catch (err) {
          set({
            mcpbError: err instanceof Error ? err.message : String(err),
            isMcpbLoading: false,
          });
        }
      },

      searchBundles: async (query: string) => {
        set({ searchQuery: query, isMcpbLoading: true });
        try {
          const bundles = query.trim()
            ? await mcpbApi.searchBundles(query)
            : await mcpbApi.fetchRegistry();
          set({ bundles, isMcpbLoading: false });
        } catch (err) {
          set({
            mcpbError: err instanceof Error ? err.message : String(err),
            isMcpbLoading: false,
          });
        }
      },

      filterByCategory: (category) => set({ selectedCategory: category }),

      installBundle: async (bundleId: string) => {
        set({ isInstalling: true, mcpbError: null });
        try {
          await mcpbApi.installBundle(bundleId);
          const installedBundles = await mcpbApi.getInstalledBundles();
          set({ installedBundles, isInstalling: false });
        } catch (err) {
          set({ mcpbError: err instanceof Error ? err.message : String(err), isInstalling: false });
          throw err;
        }
      },

      uninstallBundle: async (bundleId: string) => {
        set({ isMcpbLoading: true, mcpbError: null });
        try {
          await mcpbApi.uninstallBundle(bundleId);
          const installedBundles = await mcpbApi.getInstalledBundles();
          set({ installedBundles, isMcpbLoading: false });
        } catch (err) {
          set({
            mcpbError: err instanceof Error ? err.message : String(err),
            isMcpbLoading: false,
          });
          throw err;
        }
      },

      getBundleDetails: async (bundleId: string) => {
        try {
          return await mcpbApi.getBundleDetails(bundleId);
        } catch {
          return null;
        }
      },

      checkUpdates: async () => {
        set({ isMcpbLoading: true });
        try {
          const bundlesWithUpdates = await mcpbApi.checkUpdates();
          set((state) => {
            const updateMap = new Map(bundlesWithUpdates.map((b) => [b.id, b]));
            return {
              installedBundles: state.installedBundles.map((b) => updateMap.get(b.id) ?? b),
              isMcpbLoading: false,
            };
          });
        } catch (err) {
          set({
            mcpbError: err instanceof Error ? err.message : String(err),
            isMcpbLoading: false,
          });
        }
      },

      updateBundle: async (bundleId: string) => {
        set({ isInstalling: true, mcpbError: null });
        try {
          await mcpbApi.updateBundle(bundleId);
          const installedBundles = await mcpbApi.getInstalledBundles();
          set({ installedBundles, isInstalling: false });
        } catch (err) {
          set({ mcpbError: err instanceof Error ? err.message : String(err), isInstalling: false });
          throw err;
        }
      },

      clearMcpbError: () => set({ mcpbError: null }),
      setInstallProgress: (progress) => set({ installProgress: progress }),

      resetOnLogout: () =>
        set({
          bundles: [],
          installedBundles: [],
          featuredBundles: [],
          categories: [],
          selectedCategory: null,
          searchQuery: '',
          isMcpbLoading: false,
          isInstalling: false,
          installProgress: null,
          mcpbError: null,
        }),
    })),
    { name: 'McpbStore', enabled: import.meta.env.DEV },
  ),
);

const KNOWN_PHASES = new Set<BundleInstallStatus>([
  'pending',
  'downloading',
  'installing',
  'configuring',
  'completed',
  'failed',
]);

function toInstallStatus(phase: string): BundleInstallStatus {
  return KNOWN_PHASES.has(phase as BundleInstallStatus)
    ? (phase as BundleInstallStatus)
    : 'installing';
}

let mcpbInstallListenerInitialized = false;

export async function initializeMcpbInstallListener(): Promise<void> {
  if (mcpbInstallListenerInitialized) return;
  mcpbInstallListenerInitialized = true;
  try {
    await mcpbListen<McpbInstallProgressEvent>('mcpb:install_progress', (event) => {
      const { bundleId, phase, progress, message } = event.payload;
      useMcpbStore
        .getState()
        .setInstallProgress({ bundleId, status: toInstallStatus(phase), progress, message });
    });
  } catch (error) {
    mcpbInstallListenerInitialized = false;
    console.error('[McpbStore] Failed to initialize mcpb:install_progress listener:', error);
  }
}

export const selectMcpbBundles = (state: McpbState) => state.bundles;
export const selectMcpbInstalled = (state: McpbState) => state.installedBundles;
export const selectMcpbBundleById = (bundleId: string) => (state: McpbState) =>
  state.bundles.find((b) => b.id === bundleId) ||
  state.installedBundles.find((b) => b.id === bundleId);
export const selectBundlesWithUpdates = (state: McpbState) =>
  state.installedBundles.filter((bundle) => bundle.updateAvailable);

// =============================================================================
// MCP Server Store (absorbed from mcpServerStore.ts — task-w58)
// =============================================================================

interface McpServerToolEntry {
  name: string;
  description?: string;
  [key: string]: unknown;
}

interface McpServerStore {
  config: import('@/types/mcp').McpRuntimeServerConfig | null;
  isRunning: boolean;
  tools: McpServerToolEntry[];
  loading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  fetchTools: () => Promise<void>;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  updateConfig: (port?: number, enabledTools?: string[]) => Promise<void>;
}

export const useMcpServerStore = create<McpServerStore>()(
  devtools(
    (set, get) => ({
      config: null,
      isRunning: false,
      tools: [],
      loading: false,
      error: null,

      fetchConfig: async () => {
        set({ loading: true, error: null }, undefined, 'mcpServer/fetchConfig/start');
        try {
          const config = await McpClient.getRuntimeServerConfig();
          set(
            { config, isRunning: config.running, error: null, loading: false },
            undefined,
            'mcpServer/fetchConfig/success',
          );
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error), loading: false },
            undefined,
            'mcpServer/fetchConfig/error',
          );
        }
      },

      fetchStatus: async () => {
        try {
          const isRunning = await McpClient.getRuntimeServerStatus();
          set({ isRunning, error: null }, undefined, 'mcpServer/fetchStatus');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error) },
            undefined,
            'mcpServer/fetchStatus/error',
          );
        }
      },

      fetchTools: async () => {
        try {
          const result = await McpClient.listRuntimeServerTools();
          const tools = (result.tools ?? []) as McpServerToolEntry[];
          set({ tools, error: null }, undefined, 'mcpServer/fetchTools');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error) },
            undefined,
            'mcpServer/fetchTools/error',
          );
        }
      },

      startServer: async () => {
        set({ loading: true, error: null }, undefined, 'mcpServer/start/start');
        try {
          await McpClient.startRuntimeServer();
          await get().fetchConfig();
          await get().fetchTools();
          set({ loading: false }, undefined, 'mcpServer/start/success');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error), loading: false },
            undefined,
            'mcpServer/start/error',
          );
        }
      },

      stopServer: async () => {
        set({ loading: true, error: null }, undefined, 'mcpServer/stop/start');
        try {
          await McpClient.stopRuntimeServer();
          await get().fetchConfig();
          set({ tools: [] }, undefined, 'mcpServer/stop/clearTools');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error), loading: false },
            undefined,
            'mcpServer/stop/error',
          );
        }
      },

      updateConfig: async (port?: number, enabledTools?: string[]) => {
        set({ loading: true, error: null }, undefined, 'mcpServer/updateConfig/start');
        try {
          await McpClient.updateRuntimeServerConfig(port, enabledTools);
          await get().fetchConfig();
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error), loading: false },
            undefined,
            'mcpServer/updateConfig/error',
          );
        }
      },
    }),
    { name: 'McpServerStore', enabled: import.meta.env.DEV },
  ),
);
