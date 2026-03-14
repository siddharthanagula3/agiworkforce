import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useMcpServerStore } from '../mcpServerStore';
import type { McpRuntimeServerConfig } from '../../types/mcp';

vi.mock('../../api/mcp', () => ({
  McpClient: {
    getRuntimeServerConfig: vi.fn(),
    startRuntimeServer: vi.fn(),
    stopRuntimeServer: vi.fn(),
    updateRuntimeServerConfig: vi.fn(),
  },
}));

interface McpClientMocks {
  getRuntimeServerConfig: Mock<() => Promise<McpRuntimeServerConfig>>;
  startRuntimeServer: Mock<() => Promise<void>>;
  stopRuntimeServer: Mock<() => Promise<void>>;
  updateRuntimeServerConfig: Mock<(port?: number, enabledTools?: string[]) => Promise<void>>;
}

async function getMcpClientMock(): Promise<McpClientMocks> {
  const { McpClient } = await import('../../api/mcp');
  return McpClient as unknown as McpClientMocks;
}

describe('mcpServerStore', () => {
  let mcpMock: McpClientMocks;

  beforeEach(async () => {
    useMcpServerStore.setState({
      config: null,
      loading: false,
      error: null,
    });

    mcpMock = await getMcpClientMock();
    Object.values(mcpMock).forEach((mock) => mock.mockReset());
    mcpMock.getRuntimeServerConfig.mockResolvedValue({
      port: 3001,
      token: '********mock',
      enabled_tools: ['agi_chat'],
      running: false,
    });
    mcpMock.startRuntimeServer.mockResolvedValue();
    mcpMock.stopRuntimeServer.mockResolvedValue();
    mcpMock.updateRuntimeServerConfig.mockResolvedValue();
  });

  it('fetches runtime config through the typed MCP client', async () => {
    await useMcpServerStore.getState().fetchConfig();

    expect(mcpMock.getRuntimeServerConfig).toHaveBeenCalled();
    expect(useMcpServerStore.getState().config).toEqual({
      port: 3001,
      token: '********mock',
      enabled_tools: ['agi_chat'],
      running: false,
    });
  });

  it('starts the runtime server through the typed MCP client', async () => {
    await useMcpServerStore.getState().startServer();

    expect(mcpMock.startRuntimeServer).toHaveBeenCalled();
    expect(mcpMock.getRuntimeServerConfig).toHaveBeenCalled();
  });

  it('updates the runtime server config through the typed MCP client', async () => {
    await useMcpServerStore.getState().updateConfig(4100, ['agi_chat', 'agi_bash']);

    expect(mcpMock.updateRuntimeServerConfig).toHaveBeenCalledWith(4100, [
      'agi_chat',
      'agi_bash',
    ]);
    expect(mcpMock.getRuntimeServerConfig).toHaveBeenCalled();
  });

  it('stores runtime server errors instead of dropping them', async () => {
    mcpMock.getRuntimeServerConfig.mockRejectedValue(new Error('config unavailable'));

    await useMcpServerStore.getState().fetchConfig();

    expect(useMcpServerStore.getState().error).toBe('config unavailable');
    expect(useMcpServerStore.getState().loading).toBe(false);
  });
});
