import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { isTauri } from '../../lib/tauri-mock';
import { McpClient } from '../../api/mcp';
import type { ConnectorManifest } from '../../api/mcp';
import type {
  McpConfigLocation,
  McpRegistryPackage,
  McpRuntimeServerConfig,
  McpServerInfo,
  McpServersConfig,
} from '../../types/mcp';

export interface McpServersState {
  servers: McpServerInfo[];
  config: McpServersConfig | null;
  configLocation: McpConfigLocation | null;
  registry: McpRegistryPackage[];
  connectorManifests: ConnectorManifest[];
  connectedProviders: string[];
  runtimeServerConfig: McpRuntimeServerConfig | null;
  runtimeServerStatus: boolean;
  runtimeServerTools: unknown[];
  isInitialized: boolean;
  activeOperations: number;
  isLoading: boolean;
  error: string | null;
  selectedServer: string | null;

  refreshServers: () => Promise<void>;
  loadConfig: () => Promise<void>;
  updateConfig: (config: McpServersConfig) => Promise<void>;
  refreshConfigLocation: () => Promise<void>;
  connectServer: (name: string) => Promise<void>;
  disconnectServer: (name: string) => Promise<void>;
  enableServer: (name: string) => Promise<void>;
  disableServer: (name: string) => Promise<void>;
  storeCredential: (serverName: string, key: string, value: string) => Promise<void>;
  setCredential: (serverName: string, key: string, value: string) => Promise<void>;
  deleteCredential: (serverName: string, key: string) => Promise<void>;
  refreshRegistry: () => Promise<void>;
  installServer: (serverId: string) => Promise<void>;
  getServerLogs: (serverName: string, lines?: number) => Promise<string[]>;
  refreshConnectedProviders: () => Promise<void>;
  connectConnector: (connectorId: string) => Promise<void>;
  refreshConnectorManifests: () => Promise<void>;
  getRuntimeServerConfig: () => Promise<McpRuntimeServerConfig>;
  startRuntimeServer: () => Promise<void>;
  stopRuntimeServer: () => Promise<void>;
  updateRuntimeServerConfig: (port?: number, enabledTools?: string[]) => Promise<void>;
  refreshRuntimeServerStatus: () => Promise<void>;
  refreshRuntimeServerTools: () => Promise<void>;
  updateFilesystemDirectories: (directories: string[]) => Promise<void>;
  saveApiKey: (provider: string, key: string) => Promise<void>;
  setSelectedServer: (name: string | null) => void;
  clearError: () => void;
}

