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

const mockIsGitHubAppConfigured = vi.fn();
const mockIsGitHubInstallationLinkingAvailable = vi.fn();
vi.mock('@/lib/github-app', () => ({
  getInstallationAccessToken: vi.fn(),
  getPrDiff: vi.fn(),
  isGitHubAppConfigured: () => mockIsGitHubAppConfigured(),
  isGitHubInstallationLinkingAvailable: () => mockIsGitHubInstallationLinkingAvailable(),
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

const mockConnectMcpServer = vi.fn();
vi.mock('@agiworkforce/mcp', () => ({
  buildMcpToolCatalog: vi.fn(),
  connectMcpServer: (...a: unknown[]) => mockConnectMcpServer(...a),
}));

import {
  makeUserConnectorExecutor,
  __resetConnectorMcpMapCacheForTests,
} from '../user-connector-tools';

function stubActiveConnector(connectorId: string) {
  mockNeonQuery.mockImplementation((sql: string) => {
    if (String(sql).includes('user_connectors')) {
      return Promise.resolve([{ connector_id: connectorId }]);
    }
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetConnectorMcpMapCacheForTests();
  process.env['CONNECTOR_MCP_SERVERS_JSON'] = JSON.stringify({
    connectors: [{ connectorId: 'notion', url: 'https://mcp.notion.example/mcp' }],
  });
  mockIsGitHubAppConfigured.mockReturnValue(false);
  mockIsGitHubInstallationLinkingAvailable.mockReturnValue(false);
  mockAssertResolvedPublicHostname.mockResolvedValue(undefined);
});

describe('connector tool cancellation', () => {
  it("hands the caller's abort signal to the connector MCP request", async () => {
    stubActiveConnector('notion');
    const callTool = vi.fn().mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: 'page found' }],
    });
    mockConnectMcpServer.mockResolvedValue({ serverName: 'notion', callTool, close: vi.fn() });
    const controller = new AbortController();

    const exec = makeUserConnectorExecutor('user-1');
    await exec('notion', 'search_pages', { q: 'roadmap' }, { signal: controller.signal });

    expect(callTool).toHaveBeenCalledWith(
      'search_pages',
      { q: 'roadmap' },
      { signal: controller.signal },
    );
  });

  it('never dispatches a connector tool once the turn has already been stopped', async () => {
    stubActiveConnector('notion');
    const callTool = vi.fn();
    mockConnectMcpServer.mockResolvedValue({ serverName: 'notion', callTool, close: vi.fn() });
    const controller = new AbortController();
    controller.abort();

    const exec = makeUserConnectorExecutor('user-1');

    await expect(
      exec('notion', 'search_pages', { q: 'roadmap' }, { signal: controller.signal }),
    ).rejects.toThrow();
    expect(mockConnectMcpServer).not.toHaveBeenCalled();
    expect(callTool).not.toHaveBeenCalled();
  });
});
