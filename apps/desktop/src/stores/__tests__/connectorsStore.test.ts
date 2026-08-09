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

// Mirrors the private `CONNECTORS_PERSIST_KEY` in the store under test.
const CONNECTORS_PERSIST_KEY = 'agiworkforce-connectors-store';

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
  window.localStorage.removeItem(CONNECTORS_PERSIST_KEY);
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
    mcpMock.listConnectedProviders.mockResolvedValue(['vercel']);
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

  it('does not mark OAuth connectors connected when the MCP provider is inactive', async () => {
    await useConnectorsStore.getState().connect('gmail');
    mcpMock.listConnectedProviders.mockResolvedValue([]);

    await expect(useConnectorsStore.getState().completeOAuth('gmail')).rejects.toThrow(
      /not active/i,
    );

    const state = useConnectorsStore.getState();
    expect(state.connectedIds).not.toContain('gmail');
    expect(state.error['gmail']).toMatch(/not active/i);
  });

  describe('in-flight OAuth state is not carried across restarts', () => {
    it('keeps the pending flags out of the persisted payload', async () => {
      await useConnectorsStore.getState().connect('gmail');
      expect(useConnectorsStore.getState().pendingOAuth['gmail']).toBe(true);

      const written = window.localStorage.getItem(CONNECTORS_PERSIST_KEY);
      expect(written).not.toBeNull();
      const persisted = JSON.parse(written as string) as { state: Record<string, unknown> };
      expect(persisted.state).not.toHaveProperty('pendingOAuth');
      expect(persisted.state).not.toHaveProperty('oauthStartedAt');
    });

    // `migrate` is a chain of early returns, so every storage version that can
    // still be on disk has to be exercised: a payload at v3 leaves through the
    // `< 4` arm, v4/v5 through `< 6` and v6 through `< 7`, and none of them ever
    // reaches the tail. The timeout timer that would have resolved these flows
    // died with the process that wrote them, so rehydrating any of these
    // verbatim left gmail waiting for a callback forever.
    it.each([3, 4, 5, 6, 7])(
      'clears a stuck pending flow left behind by storage version %i',
      async (version) => {
        window.localStorage.setItem(
          CONNECTORS_PERSIST_KEY,
          JSON.stringify({
            version,
            state: {
              connectedIds: [],
              loading: {},
              error: {},
              pendingOAuth: { gmail: true },
              oauthStartedAt: { gmail: 1 },
              supportedConnectorIds: ['gmail'],
            },
          }),
        );

        await useConnectorsStore.persist.rehydrate();

        const state = useConnectorsStore.getState();
        expect(state.pendingOAuth).toEqual({});
        expect(state.oauthStartedAt).toEqual({});
      },
    );

    it('keeps the rest of a v7 payload intact while clearing the pending flow', async () => {
      window.localStorage.setItem(
        CONNECTORS_PERSIST_KEY,
        JSON.stringify({
          version: 7,
          state: {
            connectedIds: ['gmail'],
            loading: {},
            error: {},
            pendingOAuth: { gmail: true },
            oauthStartedAt: { gmail: 1 },
            supportedConnectorIds: ['gmail'],
          },
        }),
      );

      await useConnectorsStore.persist.rehydrate();

      const state = useConnectorsStore.getState();
      expect(state.pendingOAuth).toEqual({});
      expect(state.connectedIds).toContain('gmail');
      expect(state.supportedConnectorIds).toContain('gmail');
    });
  });
});
