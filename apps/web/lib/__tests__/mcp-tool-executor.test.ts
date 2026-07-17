import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildMcpToolCatalogMock, connectMcpServerMock, assertPublicHostnameMock } = vi.hoisted(
  () => ({
    buildMcpToolCatalogMock: vi.fn(),
    connectMcpServerMock: vi.fn(),
    assertPublicHostnameMock: vi.fn(),
  }),
);

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

function remoteServerConfig(url = 'https://mcp.example.com/mcp') {
  return JSON.stringify({
    servers: [
      {
        id: 'search',
        name: 'Search',
        description: 'Search approved sources',
        transport: { type: 'http', url, headers: { Authorization: 'Bearer secret' } },
        enabled: true,
      },
    ],
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env['WEB_MCP_SERVERS_JSON'];
  assertPublicHostnameMock.mockResolvedValue(undefined);
  buildMcpToolCatalogMock.mockResolvedValue({
    catalog: {
      version: 1,
      generatedAt: 1,
      servers: {},
      tools: [],
    },
    handles: [],
  });
});

describe('Web MCP configuration', () => {
  it('builds the catalog from the validated remote-only environment contract', async () => {
    process.env['WEB_MCP_SERVERS_JSON'] = remoteServerConfig();
    const { getWebMcpCatalog } = await import('../mcp-tool-executor');

    await getWebMcpCatalog();

    expect(assertPublicHostnameMock).toHaveBeenCalledWith('https://mcp.example.com/mcp');
    expect(buildMcpToolCatalogMock).toHaveBeenCalledWith({
      search: {
        url: 'https://mcp.example.com/mcp',
        transport: 'streamable-http',
        headers: { Authorization: 'Bearer secret' },
      },
    });
  });

  it('rejects stdio servers in the managed Web runtime', async () => {
    process.env['WEB_MCP_SERVERS_JSON'] = JSON.stringify({
      servers: [
        {
          id: 'filesystem',
          name: 'Filesystem',
          transport: { type: 'stdio', command: 'npx', args: ['server-filesystem'] },
        },
      ],
    });
    const { getWebMcpCatalog } = await import('../mcp-tool-executor');

    const catalog = await getWebMcpCatalog();

    expect(catalog.tools).toEqual([]);
    expect(connectMcpServerMock).not.toHaveBeenCalled();
    expect(buildMcpToolCatalogMock).not.toHaveBeenCalled();
  });

  it('does not connect to an endpoint rejected by DNS-aware egress policy', async () => {
    process.env['WEB_MCP_SERVERS_JSON'] = remoteServerConfig('https://private.example/mcp');
    assertPublicHostnameMock.mockRejectedValue(new Error('private address'));
    const { getWebMcpCatalog } = await import('../mcp-tool-executor');

    const catalog = await getWebMcpCatalog();

    expect(assertPublicHostnameMock).toHaveBeenCalledWith('https://private.example/mcp');
    expect(catalog.tools).toEqual([]);
    expect(buildMcpToolCatalogMock).not.toHaveBeenCalled();
  });

  it('fails closed when the environment payload is malformed', async () => {
    process.env['WEB_MCP_SERVERS_JSON'] = '{not-json';
    const { getWebMcpCatalog } = await import('../mcp-tool-executor');

    const catalog = await getWebMcpCatalog();

    expect(catalog.tools).toEqual([]);
    expect(buildMcpToolCatalogMock).not.toHaveBeenCalled();
  });
});
