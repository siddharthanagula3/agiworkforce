import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';
import { encodeKeysetCursor } from '@/lib/identity/pagination';

type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type IdentityModule = typeof import('@/lib/server/identity');
type LoggerModule = typeof import('@/lib/logger');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getUser: vi.fn(),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  scopedDb: vi.fn(async (..._args: unknown[]) => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'viewer-1',
    organizationId: null,
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: (...a: unknown[]) => mocks.scopedDb(...a),
}));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<IdentityModule>()),
  getIdentityProvider: () => ({ getUser: (...a: unknown[]) => mocks.getUser(...a) }),
  getRequestIdentity: vi.fn(async () => ({ subject: null })),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { GET } = await import('./route');

const ARTIFACT_ID = '6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d';

function request(query = '') {
  return new NextRequest(`http://localhost/api/artifacts/shared-with-me${query}`, {
    method: 'GET',
  });
}

function sharedRow(index: number) {
  return {
    id: `${ARTIFACT_ID.slice(0, -2)}${String(index).padStart(2, '0')}`,
    token: `tok${String(index).padStart(21, '0')}`,
    title: `Shared ${index}`,
    kind: 'html',
    updated_at: '2026-10-20T10:00:00.000Z',
    page_sort_key: `2026-10-20T10:00:00.0000${String(index).padStart(2, '0')}Z`,
    user_id: 'owner-1',
    email: 'owner@example.com',
    invited_by_user_id: 'owner-1',
  };
}

function verifiedUser(email = 'Viewer@Example.com') {
  return { id: 'viewer-1', primaryEmail: email, primaryEmailVerification: 'verified' };
}

describe('GET /api/artifacts/shared-with-me', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.getUser.mockReset();
    mocks.scopedDb.mockClear();
  });

  it('refuses a caller who is not signed in', async () => {
    mocks.scopedDb.mockRejectedValueOnce(createError.unauthorized());
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('returns nothing and reads nothing when the primary email is not verified', async () => {
    mocks.getUser.mockResolvedValueOnce({
      id: 'viewer-1',
      primaryEmail: 'viewer@example.com',
      primaryEmailVerification: 'unverified',
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [],
      hasMore: false,
      nextCursor: null,
      emailVerified: false,
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('matches the verified provider email and ignores any email the client sends', async () => {
    mocks.getUser.mockResolvedValueOnce(verifiedUser());
    mocks.query.mockResolvedValueOnce([sharedRow(1)]);
    const response = await GET(request('?email=victim@example.com'));
    expect(response.status).toBe(200);
    expect(mocks.getUser).toHaveBeenCalledWith('viewer-1');
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(params.slice(0, 2)).toEqual(['viewer@example.com', 'viewer-1']);
    expect(params).not.toContain('victim@example.com');
    expect(sql).toContain('viewer.email = $1');
    expect(sql).toContain("artifact.visibility = 'invited'");
    expect(sql).toContain('artifact.user_id <> $2');
  });

  it('returns only the token, title, kind and update time of each artifact', async () => {
    mocks.getUser.mockResolvedValueOnce(verifiedUser());
    mocks.query.mockResolvedValueOnce([sharedRow(1)]);
    const body = (await (await GET(request())).json()) as Record<string, unknown>;
    expect(body).toEqual({
      items: [
        {
          token: sharedRow(1).token,
          title: 'Shared 1',
          kind: 'html',
          updatedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
      hasMore: false,
      nextCursor: null,
      emailVerified: true,
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('owner@example.com');
    expect(serialized).not.toContain('owner-1');
    expect(serialized).not.toContain(ARTIFACT_ID.slice(0, -2));
  });

  it('pages with a keyset cursor', async () => {
    mocks.getUser.mockResolvedValue(verifiedUser());
    mocks.query.mockResolvedValueOnce([sharedRow(1), sharedRow(2), sharedRow(3)]);
    const first = (await (await GET(request('?limit=2'))).json()) as {
      items: unknown[];
      hasMore: boolean;
      nextCursor: string;
    };
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(['viewer@example.com', 'viewer-1', 3]);

    mocks.query.mockResolvedValueOnce([sharedRow(3)]);
    const second = await GET(request(`?limit=2&cursor=${first.nextCursor}`));
    expect(second.status).toBe(200);
    const [sql, params] = mocks.query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('(page_sort_key, id) < ($4, $5)');
    expect(params.slice(3)).toEqual([sharedRow(2).page_sort_key, sharedRow(2).id]);
  });

  it('rejects a cursor it did not issue', async () => {
    const forged = encodeKeysetCursor({ sortValue: "x' or 1=1", id: 'not-a-uuid' });
    expect((await GET(request(`?cursor=${forged}`))).status).toBe(400);
    expect((await GET(request('?cursor=garbage'))).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
