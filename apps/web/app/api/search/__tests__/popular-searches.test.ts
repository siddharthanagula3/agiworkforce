import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetClerkAuthUser, mockNeonQuery, mockResolveActiveOrganizationId } = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockResolveActiveOrganizationId: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mockGetClerkAuthUser,
  getAuthenticatedUserWithClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockNeonQuery(...args) },
    userId: await mockGetClerkAuthUser().then((auth: { userId: string }) => auth.userId),
    organizationId: await mockResolveActiveOrganizationId(),
  })),
}));

vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mockResolveActiveOrganizationId,
  resolveOrganizationMembershipId: vi.fn(async () => null),
}));

import { DELETE, GET, POST } from '@/app/api/search/route';

function popularRequest(): NextRequest {
  return new NextRequest('http://localhost/api/search?type=popular&limit=10&days=7', {
    method: 'GET',
  });
}

function recentRequest(): NextRequest {
  return new NextRequest('http://localhost/api/search?type=recent&limit=10');
}

class PgError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

beforeEach(() => {
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc' });
  mockResolveActiveOrganizationId.mockResolvedValue('11111111-1111-4111-8111-111111111111');
});

describe('GET /api/search?type=popular', () => {
  it('calls the workspace-scoped get_popular_searches with the server userId', async () => {
    mockNeonQuery.mockResolvedValue([{ query: 'hi', search_count: 3, avg_results: 5 }]);
    const res = await GET(popularRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { searches: unknown[] };
    expect(body.searches).toHaveLength(1);

    const [sql, params] = mockNeonQuery.mock.calls[0]!;
    expect(sql).toContain('get_popular_searches($1, $2, $3, $4)');
    expect(params).toEqual(['user-abc', '11111111-1111-4111-8111-111111111111', 10, 7]);
  });

  it('returns an empty list (200) instead of 500 when the RPC is missing (42883)', async () => {
    mockNeonQuery.mockRejectedValue(
      new PgError(
        '42883',
        'function get_popular_searches(unknown, integer, integer) does not exist',
      ),
    );
    const res = await GET(popularRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { searches: unknown[] };
    expect(body.searches).toEqual([]);
  });

  it('does not mask unrelated database errors', async () => {
    mockNeonQuery.mockRejectedValue(new PgError('08006', 'connection failure'));
    const res = await GET(popularRequest());
    expect(res.status).not.toBe(200);
  });
});

describe('search-history workspace scope', () => {
  it('binds recent history to the active workspace', async () => {
    mockNeonQuery.mockResolvedValue([]);

    const response = await GET(recentRequest());

    expect(response.status).toBe(200);
    expect(mockNeonQuery).toHaveBeenCalledWith('select * from get_recent_searches($1, $2, $3)', [
      'user-abc',
      '11111111-1111-4111-8111-111111111111',
      10,
    ]);
  });

  it('binds tracked and cleared history to the active workspace', async () => {
    mockNeonQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([{ clear_search_history: 1 }]);

    const tracked = await POST(
      new NextRequest('http://localhost/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'workspace term', resultCount: 2 }),
      }),
    );
    const cleared = await DELETE(
      new NextRequest('http://localhost/api/search', { method: 'DELETE' }),
    );

    expect(tracked.status).toBe(200);
    expect(cleared.status).toBe(200);
    expect(mockNeonQuery).toHaveBeenNthCalledWith(1, 'select track_search($1, $2, $3, $4)', [
      'user-abc',
      '11111111-1111-4111-8111-111111111111',
      'workspace term',
      2,
    ]);
    expect(mockNeonQuery).toHaveBeenNthCalledWith(2, 'select clear_search_history($1, $2)', [
      'user-abc',
      '11111111-1111-4111-8111-111111111111',
    ]);
  });
});
