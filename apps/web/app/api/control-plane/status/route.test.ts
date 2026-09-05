import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  scoped: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  getCorsHeaders: vi.fn(() => ({})),
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/mfa-policy-gate', () => ({ isMfaRequiredError: vi.fn(() => false) }));
vi.mock('@/lib/ip-allow-list-gate', () => ({ isIpNotAllowedError: vi.fn(() => false) }));
vi.mock('@/lib/api-auth-response', () => ({ unauthorizedResponseFor: vi.fn() }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.scoped }));

const { GET } = await import('./route');
const { getUserScopedDb } = await import('@/lib/server/rls-db');

function statusRequest(): NextRequest {
  return new NextRequest('http://localhost/api/control-plane/status');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 200 })),
  );
  mocks.scoped.mockResolvedValue({
    db: { query: mocks.query, execute: mocks.execute },
    userId: 'user-1',
    organizationId: null,
  });
  mocks.query.mockResolvedValue([]);
});

describe('GET /api/control-plane/status tenant scope', () => {
  it('reads every surface, agent and activity count on the caller connection', async () => {
    const response = await GET(statusRequest());

    expect(response.status).toBe(200);
    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(mocks.query).toHaveBeenCalled();
    for (const [, params] of mocks.query.mock.calls as Array<[string, unknown[]]>) {
      expect(params[0]).toBe('user-1');
    }
  });

  it('keeps the owner predicate on the device heartbeat read', async () => {
    await GET(statusRequest());

    const heartbeat = (mocks.query.mock.calls as Array<[string, unknown[]]>).find(([sql]) =>
      sql.includes('desktop_devices'),
    );
    expect(heartbeat?.[0]).toMatch(/where user_id = \$1/);
  });

  it('answers 401 without opening a connection when the caller has no session', async () => {
    mocks.scoped.mockRejectedValueOnce(new Error('unauthorized'));

    const response = await GET(statusRequest());

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
