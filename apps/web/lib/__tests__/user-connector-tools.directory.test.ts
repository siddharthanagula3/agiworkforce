import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const mockConnectMcpServer = vi.fn();
vi.mock('@agiworkforce/mcp', () => ({
  buildMcpToolCatalog: (...a: unknown[]) => mockBuildMcpToolCatalog(...a),
  connectMcpServer: (...a: unknown[]) => mockConnectMcpServer(...a),
}));

vi.mock('@/lib/connectors/oauth-registry', () => ({
  getConnectorOAuthProvider: () => null,
  getOAuthConfiguredConnectorIds: () => new Set<string>(),
  isConnectorOAuthSupported: () => false,
  buildConnectorOAuthStartPath: (id: string) =>
    `/api/connectors/oauth/start?connectorId=${encodeURIComponent(id)}`,
}));

const mockResolveAccessToken = vi.fn();
vi.mock('@/lib/connectors/oauth-access', () => ({
  resolveConnectorAccessToken: (...a: unknown[]) => mockResolveAccessToken(...a),
}));

const mockGrantSummaries = vi.fn();
vi.mock('@/lib/connectors/oauth-store', () => ({
  getUserConnectorOAuthGrantSummaries: (...a: unknown[]) => mockGrantSummaries(...a),
  ConnectorGrantDecryptionError: class ConnectorGrantDecryptionError extends Error {},
  getConnectorOAuthGrant: vi.fn(),
  revokeConnectorOAuthGrant: vi.fn(),
  updateConnectorOAuthGrantTokens: vi.fn(),
}));

vi.mock('@/lib/connectors/mcp-runtime-cache', () => ({
  getMcpStatelessRuntime: vi.fn(async () => ({})),
  NeonMcpResponseCacheStore: class {
    async get() {
      return undefined;
    }
    async set() {
      return 1;
    }
  },
}));

const OPEN_ID = 'ac.tandem/docs-mcp';
const OAUTH_ID = 'ch.cowork24/booking';
const OAUTH_SERVER_ID = 'dir-0123456789ab';
const OPEN_URL = 'https://tandem.ac/mcp';
const OAUTH_URL = 'https://mcp.cowork24.ch/mcp';

const targets: Record<string, Record<string, unknown>> = {
  [OPEN_ID]: {
    connectorId: OPEN_ID,
    serverId: 'dir-fedcba987654',
    mcpUrl: OPEN_URL,
    transport: 'streamable-http',
    name: 'Tandem Docs MCP',
    documentationUrl: null,
  },
  [OAUTH_ID]: {
    connectorId: OAUTH_ID,
    serverId: OAUTH_SERVER_ID,
    mcpUrl: OAUTH_URL,
    transport: 'streamable-http',
    name: 'Cowork24',
    documentationUrl: 'https://cowork24.ch/docs',
  },
};

vi.mock('@/lib/connectors/mcp-directory-targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/mcp-directory-targets')>()),
  resolveDirectoryTarget: async (ref: string) =>
    Object.values(targets).find(
      (target) => target['connectorId'] === ref || target['serverId'] === ref,
    ) ?? null,
}));

import {
  loadUserConnectorCapabilityCatalog,
  loadUserConnectorToolDefs,
  makeUserConnectorExecutor,
  withUserConnectorMcpHandle,
} from '../user-connector-tools';
import { parseConnectorAuthorizationRequired } from '@/lib/connectors/connect-required';

function catalogFor(serverName: string, toolName: string) {
  const tool = {
    serverName,
    safeServerName: serverName,
    toolName,
    description: `${toolName} tool`,
    fallbackDescription: `${toolName} tool`,
    inputSchema: { type: 'object', properties: {} },
    visibility: 'both',
  };
  return {
    version: 1,
    generatedAt: Date.now(),
    servers: {
      [serverName]: {
        tools: [tool],
        resources: [],
        resourceTemplates: [],
        prompts: [],
        apps: [],
        discoveryErrors: [],
        capabilities: { tools: {} },
        protocolEra: 'modern',
        tasksSupported: false,
      },
    },
    tools: [tool],
    resources: [],
    resourceTemplates: [],
    prompts: [],
    apps: [],
  };
}

function handleFor(serverName: string, toolName: string) {
  return {
    serverName,
    catalog: catalogFor(serverName, toolName).servers[serverName],
    callTool: vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text', text: `ok:${toolName}` }],
    })),
    close: vi.fn(async () => undefined),
  };
}

