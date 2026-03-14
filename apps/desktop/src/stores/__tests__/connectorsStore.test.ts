import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useConnectorsStore } from '../connectorsStore';

vi.mock('../../api/mcp', () => ({
  McpClient: {
    oauthStartRaw: vi.fn(),
    oauthDisconnectRaw: vi.fn(),
    listConnectedProviders: vi.fn(),
    connectConnector: vi.fn(),
    saveApiKey: vi.fn(),
  },
}));

interface McpClientMocks {
  oauthStartRaw: Mock<(provider: string) => Promise<{ authUrl: string; state: string }>>;
  oauthDisconnectRaw: Mock<(provider: string) => Promise<void>>;
  listConnectedProviders: Mock<() => Promise<string[]>>;
  connectConnector: Mock<(connectorId: string) => Promise<unknown>>;
  saveApiKey: Mock<(provider: string, key: string) => Promise<void>>;
}

async function getMcpClientMock(): Promise<McpClientMocks> {
  const { McpClient } = await import('../../api/mcp');
  return McpClient as unknown as McpClientMocks;
}

function resetConnectorsStore() {
  Object.values(useConnectorsStore.getState()._oauthTimers).forEach((timerId) => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  });

  useConnectorsStore.setState({
    connectedIds: [],
    loading: {},
    error: {},
    pendingOAuth: {},
    oauthStartedAt: {},
    _oauthTimers: {},
  });
  window.localStorage.removeItem('connectors-store');
}

describe('connectorsStore', () => {
  let mcpMock: McpClientMocks;

  beforeEach(async () => {
    vi.useFakeTimers();
    resetConnectorsStore();
    mcpMock = await getMcpClientMock();
    Object.values(mcpMock).forEach((mock) => mock.mockReset());
    mcpMock.oauthStartRaw.mockResolvedValue({ authUrl: 'https://example.com/auth', state: 's1' });
    mcpMock.oauthDisconnectRaw.mockResolvedValue();
    mcpMock.listConnectedProviders.mockResolvedValue([]);
    mcpMock.connectConnector.mockResolvedValue(undefined);
    mcpMock.saveApiKey.mockResolvedValue();
  });

  afterEach(() => {
    resetConnectorsStore();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('starts OAuth connectors through McpClient and tracks pending state', async () => {
    await useConnectorsStore.getState().connect('gmail');

    const state = useConnectorsStore.getState();
    expect(mcpMock.oauthStartRaw).toHaveBeenCalledWith('gmail');
    expect(state.pendingOAuth['gmail']).toBe(true);
    expect(state.loading['gmail']).toBe(false);
    expect(state.oauthStartedAt['gmail']).toBeGreaterThan(0);
  });

  it('connects API-key connectors through the shared MCP client', async () => {
    await useConnectorsStore.getState().connectWithApiKey('vercel', 'secret-key');

    expect(mcpMock.saveApiKey).toHaveBeenCalledWith('vercel', 'secret-key');
    expect(mcpMock.connectConnector).toHaveBeenCalledWith('vercel');
    expect(useConnectorsStore.getState().connectedIds).toContain('vercel');
  });

  it('completes OAuth using the connector id and connected provider list', async () => {
    await useConnectorsStore.getState().connect('gmail');
    mcpMock.listConnectedProviders.mockResolvedValue(['gmail', 'google_calendar']);

    await useConnectorsStore.getState().completeOAuth('gmail');

    const state = useConnectorsStore.getState();
    expect(mcpMock.connectConnector).toHaveBeenCalledWith('gmail');
    expect(mcpMock.listConnectedProviders).toHaveBeenCalled();
    expect(state.pendingOAuth['gmail']).toBe(false);
    expect(state.connectedIds).toContain('gmail');
  });
});
