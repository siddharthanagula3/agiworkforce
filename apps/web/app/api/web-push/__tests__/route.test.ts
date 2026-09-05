import { createECDH, randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecute, mockQuery, mockCsrf, mockRequireUser, mockRateLimit, mockPublicKey } =
  vi.hoisted(() => ({
    mockExecute: vi.fn(),
    mockQuery: vi.fn(),
    mockCsrf: vi.fn(),
    mockRequireUser: vi.fn(),
    mockRateLimit: vi.fn(),
    mockPublicKey: vi.fn(),
  }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ execute: mockExecute, query: mockQuery }),
}));
vi.mock('@/lib/server/neon-chat', () => ({ requireCurrentUserId: mockRequireUser }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { execute: mockExecute, query: mockQuery },
    userId: await mockRequireUser(),
    organizationId: null,
  })),
}));

const { isDeliverableSubscription } = await vi.importActual<
  typeof import('@/lib/services/web-push-service')
>('@/lib/services/web-push-service');

vi.mock('@/lib/services/web-push-service', () => ({
  getWebPushPublicKey: mockPublicKey,
  isDeliverableSubscription,
}));

const { GET, POST, DELETE } = await import('../route');

const ENDPOINT = 'https://push.example.test/push/abc';

function validKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  };
}

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/web-push', {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockResolvedValue(null);
  mockRequireUser.mockResolvedValue('user-owner');
  mockExecute.mockResolvedValue(1);
  mockQuery.mockResolvedValue([]);
  mockPublicKey.mockReturnValue('a-public-key');
});

describe('GET /api/web-push', () => {
  it('hands the browser the VAPID public key', async () => {
    const response = await GET(request('GET'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ publicKey: 'a-public-key' });
  });

  it('reports no key when the deployment has no VAPID pair, rather than inventing one', async () => {
    mockPublicKey.mockReturnValue(null);

    await expect((await GET(request('GET'))).json()).resolves.toEqual({ publicKey: null });
  });

  it('is authenticated: an anonymous caller never reaches the handler body', async () => {
    mockRequireUser.mockRejectedValue(new Error('unauthorised'));

    const response = await GET(request('GET'));

    expect(response.ok).toBe(false);
    expect(mockPublicKey).not.toHaveBeenCalled();
  });
});

describe('POST /api/web-push', () => {
  it('stores the registration against the caller', async () => {
    const keys = validKeys();

    const response = await POST(request('POST', { endpoint: ENDPOINT, keys }));

    expect(response.status).toBe(200);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into public.web_push_subscriptions');
    expect(sql).toContain('on conflict (endpoint) do update');
    expect(params.slice(0, 4)).toEqual(['user-owner', ENDPOINT, keys.p256dh, keys.auth]);
  });

  it('refreshes the caller’s own registration in place', async () => {
    mockQuery.mockResolvedValue([{ user_id: 'user-owner' }]);

    const response = await POST(request('POST', { endpoint: ENDPOINT, keys: validKeys() }));

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('refuses to move an endpoint that already belongs to another account', async () => {
    mockQuery.mockResolvedValue([{ user_id: 'user-victim' }]);

    const response = await POST(request('POST', { endpoint: ENDPOINT, keys: validKeys() }));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('never reassigns user_id, so a lost race cannot hand the row to the caller', async () => {
    await POST(request('POST', { endpoint: ENDPOINT, keys: validKeys() }));

    const [sql] = mockExecute.mock.calls[0] as [string];
    expect(sql).not.toContain('user_id      = excluded.user_id');
    expect(sql).toContain('where public.web_push_subscriptions.user_id = excluded.user_id');
  });

  it('is refused without a CSRF token', async () => {
    mockCsrf.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request('POST', { endpoint: ENDPOINT, keys: validKeys() }));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('is refused when the rate limiter says so', async () => {
    mockRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await POST(request('POST', { endpoint: ENDPOINT, keys: validKeys() }));

    expect(response.status).toBe(429);
    expect(mockRequireUser).not.toHaveBeenCalled();
  });

  it('rejects key material that could never be encrypted against', async () => {
    const response = await POST(
      request('POST', { endpoint: ENDPOINT, keys: { p256dh: 'short', auth: 'short' } }),
    );

    expect(response.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rejects a non-https endpoint', async () => {
    const response = await POST(
      request('POST', { endpoint: 'http://push.example.test/x', keys: validKeys() }),
    );

    expect(response.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/web-push', () => {
  it('removes only the caller’s own registration', async () => {
    const response = await DELETE(request('DELETE', { endpoint: ENDPOINT }));

    expect(response.status).toBe(200);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('delete from public.web_push_subscriptions');
    expect(sql).toContain('where endpoint = $1 and user_id = $2');
    expect(params).toEqual([ENDPOINT, 'user-owner']);
  });

  it('is refused without a CSRF token', async () => {
    mockCsrf.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await DELETE(request('DELETE', { endpoint: ENDPOINT }));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
