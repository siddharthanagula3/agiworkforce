import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildMcpToolCatalogMock, connectMcpServerMock, assertPublicHostnameMock, callToolMock } =
  vi.hoisted(() => ({
    buildMcpToolCatalogMock: vi.fn(),
    connectMcpServerMock: vi.fn(),
    assertPublicHostnameMock: vi.fn(),
    callToolMock: vi.fn(),
  }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: (...args: unknown[]) => assertPublicHostnameMock(...args),
}));
vi.mock('@agiworkforce/mcp', () => ({
  buildMcpToolCatalog: (...args: unknown[]) => buildMcpToolCatalogMock(...args),
  connectMcpServer: (...args: unknown[]) => connectMcpServerMock(...args),
}));

const SERVER_CONFIG = JSON.stringify({
  servers: [
    {
      id: 'search',
      name: 'Search',
      description: 'Search approved sources',
      transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
      enabled: true,
    },
  ],
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env['WEB_MCP_SERVERS_JSON'] = SERVER_CONFIG;
  assertPublicHostnameMock.mockResolvedValue(undefined);
  callToolMock.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
  connectMcpServerMock.mockResolvedValue({
    serverName: 'search',
    callTool: callToolMock,
    close: vi.fn().mockResolvedValue(undefined),
  });
});

describe('MCP tool cancellation', () => {
  it("hands the caller's abort signal to the MCP request", async () => {
    const { executeWebMcpTool } = await import('@/lib/mcp-tool-executor');
    const controller = new AbortController();

    await executeWebMcpTool('search', 'lookup', { query: 'x' }, { signal: controller.signal });

    expect(callToolMock).toHaveBeenCalledWith(
      'lookup',
      { query: 'x' },
      { signal: controller.signal },
    );
  });

  it('never dispatches a tool call that was already cancelled', async () => {
    const { executeWebMcpTool } = await import('@/lib/mcp-tool-executor');
    const controller = new AbortController();
    controller.abort();

    await expect(
      executeWebMcpTool('search', 'lookup', { query: 'x' }, { signal: controller.signal }),
    ).rejects.toThrow();
    expect(callToolMock).not.toHaveBeenCalled();
  });

  it('still runs a tool call when no signal is supplied', async () => {
    const { executeWebMcpTool } = await import('@/lib/mcp-tool-executor');

    await executeWebMcpTool('search', 'lookup', { query: 'x' });

    expect(callToolMock).toHaveBeenCalledWith('lookup', { query: 'x' });
  });
});
