import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  csrf: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  scopedDb: vi.fn(),
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

const { PATCH } = await import('./route');

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ORG = '11111111-1111-4111-8111-111111111111';
const ARTIFACT = '33333333-3333-4333-8333-333333333333';

function call(body: unknown, token = TOKEN) {
  return PATCH(
    new NextRequest(`https://agiworkforce.com/api/artifacts/publish/${token}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    { params: Promise.resolve({ token }) },
  );
}

function artifactRow(visibility: 'public' | 'organization') {
  return {
    id: ARTIFACT,
    token: TOKEN,
    user_id: 'user-1',
    artifact_id: 'artifact-1',
    conversation_id: null,
    title: 'Plan',
    kind: 'markdown',
    language: null,
    content: '# plan',
    visibility,
    created_at: '2026-09-13T00:00:00.000Z',
    updated_at: '2026-09-13T00:00:00.000Z',
  };
}

/**
 * The route issues four statements in order: active-workspace resolution, the
 * membership row, the owner's artifact lookup, then the share write and the
 * visibility update. Answering by statement shape keeps the test honest about
 * which query it is standing in for.
 */
function respond(visibility: 'public' | 'organization') {
  return (sql: string) => {
    const text = String(sql);
    if (text.includes('organization_members')) {
      return [{ organization_id: ORG, role: 'owner' }];
    }
    if (text.includes('activeOrganizationId') || text.includes('user_settings')) {
      return [{ organization_id: ORG }];
    }
    if (text.includes('organization_shared_artifacts')) {
      return [
        {
          organization_id: ORG,
          published_artifact_id: ARTIFACT,
          token: TOKEN,
          artifact_id: 'artifact-1',
          title: 'Plan',
          kind: 'markdown',
          visibility,
          owner_user_id: 'user-1',
          shared_by_user_id: 'user-1',
          created_at: '2026-09-13T00:00:00.000Z',
        },
      ];
    }
    if (text.includes('update public.published_artifacts')) {
      return [artifactRow(visibility)];
    }
    if (text.includes('published_artifacts')) {
      return [{ id: ARTIFACT }];
    }
    return [];
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.csrf.mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue(null);
  mocks.query.mockImplementation(async (sql: string) => respond('organization')(sql));
  mocks.scopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: ORG,
  });
});

describe('PATCH /api/artifacts/publish/[token]', () => {
  it('mints the grant row and records the workspace audience', async () => {
    const response = await call({ visibility: 'organization' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      token: TOKEN,
      visibility: 'organization',
      organizationId: ORG,
    });

    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.some((sql) => sql.includes('insert into public.organization_shared_artifacts')),
    ).toBe(true);
    expect(statements.some((sql) => sql.includes('set visibility = $3'))).toBe(true);
  });

  it('drops the grant row when the audience goes back to public', async () => {
    mocks.query.mockImplementation(async (sql: string) => respond('public')(sql));

    const response = await call({ visibility: 'public' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ visibility: 'public', organizationId: null });

    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.some((sql) => sql.includes('delete from public.organization_shared_artifacts')),
    ).toBe(true);
    expect(
      statements.some((sql) => sql.includes('insert into public.organization_shared_artifacts')),
    ).toBe(false);
  });

  it('rejects an audience the schema does not model', async () => {
    expect((await call({ visibility: 'everyone-on-earth' })).status).toBe(400);
  });

  it('404s a malformed token before auth, rate limit or any query', async () => {
    const response = await call({ visibility: 'public' }, 'short');
    expect(response.status).toBe(404);
    expect(mocks.csrf).not.toHaveBeenCalled();
    expect(mocks.scopedDb).not.toHaveBeenCalled();
  });

  it('refuses when the caller belongs to no workspace', async () => {
    mocks.query.mockImplementation(async () => []);
    expect((await call({ visibility: 'organization' })).status).toBe(403);
  });

  it('says the feature is unconfigured rather than 500ing before the migration lands', async () => {
    mocks.query.mockImplementation(async () => {
      throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
    });
    expect((await call({ visibility: 'organization' })).status).toBe(503);
  });
});
