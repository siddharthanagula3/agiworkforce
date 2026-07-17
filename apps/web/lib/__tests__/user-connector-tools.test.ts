/**
 * Unit tests for the per-user connector → tool-loop bridge
 * (fixes WEB-CONNECTORS-NO-RUNTIME-EFFECT-01).
 *
 * Proves:
 *   - github built-in tools appear ONLY when the user has a usable installation;
 *   - a user with no installation and no connected remote connectors gets no tools;
 *   - operator-mapped remote connectors appear namespaced only when the user has
 *     an ACTIVE user_connectors row for them (disconnected → absent);
 *   - an SSRF-invalid remote endpoint is rejected + logged, not crashed;
 *   - the executor dispatches github tools to the GitHub integration and remote
 *     connector tools to the MCP handle, and re-validates authorization.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockNeonQuery = vi.fn();
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockNeonQuery(...args) }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockGetInstallationAccessToken = vi.fn();
const mockGetPrDiff = vi.fn();
const mockPostIssueComment = vi.fn();
const mockPostPrReview = vi.fn();
const mockIsGitHubAppConfigured = vi.fn();
vi.mock('@/lib/github-app', () => ({
  getInstallationAccessToken: (...a: unknown[]) => mockGetInstallationAccessToken(...a),
  getPrDiff: (...a: unknown[]) => mockGetPrDiff(...a),
  isGitHubAppConfigured: () => mockIsGitHubAppConfigured(),
  postIssueComment: (...a: unknown[]) => mockPostIssueComment(...a),
  postPrReview: (...a: unknown[]) => mockPostPrReview(...a),
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

import {
  loadUserConnectorToolDefs,
  makeUserConnectorExecutor,
  __resetConnectorMcpMapCacheForTests,
} from '../user-connector-tools';
import { EgressPolicyError } from '@/lib/egress-policy';

/** Route the neon query mock by SQL fragment so both tables can be stubbed. */
function stubDb(opts: {
  installations?: Array<{ installation_id: number; account_login: string }>;
  activeConnectors?: string[];
}) {
  mockNeonQuery.mockImplementation((sql: string) => {
    if (sql.includes('github_installations')) return Promise.resolve(opts.installations ?? []);
    if (sql.includes('user_connectors')) {
      return Promise.resolve((opts.activeConnectors ?? []).map((c) => ({ connector_id: c })));
    }
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetConnectorMcpMapCacheForTests();
  delete process.env['CONNECTOR_MCP_SERVERS_JSON'];
  mockIsGitHubAppConfigured.mockReturnValue(true);
  mockAssertResolvedPublicHostname.mockResolvedValue(undefined);
});

describe('loadUserConnectorToolDefs — github built-in gate', () => {
  it('offers github tools only when the user has a usable installation', async () => {
    stubDb({ installations: [{ installation_id: 42, account_login: 'acme' }] });
    const defs = await loadUserConnectorToolDefs('user-1');
    const names = defs.map((d) => d.qualifiedName);
    expect(names).toContain('mcp__github__get_pull_request_diff');
    expect(names).toContain('mcp__github__post_issue_comment');
  });

  it('offers NO github tools when the user has no installation', async () => {
    stubDb({ installations: [] });
    const defs = await loadUserConnectorToolDefs('user-1');
    expect(defs).toEqual([]);
  });

  it('offers NO github tools when the GitHub App is not configured', async () => {
    mockIsGitHubAppConfigured.mockReturnValue(false);
    stubDb({ installations: [{ installation_id: 42, account_login: 'acme' }] });

    const defs = await loadUserConnectorToolDefs('user-1');

    expect(defs).toEqual([]);
    expect(
      mockNeonQuery.mock.calls.some(([sql]) => String(sql).includes('github_installations')),
    ).toBe(false);
  });

  it('returns [] for an empty userId without touching the DB', async () => {
    const defs = await loadUserConnectorToolDefs('');
    expect(defs).toEqual([]);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });
});

describe('loadUserConnectorToolDefs — remote connector gate', () => {
  it('offers a remote connector namespaced only when the user has it active', async () => {
    process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
      connectors: [{ connectorId: 'notion', url: 'https://mcp.notion.example/mcp' }],
    });
    stubDb({ activeConnectors: ['notion'] });
    mockBuildMcpToolCatalog.mockResolvedValue({
      catalog: {
        version: 1,
        generatedAt: 0,
        servers: {},
        tools: [
          {
            serverName: 'notion',
            safeServerName: 'notion',
            toolName: 'search_pages',
            inputSchema: { type: 'object' },
            fallbackDescription: 'search',
          },
        ],
      },
      handles: [],
    });

    const defs = await loadUserConnectorToolDefs('user-1');
    expect(defs.map((d) => d.qualifiedName)).toContain('mcp__notion__search_pages');
    expect(mockAssertResolvedPublicHostname).toHaveBeenCalledWith('https://mcp.notion.example/mcp');
  });

  it('does NOT offer a mapped connector the user has not connected', async () => {
    process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
      connectors: [{ connectorId: 'notion', url: 'https://mcp.notion.example/mcp' }],
    });
    stubDb({ activeConnectors: [] }); // user connected nothing
    const defs = await loadUserConnectorToolDefs('user-1');
    expect(defs).toEqual([]);
    expect(mockBuildMcpToolCatalog).not.toHaveBeenCalled();
  });

  it('rejects an SSRF-invalid remote endpoint without crashing (tools absent)', async () => {
    process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
      connectors: [{ connectorId: 'evil', url: 'https://169.254.169.254/mcp' }],
    });
    stubDb({ activeConnectors: ['evil'] });
    mockAssertResolvedPublicHostname.mockRejectedValue(new EgressPolicyError('blocked'));

    const defs = await loadUserConnectorToolDefs('user-1');
    expect(defs).toEqual([]);
    expect(mockBuildMcpToolCatalog).not.toHaveBeenCalled();
  });

  it('rejects a plaintext HTTP operator connector before discovery', async () => {
    process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
      connectors: [{ connectorId: 'notion', url: 'http://mcp.notion.example/mcp' }],
    });
    stubDb({ activeConnectors: ['notion'] });

    const defs = await loadUserConnectorToolDefs('user-1');

    expect(defs).toEqual([]);
    expect(mockAssertResolvedPublicHostname).not.toHaveBeenCalled();
    expect(mockBuildMcpToolCatalog).not.toHaveBeenCalled();
  });
});

