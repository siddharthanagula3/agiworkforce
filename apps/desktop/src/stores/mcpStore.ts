/**
 * MCP Store — thin barrel
 *
 * The four domain sub-stores live in stores/mcp/:
 *   mcpServersStore  — server registry, lifecycle, config, connectors, runtime
 *   mcpToolsStore    — tool catalog, search, execution, history
 *   mcpHealthStore   — health-check loop, per-server health, stats
 *   mcpOAuthStore    — OAuth flow, extensions
 *
 * useMcpStore is a facade that merges all four domains into the original
 * flat interface so that existing consumers need no changes.
 */
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { isTauri } from '../lib/tauri-mock';
import { McpClient } from '../api/mcp';

// Re-export everything from the sub-stores so that any import of a named
// export from 'stores/mcpStore' continues to resolve.
export * from './mcp/mcpServersStore';
export * from './mcp/mcpToolsStore';
export * from './mcp/mcpHealthStore';
export * from './mcp/mcpOAuthStore';

// Re-export the absorbed sub-stores so that any import of their named
// exports from 'stores/mcpStore' resolves (task-w58 placed them here).
export * from './mcpAppStore';
export * from './mcpbStore';
export * from './mcpServerStore';

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
import type { ConnectorManifest } from '../api/mcp';

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
  isLoading: boolean;
  error: string | null;
  selectedServer: string | null;
  searchQuery: string;

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
  connectServer: (name: string) => Promise<void>;
  disconnectServer: (name: string) => Promise<void>;
  loadConfig: () => Promise<void>;
  updateConfig: (config: McpServersConfig) => Promise<void>;
  refreshConfigLocation: () => Promise<void>;
  storeCredential: (serverName: string, key: string, value: string) => Promise<void>;
  setCredential: (serverName: string, key: string, value: string) => Promise<void>;
  deleteCredential: (serverName: string, key: string) => Promise<void>;
  enableServer: (name: string) => Promise<void>;
  disableServer: (name: string) => Promise<void>;
  searchTools: (query: string) => Promise<void>;
  callTool: (toolId: string, args: Record<string, unknown>) => Promise<unknown>;
  refreshToolSchemas: () => Promise<void>;
  refreshRegistry: () => Promise<void>;
  installServer: (serverId: string) => Promise<void>;
  getServerLogs: (serverName: string, lines?: number) => Promise<string[]>;
  oauthStart: (provider: McpOAuthProvider) => Promise<McpOAuthStartResponse>;
  oauthCallback: (
    provider: McpOAuthProvider,
    code: string,
    callbackState: string,
  ) => Promise<McpOAuthTokenResponse>;
  oauthStatus: (provider: McpOAuthProvider) => Promise<McpOAuthConnectionStatus>;
  oauthDisconnect: (provider: McpOAuthProvider) => Promise<void>;
  oauthRefresh: (provider: McpOAuthProvider) => Promise<McpOAuthTokenResponse>;
  refreshExtensions: () => Promise<void>;
  installExtension: (filePath: string) => Promise<McpExtensionInfo>;
  uninstallExtension: (extensionId: string) => Promise<void>;
  enableExtension: (extensionId: string) => Promise<void>;
  disableExtension: (extensionId: string) => Promise<void>;
  validateExtensionPackage: (filePath: string) => Promise<McpExtensionPackageInfo>;
  startAllExtensions: () => Promise<void>;
  stopAllExtensions: () => Promise<void>;
  refreshConnectedProviders: () => Promise<void>;
  connectConnector: (connectorId: string) => Promise<void>;
  refreshConnectorManifests: () => Promise<void>;
  runtimeServerConfig: McpRuntimeServerConfig | null;
  runtimeServerStatus: boolean;
  runtimeServerTools: unknown[];
  getRuntimeServerConfig: () => Promise<McpRuntimeServerConfig>;
  startRuntimeServer: () => Promise<void>;
  stopRuntimeServer: () => Promise<void>;
  updateRuntimeServerConfig: (port?: number, enabledTools?: string[]) => Promise<void>;
  refreshRuntimeServerStatus: () => Promise<void>;
  refreshRuntimeServerTools: () => Promise<void>;
  updateFilesystemDirectories: (directories: string[]) => Promise<void>;
  saveApiKey: (provider: string, key: string) => Promise<void>;
  oauthSetCredentials: (
    provider: McpOAuthProvider,
    clientId: string,
    clientSecret: string,
  ) => Promise<void>;
  oauthGetAllStatuses: () => Promise<Record<McpOAuthProvider, McpOAuthConnectionStatus>>;
  oauthNeedsRefresh: (provider: McpOAuthProvider) => Promise<boolean>;
  getOAuthProviders: () => McpOAuthProviderConfig[];
  getExtension: (extensionId: string) => Promise<McpExtensionInfo>;
  selectExtensionPackage: () => Promise<string | null>;
  listExtensionsByStatus: (status: string) => Promise<McpExtensionInfo[]>;
  getExtensionsDirectory: () => Promise<string>;
  getExtensionConfig: (extensionId: string) => Promise<Record<string, unknown>>;
  setExtensionConfig: (extensionId: string, config: Record<string, unknown>) => Promise<void>;
  setSelectedServer: (name: string | null) => void;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
  resetOnLogout: () => void;
}

export const useMcpStore = create<McpState>()(
  devtools(
    subscribeWithSelector((set, get) => {
      function startOp(): void {
        const next = (get().activeOperations ?? 0) + 1;
        set({ activeOperations: next, isLoading: true });
      }
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
            endOp();
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
            endOp();
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
            endOp();
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
            endOp();
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
            endOp();
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
            endOp();
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
            endOp();
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

        callTool: async (toolId: string, args: Record<string, unknown>) => {
          if (!isTauri) return undefined;
          try {
            const result = await McpClient.callTool(toolId, args);
            await get().refreshRuntimeTelemetry();
            return result;
          } catch (error) {
            set(
              {
                error: error instanceof Error ? error.message : `Failed to call tool '${toolId}'`,
              },
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
            endOp();
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
            endOp();
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
            endOp();
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
            endOp();
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
            endOp();
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
            endOp();
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
            endOp();
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
            endOp();
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
            endOp();
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
            endOp();
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

        updateFilesystemDirectories: async (directories: string[]) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/updateFilesystemDirectories/start');
          try {
            await McpClient.updateFilesystemDirectories(directories);
            await get().refreshServers();
            endOp();
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

        saveApiKey: async (provider: string, key: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/saveApiKey/start');
          try {
            await McpClient.saveApiKey(provider, key);
            endOp();
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
            endOp();
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
            endOp();
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

        setSelectedServer: (name: string | null) => {
          set({ selectedServer: name }, undefined, 'mcp/setSelectedServer');
        },

        setSearchQuery: (query: string) => {
          set({ searchQuery: query }, undefined, 'mcp/setSearchQuery');
        },

        clearError: () => {
          set({ error: null }, undefined, 'mcp/clearError');
        },

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

// Legacy selectors (re-exported from sub-stores where possible; kept here for
// consumers that import directly from 'stores/mcpStore').
export const selectMcpIsInitialized = (state: McpState) => state.isInitialized;
export const selectMcpIsLoading = (state: McpState) => state.isLoading;
export const selectMcpError = (state: McpState) => state.error;
