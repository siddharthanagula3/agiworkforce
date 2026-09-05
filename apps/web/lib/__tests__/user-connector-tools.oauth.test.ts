import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isSelfServiceConnector } from '@/lib/connectors/mcp-endpoints';

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

const mockAssertResolvedPublicHostname = vi.fn();
vi.mock('@/lib/egress-policy', () => {
  class MockEgressError extends Error {}
  return {
    assertResolvedPublicHostname: (...a: unknown[]) => mockAssertResolvedPublicHostname(...a),
    EgressPolicyError: MockEgressError,
  };
});

const mockBuildMcpToolCatalog = vi.fn();
const mockConnectMcpServer = vi.fn();
vi.mock('@agiworkforce/mcp', () => ({
  buildMcpToolCatalog: (...a: unknown[]) => mockBuildMcpToolCatalog(...a),
  connectMcpServer: (...a: unknown[]) => mockConnectMcpServer(...a),
}));

const PROVIDER = {
  connectorId: 'linear',
  displayName: 'Linear',
  authorizationUrl: 'https://auth.example.com/authorize',
  tokenUrl: 'https://auth.example.com/token',
  mcpUrl: 'https://mcp.example.com/mcp',
  transport: 'streamable-http' as const,
  scopes: ['read'],
  usePkce: true,
  tokenAuthMethod: 'client_secret_post' as const,
  authorizationParams: {},
  enabled: true,
  clientId: 'client-id',
  clientSecret: 'client-secret',
};

const mockConfiguredIds = vi.fn(() => new Set<string>(['linear']));
vi.mock('@/lib/connectors/oauth-registry', () => ({
  getConnectorOAuthProvider: (id: string) =>
    mockConfiguredIds().has(id) ? { ...PROVIDER, connectorId: id } : null,
  getOAuthConfiguredConnectorIds: () => mockConfiguredIds(),
  isConnectorOAuthSupported: (id: string) =>
    mockConfiguredIds().has(id) || isSelfServiceConnector(id),
  buildConnectorOAuthStartPath: (id: string) => `/api/connectors/oauth/start?connectorId=${id}`,
}));

const mockResolveAccessToken = vi.fn();
vi.mock('@/lib/connectors/oauth-access', () => ({
  resolveConnectorAccessToken: (...a: unknown[]) => mockResolveAccessToken(...a),
}));

const mockGrantSummaries = vi.fn();
vi.mock('@/lib/connectors/oauth-store', () => ({
  getUserConnectorOAuthGrantSummaries: (...a: unknown[]) => mockGrantSummaries(...a),
}));

import {
  __resetConnectorMcpMapCacheForTests,
  loadUserConnectorCapabilityCatalog,
  loadUserConnectorToolDefs,
  makeUserConnectorExecutor,
  evictConnectorOAuthCaches,
} from '../user-connector-tools';
import { parseConnectorAuthorizationRequired } from '@/lib/connectors/connect-required';
import { MCP_EGRESS_POLICY } from '@/lib/mcp-egress-policy';

function unauthorized(): Error {
  return Object.assign(new Error('Streamable HTTP error: Error POSTing to endpoint: {}'), {
    code: 401,
  });
}

function catalogWith(serverName: string, toolName: string) {
  return {
    catalog: {
      version: 1,
      generatedAt: Date.now(),
      servers: {},
      tools: [
        {
          serverName,
          safeServerName: serverName,
          toolName,
          inputSchema: { type: 'object', properties: {} },
          fallbackDescription: 'tool',
        },
      ],
    },
    handles: [],
  };
}

beforeEach(async () => {
  await evictConnectorOAuthCaches('user-1', 'linear');
  await evictConnectorOAuthCaches('user-1', 'airtable');
  vi.clearAllMocks();
  __resetConnectorMcpMapCacheForTests();
  delete process.env['CONNECTOR_MCP_SERVERS_JSON'];
  mockConfiguredIds.mockReturnValue(new Set(['linear']));
  mockAssertResolvedPublicHostname.mockResolvedValue(undefined);
  mockNeonQuery.mockResolvedValue([]);
  mockGrantSummaries.mockResolvedValue([{ connectorId: 'linear' }]);
});

