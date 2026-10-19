import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  csrf: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: async () => ({
    db: { query: mocks.query },
    userId: 'user-1',
    organizationId: null,
  }),
}));

const { PATCH, DELETE } = await import('./route');

const ARTIFACT = '8e1d6c3a-2b4f-4d7e-9a1c-0f2e3d4c5b6a';
const COMMENT = '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9';
const PATH = `/api/artifacts/${ARTIFACT}/comments/${COMMENT}`;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: COMMENT,
    artifact_id: ARTIFACT,
    parent_id: null,
    anchor: { kind: 'artifact' },
    body: 'Is March firm?',
    author: 'user',
    resolved_at: null,
    created_at: '2026-10-19T00:00:00.000Z',
    updated_at: '2026-10-19T00:00:00.000Z',
    ...overrides,
  };
}

function request(method: string, body?: unknown) {
  return new NextRequest(`http://localhost${PATH}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}

function context(artifactId = ARTIFACT, commentId = COMMENT) {
  return { params: Promise.resolve({ artifactId, commentId }) };
}

describe('/api/artifacts/[artifactId]/comments/[commentId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.csrf.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue(null);
  });

  it('PATCH edits the body of the caller’s own comment', async () => {
    mocks.query.mockResolvedValueOnce([row({ body: 'March is firm.' })]);
    const response = await PATCH(request('PATCH', { body: '  March is firm.  ' }), context());

    expect(response.status).toBe(200);
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('where id = $1 and user_id = $2');
    expect(params).toEqual([COMMENT, 'user-1', 'March is firm.', null]);
    const body = (await response.json()) as { comment: { body: string } };
    expect(body.comment.body).toBe('March is firm.');
  });

  it('PATCH refuses a change that changes nothing', async () => {
    const response = await PATCH(request('PATCH', {}), context());
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('PATCH answers 404 when the comment is not the caller’s', async () => {
    mocks.query.mockResolvedValueOnce([]);
    const response = await PATCH(request('PATCH', { resolved: true }), context());
    expect(response.status).toBe(404);
  });

  it('answers 404 for ids that are not artifact or comment ids, before reading anything', async () => {
    expect((await PATCH(request('PATCH', { resolved: true }), context('nope'))).status).toBe(404);
    expect((await DELETE(request('DELETE'), context(ARTIFACT, 'nope'))).status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal and changes nothing', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    expect((await PATCH(request('PATCH', { resolved: true }), context())).status).toBe(403);
    expect((await DELETE(request('DELETE'), context())).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('DELETE removes only the caller’s own comment', async () => {
    mocks.query.mockResolvedValueOnce([{ id: COMMENT }]);
    const response = await DELETE(request('DELETE'), context());

    expect(response.status).toBe(204);
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('where id = $1 and user_id = $2');
    expect(params).toEqual([COMMENT, 'user-1']);
  });
});