function customRows(rows: Array<Record<string, unknown>>) {
  mockNeonQuery.mockImplementation(async (sql: string) => {
    if (String(sql).includes('from user_custom_connectors')) return rows;
    if (String(sql).includes('from user_connectors')) return [];
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGrantSummaries.mockResolvedValue([]);
  customRows([]);
  mockResolveAccessToken.mockResolvedValue({ status: 'not-connected' });
});

describe('directory records in the connector tool catalog', () => {
  it('offers the tools of a directory OAuth grant under a tool-name-safe server id', async () => {
    mockGrantSummaries.mockResolvedValue([
      { connectorId: OAUTH_ID, grantedScopes: [], connectedAt: '', updatedAt: '' },
    ]);
    mockResolveAccessToken.mockResolvedValue({
      status: 'ready',
      accessToken: 'live-token',
      tokenType: 'Bearer',
      grantedScopes: [],
    });
    mockBuildMcpToolCatalog.mockResolvedValue({
      catalog: catalogFor(OAUTH_SERVER_ID, 'book_room'),
      handles: [],
    });

    const defs = await loadUserConnectorToolDefs('user-1');

    expect(defs.map((def) => def.qualifiedName)).toEqual([`mcp__${OAUTH_SERVER_ID}__book_room`]);
    expect(defs[0]).toMatchObject({ serverId: OAUTH_SERVER_ID, serverLabel: 'Cowork24' });
    expect(mockResolveAccessToken).toHaveBeenCalledWith('user-1', OAUTH_ID, { discovered: true });
    const [servers] = mockBuildMcpToolCatalog.mock.calls[0] as [
      Record<string, { url: string; headers: Record<string, string> }>,
    ];
    expect(servers[OAUTH_SERVER_ID]).toMatchObject({
      url: OAUTH_URL,
      headers: { Authorization: 'Bearer live-token' },
    });
  });

  it('routes a call to a directory server id through the stored grant', async () => {
    mockResolveAccessToken.mockResolvedValue({
      status: 'ready',
      accessToken: 'live-token',
      tokenType: 'Bearer',
      grantedScopes: [],
    });
    const handle = handleFor(OAUTH_SERVER_ID, 'book_room');
    mockConnectMcpServer.mockResolvedValue(handle);

    const execute = makeUserConnectorExecutor('user-1');
    const result = await execute(OAUTH_SERVER_ID, 'book_room', { room: 'a' });

    expect(result).toMatchObject({ handled: true, isError: false, content: 'ok:book_room' });
    expect(mockConnectMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: OAUTH_SERVER_ID,
        config: expect.objectContaining({
          url: OAUTH_URL,
          headers: { Authorization: 'Bearer live-token' },
        }),
      }),
    );
    expect(handle.close).toHaveBeenCalled();
  });

  it('asks the user to connect a directory server that has no grant, with a real start path', async () => {
    const execute = makeUserConnectorExecutor('user-1');
    const result = await execute(OAUTH_SERVER_ID, 'book_room', {});

    expect(result.handled).toBe(true);
    expect(result.isError).toBe(true);
    const payload = parseConnectorAuthorizationRequired(result.content);
    expect(payload).toMatchObject({
      connectorId: OAUTH_ID,
      connectorName: 'Cowork24',
      reason: 'not_connected',
      connectUrl: `/api/connectors/oauth/start?connectorId=${encodeURIComponent(OAUTH_ID)}`,
    });
  });

  it('opens a handle for a directory record that connected through the custom path', async () => {
    customRows([
      {
        id: 'row-1',
        short_id: 'abc123def0',
        name: 'Tandem Docs MCP',
        url: OPEN_URL,
        transport: 'streamable-http',
        auth_header_enc: null,
      },
    ]);
    const handle = handleFor('custom-abc123def0', 'search_docs');
    mockConnectMcpServer.mockResolvedValue(handle);

    const output = await withUserConnectorMcpHandle('user-1', OPEN_ID, async (connection) => ({
      connectorId: connection.connectorId,
      label: connection.connectorLabel,
      tools: connection.handle.catalog.tools.map((tool) => tool.toolName),
    }));

    expect(output).toEqual({
      connectorId: 'custom-abc123def0',
      label: 'Tandem Docs MCP',
      tools: ['search_docs'],
    });
    expect(mockConnectMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: 'custom-abc123def0',
        config: expect.objectContaining({ url: OPEN_URL, headers: {} }),
      }),
    );
    expect(mockResolveAccessToken).not.toHaveBeenCalled();
  });

  it('serves the capability catalog of a directory OAuth grant under its server id', async () => {
    mockResolveAccessToken.mockResolvedValue({
      status: 'ready',
      accessToken: 'live-token',
      tokenType: 'Bearer',
      grantedScopes: [],
    });
    mockBuildMcpToolCatalog.mockResolvedValue({
      catalog: catalogFor(OAUTH_SERVER_ID, 'book_room'),
      handles: [],
    });

    const resolved = await loadUserConnectorCapabilityCatalog('user-1', OAUTH_ID);

    expect(resolved).toMatchObject({
      connectorId: OAUTH_SERVER_ID,
      connectorLabel: 'Cowork24',
      source: 'oauth',
    });
    expect(resolved?.catalog.servers[OAUTH_SERVER_ID]?.tools.map((t) => t.toolName)).toEqual([
      'book_room',
    ]);
  });

  it('returns nothing for a directory record the user never connected', async () => {
    expect(await loadUserConnectorCapabilityCatalog('user-1', OPEN_ID)).toBeNull();
    expect(
      await withUserConnectorMcpHandle('user-1', OAUTH_ID, async () => 'unreachable'),
    ).toBeNull();
  });
});
