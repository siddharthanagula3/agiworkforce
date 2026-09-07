import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockNeonQuery = vi.fn();
vi.mock('@/lib/server/neon-db', () => {
  const adapter = {
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: async () => 0,
    transaction: async (callback: (tx: unknown) => unknown) => callback(adapter),
  };
  return { getNeonDb: () => adapter };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/github-app', () => ({
  getInstallationAccessToken: vi.fn(),
  getPrDiff: vi.fn(),
  isGitHubAppConfigured: () => false,
  isGitHubInstallationLinkingAvailable: () => false,
  postIssueComment: vi.fn(),
  postPrReview: vi.fn(),
}));

vi.mock('@/lib/egress-policy', () => {
  class MockEgressError extends Error {}
  return {
    assertResolvedPublicHostname: vi.fn(async () => undefined),
    EgressPolicyError: MockEgressError,
    pinnedPublicFetch: (...a: Parameters<typeof fetch>) => fetch(...a),
  };
});

const mockBuildMcpToolCatalog = vi.fn();
vi.mock('@agiworkforce/mcp', () => ({
  buildMcpToolCatalog: (...a: unknown[]) => mockBuildMcpToolCatalog(...a),
  connectMcpServer: vi.fn(),
}));

import {
  loadUserConnectorToolDefs,
  __resetConnectorMcpMapCacheForTests,
} from '../user-connector-tools';

const MCP_CLIENT_DEFAULT_CONNECTION_TIMEOUT_MS = 30_000;

interface Deferred {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function catalogFor(serverName: string, toolName: string) {
  return {
    catalog: {
      version: 1,
      generatedAt: 0,
      servers: {},
      tools: [
        {
          serverName,
          safeServerName: serverName,
          toolName,
          inputSchema: { type: 'object' },
          fallbackDescription: toolName,
        },
      ],
    },
    handles: [],
  };
}

function stubActiveConnectors(ids: string[]) {
  mockNeonQuery.mockImplementation((sql: string) => {
    if (String(sql).includes('user_connectors')) {
      return Promise.resolve(ids.map((connector_id) => ({ connector_id })));
    }
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetConnectorMcpMapCacheForTests();
  delete process.env['CONNECTOR_MCP_SERVERS_JSON'];
});

describe('connector catalog assembly does not serialise on a slow server', () => {
  it('dials every connected connector at once', async () => {
    process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
      connectors: [
        { connectorId: 'alpha', url: 'https://alpha.example/mcp' },
        { connectorId: 'beta', url: 'https://beta.example/mcp' },
      ],
    });
    stubActiveConnectors(['alpha', 'beta']);

    const slow = deferred();
    const dialled: string[] = [];
    mockBuildMcpToolCatalog.mockImplementation(async (configs: Record<string, unknown>) => {
      const serverName = Object.keys(configs)[0]!;
      dialled.push(serverName);
      if (serverName === 'alpha') await slow.promise;
      return catalogFor(serverName, `${serverName}_tool`);
    });

    const pending = loadUserConnectorToolDefs('user-1');
    await vi.waitFor(() => {
      expect(dialled).toEqual(['alpha', 'beta']);
    });

    slow.resolve(undefined);
    const defs = await pending;
    expect(defs.map((d) => d.qualifiedName)).toEqual([
      'mcp__alpha__alpha_tool',
      'mcp__beta__beta_tool',
    ]);
  });

  it('bounds the handshake well under the MCP client default', async () => {
    process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
      connectors: [{ connectorId: 'gamma', url: 'https://gamma.example/mcp' }],
    });
    stubActiveConnectors(['gamma']);
    mockBuildMcpToolCatalog.mockResolvedValue(catalogFor('gamma', 'gamma_tool'));

    await loadUserConnectorToolDefs('user-1');

    const [configs] = mockBuildMcpToolCatalog.mock.calls[0] as [
      Record<string, { connectionTimeoutMs?: number }>,
    ];
    const timeout = configs['gamma']?.connectionTimeoutMs;
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThan(MCP_CLIENT_DEFAULT_CONNECTION_TIMEOUT_MS);
  });

  it('never has more than the dial cap of six handshakes open at once', async () => {
    const ids = Array.from({ length: 15 }, (_, index) => `srv${index}`);
    process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
      connectors: ids.map((id) => ({ connectorId: id, url: `https://${id}.example/mcp` })),
    });
    stubActiveConnectors(ids);

    let open = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    mockBuildMcpToolCatalog.mockImplementation(async (configs: Record<string, unknown>) => {
      const serverName = Object.keys(configs)[0]!;
      open += 1;
      peak = Math.max(peak, open);
      await new Promise<void>((resolve) => release.push(resolve));
      open -= 1;
      return catalogFor(serverName, `${serverName}_tool`);
    });

    const pending = loadUserConnectorToolDefs('user-1');
    await vi.waitFor(() => {
      expect(release.length).toBe(6);
    });
    while (release.length > 0) {
      release.shift()!();
      await Promise.resolve();
    }
    const defs = await pending;

    expect(peak).toBe(6);
    expect(defs).toHaveLength(ids.length);
    expect(defs.map((d) => d.qualifiedName)).toEqual(ids.map((id) => `mcp__${id}__${id}_tool`));
  });

  it('keeps the reachable connectors when one of them fails outright', async () => {
    process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
      connectors: [
        { connectorId: 'delta', url: 'https://delta.example/mcp' },
        { connectorId: 'epsilon', url: 'https://epsilon.example/mcp' },
      ],
    });
    stubActiveConnectors(['delta', 'epsilon']);
    mockBuildMcpToolCatalog.mockImplementation(async (configs: Record<string, unknown>) => {
      const serverName = Object.keys(configs)[0]!;
      if (serverName === 'delta') throw new Error('unreachable');
      return catalogFor(serverName, `${serverName}_tool`);
    });

    const defs = await loadUserConnectorToolDefs('user-1');

    expect(defs.map((d) => d.qualifiedName)).toEqual(['mcp__epsilon__epsilon_tool']);
  });
});
