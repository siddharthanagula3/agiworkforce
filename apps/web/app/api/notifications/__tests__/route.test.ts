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
    expect(feedParams).toEqual(['user-owner', 21]);
  });

  it('pages from an opaque cursor and returns the next one', async () => {
    const cursor = Buffer.from(
      JSON.stringify(['2026-09-17T10:00:00.123456Z', ROW_ID]),
      'utf8',
    ).toString('base64url');
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `9c1d2e3f-0000-4000-8000-00000000000${index}`,
      category: 'general',
      type: 'info',
      title: 'Title',
      message: 'Message',
      target_kind: null,
      target_id: null,
      is_read: false,
      created_at: '2026-09-17T09:00:00.000Z',
      page_sort_key: '2026-09-17T09:00:00.000000Z',
    }));
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('count(*)') ? [{ unread: '3' }] : rows,
    );

    const response = await GET(request('GET', `?limit=2&cursor=${cursor}`));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notifications).toHaveLength(2);
    expect(typeof body.nextCursor).toBe('string');
    const [feedSql, feedParams] = mockQuery.mock.calls.find(([sql]) => !sql.includes('count(*)'))!;
    expect(feedSql).toContain('(created_at, id) < ($2, $3)');
    expect(feedParams).toEqual(['user-owner', '2026-09-17T10:00:00.123456Z', ROW_ID, 3]);
  });

  it.each([
    ['not base64 json', 'abc'],
    [
      'a sort value that is not a timestamp',
      Buffer.from(JSON.stringify(['x', ROW_ID])).toString('base64url'),
    ],
    [
      'an id that is not a uuid',
      Buffer.from(JSON.stringify(['2026-09-17T10:00:00.123456Z', 'nope'])).toString('base64url'),
    ],
  ])('rejects a cursor that is %s before touching the database', async (_label, cursor) => {
    const response = await GET(request('GET', `?cursor=${cursor}`));
    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
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
