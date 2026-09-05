import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const rlsWithOrg = vi.fn(() => ({ tag: 'rls-adapter' }) as unknown as DatabaseAdapter);
const rlsWithUser = vi.fn((_jwt: string) => ({ withOrg: rlsWithOrg }));
vi.mock('@agiworkforce/data-layer', () => ({
  createDatabaseClient: vi.fn(() => ({ withUser: rlsWithUser })),
}));

const mockAuth = vi.fn(
  async (): Promise<{ userId: string | null; getToken: () => Promise<string | null> }> => ({
    userId: null,
    getToken: async () => null,
  }),
);
vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...(args as [])),
}));

const mockVerifyToken = vi.fn();
vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...(args as [])),
}));

const mockVerifyKey = vi.fn();
vi.mock('@/lib/services/api-key-service', () => ({
  ApiKeyService: { verifyKey: (...args: unknown[]) => mockVerifyKey(...args) },
}));

vi.mock('@/lib/server/developer-token', () => ({
  verifyDeveloperTokenSignature: vi.fn(() => null),
  isDeveloperTokenRevoked: vi.fn(async () => false),
}));

const serviceQuery = vi.fn(async () => [] as Record<string, unknown>[]);
const serviceExecute = vi.fn(async () => 0);
const serviceTransaction = vi.fn(async (callback: (tx: DatabaseAdapter) => Promise<unknown>) =>
  callback({ query: serviceQuery, execute: serviceExecute } as unknown as DatabaseAdapter),
);
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(
    () =>
      ({
        query: (...args: unknown[]) => serviceQuery(...(args as [])),
        execute: (...args: unknown[]) => serviceExecute(...(args as [])),
        transaction: (...args: unknown[]) => serviceTransaction(...(args as [never])),
      }) as unknown as DatabaseAdapter,
  ),
}));

const mockAssertMfaPolicy = vi.fn(async () => {});
vi.mock('@/lib/mfa-policy-gate', () => ({
  assertMfaPolicy: (...args: unknown[]) => mockAssertMfaPolicy(...(args as [])),
  isMfaRequiredError: () => false,
  resolveMfaEnrolled: vi.fn(async () => true),
  MfaRequiredError: class MfaRequiredError extends Error {},
}));

const mockAssertIpAllowList = vi.fn(async () => {});
vi.mock('@/lib/ip-allow-list-gate', () => ({
  assertIpAllowList: (...args: unknown[]) => mockAssertIpAllowList(...(args as [])),
  isIpNotAllowedError: () => false,
  IpNotAllowedError: class IpNotAllowedError extends Error {},
}));

vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(async () => null),
}));

import { isApiKeyScopeError } from '@/lib/api-key-scope-error';
import { isAppError } from '@/lib/errors';
import {
  getTenantScope,
  newSpanId,
  newTraceId,
  runWithTraceContext,
} from '@/lib/observability/trace-context';
import { getCurrentUserRlsDb, getUserScopedDb } from './rls-db';

function withTrace<R>(fn: () => Promise<R>): Promise<R> {
  return runWithTraceContext({ traceId: newTraceId(), spanId: newSpanId(), sampled: true }, fn);
}

const API_KEY_TOKEN = 'sk_live_0000000000000000_rls_spec_fixture';
const API_KEY_USER = 'user_api_key_principal';

function apiKeyRequest(): NextRequest {
  return new NextRequest('https://example.test/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY_TOKEN}` },
  });
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('getUserScopedDb with an API-key principal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceQuery.mockResolvedValue([]);
    mockVerifyKey.mockResolvedValue({
      id: 'key-1',
      user_id: API_KEY_USER,
      scopes: ['inference:write'],
    });
  });

  it('binds the key owner as the RLS subject so inference endpoints are reachable', async () => {
    const scoped = await getUserScopedDb(apiKeyRequest(), { apiKeyScope: 'inference:write' });

    expect(scoped.userId).toBe(API_KEY_USER);
    expect(rlsWithUser).not.toHaveBeenCalled();

    serviceQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'owned-row' }]);
    await expect(scoped.db.query('select id from web_conversations')).resolves.toEqual([
      { id: 'owned-row' },
    ]);

    expect(serviceExecute).toHaveBeenCalledWith('set local role app_rls');
    expect(serviceQuery).toHaveBeenCalledWith(
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      [API_KEY_USER, ''],
    );
  });

  it('rejects a key missing the required scope as a scope-specific 403', async () => {
    mockVerifyKey.mockResolvedValue({
      id: 'key-1',
      user_id: API_KEY_USER,
      scopes: ['usage:read'],
    });

    const error = await capture(
      getUserScopedDb(apiKeyRequest(), { apiKeyScope: 'inference:write' }),
    );

    expect(isApiKeyScopeError(error)).toBe(true);
    expect(isAppError(error) && error.statusCode).toBe(403);
  });

  it('rejects a key on an endpoint that admits none with a scope reason, not a bare 401', async () => {
    const error = await capture(getUserScopedDb(apiKeyRequest()));

    expect(isApiKeyScopeError(error)).toBe(true);
    expect(isAppError(error) && error.statusCode).toBe(403);
  });

  it('still binds a session JWT through the RLS-capable adapter', async () => {
    const request = new NextRequest('https://example.test/api/chat/sync', {
      method: 'POST',
      headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.session.sig' },
    });
    mockVerifyToken.mockResolvedValue({ sub: 'user_session' });
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_clerk_secret');

    const scoped = await getUserScopedDb(request);

    expect(scoped.userId).toBe('user_session');
    expect(rlsWithUser).toHaveBeenCalledWith('eyJhbGciOiJIUzI1NiJ9.session.sig');
    vi.unstubAllEnvs();
  });

  it('skips organization resolution when the caller opts out, scoping to no workspace', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_1', getToken: async () => 'jwt-token' });
    const request = new NextRequest('https://example.test/api/settings/preferences');

    const { resolveActiveOrganizationId } = await import('@/lib/services/active-workspace-service');

    const scoped = await getUserScopedDb(request, { resolveOrganization: false });

    expect(scoped.organizationId).toBeNull();
    expect(resolveActiveOrganizationId).not.toHaveBeenCalled();
    expect(rlsWithOrg).toHaveBeenCalledWith(null);
  });
});

// WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01: the RLS read used by Server
// Components with no NextRequest to build getUserScopedDb from (the root
// layout's server-rendered telemetry consent).
describe('getCurrentUserRlsDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when signed out', async () => {
    mockAuth.mockResolvedValue({ userId: null, getToken: async () => null });

    await expect(getCurrentUserRlsDb()).resolves.toBeNull();
    expect(rlsWithUser).not.toHaveBeenCalled();
  });

  it('treats a route with no auth context as signed out instead of throwing', async () => {
    mockAuth.mockRejectedValue(
      new Error("Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()"),
    );

    await expect(getCurrentUserRlsDb()).resolves.toBeNull();
    expect(rlsWithUser).not.toHaveBeenCalled();
  });

  it('returns null when the session carries no token', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_1', getToken: async () => null });

    await expect(getCurrentUserRlsDb()).resolves.toBeNull();
    expect(rlsWithUser).not.toHaveBeenCalled();
  });

  it('scopes the adapter to the caller without an organization-resolution query', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_1', getToken: async () => 'jwt-token' });

    const scoped = await getCurrentUserRlsDb();

    expect(scoped?.userId).toBe('user_1');
    expect(scoped?.db).toBe(rlsWithUser.mock.results[0]?.value);
    expect(rlsWithUser).toHaveBeenCalledWith('jwt-token');
    expect(rlsWithOrg).not.toHaveBeenCalled();
  });
});

describe('tenant scope propagation onto the active trace context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceQuery.mockResolvedValue([]);
    mockVerifyKey.mockResolvedValue({
      id: 'key-1',
      user_id: API_KEY_USER,
      scopes: ['inference:write'],
    });
  });

  it('stamps user id and organization id for an API-key principal', async () => {
    await withTrace(async () => {
      await getUserScopedDb(apiKeyRequest(), { apiKeyScope: 'inference:write' });
      expect(getTenantScope()).toEqual({ organizationId: undefined, userId: API_KEY_USER });
    });
  });

  it('stamps user id for a session JWT with no active context outside the request', async () => {
    const request = new NextRequest('https://example.test/api/chat/sync', {
      method: 'POST',
      headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.session.sig' },
    });
    mockVerifyToken.mockResolvedValue({ sub: 'user_session' });
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_clerk_secret');

    await withTrace(async () => {
      await getUserScopedDb(request);
      expect(getTenantScope().userId).toBe('user_session');
    });
    expect(getTenantScope().userId).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it('stamps user id for the Server-Component RLS read', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_1', getToken: async () => 'jwt-token' });

    await withTrace(async () => {
      await getCurrentUserRlsDb();
      expect(getTenantScope().userId).toBe('user_1');
    });
  });
});

describe('getUserScopedDb on a cookie session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceQuery.mockResolvedValue([]);
  });

  it('applies the workspace mfa gate and ip allow list the bearer path already applies', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_cookie', getToken: async () => 'jwt-token' });
    const request = new NextRequest('https://example.test/api/settings/2fa');

    const scoped = await getUserScopedDb(request, { resolveOrganization: false });

    expect(scoped.userId).toBe('user_cookie');
    expect(mockAssertMfaPolicy).toHaveBeenCalledWith('user_cookie', request);
    expect(mockAssertIpAllowList).toHaveBeenCalledWith('user_cookie', request);
  });

  it('refuses the request when the workspace mfa gate rejects it', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_cookie', getToken: async () => 'jwt-token' });
    mockAssertMfaPolicy.mockRejectedValueOnce(new Error('mfa required'));

    const error = await capture(
      getUserScopedDb(new NextRequest('https://example.test/api/settings/2fa'), {
        resolveOrganization: false,
      }),
    );

    expect(error).toBeInstanceOf(Error);
    expect(rlsWithUser).not.toHaveBeenCalled();
  });
});
