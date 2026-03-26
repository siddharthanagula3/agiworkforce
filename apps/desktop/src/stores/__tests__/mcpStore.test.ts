import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { useMcpStore } from '../mcpStore';
import type {
  McpExecutionHistoryEntry,
  McpServerHealth,
  McpServersConfig,
  McpToolExecutionStats,
} from '../../types/mcp';

// Mock isTauri to true so store methods don't bail out
vi.mock('../../lib/tauri-mock', async () => {
  const actual =
    await vi.importActual<typeof import('../../lib/tauri-mock')>('../../lib/tauri-mock');
  return {
    ...actual,
    isTauri: true,
  };
});

// AUDIT-P3-TEST-TYPE: Properly typed mock functions for MCP API
vi.mock('../../api/mcp', () => ({
  McpClient: {
    initialize: vi.fn(),
    listServers: vi.fn(),
    listTools: vi.fn(),
    getStats: vi.fn(),
    getExecutionHistory: vi.fn(),
    getToolExecutionStats: vi.fn(),
    getHealth: vi.fn(),
    checkServerHealth: vi.fn(),
    getConfig: vi.fn(),
    getConfigLocation: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    enableServer: vi.fn(),
    disableServer: vi.fn(),
    updateConfig: vi.fn(),
    storeCredential: vi.fn(),
    searchTools: vi.fn(),
  },
}));

// AUDIT-P3-TEST-TYPE: Partial mock types for test data (allow testing with minimal required fields)
interface MockServerInfo {
  name: string;
  status?: string;
  enabled?: boolean;
  connected?: boolean;
  tool_count?: number;
}

interface MockToolInfo {
  id: string;
  name: string;
  description?: string;
  server?: string;
}

// AUDIT-P3-TEST-TYPE: Type-safe mock accessor for MCP client methods with flexible return types
interface McpClientMocks {
  initialize: Mock<() => Promise<string>>;
  listServers: Mock<() => Promise<MockServerInfo[]>>;
  listTools: Mock<() => Promise<MockToolInfo[]>>;
  getStats: Mock<() => Promise<Record<string, number>>>;
  getExecutionHistory: Mock<(limit?: number) => Promise<McpExecutionHistoryEntry[]>>;
  getToolExecutionStats: Mock<() => Promise<McpToolExecutionStats[]>>;
  getHealth: Mock<() => Promise<McpServerHealth[]>>;
  checkServerHealth: Mock<(serverName: string) => Promise<McpServerHealth>>;
  getConfig: Mock<() => Promise<Partial<McpServersConfig> | { servers: Record<string, unknown> }>>;
  getConfigLocation: Mock<() => Promise<{ path: string; source: string } | null>>;
  connect: Mock<(serverName: string) => Promise<string>>;
  disconnect: Mock<(serverName: string) => Promise<string>>;
  enableServer: Mock<(serverName: string) => Promise<string>>;
  disableServer: Mock<(serverName: string) => Promise<string>>;
  updateConfig: Mock<(config: McpServersConfig) => Promise<string>>;
  storeCredential: Mock<(serverName: string, key: string, value: string) => Promise<string>>;
  searchTools: Mock<(query: string) => Promise<MockToolInfo[]>>;
}

async function getMcpClientMock(): Promise<McpClientMocks> {
  const { McpClient } = await import('../../api/mcp');
  // AUDIT-P3-TEST-TYPE: Cast is necessary here as the mock module returns vi.fn() implementations
  return McpClient as unknown as McpClientMocks;
}

