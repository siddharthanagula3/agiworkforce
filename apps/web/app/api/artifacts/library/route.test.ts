import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  csrf: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  scopedDb: vi.fn(async (..._args: unknown[]) => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: (...a: unknown[]) => mocks.csrf(...a) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...a: unknown[]) => mocks.scopedDb(...a),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { GET, POST } = await import('./route');
const { DELETE } = await import('./[itemId]/route');

const ITEM = '6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d';

function request(method: string, body?: unknown, query = '') {
  return new NextRequest(`http://localhost/api/artifacts/library${query}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}

describe('/api/artifacts/library', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.csrf.mockClear();
  });

  it('lists the caller’s items, optionally of one kind', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        id: ITEM,
        kind: 'brand',
        name: 'Acme',
        payload: { accent: '#ff0000' },
        created_at: '2026-10-19T00:00:00Z',
      },
    ]);
    const response = await GET(request('GET', undefined, '?kind=brand'));
    expect(response.status).toBe(200);
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('where user_id = $1');
    expect(params.slice(0, 2)).toEqual(['user-1', 'brand']);
    expect(((await response.json()) as { items: unknown[] }).items).toHaveLength(1);
  });

  it('rejects an unknown kind', async () => {
    expect((await GET(request('GET', undefined, '?kind=secret'))).status).toBe(400);
  });

  it('saves a deck template behind the CSRF check', async () => {
    mocks.query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([
      {
        id: ITEM,
        kind: 'deck_template',
        name: 'Board',
        payload: { title: 'B', content: '# B' },
        created_at: '2026-10-19T00:00:00Z',
      },
    ]);
    const response = await POST(
      request('POST', {
        kind: 'deck_template',
        name: 'Board',
        payload: { title: 'B', content: '# B' },
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.csrf).toHaveBeenCalledTimes(1);
    const [sql, params] = mocks.query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('insert into public.studio_library_items');
    expect(params.slice(0, 3)).toEqual(['user-1', 'deck_template', 'Board']);
  });

  it('refuses a brand with a colour that is not a hex value', async () => {
    const response = await POST(
      request('POST', {
        kind: 'brand',
        name: 'Bad',
        payload: {
          background: 'red',
          text: '#000000',
          accent: '#111111',
          headingFont: 'sans',
          bodyFont: 'sans',
        },
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('caps the items of one kind', async () => {
    mocks.query.mockResolvedValueOnce([{ total: 100 }]);
    const response = await POST(
      request('POST', {
        kind: 'document_template',
        name: 'One more',
        payload: { title: 'T', content: 'x' },
      }),
    );
    expect(response.status).toBe(409);
  });

  it('deletes only the caller’s own item', async () => {
    mocks.query.mockResolvedValueOnce([{ id: ITEM }]);
    const ok = await DELETE(request('DELETE'), { params: Promise.resolve({ itemId: ITEM }) });
    expect(ok.status).toBe(204);
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('where id = $1 and user_id = $2');
    expect(params).toEqual([ITEM, 'user-1']);
    mocks.query.mockResolvedValueOnce([]);
    const missing = await DELETE(request('DELETE'), { params: Promise.resolve({ itemId: ITEM }) });
    expect(missing.status).toBe(404);
  });
});
