/**
 * POST / GET /api/artifacts/publish (CAP-015 slice 1).
 *
 * This directory shipped EMPTY, which is exactly why
 * `packages/platform/artifacts` could truthfully say no surface had a
 * `CloudPublisher`. These tests pin the parts that make publishing safe rather
 * than merely functional: CSRF before any write, auth via the RLS-scoped
 * adapter, kind rejection at the boundary, and a list that never ships bodies.
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
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { POST, GET } = await import('./route');

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function publishRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    token: TOKEN,
    user_id: 'user-1',
    artifact_id: 'artifact-1',
    conversation_id: null,
    title: 'Dashboard',
    kind: 'html',
    language: null,
    content: '<h1>hi</h1>',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}

function postRequest(body: unknown) {
  return new NextRequest('https://agiworkforce.com/api/artifacts/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  artifactId: 'artifact-1',
  title: 'Dashboard',
  kind: 'html',
  content: '<h1>hi</h1>',
};

describe('POST /api/artifacts/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.csrf.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.query.mockResolvedValue([publishRow()]);
    mocks.scopedDb.mockResolvedValue({
      db: { query: (...args: unknown[]) => mocks.query(...args) },
      userId: 'user-1',
      organizationId: null,
    });
  });

  it('returns a public URL and the token for a valid publish', async () => {
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.token).toBe(TOKEN);
    expect(body.shareUrl).toContain(`/shared-artifact/${TOKEN}`);
    // The client must be able to tell the user HOW the page will render.
    expect(body.sandboxed).toBe(true);
  });

  it('refuses a cross-site publish before writing anything', async () => {
    // Publishing makes content world-readable; a forged POST must never be able
    // to do that on a signed-in user's behalf.
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(403);
    expect(mocks.scopedDb).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('honours the rate limit before authenticating', async () => {
    mocks.rateLimit.mockResolvedValue(NextResponse.json({ error: 'slow down' }, { status: 429 }));
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(429);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects kinds that have no safe public renderer', async () => {
    for (const kind of ['pdf', 'image', 'spreadsheet', 'presentation', 'email']) {
      const response = await POST(postRequest({ ...VALID_BODY, kind }));
      expect(response.status).toBe(400);
    }
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const request = new NextRequest('https://agiworkforce.com/api/artifacts/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect((await POST(request)).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects a conversationId that is not a uuid', async () => {
    const response = await POST(postRequest({ ...VALID_BODY, conversationId: 'not-a-uuid' }));
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('binds the authenticated user id into the write', async () => {
    await POST(postRequest(VALID_BODY));
    const [, params] = mocks.query.mock.calls[0]!;
    expect((params as unknown[])[1]).toBe('user-1');
  });

  it('propagates a 401 from the auth boundary instead of publishing anonymously', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.scopedDb.mockRejectedValue(createError.unauthorized());
    const response = await POST(postRequest(VALID_BODY));
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe('GET /api/artifacts/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.scopedDb.mockResolvedValue({
      db: { query: (...args: unknown[]) => mocks.query(...args) },
      userId: 'user-1',
      organizationId: null,
    });
  });

  it('lists the callers own published artifacts with usable links', async () => {
    mocks.query.mockResolvedValue([
      {
        token: TOKEN,
        artifact_id: 'artifact-1',
        title: 'Dashboard',
        kind: 'html',
        language: null,
        content_chars: 2048,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-02T00:00:00.000Z',
      },
    ]);

    const response = await GET(new NextRequest('https://agiworkforce.com/api/artifacts/publish'));
    const body = await response.json();

    expect(body.artifacts).toHaveLength(1);
    expect(body.artifacts[0]).toMatchObject({
      token: TOKEN,
      title: 'Dashboard',
      contentChars: 2048,
      sandboxed: true,
    });
    expect(body.artifacts[0].shareUrl).toContain(`/shared-artifact/${TOKEN}`);
  });

  it('never returns the published bodies', async () => {
    mocks.query.mockResolvedValue([]);
    await GET(new NextRequest('https://agiworkforce.com/api/artifacts/publish'));
    const [sql] = mocks.query.mock.calls[0]!;
    expect(sql).not.toMatch(/select[\s\S]*\bcontent,/);
  });

  it('returns an empty list rather than failing when nothing is published', async () => {
    mocks.query.mockResolvedValue([]);
    const response = await GET(new NextRequest('https://agiworkforce.com/api/artifacts/publish'));
    expect(response.status).toBe(200);
    expect((await response.json()).artifacts).toEqual([]);
  });

  it('reports an honest unavailable state when the publishing schema is not installed', async () => {
    mocks.query.mockRejectedValue(
      Object.assign(new Error('relation published_artifacts does not exist'), { code: '42P01' }),
    );

    const response = await GET(new NextRequest('https://agiworkforce.com/api/artifacts/publish'));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Artifact publishing is not configured in this environment yet.' },
    });
  });
});
