import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { isTauri } from '../lib/tauri-mock';
import { McpClient } from '../api/mcp';

export * from './mcpbStore';
export * from './mcpServerStore';

import type {
  McpConfigLocation,
  McpExtensionInfo,
  McpOAuthConnectionStatus,
  McpOAuthProvider,
  McpOAuthProviderConfig,
  McpOAuthStartResponse,
  McpOAuthTokenResponse,
  McpRuntimeServerConfig,
  McpServerHealth,
  McpServerInfo,
  McpToolInfo,
  McpServersConfig,
} from '../types/mcp';

interface McpState {
  servers: McpServerInfo[];
  tools: McpToolInfo[];
  config: McpServersConfig | null;
  configLocation: McpConfigLocation | null;
  stats: Record<string, number>;
  health: McpServerHealth[];
  extensions: McpExtensionInfo[];
  connectedProviders: string[];
  isInitialized: boolean;
  activeOperations: number;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;

  initialize: () => Promise<void>;
  refreshServers: () => Promise<void>;
  refreshTools: () => Promise<void>;
  refreshStats: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  refreshRuntimeTelemetry: () => Promise<void>;
  upsertServerHealth: (health: McpServerHealth) => void;
  connectServer: (name: string) => Promise<void>;
  disconnectServer: (name: string) => Promise<void>;
  loadConfig: () => Promise<void>;
  updateConfig: (config: McpServersConfig) => Promise<void>;
  refreshConfigLocation: () => Promise<void>;
  enableServer: (name: string) => Promise<void>;
  disableServer: (name: string) => Promise<void>;
  searchTools: (query: string) => Promise<void>;
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
  refreshConnectedProviders: () => Promise<void>;
  connectConnector: (connectorId: string) => Promise<void>;
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
  selectExtensionPackage: () => Promise<string | null>;
  getExtensionConfig: (extensionId: string) => Promise<Record<string, unknown>>;
  setExtensionConfig: (extensionId: string, config: Record<string, unknown>) => Promise<void>;
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
        config: null,
        configLocation: null,
        stats: {},
        health: [],
        extensions: [],
        connectedProviders: [],
        runtimeServerConfig: null,
        runtimeServerStatus: false,
        runtimeServerTools: [],
        isInitialized: false,
        activeOperations: 0,
        isLoading: false,
        error: null,
        searchQuery: '',

        initialize: async () => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcp/initialize/start');
          try {
            await McpClient.initialize();
            await get().refreshServers();
            await get().refreshTools();
            await Promise.all([get().refreshStats(), get().refreshHealth()]);
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

        refreshRuntimeTelemetry: async () => {
          if (!isTauri) return;
          await Promise.all([get().refreshStats(), get().refreshHealth()]);
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
              config: null,
              configLocation: null,
              stats: {},
              health: [],
              extensions: [],
              connectedProviders: [],
              runtimeServerConfig: null,
              runtimeServerStatus: false,
              runtimeServerTools: [],
              isInitialized: false,
              activeOperations: 0,
              isLoading: false,
              error: null,
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

export const selectMcpServers = (state: McpState) => state.servers;
export const selectMcpHealth = (state: McpState) => state.health;
export const selectMcpIsLoading = (state: McpState) => state.isLoading;
