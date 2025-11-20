import { create } from 'zustand';
import { McpClient } from '../api/mcp';
import type { McpServerInfo, McpToolInfo, McpServersConfig } from '../types/mcp';

interface McpState {
  // State
  servers: McpServerInfo[];
  tools: McpToolInfo[];
  config: McpServersConfig | null;
  stats: Record<string, number>;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  selectedServer: string | null;
  searchQuery: string;

  // Actions
  initialize: () => Promise<void>;
  refreshServers: () => Promise<void>;
  refreshTools: () => Promise<void>;
  refreshStats: () => Promise<void>;
  connectServer: (name: string) => Promise<void>;
  disconnectServer: (name: string) => Promise<void>;
  loadConfig: () => Promise<void>;
  updateConfig: (config: McpServersConfig) => Promise<void>;
  storeCredential: (serverName: string, key: string, value: string) => Promise<void>;
  enableServer: (name: string) => Promise<void>;
  disableServer: (name: string) => Promise<void>;
  searchTools: (query: string) => Promise<void>;
  setSelectedServer: (name: string | null) => void;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
}

export const useMcpStore = create<McpState>((set, get) => ({
  // Initial state
  servers: [],
  tools: [],
  config: null,
  stats: {},
  isInitialized: false,
  isLoading: false,
  error: null,
  selectedServer: null,
  searchQuery: '',

  // Initialize MCP system
  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      await McpClient.initialize();
      await get().refreshServers();
      await get().refreshTools();
      await get().refreshStats();
      await get().loadConfig();
      set({ isInitialized: true, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Initialization failed',
        isLoading: false,
      });
    }
  },

  // Refresh server list
  refreshServers: async () => {
    try {
      const servers = await McpClient.listServers();
      set({ servers, error: null });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to list servers',
      });
    }
  },

  // Refresh tool list
  refreshTools: async () => {
    try {
      const tools = await McpClient.listTools();
      set({ tools, error: null });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to list tools',
      });
    }
  },

  // Refresh statistics
  refreshStats: async () => {
    try {
      const stats = await McpClient.getStats();
      set({ stats, error: null });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to get stats',
      });
    }
  },

  // Connect to server
  connectServer: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      await McpClient.connect(name);
      await get().refreshServers();
      await get().refreshTools();
      await get().refreshStats();
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : `Failed to connect to ${name}`,
        isLoading: false,
      });
    }
  },

  // Disconnect from server
  disconnectServer: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      await McpClient.disconnect(name);
      await get().refreshServers();
      await get().refreshTools();
      await get().refreshStats();
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : `Failed to disconnect from ${name}`,
        isLoading: false,
      });
    }
  },

  enableServer: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      await McpClient.enableServer(name);
      await get().refreshServers();
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : `Failed to enable ${name}`,
        isLoading: false,
      });
    }
  },

  disableServer: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      await McpClient.disableServer(name);
      await get().refreshServers();
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : `Failed to disable ${name}`,
        isLoading: false,
      });
    }
  },

  // Load configuration
  loadConfig: async () => {
    try {
      const config = await McpClient.getConfig();
      set({ config, error: null });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load config',
      });
    }
  },

  // Update configuration
  updateConfig: async (config: McpServersConfig) => {
    set({ isLoading: true, error: null });
    try {
      await McpClient.updateConfig(config);
      set({ config, isLoading: false });
      await get().refreshServers();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update config',
        isLoading: false,
      });
    }
  },

  // Store credential
  storeCredential: async (serverName: string, key: string, value: string) => {
    set({ isLoading: true, error: null });
    try {
      await McpClient.storeCredential(serverName, key, value);
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to store credential',
        isLoading: false,
      });
    }
  },

  // Search tools
  searchTools: async (query: string) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      await get().refreshTools();
      return;
    }

    try {
      const tools = await McpClient.searchTools(query);
      set({ tools, error: null });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to search tools',
      });
    }
  },

  // Set selected server
  setSelectedServer: (name: string | null) => {
    set({ selectedServer: name });
  },

  // Set search query
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));
