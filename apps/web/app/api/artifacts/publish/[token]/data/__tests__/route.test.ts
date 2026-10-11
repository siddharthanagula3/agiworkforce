import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedCloudPublishedArtifactDataClearResponseSchema,
  ManagedCloudPublishedArtifactDataResponseSchema,
} from '@agiworkforce/cloud-contracts';
type Original0 = typeof import('@/lib/csrf');
type Original1 = typeof import('@/lib/rate-limit');
type Original2 = typeof import('@/lib/server/rls-db');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  csrf: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  scopedDb: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<Original0>()),
  requireCsrfToken: (...a: unknown[]) => mocks.csrf(...a),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<Original1>()),
  withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<Original2>()),
  getUserScopedDb: (...a: unknown[]) => mocks.scopedDb(...a),
}));

const { GET, DELETE } = await import('../route');

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SITE_ID = '22222222-2222-4222-8222-222222222222';
const OWNER = 'owner-1';
const VISITOR = 'visitor-1';

type Rows = Record<string, unknown>[];

/**
 * Stands in for the RLS-scoped adapter: the owner lookup only answers when the
 * bound user id owns the site, the way `where token = $1 and user_id = $2` does.
 */
function siteOwnedBy(owner: string, kind = 'html') {
  return async (sql: string, params: unknown[]): Promise<Rows> => {
    const text = String(sql);
    if (text.includes('from public.published_artifacts')) {
      return params[1] === owner ? [{ id: SITE_ID, kind }] : [];
    }
    if (text.includes('count(*) filter')) {
      return [{ shared_count: '2', shared_bytes: '70', own_personal_count: '1' }];
    }
    if (text.startsWith('select storage_key') || text.includes('select storage_key, value_bytes')) {
      return [
        {
          storage_key: 'scores',
          value_bytes: 50,
          preview: '[1,2,3]',
          value_chars: 7,
          updated_at: '2026-10-09T00:00:00.000Z',
        },
        {
          storage_key: 'title',
          value_bytes: '20',
          preview: 'x'.repeat(240),
          value_chars: 900,
          updated_at: new Date('2026-10-08T00:00:00.000Z'),
        },
      ];
    }
    if (text.includes('delete from public.published_artifact_storage')) {
      return [{ storage_key: 'scores' }, { storage_key: 'title' }];
    }
    return [];
  };
}

function signIn(userId: string) {
  mocks.scopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId,
    organizationId: null,
  });
}

function read(token = TOKEN) {
  return GET(new NextRequest(`https://agiworkforce.com/api/artifacts/publish/${token}/data`), {
    params: Promise.resolve({ token }),
  });
}

function clear(token = TOKEN) {
  return DELETE(
    new NextRequest(`https://agiworkforce.com/api/artifacts/publish/${token}/data`, {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ token }) },
  );
}

function statements(): string[] {
  return mocks.query.mock.calls.map(([sql]) => String(sql));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.csrf.mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue(null);
  mocks.query.mockImplementation(siteOwnedBy(OWNER));
  signIn(OWNER);
});

describe('GET /api/artifacts/publish/[token]/data', () => {
  it('shows the owner the shared entries and a count of their own personal ones', async () => {
    const response = await read();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = ManagedCloudPublishedArtifactDataResponseSchema.parse(await response.json());
    expect(body.supported).toBe(true);
    expect(body.ownPersonalEntryCount).toBe(1);
    expect(body.shared).toMatchObject({ entryCount: 2, totalBytes: 70 });
    expect(body.shared.entries.map((entry) => [entry.key, entry.bytes, entry.truncated])).toEqual([
      ['scores', 50, false],
      ['title', 20, true],
    ]);
  });

  it("never selects another visitor's personal values", async () => {
    await read();

    const listing = statements().find((sql) => sql.includes('select storage_key, value_bytes'));
    expect(listing).toContain('owner_user_id is null');
    const totals = statements().find((sql) => sql.includes('count(*) filter'));
    expect(totals).toContain('owner_user_id is null or owner_user_id = $2');
    const totalsCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes('count(*)'));
    expect(totalsCall![1]).toEqual([SITE_ID, OWNER]);
  });

  it('answers 404 to a signed-in visitor who is not the owner, and reads no storage', async () => {
    signIn(VISITOR);

    const response = await read();

    expect(response.status).toBe(404);
    expect(statements().some((sql) => sql.includes('published_artifact_storage'))).toBe(false);
  });

  it('answers 401 to a signed-out caller without a query', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.scopedDb.mockRejectedValue(createError.unauthorized());

    expect((await read()).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('reports a page kind that runs no script as keeping no data', async () => {
    mocks.query.mockImplementation(siteOwnedBy(OWNER, 'markdown'));

    const body = ManagedCloudPublishedArtifactDataResponseSchema.parse(await (await read()).json());

    expect(body.supported).toBe(false);
    expect(body.shared.entries).toEqual([]);
    expect(statements().some((sql) => sql.includes('published_artifact_storage'))).toBe(false);
  });

  it('404s a malformed token before rate limit, auth or a query', async () => {
    expect((await read('../etc')).status).toBe(404);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.scopedDb).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/artifacts/publish/[token]/data', () => {
  it("clears only the owner's shared entries and says how many", async () => {
    const response = await clear();

    expect(response.status).toBe(200);
    expect(
      ManagedCloudPublishedArtifactDataClearResponseSchema.parse(await response.json()),
    ).toEqual({ cleared: 2 });
    const deletion = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes('delete from public.published_artifact_storage'),
    )!;
    expect(String(deletion[0])).toContain('owner_user_id is null');
    expect(deletion[1]).toEqual([SITE_ID]);
  });

  it("answers 404 to a visitor and deletes nothing from someone else's site", async () => {
    signIn(VISITOR);

    expect((await clear()).status).toBe(404);
    expect(statements().some((sql) => sql.includes('delete from'))).toBe(false);
  });

  it('answers 401 to a signed-out caller', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.scopedDb.mockRejectedValue(createError.unauthorized());

    expect((await clear()).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('refuses a cross-site clear before touching the database', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));

    expect((await clear()).status).toBe(403);
    expect(mocks.scopedDb).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