export const useMcpServersStore = create<McpServersState>()(
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
        config: null,
        configLocation: null,
        registry: [],
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

        refreshServers: async () => {
          if (!isTauri) return;
          try {
            const servers = await McpClient.listServers();
            set({ servers, error: null }, undefined, 'mcpServers/refreshServers');
          } catch (error) {
            set(
              { error: error instanceof Error ? error.message : 'Failed to list servers' },
              undefined,
              'mcpServers/refreshServers/error',
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
            set({ config, configLocation, error: null }, undefined, 'mcpServers/loadConfig');
          } catch (error) {
            set(
              { error: error instanceof Error ? error.message : 'Failed to load config' },
              undefined,
              'mcpServers/loadConfig/error',
            );
          }
        },

        updateConfig: async (config: McpServersConfig) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/updateConfig/start');
          try {
            await McpClient.updateConfig(config);
            endOp();
            set({ config }, undefined, 'mcpServers/updateConfig/success');
            await get().refreshConfigLocation();
            await get().refreshServers();
          } catch (error) {
            endOp();
            set(
              { error: error instanceof Error ? error.message : 'Failed to update config' },
              undefined,
              'mcpServers/updateConfig/error',
            );
          }
        },

        refreshConfigLocation: async () => {
          if (!isTauri) return;
          try {
            const configLocation = await McpClient.getConfigLocation();
            set({ configLocation, error: null }, undefined, 'mcpServers/refreshConfigLocation');
          } catch (error) {
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to get MCP config location',
              },
              undefined,
              'mcpServers/refreshConfigLocation/error',
            );
          }
        },

        connectServer: async (name: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/connectServer/start');
          try {
            await McpClient.connect(name);
            await get().refreshServers();
            endOp();
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : `Failed to connect to ${name}`,
              },
              undefined,
              'mcpServers/connectServer/error',
            );
          }
        },

        disconnectServer: async (name: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/disconnectServer/start');
          try {
            await McpClient.disconnect(name);
            await get().refreshServers();
            endOp();
          } catch (error) {
            endOp();
            set(
              {
                error: error instanceof Error ? error.message : `Failed to disconnect from ${name}`,
              },
              undefined,
              'mcpServers/disconnectServer/error',
            );
          }
        },

        enableServer: async (name: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/enableServer/start');
          try {
            await McpClient.enableServer(name);
            await get().refreshServers();
            endOp();
          } catch (error) {
            endOp();
            set(
              { error: error instanceof Error ? error.message : `Failed to enable ${name}` },
              undefined,
              'mcpServers/enableServer/error',
            );
          }
        },

        disableServer: async (name: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/disableServer/start');
          try {
            await McpClient.disableServer(name);
            await get().refreshServers();
            endOp();
          } catch (error) {
            endOp();
            set(
              { error: error instanceof Error ? error.message : `Failed to disable ${name}` },
              undefined,
              'mcpServers/disableServer/error',
            );
          }
        },

        storeCredential: async (serverName: string, key: string, value: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/storeCredential/start');
          try {
            await McpClient.storeCredential(serverName, key, value);
            endOp();
          } catch (error) {
            endOp();
            set(
              { error: error instanceof Error ? error.message : 'Failed to store credential' },
              undefined,
              'mcpServers/storeCredential/error',
            );
          }
        },

        setCredential: async (serverName: string, key: string, value: string) => {
          if (!isTauri) return;
          if (!serverName.trim() || !key.trim()) {
            set(
              { error: 'Server name and key are required' },
              undefined,
              'mcpServers/setCredential/validationError',
            );
            return;
          }
          startOp();
          set({ error: null }, undefined, 'mcpServers/setCredential/start');
          try {
            await McpClient.setCredential(serverName, key, value);
            endOp();
          } catch (error) {
            endOp();
            set(
              { error: error instanceof Error ? error.message : 'Failed to set credential' },
              undefined,
              'mcpServers/setCredential/error',
            );
          }
        },

        deleteCredential: async (serverName: string, key: string) => {
          if (!isTauri) return;
          if (!serverName.trim() || !key.trim()) {
            set(
              { error: 'Server name and key are required' },
              undefined,
              'mcpServers/deleteCredential/validationError',
            );
            return;
          }
          startOp();
          set({ error: null }, undefined, 'mcpServers/deleteCredential/start');
          try {
            await McpClient.deleteCredential(serverName, key);
            endOp();
          } catch (error) {
            endOp();
            set(
              { error: error instanceof Error ? error.message : 'Failed to delete credential' },
              undefined,
              'mcpServers/deleteCredential/error',
            );
          }
        },

        refreshRegistry: async () => {
          if (!isTauri) return;
          try {
            const registry = await McpClient.getRegistry();
            set({ registry, error: null }, undefined, 'mcpServers/refreshRegistry');
          } catch (error) {
            set(
              { error: error instanceof Error ? error.message : 'Failed to get MCP registry' },
              undefined,
              'mcpServers/refreshRegistry/error',
            );
          }
        },

        installServer: async (serverId: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/installServer/start');
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
              'mcpServers/installServer/error',
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
              'mcpServers/getServerLogs/error',
            );
            return [];
          }
        },

        refreshConnectedProviders: async () => {
          if (!isTauri) return;
          try {
            const connectedProviders = await McpClient.listConnectedProviders();
            set(
              { connectedProviders, error: null },
              undefined,
              'mcpServers/refreshConnectedProviders',
            );
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error ? error.message : 'Failed to list connected providers',
              },
              undefined,
              'mcpServers/refreshConnectedProviders/error',
            );
          }
        },

        connectConnector: async (connectorId: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/connectConnector/start');
          try {
            await McpClient.connectConnector(connectorId);
            await get().refreshServers();
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
              'mcpServers/connectConnector/error',
            );
          }
        },

        refreshConnectorManifests: async () => {
          if (!isTauri) return;
          try {
            const connectorManifests = await McpClient.getConnectorManifests();
            set(
              { connectorManifests, error: null },
              undefined,
              'mcpServers/refreshConnectorManifests',
            );
          } catch (error) {
            set(
              {
                error: error instanceof Error ? error.message : 'Failed to get connector manifests',
              },
              undefined,
              'mcpServers/refreshConnectorManifests/error',
            );
          }
        },

        getRuntimeServerConfig: async () => {
          if (!isTauri) throw new Error('Runtime server not available outside Tauri');
          try {
            const runtimeServerConfig = await McpClient.getRuntimeServerConfig();
            set(
              { runtimeServerConfig, error: null },
              undefined,
              'mcpServers/getRuntimeServerConfig',
            );
            return runtimeServerConfig;
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error ? error.message : 'Failed to get runtime server config',
              },
              undefined,
              'mcpServers/getRuntimeServerConfig/error',
            );
            throw error;
          }
        },

        startRuntimeServer: async () => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/startRuntimeServer/start');
          try {
            await McpClient.startRuntimeServer();
            endOp();
            set({ runtimeServerStatus: true }, undefined, 'mcpServers/startRuntimeServer/success');
          } catch (error) {
            endOp();
            set(
              { error: error instanceof Error ? error.message : 'Failed to start runtime server' },
              undefined,
              'mcpServers/startRuntimeServer/error',
            );
          }
        },

        stopRuntimeServer: async () => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/stopRuntimeServer/start');
          try {
            await McpClient.stopRuntimeServer();
            endOp();
            set({ runtimeServerStatus: false }, undefined, 'mcpServers/stopRuntimeServer/success');
          } catch (error) {
            endOp();
            set(
              { error: error instanceof Error ? error.message : 'Failed to stop runtime server' },
              undefined,
              'mcpServers/stopRuntimeServer/error',
            );
          }
        },

        updateRuntimeServerConfig: async (port?: number, enabledTools?: string[]) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/updateRuntimeServerConfig/start');
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
              'mcpServers/updateRuntimeServerConfig/error',
            );
          }
        },

        refreshRuntimeServerStatus: async () => {
          if (!isTauri) return;
          try {
            const runtimeServerStatus = await McpClient.getRuntimeServerStatus();
            set(
              { runtimeServerStatus, error: null },
              undefined,
              'mcpServers/refreshRuntimeServerStatus',
            );
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error ? error.message : 'Failed to get runtime server status',
              },
              undefined,
              'mcpServers/refreshRuntimeServerStatus/error',
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
              'mcpServers/refreshRuntimeServerTools',
            );
          } catch (error) {
            set(
              {
                error:
                  error instanceof Error ? error.message : 'Failed to list runtime server tools',
              },
              undefined,
              'mcpServers/refreshRuntimeServerTools/error',
            );
          }
        },

        updateFilesystemDirectories: async (directories: string[]) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/updateFilesystemDirectories/start');
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
              'mcpServers/updateFilesystemDirectories/error',
            );
          }
        },

        saveApiKey: async (provider: string, key: string) => {
          if (!isTauri) return;
          startOp();
          set({ error: null }, undefined, 'mcpServers/saveApiKey/start');
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
              'mcpServers/saveApiKey/error',
            );
          }
        },

        setSelectedServer: (name: string | null) => {
          set({ selectedServer: name }, undefined, 'mcpServers/setSelectedServer');
        },

        clearError: () => {
          set({ error: null }, undefined, 'mcpServers/clearError');
        },
      };
    }),
    { name: 'McpServersStore', enabled: import.meta.env.DEV },
  ),
);

