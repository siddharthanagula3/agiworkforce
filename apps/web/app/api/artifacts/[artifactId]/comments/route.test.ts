import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  csrf: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  scopedDb: vi.fn(async (..._args: unknown[]) => {
    const db = {
      query: (...args: unknown[]) => mocks.query(...args),
      transaction: async (work: (tx: unknown) => Promise<unknown>) => work(db),
    };
    return { db, userId: 'user-1', organizationId: null };
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule3>()),
  requireCsrfToken: (...a: unknown[]) => mocks.csrf(...a),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  getUserScopedDb: (...a: unknown[]) => mocks.scopedDb(...a),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { GET, POST } = await import('./route');
const { PATCH, DELETE } = await import('./[commentId]/route');

const ARTIFACT = '8e1d6c3a-2b4f-4d7e-9a1c-0f2e3d4c5b6a';
const COMMENT = '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: COMMENT,
    artifact_id: ARTIFACT,
    parent_id: null,
    anchor: { kind: 'text', quote: 'ship in March', prefix: '', suffix: '' },
    body: 'Is March firm?',
    author: 'user',
    resolved_at: null,
    created_at: '2026-10-19T00:00:00.000Z',
    updated_at: '2026-10-19T00:00:00.000Z',
    ...overrides,
  };
}

function admitted() {
  return mocks.query
    .mockResolvedValueOnce([{ isolation: 'read committed' }])
    .mockResolvedValueOnce([{ locked: true }]);
}

function request(method: string, body?: unknown, path = `/api/artifacts/${ARTIFACT}/comments`) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}

const context = { params: Promise.resolve({ artifactId: ARTIFACT }) };
const commentContext = { params: Promise.resolve({ artifactId: ARTIFACT, commentId: COMMENT }) };

describe('/api/artifacts/[artifactId]/comments', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.csrf.mockClear();
  });

  it('lists only the caller’s comments on that artifact', async () => {
    mocks.query.mockResolvedValueOnce([row()]);
    const response = await GET(request('GET'), context);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { comments: { anchor: { quote: string } }[] };
    expect(body.comments[0]!.anchor.quote).toBe('ship in March');
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('where user_id = $1 and artifact_id = $2');
    expect(params.slice(0, 2)).toEqual(['user-1', ARTIFACT]);
  });

  it('creates an anchored comment behind the CSRF check', async () => {
    admitted()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([row()]);
    const response = await POST(
      request('POST', {
        body: 'Is March firm?',
        anchor: { kind: 'text', quote: 'ship in March' },
      }),
      context,
    );
    expect(response.status).toBe(201);
    expect(mocks.csrf).toHaveBeenCalledTimes(1);
    const [sql, params] = mocks.query.mock.calls[3] as [string, unknown[]];
    expect(sql).toContain('insert into public.artifact_comments');
    expect(params[0]).toBe('user-1');
    expect(JSON.parse(params[3] as string)).toMatchObject({ kind: 'text', quote: 'ship in March' });
  });

  it('refuses a malformed anchor and a missing body', async () => {
    const bad = await POST(request('POST', { body: 'x', anchor: { kind: 'element' } }), context);
    expect(bad.status).toBe(400);
    const empty = await POST(request('POST', { body: '   ' }), context);
    expect(empty.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('threads a reply onto the top comment of its thread', async () => {
    admitted()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ id: 'reply-parent', parent_id: COMMENT }])
      .mockResolvedValueOnce([row({ id: 'r2', parent_id: COMMENT, body: 'Yes' })]);
    const response = await POST(
      request('POST', { body: 'Yes', parentId: '0c9b8a76-5432-4f10-8e9d-c8b7a6958473' }),
      context,
    );
    expect(response.status).toBe(201);
    const [, params] = mocks.query.mock.calls[4] as [string, unknown[]];
    expect(params[2]).toBe(COMMENT);
  });

  it('caps the comments on one artifact', async () => {
    admitted().mockResolvedValueOnce([{ total: 500 }]);
    const response = await POST(request('POST', { body: 'One more' }), context);
    expect(response.status).toBe(409);
  });

  it('resolves and deletes the caller’s own comment', async () => {
    mocks.query.mockResolvedValueOnce([row({ resolved_at: '2026-10-19T01:00:00.000Z' })]);
    const patched = await PATCH(request('PATCH', { resolved: true }), commentContext);
    expect(patched.status).toBe(200);
    const [, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([COMMENT, 'user-1', null, true]);

    mocks.query.mockResolvedValueOnce([{ id: COMMENT }]);
    const deleted = await DELETE(request('DELETE'), commentContext);
    expect(deleted.status).toBe(204);

    mocks.query.mockResolvedValueOnce([]);
    const missing = await DELETE(request('DELETE'), commentContext);
    expect(missing.status).toBe(404);
  });
});

type ImportedModule3 = typeof import('@/lib/csrf');
type ImportedModule2 = typeof import('@/lib/rate-limit');
type ImportedModule1 = typeof import('@/lib/server/rls-db');
type ImportedModule0 = typeof import('@/lib/logger');
