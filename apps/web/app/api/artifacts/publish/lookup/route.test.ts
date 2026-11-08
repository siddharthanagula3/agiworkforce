import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  scopedDb: vi.fn(async (..._args: unknown[]) => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  withRateLimit: (...args: unknown[]) => mocks.rateLimit(...args),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  getUserScopedDb: (...args: unknown[]) => mocks.scopedDb(...args),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { GET, OPTIONS } = await import('./route');
const path = 'https://agiworkforce.com/api/artifacts/publish/lookup';
const call = (query = '?artifactId=artifact-1') => GET(new NextRequest(`${path}${query}`));

// UNRUN: source-authored exact owner publication lookup HTTP fixtures.
describe('GET /api/artifacts/publish/lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.scopedDb.mockResolvedValue({
      db: { query: (...args: unknown[]) => mocks.query(...args) },
      userId: 'user-1',
      organizationId: null,
    });
  });

  it('returns a bounded exact owner summary for an older restricted publication', async () => {
    const artifactId = 'Older/Artifact?x=1+#片';
    mocks.query.mockResolvedValue([
      {
        token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        artifact_id: artifactId,
        conversation_id: null,
        title: 'Older artifact',
        kind: 'html',
        language: null,
        content_chars: 12,
        version: 3,
        visibility: 'organization',
        created_at: '2020-01-01T00:00:00.000Z',
        updated_at: '2020-01-01T00:00:00.000Z',
      },
    ]);
    const response = await call(`?${new URLSearchParams({ artifactId: ` ${artifactId} ` })}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      artifact: { artifactId, visibility: 'organization', contentChars: 12, version: 3 },
      workspace: null,
    });
    expect(body.artifact).not.toHaveProperty('content');
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(NextRequest), 'share-view');
    expect(mocks.scopedDb).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('where user_id = $1 and artifact_id = $2');
    expect(sql).toContain('limit 1');
    expect(params).toEqual(['user-1', artifactId]);
  });

  it('returns explicit successful absence when the owner has no matching row', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ artifact: null, workspace: null });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    '',
    '?artifactId=',
    '?artifactId=%20',
    '?artifactId=a&artifactId=b',
    `?artifactId=${'a'.repeat(201)}`,
  ])('rejects invalid identity %s without querying', async (query) => {
    expect((await call(query)).status).toBe(400);
    expect(mocks.scopedDb).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('requires authentication and does not turn authorization failures into absence', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.scopedDb.mockRejectedValue(createError.unauthorized());
    expect((await call()).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rate limits before querying', async () => {
    mocks.rateLimit.mockResolvedValue(NextResponse.json({ error: 'limited' }, { status: 429 }));
    expect((await call()).status).toBe(429);
    expect(mocks.scopedDb).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('does not turn database failures into successful absence', async () => {
    mocks.query.mockRejectedValue(new Error('database unavailable'));
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty('artifact');
  });

  it('provides an OPTIONS handler without reading publications', () => {
    const response = OPTIONS(new NextRequest(path, { method: 'OPTIONS' }));
    expect(response.status).toBe(204);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

type ImportedModule0 = typeof import('@/lib/rate-limit');
type ImportedModule1 = typeof import('@/lib/server/rls-db');
type ImportedModule2 = typeof import('@/lib/logger');
