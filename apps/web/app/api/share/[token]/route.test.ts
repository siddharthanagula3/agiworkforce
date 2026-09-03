import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  authUser: vi.fn(async (..._args: unknown[]) => ({ userId: 'owner-1' })),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: (...a: unknown[]) => mocks.authUser(...a) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { DELETE, GET } = await import('./route');

const TOKEN = 'a'.repeat(24);
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

function context(token = TOKEN) {
  return { params: Promise.resolve({ token }) };
}

function del(token = TOKEN) {
  return DELETE(
    new NextRequest(`https://agiworkforce.com/api/share/${token}`, { method: 'DELETE' }),
    context(token),
  );
}

function get(token = TOKEN) {
  return GET(new NextRequest(`https://agiworkforce.com/api/share/${token}`), context(token));
}

describe('DELETE /api/share/[token], revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'owner-1' });
    mocks.rateLimit.mockResolvedValue(null);
  });

  it('revokes the owners own link and scopes the delete to that owner', async () => {
    mocks.execute.mockResolvedValue(1);

    const response = await del();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    const [sql, params] = mocks.execute.mock.calls[0]!;
    expect(sql).toContain('owner_id = $2');
    expect(params).toEqual([TOKEN, 'owner-1']);
  });

  it('does not confirm a revocation to someone who only holds the link', async () => {
    mocks.authUser.mockResolvedValue({ userId: 'stranger-2' });
    mocks.execute.mockResolvedValue(0);

    const response = await del();

    expect(response.status).toBe(404);
    expect((await response.json()).success).toBeUndefined();
  });

  it('rejects an unauthenticated revocation before touching the database', async () => {
    mocks.authUser.mockRejectedValue(new Error('no session'));

    const response = await del();

    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('leaves a malformed token unqueried', async () => {
    const response = await del('not-a-share-token');

    expect(response.status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe('GET /api/share/[token] after revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'owner-1' });
    mocks.rateLimit.mockResolvedValue(null);
  });

  it('serves the snapshot while the share exists', async () => {
    mocks.query.mockResolvedValue([
      { token: TOKEN, title: 'Planning', messages: [], total_messages: 0, expires_at: FUTURE },
    ]);

    const response = await get();

    expect(response.status).toBe(200);
    expect((await response.json()).token).toBe(TOKEN);
  });

  it('404s once the row is gone, so a revoked link reads nothing', async () => {
    mocks.execute.mockResolvedValue(1);
    await del();
    mocks.query.mockResolvedValue([]);

    const response = await get();

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('Planning');
  });
});
