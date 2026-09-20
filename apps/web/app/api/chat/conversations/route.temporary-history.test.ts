import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
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

  it('keeps the exclusion on the title search, so a temporary chat is unfindable', async () => {
    await GET(new NextRequest(url('?q=quarterly%20numbers')));

    const listing = statementsAgainstConversations().find((sql) => sql.includes('title ilike'));
    expect(listing, 'the search path should issue a statement').toBeDefined();
    expect(listing).toMatch(/is_temporary(, false\))? = false/);
  });
});
