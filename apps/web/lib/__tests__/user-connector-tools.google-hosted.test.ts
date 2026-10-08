import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<TypesModule>()),
  connectorsReleased: () => true,
}));

type ScanModule0 = typeof import('@/lib/server/neon-db');
type ScanModule1 = typeof import('@/lib/egress-policy');
type ScanModule2 = typeof import('@agiworkforce/mcp');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  buildMcpToolCatalog: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', async (importOriginal) => {
  const adapter = {
    query: (...args: unknown[]) => mocks.query(...args),
    execute: async () => 0,
    transaction: async (callback: (tx: unknown) => unknown) => callback(adapter),
  };
  return {
    ...(await importOriginal<ScanModule0>()),
    getNeonDb: () => adapter,
  };
});

vi.mock('@/lib/egress-policy', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  assertResolvedPublicHostname: vi.fn(async () => undefined),
}));

vi.mock('@agiworkforce/mcp', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  buildMcpToolCatalog: (...args: unknown[]) => mocks.buildMcpToolCatalog(...args),
}));

import { loadUserConnectorToolCatalog } from '../user-connector-tools';

type TypesModule = typeof import('@agiworkforce/types');

function serveCustomConnectors(urls: Record<string, string>) {
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes('user_custom_connectors')
      ? Object.entries(urls).map(([shortId, url], index) => ({
          id: `row-${index}`,
          short_id: shortId,
          name: shortId,
          url,
          transport: 'streamable-http',
          auth_header_enc: null,
        }))
      : [],
  );
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.buildMcpToolCatalog.mockReset().mockImplementation(async (configs: object) => {
    const serverName = Object.keys(configs)[0]!;
    return {
      catalog: {
        version: 1,
        generatedAt: 0,
        servers: {},
        tools: [
          {
            serverName,
            safeServerName: serverName,
            toolName: 'read',
            description: 'read',
            inputSchema: { type: 'object' },
            fallbackDescription: 'read',
          },
        ],
      },
      handles: [],
    };
  });
});

describe('custom connectors served from a Google API host', () => {
  const urls = {
    aaaaaaaaaa: 'https://sheets.googleapis.com/mcp',
    bbbbbbbbbb: 'https://mcp.example.com/mcp',
  };

  it('are not dialled for a turn that may reach a provider that trains', async () => {
    serveCustomConnectors(urls);

    const { tools } = await loadUserConnectorToolCatalog('user-1', { organizationId: null });

    expect(tools.map((tool) => tool.serverId)).toEqual(['custom-bbbbbbbbbb']);
  });

  it('are offered, marked as Google data, when the turn is limited to no-training models', async () => {
    serveCustomConnectors(urls);

    const { tools } = await loadUserConnectorToolCatalog('user-1', {
      organizationId: null,
      googleUserDataRouted: true,
    });

    const google = tools.find((tool) => tool.serverId === 'custom-aaaaaaaaaa');
    expect(google?.googleUserData).toBe(true);
    expect(tools.find((tool) => tool.serverId === 'custom-bbbbbbbbbb')?.googleUserData).toBe(
      undefined,
    );
  });
});
