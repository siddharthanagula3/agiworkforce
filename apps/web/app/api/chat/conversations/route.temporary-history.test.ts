import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type RlsDbModule = typeof import('@/lib/server/rls-db');
type ActiveWorkspaceServiceModule = typeof import('@/lib/services/active-workspace-service');
type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type LoggerModule = typeof import('@/lib/logger');
type CorsModule = typeof import('@/lib/cors');

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<ActiveWorkspaceServiceModule>()),
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<CorsModule>()),
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));

const { GET } = await import('./route');

const url = (query = '') => `https://agiworkforce.com/api/chat/conversations${query}`;

/** Every way a caller can ask this route for rows, not a sample of them. */
const QUERIES = [
  '',
  '?q=invoice',
  '?archived=only',
  '?archived=exclude',
  '?deleted=only',
  '?projectId=00000000-0000-4000-8000-000000000001',
  '?includeHistoryStats=1',
  '?includeHistoryStats=1&statsOnly=1',
  '?cursor=bad-cursor&q=invoice',
];

function statementsAgainstConversations(): string[] {
  return mocks.query.mock.calls
    .map(([sql]) => String(sql).replace(/\s+/g, ' '))
    .filter((sql) => sql.includes('from web_conversations'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([]);
});

/**
 * A temporary chat is kept out of history by the turns that write no rows. A
 * writer that slips must not turn into a permanent entry in the sidebar.
 */
describe('the conversation history listing', () => {
  it('excludes temporary conversations on every read it issues', async () => {
    for (const query of QUERIES) {
      mocks.query.mockClear();
      await GET(new NextRequest(url(query)));

      const statements = statementsAgainstConversations();
      expect(
        statements.length,
        `no statement issued for ${query || '(no filter)'}`,
      ).toBeGreaterThan(0);
      for (const sql of statements) {
        expect(sql, `${query || '(no filter)'} reads history without the exclusion`).toMatch(
          /is_temporary(, false\))? = false/,
        );
      }
    }
  });

  it('counts only unarchived chats for the active total, in the same excluded set', async () => {
    await GET(new NextRequest(url('?includeHistoryStats=1&statsOnly=1')));

    const stats = statementsAgainstConversations().find((sql) =>
      sql.includes('active_conversation_count'),
    );
    expect(stats).toMatch(/filter \(where archived = false\)/);
    expect(stats).toMatch(/is_temporary = false/);
  });

  it('keeps the exclusion on the title search, so a temporary chat is unfindable', async () => {
    await GET(new NextRequest(url('?q=quarterly%20numbers')));

    const listing = statementsAgainstConversations().find((sql) => sql.includes('title ilike'));
    expect(listing, 'the search path should issue a statement').toBeDefined();
    expect(listing).toMatch(/is_temporary(, false\))? = false/);
  });
});
