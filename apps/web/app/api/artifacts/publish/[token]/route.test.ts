/**
 * DELETE /api/artifacts/publish/[token] (CAP-015 slice 1).
 *
 * Published artifacts have no TTL, so this route is the ONLY way a public page
 * ever comes down. It has to be right: owner-scoped, CSRF-guarded, and unable
 * to double as a probe for which tokens are live.
 */
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

const { DELETE } = await import('./route');

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
    // A 403 would confirm the token exists, turning this endpoint into an
    // oracle for guessing which published pages are live.
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
