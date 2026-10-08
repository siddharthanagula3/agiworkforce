import { describe, it, expect, vi, beforeEach } from 'vitest';
type ScanModule0 = typeof import('@/lib/connectors/mcp-directory-targets');
type OAuthAccessModule = typeof import('@/lib/connectors/oauth-access');

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
  GitHubWriteOutcomeUnknownError: class GitHubWriteOutcomeUnknownError extends Error {},
  issueCommentPostedSince: vi.fn(() => false),
  pullRequestReviewPostedSince: vi.fn(() => false),
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
  ...(await importOriginal<ScanModule0>()),
  findDirectoryTargetByRemoteUrl: directoryByUrl,
}));

const resolveAccess = vi.hoisted(() => ({
  unreachable: false,
}));
vi.mock('@/lib/connectors/oauth-access', async (importOriginal) => {
  const actual = await importOriginal<OAuthAccessModule>();
  return {
    ...actual,
    resolveConnectorAccessToken: (
      ...args: Parameters<typeof actual.resolveConnectorAccessToken>
    ) =>
      resolveAccess.unreachable
        ? Promise.resolve({ status: 'unreachable' as const })
        : actual.resolveConnectorAccessToken(...args),
  };
});

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
  resolveAccess.unreachable = false;
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

  it('asks a hand-entered endpoint with no saved token to sign in', async () => {
    directoryByUrl.mockResolvedValue(null);

    const result = await makeUserConnectorExecutor('user-1')(SERVER_ID, 'search_issues', {});

    expect(parseConnectorAuthorizationRequired(result.content)).toMatchObject({
      connectorId: SERVER_ID,
      reason: 'not_connected',
    });
  });
});

describe('a signed-in custom connector whose token cannot be refreshed right now', () => {
  it('says it could not be reached, without dialling it or asking to reconnect', async () => {
    directoryByUrl.mockResolvedValue(null);
    resolveAccess.unreachable = true;

    const result = await makeUserConnectorExecutor('user-1')(SERVER_ID, 'search_issues', {});

    expect(parseConnectorAuthorizationRequired(result.content)).toBeNull();
    expect(result).toEqual({
      handled: true,
      content: "Couldn't reach Sentry just now. It is still connected, so try again in a moment.",
      isError: true,
    });
    expect(mockConnectMcpServer).not.toHaveBeenCalled();
  });
});
