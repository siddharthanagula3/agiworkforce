import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.query, execute: mocks.execute },
    userId: 'user-1',
    organizationId: null,
  })),
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

import { decodeKeysetCursor, encodeKeysetCursor } from '@/lib/identity/pagination';

const { GET } = await import('./route');

function row(index: number, pinned = false): Record<string, unknown> {
  const id = `0000000${index}-0000-4000-8000-000000000000`;
  const updatedAt = `2026-01-0${index}T00:00:00.000000Z`;
  return {
    id,
    organization_id: null,
    title: `Conversation ${index}`,
    pinned,
    updated_at: updatedAt,
    page_sort_key: `${pinned ? '1' : '0'}${updatedAt}`,
  };
}

function listRequest(query = ''): NextRequest {
  return new NextRequest(`https://agiworkforce.com/api/chat/conversations${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/chat/conversations · keyset pagination', () => {
  it('returns a cursor naming the last row it showed', async () => {
    mocks.query.mockResolvedValue([row(3, true), row(2), row(1)]);

    const body = await (await GET(listRequest('?limit=2'))).json();

    expect(body.conversations).toHaveLength(2);
    expect(body.hasMore).toBe(true);
    expect(decodeKeysetCursor(body.nextCursor)).toEqual({
      sortValue: '02026-01-02T00:00:00.000000Z',
      id: '00000002-0000-4000-8000-000000000000',
    });
  });

  it('never leaks the internal sort key into the answer', async () => {
    mocks.query.mockResolvedValue([row(1)]);

    const body = await (await GET(listRequest('?limit=2'))).json();

    expect(body.conversations[0]).not.toHaveProperty('page_sort_key');
    expect(body.nextCursor).toBeNull();
  });

  it('orders pinned first inside one total order the cursor can name', async () => {
    mocks.query.mockResolvedValue([]);

    await GET(listRequest('?limit=2'));

    const sql = String(mocks.query.mock.calls[0]?.[0]);
    expect(sql).toContain("(case when pinned then '1' else '0' end)");
    expect(sql).toContain('order by page_sort_key desc, id desc');
  });

  it('pages from the cursor and stops sending an offset', async () => {
    mocks.query.mockResolvedValue([]);
    const cursor = encodeKeysetCursor({
      sortValue: '02026-01-02T00:00:00.000000Z',
      id: '00000002-0000-4000-8000-000000000000',
    });

    await GET(listRequest(`?limit=2&cursor=${cursor}`));

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('(page_sort_key, id) < ($5, $6)');
    expect(sql).not.toMatch(/offset \$/u);
    expect(params[4]).toBe('02026-01-02T00:00:00.000000Z');
    expect(params[5]).toBe('00000002-0000-4000-8000-000000000000');
  });
});