describe('mcpStore', () => {
  let mcpMock: Awaited<ReturnType<typeof getMcpClientMock>>;

  beforeEach(async () => {
    // Reset store state
    useMcpStore.setState({
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
    });

    mcpMock = await getMcpClientMock();
    Object.values(mcpMock).forEach((mock) => mock.mockReset());
    mcpMock.getStats.mockResolvedValue({});
    mcpMock.getHealth.mockResolvedValue([]);
    mcpMock.getExecutionHistory.mockResolvedValue([]);
    mcpMock.getToolExecutionStats.mockResolvedValue([]);
    mcpMock.getConfigLocation.mockResolvedValue(null);
  });

  describe('initial state', () => {
    it('should initialize with default state', () => {
      const state = useMcpStore.getState();

      expect(state.servers).toEqual([]);
      expect(state.tools).toEqual([]);
      expect(state.config).toBeNull();
      expect(state.health).toEqual([]);
      expect(state.executionHistory).toEqual([]);
      expect(state.toolExecutionStats).toEqual([]);
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
      const mockHealth: McpServerHealth[] = [];
      const mockHistory: McpExecutionHistoryEntry[] = [];
      const mockToolStats: McpToolExecutionStats[] = [];

      mcpMock.initialize.mockResolvedValue('initialized');
      mcpMock.listServers.mockResolvedValue(mockServers);
      mcpMock.listTools.mockResolvedValue(mockTools);
      mcpMock.getStats.mockResolvedValue(mockStats);
      mcpMock.getHealth.mockResolvedValue(mockHealth);
      mcpMock.getExecutionHistory.mockResolvedValue(mockHistory);
      mcpMock.getToolExecutionStats.mockResolvedValue(mockToolStats);
      mcpMock.getConfig.mockResolvedValue(mockConfig);
      mcpMock.getConfigLocation.mockResolvedValue(null);

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

  describe('runtime telemetry', () => {
    it('should refresh MCP health', async () => {
      const mockHealth: McpServerHealth[] = [
        {
          server_name: 'filesystem',
          status: 'healthy',
          last_check: new Date().toISOString(),
          error_message: null,
          response_time_ms: 12,
          tool_count: 3,
          consecutive_failures: 0,
        },
      ];
      mcpMock.getHealth.mockResolvedValue(mockHealth);

      await useMcpStore.getState().refreshHealth();

      expect(useMcpStore.getState().health).toEqual(mockHealth);
    });

    it('should refresh MCP execution history', async () => {
      const mockHistory: McpExecutionHistoryEntry[] = [
        {
          tool_id: 'mcp__filesystem__read_file',
          server_name: 'filesystem',
          result: { ok: true },
          duration_ms: 25,
          timestamp: 1_700_000_000,
          success: true,
          error: null,
        },
      ];
      mcpMock.getExecutionHistory.mockResolvedValue(mockHistory);

      await useMcpStore.getState().refreshExecutionHistory(5);

      expect(mcpMock.getExecutionHistory).toHaveBeenCalledWith(5);
      expect(useMcpStore.getState().executionHistory).toEqual(mockHistory);
    });

    it('should refresh MCP tool execution stats', async () => {
      const mockToolStats: McpToolExecutionStats[] = [
        {
          tool_id: 'mcp__filesystem__read_file',
          total_executions: 4,
          successful_executions: 4,
          failed_executions: 0,
          avg_duration_ms: 18,
          last_execution: 1_700_000_000,
        },
      ];
      mcpMock.getToolExecutionStats.mockResolvedValue(mockToolStats);

      await useMcpStore.getState().refreshToolExecutionStats();

      expect(useMcpStore.getState().toolExecutionStats).toEqual(mockToolStats);
    });

    it('should upsert server health entries', () => {
      const initialHealth: McpServerHealth = {
        server_name: 'filesystem',
        status: 'degraded',
        last_check: new Date().toISOString(),
        error_message: 'Timeout',
        response_time_ms: 900,
        tool_count: 2,
        consecutive_failures: 1,
      };

      useMcpStore.getState().upsertServerHealth(initialHealth);
      useMcpStore.getState().upsertServerHealth({
        ...initialHealth,
        status: 'healthy',
        error_message: null,
        response_time_ms: 30,
        consecutive_failures: 0,
      });

      expect(useMcpStore.getState().health).toEqual([
        expect.objectContaining({
          server_name: 'filesystem',
          status: 'healthy',
          response_time_ms: 30,
          consecutive_failures: 0,
        }),
      ]);
    });

    it('should check and upsert a single server health row', async () => {
      const health: McpServerHealth = {
        server_name: 'filesystem',
        status: 'healthy',
        last_check: new Date().toISOString(),
        error_message: null,
        response_time_ms: 18,
        tool_count: 3,
        consecutive_failures: 0,
      };
      mcpMock.checkServerHealth.mockResolvedValue(health);

      await useMcpStore.getState().checkServerHealth('filesystem');

      expect(mcpMock.checkServerHealth).toHaveBeenCalledWith('filesystem');
      expect(useMcpStore.getState().health).toEqual([health]);
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
      mcpMock.getConfigLocation.mockResolvedValue(null);

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