describe('OAuth connector catalog gating', () => {
  it('offers no tools, and looks up no token, when the user holds no grant', async () => {
    mockGrantSummaries.mockResolvedValue([]);

    const defs = await loadUserConnectorToolDefs('user-1');

    expect(defs).toEqual([]);
    expect(mockResolveAccessToken).not.toHaveBeenCalled();
    expect(mockBuildMcpToolCatalog).not.toHaveBeenCalled();
  });

  it('offers no tools when a grant exists but its token can no longer be resolved', async () => {
    mockResolveAccessToken.mockResolvedValue({
      status: 'reauthorization-required',
      reason: 'refresh-failed',
    });

    const defs = await loadUserConnectorToolDefs('user-1');

    expect(defs).toEqual([]);
    expect(mockBuildMcpToolCatalog).not.toHaveBeenCalled();
  });

  it('offers tools, namespaced by connector id, once a grant resolves', async () => {
    mockResolveAccessToken.mockResolvedValue({
      status: 'ready',
      accessToken: 'tok',
      tokenType: 'Bearer',
      grantedScopes: ['read'],
    });
    mockBuildMcpToolCatalog.mockResolvedValue(catalogWith('linear', 'create_issue'));

    const defs = await loadUserConnectorToolDefs('user-1');

    expect(defs.map((d) => d.qualifiedName)).toEqual(['mcp__linear__create_issue']);
    expect(defs[0]?.serverId).toBe('linear');
    expect(mockBuildMcpToolCatalog).toHaveBeenCalledWith(
      {
        linear: expect.objectContaining({
          url: PROVIDER.mcpUrl,
          headers: { Authorization: 'Bearer tok' },
        }),
      },
      MCP_EGRESS_POLICY,
      { resolveRuntime: expect.any(Function) },
    );
  });

  it('offers tools for a self-service connector without an operator OAuth registration', async () => {
    mockConfiguredIds.mockReturnValue(new Set());
    mockGrantSummaries.mockResolvedValue([{ connectorId: 'airtable' }]);
    mockResolveAccessToken.mockResolvedValue({
      status: 'ready',
      accessToken: 'tok',
      tokenType: 'Bearer',
      grantedScopes: ['data.records:read'],
    });
    mockBuildMcpToolCatalog.mockResolvedValue(catalogWith('airtable', 'list_records'));

    const defs = await loadUserConnectorToolDefs('user-1');

    expect(defs.map((definition) => definition.qualifiedName)).toEqual([
      'mcp__airtable__list_records',
    ]);
  });

  it('loads capability details for a connected self-service connector', async () => {
    mockConfiguredIds.mockReturnValue(new Set());
    mockGrantSummaries.mockResolvedValue([{ connectorId: 'airtable' }]);
    mockResolveAccessToken.mockResolvedValue({
      status: 'ready',
      accessToken: 'tok',
      tokenType: 'Bearer',
      grantedScopes: ['data.records:read'],
    });
    mockBuildMcpToolCatalog.mockResolvedValue(catalogWith('airtable', 'list_records'));

    const capability = await loadUserConnectorCapabilityCatalog('user-1', 'airtable');

    expect(capability).toMatchObject({
      connectorId: 'airtable',
      source: 'oauth',
      catalog: {
        tools: [expect.objectContaining({ serverName: 'airtable', toolName: 'list_records' })],
      },
    });
  });

  it('still applies the user per-tool BLOCK verdict to an OAuth connector', async () => {
    mockResolveAccessToken.mockResolvedValue({
      status: 'ready',
      accessToken: 'tok',
      tokenType: 'Bearer',
      grantedScopes: ['read'],
    });
    mockBuildMcpToolCatalog.mockResolvedValue(catalogWith('linear', 'create_issue'));

    const defs = await loadUserConnectorToolDefs('user-1', {
      isToolDenied: (connectorId, toolName) =>
        connectorId === 'linear' && toolName === 'create_issue',
    });

    expect(defs).toEqual([]);
  });

  it('keeps the operator mapping when an id is both operator-mapped and OAuth-configured', async () => {
    process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
      connectors: [{ connectorId: 'linear', url: 'https://operator.example.com/mcp' }],
    });
    __resetConnectorMcpMapCacheForTests();
    mockNeonQuery.mockImplementation((sql: string) =>
      String(sql).includes('user_connectors')
        ? Promise.resolve([{ connector_id: 'linear' }])
        : Promise.resolve([]),
    );
    mockBuildMcpToolCatalog.mockResolvedValue(catalogWith('linear', 'operator_tool'));

    const defs = await loadUserConnectorToolDefs('user-1');

    expect(defs.map((d) => d.qualifiedName)).toEqual(['mcp__linear__operator_tool']);
    expect(mockResolveAccessToken).not.toHaveBeenCalled();
    expect(mockBuildMcpToolCatalog).toHaveBeenCalledWith(
      { linear: expect.objectContaining({ url: 'https://operator.example.com/mcp' }) },
      MCP_EGRESS_POLICY,
      { resolveRuntime: expect.any(Function) },
    );
  });
});

