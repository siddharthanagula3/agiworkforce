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
import type {
  McpConfigLocation,
  McpExecutionHistoryEntry,
  McpServerHealth,
  McpServerInfo,
  McpToolExecutionStats,
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
  executionHistory: McpExecutionHistoryEntry[];
  toolExecutionStats: McpToolExecutionStats[];
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

  // Server connection management - used by MCPServerManager component
  connectServer: (name: string) => Promise<void>;
  disconnectServer: (name: string) => Promise<void>;

  // Configuration management - used by MCPWorkspace component
  loadConfig: () => Promise<void>;
  updateConfig: (config: McpServersConfig) => Promise<void>;
  refreshConfigLocation: () => Promise<void>;

  // Credential management - used by MCPCredentialManager component
  storeCredential: (serverName: string, key: string, value: string) => Promise<void>;
  setCredential: (serverName: string, key: string, value: string) => Promise<void>;
  deleteCredential: (serverName: string, key: string) => Promise<void>;

  // Server enable/disable - used by MCPServerManager component
  enableServer: (name: string) => Promise<void>;
  disableServer: (name: string) => Promise<void>;

  // Tool search - used by MCPToolExplorer component
  searchTools: (query: string) => Promise<void>;

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
      config: null,
      configLocation: null,
      stats: {},
      health: [],
      executionHistory: [],
      toolExecutionStats: [],
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
            {
              error: error instanceof Error ? error.message : 'Failed to list servers',
            },
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
            {
              error: error instanceof Error ? error.message : 'Failed to list tools',
            },
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
            {
              error: error instanceof Error ? error.message : 'Failed to get stats',
            },
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
            {
              error: error instanceof Error ? error.message : 'Failed to get MCP health',
            },
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
            nextHealth[existingIndex] = {
              ...nextHealth[existingIndex],
              ...health,
            };
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
            {
              error: error instanceof Error ? error.message : 'Failed to load config',
            },
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
            {
              error: error instanceof Error ? error.message : 'Failed to get MCP config location',
            },
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
            {
              error: error instanceof Error ? error.message : 'Failed to search tools',
            },
            undefined,
            'mcp/searchTools/error',
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

      // AUDIT-006-019 fix: Add resetOnLogout function for cleanup
      resetOnLogout: () => {
        set(
          {
            servers: [],
            tools: [],
            config: null,
            configLocation: null,
            stats: {},
            health: [],
            executionHistory: [],
            toolExecutionStats: [],
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
export const selectMcpConfig = (state: McpState) => state.config;
export const selectMcpConfigLocation = (state: McpState) => state.configLocation;
export const selectMcpStats = (state: McpState) => state.stats;
export const selectMcpHealth = (state: McpState) => state.health;
export const selectMcpExecutionHistory = (state: McpState) => state.executionHistory;
export const selectMcpToolExecutionStats = (state: McpState) => state.toolExecutionStats;
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
