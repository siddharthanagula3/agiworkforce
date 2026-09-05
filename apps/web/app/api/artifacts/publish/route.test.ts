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
  recordAuditEvent: vi.fn(async (..._args: unknown[]) => undefined),
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
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...a: unknown[]) => mocks.recordAuditEvent(...a),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

const { POST, GET } = await import('./route');

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function isInsert(sql: unknown): boolean {
  return String(sql).includes('insert into public.published_artifacts');
}

function insertCall(): [string, unknown[]] {
  const call = mocks.query.mock.calls.find(([sql]) => isInsert(sql));
  if (!call) throw new Error('the publish route never issued the insert');
  return call as [string, unknown[]];
}

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
    expect(body.sandboxed).toBe(true);
  });

  it('redacts a secret found in the artifact content before it is stored', async () => {
    const stripeKey = `sk_live_${'a'.repeat(30)}`;
    await POST(
      postRequest({ ...VALID_BODY, content: `<script>const key='${stripeKey}'</script>` }),
    );

    const call = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into public.published_artifacts'),
    );
    const params = call![1] as unknown[];
    const storedContent = String(params[7]);
    expect(storedContent).not.toContain(stripeKey);
    expect(storedContent).toContain('[REDACTED]');
  });

  it('records an audit event naming the pattern without the secret value', async () => {
    const stripeKey = `sk_live_${'a'.repeat(30)}`;
    await POST(postRequest({ ...VALID_BODY, content: `key='${stripeKey}'` }));

    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    const event = mocks.recordAuditEvent.mock.calls[0]![0] as {
      eventType: string;
      detail: Record<string, unknown>;
    };
    expect(event.eventType).toBe('secret_detected');
    expect(event.detail['status']).toBe('redacted');
    expect(JSON.stringify(event)).not.toContain(stripeKey);
  });

  it('does not record an audit event when the content is clean', async () => {
    await POST(postRequest(VALID_BODY));
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses a cross-site publish before writing anything', async () => {
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
    const [, params] = insertCall();
    expect(params[1]).toBe('user-1');
  });

  it('answers 403, not 500, when the conversation belongs to somebody else', async () => {
    mocks.query.mockImplementation(async (sql: unknown) =>
      isInsert(sql) ? [publishRow()] : [{ other_published: 0, owned_conversations: 0 }],
    );

    const response = await POST(
      postRequest({ ...VALID_BODY, conversationId: '11111111-1111-4111-8111-111111111111' }),
    );

    expect(response.status).toBe(403);
    expect(mocks.query.mock.calls.some(([sql]) => isInsert(sql))).toBe(false);
  });

  it('publishes when the conversation is the callers own', async () => {
    mocks.query.mockImplementation(async (sql: unknown) =>
      isInsert(sql) ? [publishRow()] : [{ other_published: 0, owned_conversations: 1 }],
    );

    const response = await POST(
      postRequest({ ...VALID_BODY, conversationId: '11111111-1111-4111-8111-111111111111' }),
    );

    expect(response.status).toBe(201);
  });

  it('refuses a publish past the per-user cap with an actionable 409', async () => {
    const { MAX_PUBLISHED_PER_USER } = await import('@/lib/services/published-artifact-service');
    mocks.query.mockImplementation(async (sql: unknown) =>
      isInsert(sql)
        ? [publishRow()]
        : [{ other_published: MAX_PUBLISHED_PER_USER, owned_conversations: 0 }],
    );

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('Unpublish one') },
    });
    expect(mocks.query.mock.calls.some(([sql]) => isInsert(sql))).toBe(false);
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
