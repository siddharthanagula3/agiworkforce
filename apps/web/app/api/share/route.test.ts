import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  authUser: vi.fn(async (..._args: unknown[]) => ({ userId: 'user-1' })),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  recordAuditEvent: vi.fn(async (..._args: unknown[]) => undefined),
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

const { GET, POST } = await import('./route');

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function row(overrides: Record<string, unknown> = {}) {
  return {
    token: 'tok-1',
    title: 'Planning session',
    model_id: 'model-a',
    provider: 'anthropic',
    total_messages: 12,
    expires_at: FUTURE,
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const call = () => GET(new NextRequest('https://agiworkforce.com/api/share'));

describe('GET /api/share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
  });

  it('returns the callers own shares with a usable URL', async () => {
    mocks.query.mockResolvedValue([row()]);

    const body = await (await call()).json();

    expect(body.shares).toHaveLength(1);
    expect(body.shares[0]).toMatchObject({
      token: 'tok-1',
      title: 'Planning session',
      messageCount: 12,
      expired: false,
    });
    expect(body.shares[0].shareUrl).toContain('/share/tok-1');
  });

  it('scopes the query to the authenticated owner', async () => {
    mocks.query.mockResolvedValue([]);
    await call();

    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('owner_id = $1');
    expect(params).toEqual(['user-1']);
  });

  it('never returns the conversation bodies', async () => {
    mocks.query.mockResolvedValue([]);
    await call();

    const [sql] = mocks.query.mock.calls[0]!;
    expect(sql).not.toMatch(/\bmessages\b/);
  });

  it('marks expired shares instead of hiding them', async () => {
    mocks.query.mockResolvedValue([row({ token: 'old', expires_at: PAST })]);

    const body = await (await call()).json();

    expect(body.shares).toHaveLength(1);
    expect(body.shares[0].expired).toBe(true);
  });

  it('falls back to a title when the row has none', async () => {
    mocks.query.mockResolvedValue([row({ title: null })]);
    const body = await (await call()).json();
    expect(body.shares[0].title).toBe('Shared Session');
  });

  it('returns an empty list rather than failing when nothing is shared', async () => {
    mocks.query.mockResolvedValue([]);
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).shares).toEqual([]);
  });
});

describe('POST /api/share, link lifetime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
  });

  function post(body: Record<string, unknown>) {
    mocks.query.mockResolvedValue([{ token: 'tok-new', expires_at: FUTURE, total_messages: 0 }]);
    return POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  }

  // Selected by SQL rather than by call index: the route asks the workspace
  // sharing policy before it writes, so the insert is no longer the first
  // query this mock sees.
  function insertCall(): unknown[] {
    const call = mocks.query.mock.calls.find((c) =>
      /insert into shared_sessions/i.test(String(c[0])),
    );
    if (!call) throw new Error('no insert into shared_sessions was issued');
    return call[1] as unknown[];
  }

  function insertedExpiryDays(): number {
    const params = insertCall();
    const expiresAt = new Date(String(params[params.length - 1]));
    return Math.round((expiresAt.getTime() - Date.now()) / 86_400_000);
  }

  it('defaults to seven days when the caller says nothing', async () => {
    await post({ title: 'Session' });
    expect(insertedExpiryDays()).toBe(7);
  });

  it('honors a caller-supplied lifetime', async () => {
    await post({ title: 'Session', expires_in_days: 1 });
    expect(insertedExpiryDays()).toBe(1);
  });

  it('rejects a lifetime outside the allowed set', async () => {
    const response = await post({ title: 'Session', expires_in_days: 3650 });
    expect(response.status).toBe(400);
    expect(
      mocks.query.mock.calls.some((c) => /insert into shared_sessions/i.test(String(c[0]))),
      'a rejected lifetime must not reach the insert',
    ).toBe(false);
  });
});

describe('POST /api/share, secret redaction', () => {
  const STRIPE_KEY = `sk_live_${'a'.repeat(30)}`;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.query.mockResolvedValue([{ token: 'tok-new', expires_at: FUTURE, total_messages: 0 }]);
  });

  function insertedMessages(): Array<Record<string, unknown>> {
    const call = mocks.query.mock.calls.find((c) =>
      /insert into shared_sessions/i.test(String(c[0])),
    );
    if (!call) throw new Error('no insert into shared_sessions was issued');
    const params = call[1] as unknown[];
    return JSON.parse(params[5] as string) as Array<Record<string, unknown>>;
  }

  it('redacts a secret found in a message before it is stored', async () => {
    await POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Session',
          messages: [{ role: 'user', content: `use ${STRIPE_KEY} to bill` }],
        }),
      }),
    );

    const stored = JSON.stringify(insertedMessages());
    expect(stored).not.toContain(STRIPE_KEY);
    expect(stored).toContain('[REDACTED]');
  });

  it('records an audit event naming the pattern without the secret value', async () => {
    await POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Session',
          messages: [{ role: 'user', content: `use ${STRIPE_KEY} to bill` }],
        }),
      }),
    );

    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    const event = mocks.recordAuditEvent.mock.calls[0]![0] as {
      eventType: string;
      detail: Record<string, unknown>;
    };
    expect(event.eventType).toBe('secret_detected');
    expect(event.detail['status']).toBe('redacted');
    expect(JSON.stringify(event)).not.toContain(STRIPE_KEY);
  });

  it('does not record an audit event when nothing is redacted', async () => {
    await POST(
      new NextRequest('https://agiworkforce.com/api/share', {
        method: 'POST',
        body: JSON.stringify({ title: 'Session', messages: [{ role: 'user', content: 'hi' }] }),
      }),
    );

    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
