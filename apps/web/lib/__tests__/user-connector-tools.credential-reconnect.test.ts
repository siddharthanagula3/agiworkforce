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

const mockConnectMcpServer = vi.hoisted(() => vi.fn());
vi.mock('@agiworkforce/mcp', () => ({
  buildMcpToolCatalog: vi.fn(),
  connectMcpServer: mockConnectMcpServer,
}));

const directoryByUrl = vi.hoisted(() => vi.fn());
vi.mock('@/lib/connectors/mcp-directory-targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/mcp-directory-targets')>()),
  findDirectoryTargetByRemoteUrl: directoryByUrl,
}));

import { makeUserConnectorExecutor } from '../user-connector-tools';
import { parseConnectorAuthorizationRequired } from '@/lib/connectors/connect-required';

const SHORT_ID = 'abc123def0';
const SERVER_ID = `custom-${SHORT_ID}`;
const DIRECTORY_ID = 'io.sentry/mcp';

function rejectedCredential(): Error {
  return Object.assign(new Error('Unauthorized'), {
    status: 401,
    headers: { 'www-authenticate': 'Bearer error="invalid_token"' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockNeonQuery.mockImplementation((sql: string) => {
    if (String(sql).includes('user_custom_connectors')) {
      return Promise.resolve([
        {
          id: 'row-1',
          short_id: SHORT_ID,
          name: 'Sentry',
          url: 'https://mcp.sentry.dev/mcp',
          transport: 'streamable-http',
          auth_header_enc: null,
        },
      ]);
    }
    return Promise.resolve([]);
  });
  mockConnectMcpServer.mockResolvedValue({
    serverName: SERVER_ID,
    callTool: vi.fn().mockRejectedValue(rejectedCredential()),
    close: vi.fn(),
  });
});

describe('a rejected credential on a directory-linked connector', () => {
  it('returns the structured reconnect envelope pointing at its own server id', async () => {
    directoryByUrl.mockResolvedValue({ connectorId: DIRECTORY_ID, name: 'Sentry' });

    const result = await makeUserConnectorExecutor('user-1')(SERVER_ID, 'search_issues', {});

    expect(result.isError).toBe(true);
    const payload = parseConnectorAuthorizationRequired(result.content);
    expect(payload).toMatchObject({
      connectorId: SERVER_ID,
      connectorName: 'Sentry',
      toolName: 'search_issues',
      reason: 'authorization_unavailable',
    });
    expect(payload?.connectUrl).toBe(
      `/api/connectors/oauth/start?connectorId=${encodeURIComponent(SERVER_ID)}`,
    );
  });

  it('never leaks the credential or the endpoint into the envelope', async () => {
    directoryByUrl.mockResolvedValue({ connectorId: DIRECTORY_ID, name: 'Sentry' });

    const result = await makeUserConnectorExecutor('user-1')(SERVER_ID, 'search_issues', {});

    expect(result.content).not.toContain('mcp.sentry.dev');
    expect(result.content).not.toMatch(/bearer|authorization:/i);
  });

  it('keeps the plain sentence for a hand-entered endpoint with no directory entry', async () => {
    directoryByUrl.mockResolvedValue(null);

    const result = await makeUserConnectorExecutor('user-1')(SERVER_ID, 'search_issues', {});

    expect(parseConnectorAuthorizationRequired(result.content)).toBeNull();
    expect(result.content).toContain('rejected the saved credential');
  });
});