export const selectMcpServers = (state: McpServersState) => state.servers;
export const selectMcpConfig = (state: McpServersState) => state.config;
export const selectMcpConfigLocation = (state: McpServersState) => state.configLocation;
export const selectMcpRegistry = (state: McpServersState) => state.registry;
export const selectMcpConnectorManifests = (state: McpServersState) => state.connectorManifests;
export const selectMcpConnectedProviders = (state: McpServersState) => state.connectedProviders;
export const selectMcpRuntimeServerConfig = (state: McpServersState) => state.runtimeServerConfig;
export const selectMcpRuntimeServerStatus = (state: McpServersState) => state.runtimeServerStatus;
export const selectMcpRuntimeServerTools = (state: McpServersState) => state.runtimeServerTools;
export const selectMcpServersIsLoading = (state: McpServersState) => state.isLoading;
export const selectMcpServersError = (state: McpServersState) => state.error;
export const selectMcpSelectedServer = (state: McpServersState) => state.selectedServer;
export const selectConnectedServers = (state: McpServersState) =>
  state.servers.filter((server) => server.connected);
export const selectDisconnectedServers = (state: McpServersState) =>
  state.servers.filter((server) => !server.connected);
export const selectServerByName = (name: string) => (state: McpServersState) =>
  state.servers.find((server) => server.name === name);
export const selectServerCount = (state: McpServersState) => state.servers.length;