describe('makeUserConnectorExecutor', () => {
  it('executes a github diff tool via the GitHub integration', async () => {
    stubDb({ installations: [{ installation_id: 42, account_login: 'acme' }] });
    mockGetInstallationAccessToken.mockResolvedValue('tok');
    mockGetPrDiff.mockResolvedValue('diff --git a b');

    const exec = makeUserConnectorExecutor('user-1');
    const result = await exec('github', 'get_pull_request_diff', {
      owner: 'acme',
      repo: 'app',
      pull_number: 7,
    });

    expect(mockGetInstallationAccessToken).toHaveBeenCalledWith(42);
    expect(mockGetPrDiff).toHaveBeenCalledWith('tok', 'acme', 'app', 7);
    expect(result).toEqual({ handled: true, content: 'diff --git a b', isError: false });
  });

  it('surfaces a github execution failure as a tool-result error (not a throw)', async () => {
    stubDb({ installations: [{ installation_id: 42, account_login: 'acme' }] });
    mockGetInstallationAccessToken.mockResolvedValue('tok');
    mockGetPrDiff.mockRejectedValue(new Error('Failed to fetch PR diff: 404'));

    const exec = makeUserConnectorExecutor('user-1');
    const result = await exec('github', 'get_pull_request_diff', {
      owner: 'acme',
      repo: 'app',
      pull_number: 7,
    });
    expect(result.handled).toBe(true);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('404');
  });

  it('returns handled:false for a non-connector serverId (falls through to operator MCP)', async () => {
    stubDb({});
    const exec = makeUserConnectorExecutor('user-1');
    const result = await exec('operator-server', 'some_tool', {});
    expect(result.handled).toBe(false);
  });

  it('refuses to execute a mapped connector the user has not connected', async () => {
    process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
      connectors: [{ connectorId: 'notion', url: 'https://mcp.notion.example/mcp' }],
    });
    stubDb({ activeConnectors: [] });
    const exec = makeUserConnectorExecutor('user-1');
    const result = await exec('notion', 'search_pages', {});
    expect(result.handled).toBe(true);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not connected');
    expect(mockConnectMcpServer).not.toHaveBeenCalled();
  });

  it('executes a connected remote connector tool through the MCP handle', async () => {
    process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
      connectors: [{ connectorId: 'notion', url: 'https://mcp.notion.example/mcp' }],
    });
    stubDb({ activeConnectors: ['notion'] });
    const callTool = vi.fn().mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: 'page found' }],
    });
    mockConnectMcpServer.mockResolvedValue({ serverName: 'notion', callTool, close: vi.fn() });

    const exec = makeUserConnectorExecutor('user-1');
    const result = await exec('notion', 'search_pages', { q: 'roadmap' });
    expect(callTool).toHaveBeenCalledWith('search_pages', { q: 'roadmap' });
    expect(result).toEqual({ handled: true, content: 'page found', isError: false });
  });

  it('never reuses User A credentialed handle when User B has the same short_id', async () => {
    mockIsGitHubAppConfigured.mockReturnValue(false);
    const sameShortId = 'deadbeef00';
    const userRows = {
      'user-a': {
        id: 'row-a',
        short_id: sameShortId,
        name: 'Private A',
        url: 'https://a.mcp.example/mcp',
        transport: 'streamable-http',
        auth_header_enc: null,
      },
      'user-b': {
        id: 'row-b',
        short_id: sameShortId,
        name: 'Private B',
        url: 'https://b.mcp.example/mcp',
        transport: 'streamable-http',
        auth_header_enc: null,
      },
    } as const;
    mockNeonQuery.mockImplementation((sql: string, params: unknown[] = []) => {
      if (sql.includes('user_custom_connectors')) {
        const userId = sql.includes('where short_id = $1') ? params[1] : params[0];
        const row = userRows[userId as keyof typeof userRows];
        return Promise.resolve(row ? [row] : []);
      }
      return Promise.resolve([]);
    });

    const callAsA = vi.fn().mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: 'credential owner: A' }],
    });
    const callAsB = vi.fn().mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: 'credential owner: B' }],
    });
    mockBuildMcpToolCatalog.mockImplementation(async (configs: Record<string, { url?: string }>) => {
      const config = Object.values(configs)[0];
      const isUserA = config?.url === 'https://a.mcp.example/mcp';
      return {
        catalog: {
          version: 1,
          generatedAt: 0,
          servers: {},
          tools: [
            {
              serverName: `custom-${sameShortId}`,
              safeServerName: `custom-${sameShortId}`,
              toolName: 'whoami',
              description: isUserA ? 'User A private tool' : 'User B private tool',
              inputSchema: { type: 'object' },
              fallbackDescription: 'identify credential owner',
            },
          ],
        },
        handles: [
          {
            serverName: `custom-${sameShortId}`,
            callTool: isUserA ? callAsA : callAsB,
            close: vi.fn(),
          },
        ],
      };
    });
    mockConnectMcpServer.mockResolvedValue({
      serverName: `custom-${sameShortId}`,
      callTool: callAsB,
      close: vi.fn(),
    });

    const userADefs = await loadUserConnectorToolDefs('user-a');
    const userBDefs = await loadUserConnectorToolDefs('user-b');
    const result = await makeUserConnectorExecutor('user-b')(
      `custom-${sameShortId}`,
      'whoami',
      {},
    );

    expect(userADefs[0]?.description).toBe('User A private tool');
    expect(userBDefs[0]?.description).toBe('User B private tool');
    expect(mockBuildMcpToolCatalog).toHaveBeenCalledTimes(2);
    expect(callAsA).not.toHaveBeenCalled();
    expect(callAsB).toHaveBeenCalledWith('whoami', {});
    expect(result).toEqual({ handled: true, content: 'credential owner: B', isError: false });
    expect(mockConnectMcpServer).not.toHaveBeenCalled();
  });
});
