import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest';
import { useMcpStore } from '../mcpStore';

// Mock the MCP API module
vi.mock('../../api/mcp', () => ({
  McpClient: {
    initialize: vi.fn(),
    listServers: vi.fn(),
    listTools: vi.fn(),
    getStats: vi.fn(),
    getConfig: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    enableServer: vi.fn(),
    disableServer: vi.fn(),
    updateConfig: vi.fn(),
    storeCredential: vi.fn(),
    searchTools: vi.fn(),
  },
}));

async function getMcpClientMock() {
  const { McpClient } = await import('../../api/mcp');
  return McpClient as unknown as {
    initialize: MockInstance;
    listServers: MockInstance;
    listTools: MockInstance;
    getStats: MockInstance;
    getConfig: MockInstance;
    connect: MockInstance;
    disconnect: MockInstance;
    enableServer: MockInstance;
    disableServer: MockInstance;
    updateConfig: MockInstance;
    storeCredential: MockInstance;
    searchTools: MockInstance;
  };
}

describe('mcpStore', () => {
  let mcpMock: Awaited<ReturnType<typeof getMcpClientMock>>;

  beforeEach(async () => {
    // Reset store state
    useMcpStore.setState({
      servers: [],
      tools: [],
      config: null,
      stats: {},
      isInitialized: false,
      isLoading: false,
      error: null,
      selectedServer: null,
      searchQuery: '',
    });

    mcpMock = await getMcpClientMock();
    Object.values(mcpMock).forEach((mock) => mock.mockReset());
  });

  describe('initial state', () => {
    it('should initialize with default state', () => {
      const state = useMcpStore.getState();

      expect(state.servers).toEqual([]);
      expect(state.tools).toEqual([]);
      expect(state.config).toBeNull();
      expect(state.stats).toEqual({});
      expect(state.isInitialized).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.selectedServer).toBeNull();
      expect(state.searchQuery).toBe('');
    });
  });

  describe('initialize', () => {
    it('should initialize MCP system successfully', async () => {
      const mockServers = [{ name: 'test-server', status: 'connected' }];
      const mockTools = [{ id: 'tool-1', name: 'Test Tool' }];
      const mockStats = { servers: 1, tools: 1 };
      const mockConfig = { servers: {} };

      mcpMock.initialize.mockResolvedValue('initialized');
      mcpMock.listServers.mockResolvedValue(mockServers);
      mcpMock.listTools.mockResolvedValue(mockTools);
      mcpMock.getStats.mockResolvedValue(mockStats);
      mcpMock.getConfig.mockResolvedValue(mockConfig);

      await useMcpStore.getState().initialize();

      const state = useMcpStore.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(mcpMock.initialize).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      const errorMessage = 'MCP initialization failed';
      mcpMock.initialize.mockRejectedValue(new Error(errorMessage));

      await useMcpStore.getState().initialize();

      const state = useMcpStore.getState();
      expect(state.isInitialized).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe(errorMessage);
    });
  });

  describe('refreshServers', () => {
    it('should refresh servers list', async () => {
      const mockServers = [
        { name: 'server-1', status: 'connected' },
        { name: 'server-2', status: 'disconnected' },
      ];
      mcpMock.listServers.mockResolvedValue(mockServers);

      await useMcpStore.getState().refreshServers();

      const state = useMcpStore.getState();
      expect(state.servers).toEqual(mockServers);
      expect(state.error).toBeNull();
    });

    it('should handle refresh servers errors', async () => {
      mcpMock.listServers.mockRejectedValue(new Error('Network error'));

      await useMcpStore.getState().refreshServers();

      const state = useMcpStore.getState();
      expect(state.error).toBe('Network error');
    });
  });

  describe('refreshTools', () => {
    it('should refresh tools list', async () => {
      const mockTools = [
        { id: 'tool-1', name: 'Tool A', description: 'First tool' },
        { id: 'tool-2', name: 'Tool B', description: 'Second tool' },
      ];
      mcpMock.listTools.mockResolvedValue(mockTools);

      await useMcpStore.getState().refreshTools();

      const state = useMcpStore.getState();
      expect(state.tools).toEqual(mockTools);
      expect(state.error).toBeNull();
    });

    it('should handle refresh tools errors', async () => {
      mcpMock.listTools.mockRejectedValue(new Error('Failed to fetch tools'));

      await useMcpStore.getState().refreshTools();

      const state = useMcpStore.getState();
      expect(state.error).toBe('Failed to fetch tools');
    });
  });

  describe('refreshStats', () => {
    it('should refresh stats', async () => {
      const mockStats = { servers: 5, tools: 20, calls: 100 };
      mcpMock.getStats.mockResolvedValue(mockStats);

      await useMcpStore.getState().refreshStats();

      const state = useMcpStore.getState();
      expect(state.stats).toEqual(mockStats);
      expect(state.error).toBeNull();
    });

    it('should handle refresh stats errors', async () => {
      mcpMock.getStats.mockRejectedValue(new Error('Stats unavailable'));

      await useMcpStore.getState().refreshStats();

      const state = useMcpStore.getState();
      expect(state.error).toBe('Stats unavailable');
    });
  });

  describe('connectServer', () => {
    it('should connect to a server successfully', async () => {
      mcpMock.connect.mockResolvedValue('connected');
      mcpMock.listServers.mockResolvedValue([{ name: 'test', status: 'connected' }]);
      mcpMock.listTools.mockResolvedValue([]);
      mcpMock.getStats.mockResolvedValue({});

      await useMcpStore.getState().connectServer('test');

      const state = useMcpStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(mcpMock.connect).toHaveBeenCalledWith('test');
    });

    it('should handle connect server errors', async () => {
      mcpMock.connect.mockRejectedValue(new Error('Connection refused'));

      await useMcpStore.getState().connectServer('test');

      const state = useMcpStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toContain('Connection refused');
    });
  });

  describe('disconnectServer', () => {
    it('should disconnect from a server successfully', async () => {
      mcpMock.disconnect.mockResolvedValue('disconnected');
      mcpMock.listServers.mockResolvedValue([{ name: 'test', status: 'disconnected' }]);
      mcpMock.listTools.mockResolvedValue([]);
      mcpMock.getStats.mockResolvedValue({});

      await useMcpStore.getState().disconnectServer('test');

      const state = useMcpStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(mcpMock.disconnect).toHaveBeenCalledWith('test');
    });

    it('should handle disconnect server errors', async () => {
      mcpMock.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      await useMcpStore.getState().disconnectServer('test');

      const state = useMcpStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toContain('Disconnect failed');
    });
  });

  describe('enableServer', () => {
    it('should enable a server', async () => {
      mcpMock.enableServer.mockResolvedValue('enabled');
      mcpMock.listServers.mockResolvedValue([{ name: 'test', enabled: true }]);

      await useMcpStore.getState().enableServer('test');

      const state = useMcpStore.getState();
      expect(state.isLoading).toBe(false);
      expect(mcpMock.enableServer).toHaveBeenCalledWith('test');
    });

    it('should handle enable server errors', async () => {
      mcpMock.enableServer.mockRejectedValue(new Error('Cannot enable'));

      await useMcpStore.getState().enableServer('test');

      const state = useMcpStore.getState();
      expect(state.error).toContain('Cannot enable');
    });
  });

  describe('disableServer', () => {
    it('should disable a server', async () => {
      mcpMock.disableServer.mockResolvedValue('disabled');
      mcpMock.listServers.mockResolvedValue([{ name: 'test', enabled: false }]);

      await useMcpStore.getState().disableServer('test');

      const state = useMcpStore.getState();
      expect(state.isLoading).toBe(false);
      expect(mcpMock.disableServer).toHaveBeenCalledWith('test');
    });

    it('should handle disable server errors', async () => {
      mcpMock.disableServer.mockRejectedValue(new Error('Cannot disable'));

      await useMcpStore.getState().disableServer('test');

      const state = useMcpStore.getState();
      expect(state.error).toContain('Cannot disable');
    });
  });

  describe('loadConfig', () => {
    it('should load configuration', async () => {
      const mockConfig = { servers: { test: { command: 'test' } } };
      mcpMock.getConfig.mockResolvedValue(mockConfig);

      await useMcpStore.getState().loadConfig();

      const state = useMcpStore.getState();
      expect(state.config).toEqual(mockConfig);
      expect(state.error).toBeNull();
    });

    it('should handle load config errors', async () => {
      mcpMock.getConfig.mockRejectedValue(new Error('Config not found'));

      await useMcpStore.getState().loadConfig();

      const state = useMcpStore.getState();
      expect(state.error).toBe('Config not found');
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', async () => {
      const newConfig = {
        mcpServers: { new: { command: 'new', args: [], env: {}, enabled: true } },
      };
      mcpMock.updateConfig.mockResolvedValue('updated');
      mcpMock.listServers.mockResolvedValue([]);

      await useMcpStore.getState().updateConfig(newConfig);

      const state = useMcpStore.getState();
      expect(state.config).toEqual(newConfig);
      expect(state.isLoading).toBe(false);
      expect(mcpMock.updateConfig).toHaveBeenCalledWith(newConfig);
    });

    it('should handle update config errors', async () => {
      mcpMock.updateConfig.mockRejectedValue(new Error('Update failed'));

      await useMcpStore.getState().updateConfig({ mcpServers: {} });

      const state = useMcpStore.getState();
      expect(state.error).toContain('Update failed');
    });
  });

  describe('storeCredential', () => {
    it('should store credential', async () => {
      mcpMock.storeCredential.mockResolvedValue('stored');

      await useMcpStore.getState().storeCredential('server', 'key', 'value');

      const state = useMcpStore.getState();
      expect(state.isLoading).toBe(false);
      expect(mcpMock.storeCredential).toHaveBeenCalledWith('server', 'key', 'value');
    });

    it('should handle store credential errors', async () => {
      mcpMock.storeCredential.mockRejectedValue(new Error('Storage failed'));

      await useMcpStore.getState().storeCredential('server', 'key', 'value');

      const state = useMcpStore.getState();
      expect(state.error).toContain('Storage failed');
    });
  });

  describe('searchTools', () => {
    it('should search tools with query', async () => {
      const mockTools = [{ id: 'tool-1', name: 'Matching Tool' }];
      mcpMock.searchTools.mockResolvedValue(mockTools);

      await useMcpStore.getState().searchTools('match');

      const state = useMcpStore.getState();
      expect(state.tools).toEqual(mockTools);
      expect(state.searchQuery).toBe('match');
    });

    it('should refresh all tools when query is empty', async () => {
      const mockTools = [{ id: 'tool-1', name: 'Tool A' }];
      mcpMock.listTools.mockResolvedValue(mockTools);

      await useMcpStore.getState().searchTools('');

      const state = useMcpStore.getState();
      expect(state.searchQuery).toBe('');
      expect(mcpMock.listTools).toHaveBeenCalled();
    });

    it('should handle search tools errors', async () => {
      mcpMock.searchTools.mockRejectedValue(new Error('Search failed'));

      await useMcpStore.getState().searchTools('query');

      const state = useMcpStore.getState();
      expect(state.error).toBe('Search failed');
    });
  });

  describe('UI state management', () => {
    it('should set selected server', () => {
      useMcpStore.getState().setSelectedServer('server-1');

      expect(useMcpStore.getState().selectedServer).toBe('server-1');
    });

    it('should clear selected server', () => {
      useMcpStore.getState().setSelectedServer('server-1');
      useMcpStore.getState().setSelectedServer(null);

      expect(useMcpStore.getState().selectedServer).toBeNull();
    });

    it('should set search query', () => {
      useMcpStore.getState().setSearchQuery('test query');

      expect(useMcpStore.getState().searchQuery).toBe('test query');
    });

    it('should clear error', () => {
      useMcpStore.setState({ error: 'Some error' });
      useMcpStore.getState().clearError();

      expect(useMcpStore.getState().error).toBeNull();
    });
  });
});