describe('OAuth connector execution, lazy authentication', () => {
  it('dispatches a self-service connector tool without an operator OAuth registration', async () => {
    mockConfiguredIds.mockReturnValue(new Set());
    mockResolveAccessToken.mockResolvedValue({
      status: 'ready',
      accessToken: 'tok',
      tokenType: 'Bearer',
      grantedScopes: ['data.records:read'],
    });
    const callTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'records loaded' }],
    });
    mockConnectMcpServer.mockResolvedValue({ callTool, close: async () => undefined });

    const result = await makeUserConnectorExecutor('user-1')('airtable', 'list_records', {});

    expect(result).toEqual({ handled: true, content: 'records loaded', isError: false });
    expect(callTool).toHaveBeenCalledWith('list_records', {});
  });

  it('returns a connect path when a self-service connector grant is missing', async () => {
    mockConfiguredIds.mockReturnValue(new Set());
    mockResolveAccessToken.mockResolvedValue({ status: 'not-connected' });

    const result = await makeUserConnectorExecutor('user-1')('airtable', 'list_records', {});

    expect(parseConnectorAuthorizationRequired(result.content)).toMatchObject({
      connectorId: 'airtable',
      connectUrl: '/api/connectors/oauth/start?connectorId=airtable',
      reason: 'not_connected',
    });
  });

  it('surfaces a structured connect card instead of failing when there is no grant', async () => {
    mockResolveAccessToken.mockResolvedValue({ status: 'not-connected' });

    const result = await makeUserConnectorExecutor('user-1')('linear', 'create_issue', {});

    expect(result.handled).toBe(true);
    expect(result.isError).toBe(true);
    const payload = parseConnectorAuthorizationRequired(result.content);
    expect(payload).toMatchObject({
      connectorId: 'linear',
      toolName: 'create_issue',
      reason: 'not_connected',
      connectUrl: '/api/connectors/oauth/start?connectorId=linear',
      scopes: ['read'],
    });
    expect(mockConnectMcpServer).not.toHaveBeenCalled();
  });

  it('preserves cancellation and continuation options when retrying a tool after a 401', async () => {
    mockResolveAccessToken
      .mockResolvedValueOnce({
        status: 'ready',
        accessToken: 'stale',
        tokenType: 'Bearer',
        grantedScopes: ['read'],
      })
      .mockResolvedValueOnce({
        status: 'ready',
        accessToken: 'fresh',
        tokenType: 'Bearer',
        grantedScopes: ['read'],
      });

    const callTool = vi
      .fn()
      .mockRejectedValueOnce(unauthorized())
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'issue created' }] });
    mockConnectMcpServer.mockResolvedValue({ callTool, close: async () => undefined });

    const controller = new AbortController();
    const options = {
      signal: controller.signal,
      allowInputRequired: true,
      inputResponses: { confirmation: true },
      requestState: 'continuation-state',
    };
    const result = await makeUserConnectorExecutor('user-1')(
      'linear',
      'create_issue',
      { title: 'x' },
      options,
    );

    expect(result).toEqual({ handled: true, content: 'issue created', isError: false });
    expect(mockResolveAccessToken).toHaveBeenLastCalledWith('user-1', 'linear', {
      forceRefresh: true,
    });
    expect(callTool).toHaveBeenNthCalledWith(1, 'create_issue', { title: 'x' }, options);
    expect(callTool).toHaveBeenNthCalledWith(2, 'create_issue', { title: 'x' }, options);
    expect(mockConnectMcpServer).toHaveBeenCalledTimes(2);
  });

  it('asks the user to reconnect when the refresh cannot produce a token', async () => {
    mockResolveAccessToken
      .mockResolvedValueOnce({
        status: 'ready',
        accessToken: 'stale',
        tokenType: 'Bearer',
        grantedScopes: ['read'],
      })
      .mockResolvedValueOnce({ status: 'reauthorization-required', reason: 'refresh-failed' });

    const callTool = vi.fn().mockRejectedValue(unauthorized());
    mockConnectMcpServer.mockResolvedValue({ callTool, close: async () => undefined });

    const result = await makeUserConnectorExecutor('user-1')('linear', 'create_issue', {});

    expect(parseConnectorAuthorizationRequired(result.content)).toMatchObject({
      reason: 'authorization_expired',
    });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('gives up after ONE retry when a freshly-minted token is also rejected', async () => {
    mockResolveAccessToken.mockResolvedValue({
      status: 'ready',
      accessToken: 'tok',
      tokenType: 'Bearer',
      grantedScopes: ['read'],
    });
    const callTool = vi.fn().mockRejectedValue(unauthorized());
    mockConnectMcpServer.mockResolvedValue({ callTool, close: async () => undefined });

    const result = await makeUserConnectorExecutor('user-1')('linear', 'create_issue', {});

    expect(parseConnectorAuthorizationRequired(result.content)).toMatchObject({
      reason: 'authorization_unavailable',
    });
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it('turns a step-up 403 into a scope-specific connect card without retrying', async () => {
    mockResolveAccessToken.mockResolvedValue({
      status: 'ready',
      accessToken: 'tok',
      tokenType: 'Bearer',
      grantedScopes: ['read'],
    });
    const callTool = vi.fn().mockRejectedValue(
      Object.assign(new Error('Bearer error="insufficient_scope", scope="write admin"'), {
        code: 403,
      }),
    );
    mockConnectMcpServer.mockResolvedValue({ callTool, close: async () => undefined });

    const result = await makeUserConnectorExecutor('user-1')('linear', 'create_issue', {});

    expect(parseConnectorAuthorizationRequired(result.content)).toMatchObject({
      reason: 'insufficient_scope',
      scopes: ['read', 'write', 'admin'],
    });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('reports an ordinary tool failure as an ordinary error, not a connect card', async () => {
    mockResolveAccessToken.mockResolvedValue({
      status: 'ready',
      accessToken: 'tok',
      tokenType: 'Bearer',
      grantedScopes: ['read'],
    });
    const callTool = vi.fn().mockRejectedValue(new Error('upstream said 500'));
    mockConnectMcpServer.mockResolvedValue({ callTool, close: async () => undefined });

    const result = await makeUserConnectorExecutor('user-1')('linear', 'create_issue', {});

    expect(parseConnectorAuthorizationRequired(result.content)).toBeNull();
    expect(result).toMatchObject({ isError: true });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('does not claim an unconfigured connector id', async () => {
    mockConfiguredIds.mockReturnValue(new Set());

    const result = await makeUserConnectorExecutor('user-1')('dropbox', 'search', {});

    expect(result.handled).toBe(false);
  });
});
