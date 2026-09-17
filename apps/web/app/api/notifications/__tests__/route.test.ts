import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockCsrf, mockRateLimit, mockScopedDb } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockCsrf: vi.fn(),
  mockRateLimit: vi.fn(),
  mockScopedDb: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockScopedDb }));

const { GET, PATCH } = await import('../route');

const ROW_ID = '3f9b3a52-7e4d-4d7a-9d0e-2b5f7c1a9e01';

function request(method: string, query = '', body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/notifications${query}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockResolvedValue(null);
  mockScopedDb.mockResolvedValue({
    db: { query: mockQuery, execute: vi.fn() },
    userId: 'user-owner',
    organizationId: null,
  });
});

describe('GET /api/notifications', () => {
  it('returns the caller’s feed with a resolvable link for each target and the unread count', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('count(*)')) return [{ unread: '2' }];
      return [
        {
          id: ROW_ID,
          category: 'research',
          type: 'success',
          title: 'Research report ready',
          message: '“Market sizing” finished with 14 sources.',
          target_kind: 'research',
          target_id: 'report-1',
          is_read: false,
          created_at: '2026-09-17T10:00:00.000Z',
        },
        {
          id: '9c1d2e3f-0000-4000-8000-000000000002',
          category: 'connector',
          type: 'warning',
          title: 'Reconnect GitHub',
          message: 'The authorization expired.',
          target_kind: 'settings',
          target_id: 'connectors',
          is_read: true,
          created_at: '2026-09-17T09:00:00.000Z',
        },
      ];
    });

    const response = await GET(request('GET', '?limit=20'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.unreadCount).toBe(2);
    expect(body.notifications.map((item: { href: string }) => item.href)).toEqual([
      '/open/research/report-1',
      '/chat?settings=connectors',
    ]);
    const [feedSql, feedParams] = mockQuery.mock.calls.find(([sql]) => !sql.includes('count(*)'))!;
    expect(feedSql).toContain('where user_id = $1');
    expect(feedParams).toEqual(['user-owner', 20]);
  });

  it('rejects a malformed cursor before touching the database', async () => {
    const response = await GET(request('GET', '?before=yesterday'));
    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('answers the rate limiter’s response unchanged', async () => {
    mockRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await GET(request('GET'));
    expect(response.status).toBe(429);
    expect(mockScopedDb).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/notifications', () => {
  it('marks only the caller’s named rows read', async () => {
    mockQuery.mockResolvedValue([{ id: ROW_ID }]);

    const response = await PATCH(request('PATCH', '', { ids: [ROW_ID] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ updated: 1 });
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('where user_id = $1 and is_read = false and id = any($2::uuid[])');
    expect(params).toEqual(['user-owner', [ROW_ID]]);
  });

  it('marks everything read', async () => {
    mockQuery.mockResolvedValue([{ id: ROW_ID }, { id: 'b' }]);
    const response = await PATCH(request('PATCH', '', { all: true }));
    await expect(response.json()).resolves.toEqual({ updated: 2 });
    expect(mockQuery.mock.calls[0]![1]).toEqual(['user-owner']);
  });

  it('refuses a selection that is neither ids nor all', async () => {
    const response = await PATCH(request('PATCH', '', { ids: ['not-a-uuid'] }));
    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses without a csrf token', async () => {
    mockCsrf.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await PATCH(request('PATCH', '', { all: true }));
    expect(response.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
