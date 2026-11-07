import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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

const { DELETE, GET } = await import('./route');

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function call(token: string) {
  return DELETE(
    new NextRequest(`https://agiworkforce.com/api/artifacts/publish/${token}`, {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ token }) },
  );
}

describe('DELETE /api/artifacts/publish/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.csrf.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.query.mockResolvedValue([{ token: TOKEN }]);
    mocks.scopedDb.mockResolvedValue({
      db: { query: (...args: unknown[]) => mocks.query(...args) },
      userId: 'user-1',
      organizationId: null,
    });
  });

  it('takes the page down and scopes the delete to the owner', async () => {
    const response = await call(TOKEN);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, token: TOKEN });

    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('delete from public.published_artifacts');
    expect(params).toEqual([TOKEN, 'user-1']);
  });

  it("answers 404 for someone else's live token, not 403", async () => {
    mocks.query.mockResolvedValue([]);
    expect((await call(TOKEN)).status).toBe(404);
  });

  it('404s a malformed token without auth, rate-limit, or a query', async () => {
    const response = await call('short');
    expect(response.status).toBe(404);
    expect(mocks.csrf).not.toHaveBeenCalled();
    expect(mocks.scopedDb).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('refuses a cross-site unpublish before touching the database', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await call(TOKEN);
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.scopedDb.mockRejectedValue(createError.unauthorized());
    expect((await call(TOKEN)).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

// UNRUN: direct owner metadata lookup HTTP fixtures.
describe('GET /api/artifacts/publish/[token]', () => {
  const detail = (token = TOKEN) =>
    GET(new NextRequest(`https://agiworkforce.com/api/artifacts/publish/${token}`), {
      params: Promise.resolve({ token }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.scopedDb.mockResolvedValue({
      db: { query: (...args: unknown[]) => mocks.query(...args) },
      userId: 'user-1',
      organizationId: null,
    });
    mocks.query.mockResolvedValue([]);
  });

  it('returns exact owner metadata even for an invited publication without reading the list', async () => {
    mocks.query.mockResolvedValue([
      {
        token: TOKEN,
        artifact_id: 'artifact-1',
        conversation_id: null,
        title: 'Older site',
        kind: 'html',
        language: null,
        content_chars: 10,
        version: 3,
        visibility: 'invited',
        created_at: '2020-01-01T00:00:00.000Z',
        updated_at: '2020-01-01T00:00:00.000Z',
      },
    ]);
    const response = await detail();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.artifact).toMatchObject({ token: TOKEN, visibility: 'invited', contentChars: 10 });
    expect(body.artifact).not.toHaveProperty('content');
    expect(body.workspace).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]![1]).toEqual([TOKEN, 'user-1']);
    expect(mocks.csrf).not.toHaveBeenCalled();
  });

  it('uses the same 404 for absent and nonowned rows', async () => {
    expect((await detail()).status).toBe(404);
    expect(mocks.query.mock.calls[0]![0]).toContain('where token = $1 and user_id = $2');
  });

  it('rejects malformed tokens before querying', async () => {
    expect((await detail('short')).status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('requires owner authentication', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.scopedDb.mockRejectedValue(createError.unauthorized());
    expect((await detail()).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('honors the read rate limit before querying', async () => {
    mocks.rateLimit.mockResolvedValue(NextResponse.json({ error: 'limited' }, { status: 429 }));
    expect((await detail()).status).toBe(429);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
