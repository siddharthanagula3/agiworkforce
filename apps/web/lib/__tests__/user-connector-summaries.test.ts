import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: async () => [], execute: async () => 0 }),
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

vi.mock('@agiworkforce/mcp', () => ({
  buildMcpToolCatalog: vi.fn(),
  connectMcpServer: vi.fn(),
}));

const openCredential = vi.hoisted(() => vi.fn());
vi.mock('@/lib/custom-connector-crypto', () => ({
  openCustomConnectorCredential: openCredential,
}));

import { getUserCustomConnectorSummaries } from '../user-connector-tools';

const ROW = {
  id: 'row-1',
  short_id: 'abc123def0',
  name: 'My MCP',
  url: 'https://mcp.example.com/mcp',
  transport: 'streamable-http',
  auth_header_enc: 'sealed',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

function dbReturning(rows: unknown[]) {
  return { query: vi.fn(async () => rows) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  openCredential.mockReturnValue({ headerName: 'Authorization', headerValue: 'Bearer x' });
});

describe('getUserCustomConnectorSummaries credential state', () => {
  it('flags a row whose sealed credential no longer opens', async () => {
    openCredential.mockImplementation(() => {
      throw new Error('bad key');
    });

    const [summary] = await getUserCustomConnectorSummaries(dbReturning([ROW]), 'user-1');

    expect(summary?.credentialUnreadable).toBe(true);
  });

  it('leaves a readable credential unflagged', async () => {
    const [summary] = await getUserCustomConnectorSummaries(dbReturning([ROW]), 'user-1');

    expect(summary).not.toHaveProperty('credentialUnreadable');
    expect(summary?.shortId).toBe('abc123def0');
  });

  it('never tries to open a row that stores no credential', async () => {
    const [summary] = await getUserCustomConnectorSummaries(
      dbReturning([{ ...ROW, auth_header_enc: null }]),
      'user-1',
    );

    expect(openCredential).not.toHaveBeenCalled();
    expect(summary).not.toHaveProperty('credentialUnreadable');
  });

  it('never returns credential material', async () => {
    const summaries = await getUserCustomConnectorSummaries(dbReturning([ROW]), 'user-1');

    expect(JSON.stringify(summaries)).not.toContain('sealed');
    expect(JSON.stringify(summaries)).not.toMatch(/authorization|bearer/i);
  });
});
