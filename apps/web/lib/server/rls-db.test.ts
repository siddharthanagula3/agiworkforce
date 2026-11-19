import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const rlsWithOrg = vi.fn(() => ({ tag: 'rls-adapter' }) as unknown as DatabaseAdapter);
const rlsUserQuery = vi.fn(async () => []);
const rlsWithUser = vi.fn((_jwt: string) => ({ withOrg: rlsWithOrg, query: rlsUserQuery }));
vi.mock('@agiworkforce/data-layer', () => ({
  createDatabaseClient: vi.fn(() => ({ withUser: rlsWithUser })),
}));

const mockAuth = vi.fn(
  async (): Promise<{
    userId: string | null;
    sessionId?: string | null;
    getToken: () => Promise<string | null>;
  }> => ({
    userId: null,
    getToken: async () => null,
  }),
);
const mockGetSession = vi.fn(async (sessionId: string) => ({
  id: sessionId,
  userId: 'user_policy_provider',
  status: 'active',
  createdAt: Date.now() - 60 * 60 * 1000,
  lastActiveAt: Date.now(),
  expireAt: Date.now() + 60 * 60 * 1000,
  latestActivity: null,
}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...(args as [])),
  clerkClient: vi.fn(async () => ({ sessions: { getSession: mockGetSession } })),
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

/**
 * The two owner-connection reads made before a user scope exists: the identity
 * bridge and the account lifecycle. Both answer with an unremarkable account.
 */
async function ownerConnectionAnswers(
  sql: string = '',
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const statement = String(sql).toLowerCase();
  if (statement.includes('left join public.identities')) {
    return [{ identity_id: null, account_id: params[2] ?? null, erased: false }];
  }
  if (statement.includes('account_status')) {
    return [{ account_status: null, deletion_scheduled_for: null, erased: false }];
  }
  return [];
}

const serviceQuery = vi.fn(ownerConnectionAnswers);
const serviceExecute = vi.fn(async (_sql: string, _params?: unknown[]) => 0);
const serviceTransaction = vi.fn(async (callback: (tx: DatabaseAdapter) => Promise<unknown>) =>
  callback({ query: serviceQuery, execute: serviceExecute } as unknown as DatabaseAdapter),
);
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(
    () =>
      ({
        query: (sql: string, params?: unknown[]) => serviceQuery(sql, params),
        execute: (sql: string, params?: unknown[]) => serviceExecute(sql, params),
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
import { createError, isAppError } from '@/lib/errors';
import {
  getTenantScope,
  newSpanId,
  newTraceId,
  runWithTraceContext,
} from '@/lib/observability/trace-context';
import {
  getCurrentCookieUserRlsDb,
  getCurrentUserRlsDb,
  getUserScopedDb,
  getVerifiedBearerUserScopedDb,
} from './rls-db';

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
    serviceQuery.mockImplementation(ownerConnectionAnswers);
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

  it('keeps authentication policy checks when data scope opts out of workspace resolution', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_1', getToken: async () => 'jwt-token' });
    const request = new NextRequest('https://example.test/api/settings/preferences');

    const { resolveActiveOrganizationId } = await import('@/lib/services/active-workspace-service');

    const scoped = await getUserScopedDb(request, { resolveOrganization: false });

    expect(scoped.organizationId).toBeNull();
    expect(resolveActiveOrganizationId).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      'user_1',
      request,
    );
    expect(rlsWithOrg).toHaveBeenCalledWith(null);
  });

  it('propagates an explicit workspace rejection instead of falling back to personal data', async () => {
    const { resolveActiveOrganizationId } = await import('@/lib/services/active-workspace-service');
    const refusal = createError.forbidden('You are not a member of that workspace');
    vi.mocked(resolveActiveOrganizationId).mockRejectedValue(refusal);
    const request = apiKeyRequest();
    request.headers.set('x-agi-organization-id', '11111111-1111-4111-8111-111111111111');
    try {
      await expect(getUserScopedDb(request, { apiKeyScope: 'inference:write' })).rejects.toBe(
        refusal,
      );
      expect(rlsWithOrg).not.toHaveBeenCalled();
    } finally {
      vi.mocked(resolveActiveOrganizationId).mockResolvedValue(null);
    }
  });

  it('answers a workspace lookup that fails outright as unavailable, never as signed out', async () => {
    const { resolveActiveOrganizationId } = await import('@/lib/services/active-workspace-service');
    vi.mocked(resolveActiveOrganizationId).mockRejectedValue(new Error('connection terminated'));
    try {
      const error = await getUserScopedDb(apiKeyRequest(), {
        apiKeyScope: 'inference:write',
      }).catch((caught: unknown) => caught);
      expect(isAppError(error) && error.statusCode).toBe(503);
      expect(rlsWithOrg).not.toHaveBeenCalled();
    } finally {
      vi.mocked(resolveActiveOrganizationId).mockResolvedValue(null);
    }
  });
});

describe('getVerifiedBearerUserScopedDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses an already verified principal without verifying the bearer token again', async () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.verified-session.sig';
    const request = new NextRequest('https://example.test/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });

    const scoped = await getVerifiedBearerUserScopedDb(request, {
      userId: 'user_verified',
      token,
    });

    expect(scoped.userId).toBe('user_verified');
    expect(scoped).not.toHaveProperty('sessionIdentity');
    expect(rlsWithUser).toHaveBeenCalledWith(token);
    expect(mockVerifyToken).not.toHaveBeenCalled();
    expect(mockVerifyKey).not.toHaveBeenCalled();
  });

  it('rejects a principal whose verified token is not the request bearer', async () => {
    const request = new NextRequest('https://example.test/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer request-token' },
    });

    const error = await capture(
      getVerifiedBearerUserScopedDb(request, {
        userId: 'user_verified',
        token: 'different-token',
      }),
    );

    expect(isAppError(error) && error.statusCode).toBe(401);
    expect(rlsWithUser).not.toHaveBeenCalled();
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
    expect(scoped).not.toHaveProperty('sessionIdentity');
    await scoped?.db.query('select 1');
    expect(rlsUserQuery).toHaveBeenCalledWith('select 1', undefined);
    expect(rlsWithUser).toHaveBeenCalledWith('jwt-token');
    expect(rlsWithOrg).not.toHaveBeenCalled();
  });
});

describe('tenant scope propagation onto the active trace context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceQuery.mockImplementation(ownerConnectionAnswers);
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
    serviceQuery.mockImplementation(ownerConnectionAnswers);
  });

  it('applies the workspace mfa gate and ip allow list the bearer path already applies', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_cookie', getToken: async () => 'jwt-token' });
    const request = new NextRequest('https://example.test/api/settings/2fa');

    const scoped = await getUserScopedDb(request, { resolveOrganization: false });

    expect(scoped.userId).toBe('user_cookie');
    // The mfa gate resolves its scope from membership, so it takes no request;
    // the ip allow list still needs one, to read the client address.
    expect(mockAssertMfaPolicy).toHaveBeenCalledWith('user_cookie', {
      subject: 'user_cookie',
      sessionId: null,
    });
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

describe('getCurrentCookieUserRlsDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceQuery.mockImplementation(ownerConnectionAnswers);
    mockAssertMfaPolicy.mockResolvedValue(undefined);
    mockAssertIpAllowList.mockResolvedValue(undefined);
    mockAuth.mockResolvedValue({ userId: 'user_cookie_share', getToken: async () => 'cookie-jwt' });
  });

  it('ignores bearer credentials and scopes only the admitted cookie without binding a workspace', async () => {
    const request = apiKeyRequest();
    const result = await getCurrentCookieUserRlsDb(request);
    expect(result?.userId).toBe('user_cookie_share');
    expect(result).not.toHaveProperty('sessionIdentity');
    expect(mockVerifyKey).not.toHaveBeenCalled();
    expect(mockVerifyToken).not.toHaveBeenCalled();
    expect(mockAssertMfaPolicy).toHaveBeenCalledWith('user_cookie_share', {
      subject: 'user_cookie_share',
      sessionId: null,
    });
    expect(mockAssertIpAllowList).toHaveBeenCalledWith('user_cookie_share', request);
    expect(rlsWithUser).toHaveBeenCalledWith('cookie-jwt');
    expect(rlsWithOrg).not.toHaveBeenCalled();
  });

  it('does not construct an RLS scope when an admitted cookie has no token', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_cookie_share', getToken: async () => null });
    await expect(getCurrentCookieUserRlsDb(apiKeyRequest())).resolves.toBeNull();
    expect(rlsWithUser).not.toHaveBeenCalled();
  });

  it('does not admit a bearer-only caller', async () => {
    mockAuth.mockResolvedValue({ userId: null, getToken: async () => null });
    await expect(getCurrentCookieUserRlsDb(apiKeyRequest())).resolves.toBeNull();
    expect(mockVerifyKey).not.toHaveBeenCalled();
    expect(rlsWithUser).not.toHaveBeenCalled();
  });

  it('returns the mapped account rather than the provider subject', async () => {
    serviceQuery.mockImplementation(async (sql, params) =>
      String(sql).includes('left join public.identities')
        ? [{ identity_id: 'identity-share', account_id: 'account-share', erased: false }]
        : ownerConnectionAnswers(sql, params),
    );
    await expect(getCurrentCookieUserRlsDb(apiKeyRequest())).resolves.toMatchObject({
      userId: 'account-share',
    });
    expect(mockAssertMfaPolicy).toHaveBeenCalledWith('account-share', {
      subject: 'user_cookie_share',
      sessionId: null,
    });
  });

  it.each(['mfa', 'ip'] as const)(
    'does not create an RLS scope after a %s denial',
    async (gate) => {
      const deny = gate === 'mfa' ? mockAssertMfaPolicy : mockAssertIpAllowList;
      deny.mockRejectedValueOnce(createError.forbidden('denied'));
      await expect(getCurrentCookieUserRlsDb(apiKeyRequest())).resolves.toBeNull();
      expect(rlsWithUser).not.toHaveBeenCalled();
    },
  );

  it('propagates unavailable admission instead of constructing an RLS scope', async () => {
    mockAssertIpAllowList.mockRejectedValueOnce(createError.serviceUnavailable('unavailable'));
    await expect(getCurrentCookieUserRlsDb(apiKeyRequest())).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(rlsWithUser).not.toHaveBeenCalled();
  });
});

describe('authenticated surface carried by a scoped database', () => {
  it.each([
    { boundSurface: 'mobile' as const, expected: 'mobile' },
    { boundSurface: undefined, expected: 'unknown' },
  ])(
    'does not trust a web header over verified claims: $expected',
    async ({ boundSurface, expected }) => {
      const token = 'fixture-verified-token';
      const request = new NextRequest('https://example.test/api/models/free-quota/completions', {
        headers: { authorization: `Bearer ${token}`, 'x-agi-surface': 'web' },
      });
      const scoped = await getVerifiedBearerUserScopedDb(request, {
        userId: 'user_verified',
        token,
        ...(boundSurface ? { boundSurface } : {}),
      });
      expect(scoped.surface).toBe(expected);
    },
  );
});

vi.mock('@/lib/services/org-sharing-service', () => ({
  resolveOrgMembershipForOrganization: vi.fn(async () => null),
}));

vi.mock('@/lib/feature-flags/tenant-lockdown', () => ({
  assertTenantNotLockedDown: vi.fn(async () => {}),
}));

async function resetPolicyBoundaries(): Promise<void> {
  const { resetSessionStartCache } = await import('@/lib/auth/session-age');
  resetSessionStartCache();
  const { resolveOrgMembershipForOrganization } =
    await import('@/lib/services/org-sharing-service');
  const { assertTenantNotLockedDown } = await import('@/lib/feature-flags/tenant-lockdown');
  const { resolveActiveOrganizationId } = await import('@/lib/services/active-workspace-service');
  vi.mocked(resolveOrgMembershipForOrganization).mockReset().mockResolvedValue(null);
  vi.mocked(assertTenantNotLockedDown).mockReset().mockResolvedValue(undefined);
  vi.mocked(resolveActiveOrganizationId).mockReset().mockResolvedValue(null);
  mockAssertMfaPolicy.mockReset().mockResolvedValue(undefined);
  mockAssertIpAllowList.mockReset().mockResolvedValue(undefined);
  mockAuth.mockReset();
  mockVerifyToken.mockReset();
}

describe('owner-policy admission through real auth and claimed scope', () => {
  const organizationId = '11111111-1111-4111-8111-111111111111';
  const otherOrganizationId = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    vi.clearAllMocks();
    serviceQuery.mockReset().mockImplementation(ownerConnectionAnswers);
    await resetPolicyBoundaries();
    mockAssertMfaPolicy.mockResolvedValue(undefined);
    mockAssertIpAllowList.mockResolvedValue(undefined);
    const { resolveActiveOrganizationId } = await import('@/lib/services/active-workspace-service');
    vi.mocked(resolveActiveOrganizationId).mockResolvedValue(organizationId);
  });

  it.each(
    [
      { transport: 'cookie', mapped: false },
      { transport: 'cookie', mapped: true },
      { transport: 'bearer', mapped: false },
      { transport: 'bearer', mapped: true },
    ].flatMap((principal) => [
      { ...principal, sessionId: 'sess_policy_admitted' },
      { ...principal, sessionId: null },
    ]),
  )(
    'captures one $transport identity and target (mapped=$mapped, session=$sessionId)',
    async ({ transport, mapped, sessionId }) => {
      const providerSubject = 'user_policy_provider';
      const userId = mapped ? 'account_policy_product' : providerSubject;
      const token = 'opaque-provider-session-token';
      const getToken = vi.fn(async () => token);
      mockAuth.mockResolvedValue({ userId: providerSubject, sessionId, getToken });
      mockVerifyToken.mockResolvedValue({ sub: providerSubject, sid: sessionId });
      serviceQuery.mockImplementation(async (sql, params) =>
        String(sql).includes('left join public.identities')
          ? [{ identity_id: mapped ? 'identity-policy' : null, account_id: userId, erased: false }]
          : ownerConnectionAnswers(sql, params),
      );
      const { resolveActiveOrganizationId } =
        await import('@/lib/services/active-workspace-service');
      const { assertTenantNotLockedDown } = await import('@/lib/feature-flags/tenant-lockdown');
      const { resolveOrgMembershipForOrganization } =
        await import('@/lib/services/org-sharing-service');
      vi.mocked(assertTenantNotLockedDown).mockImplementationOnce(async () => {
        vi.mocked(resolveActiveOrganizationId).mockResolvedValue(otherOrganizationId);
      });
      vi.mocked(resolveOrgMembershipForOrganization).mockResolvedValue(null);
      vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_clerk_secret');
      try {
        const scoped = await getUserScopedDb(
          new NextRequest(
            'https://example.test/api/organizations/mfa-policy?subject=forged-query-subject&sessionId=forged-query-session',
            {
              method: 'PATCH',
              headers: {
                ...(transport === 'bearer' ? { authorization: `Bearer ${token}` } : {}),
                'content-type': 'application/json',
                'x-agi-subject': 'forged-header-subject',
                'x-agi-session-id': 'forged-header-session',
              },
              body: JSON.stringify({
                sessionIdentity: {
                  subject: 'forged-body-subject',
                  sessionId: 'forged-body-session',
                },
              }),
            },
          ),
          { mfaGateExemptForOwner: true },
        );
        expect(scoped).toMatchObject({ userId, organizationId });
        expect(scoped.sessionIdentity).toEqual({ subject: providerSubject, sessionId });
        expect(resolveActiveOrganizationId).toHaveBeenCalledTimes(1);
        expect(assertTenantNotLockedDown).toHaveBeenCalledWith(organizationId);
        expect(resolveOrgMembershipForOrganization).toHaveBeenCalledWith(
          expect.anything(),
          userId,
          organizationId,
        );
        expect(mockAssertMfaPolicy).toHaveBeenCalledExactlyOnceWith(userId, {
          subject: providerSubject,
          sessionId,
        });
        expect(mockAssertMfaPolicy).toHaveBeenCalledWith(userId, scoped.sessionIdentity);
        expect(rlsWithUser).not.toHaveBeenCalled();
        expect(rlsWithOrg).not.toHaveBeenCalled();
        expect(mockAuth).toHaveBeenCalledTimes(transport === 'cookie' ? 1 : 0);
        expect(getToken).toHaveBeenCalledTimes(transport === 'cookie' ? 1 : 0);
        expect(mockVerifyToken).toHaveBeenCalledTimes(transport === 'bearer' ? 1 : 0);

        scoped.userId = 'changed-return-value';
        scoped.organizationId = otherOrganizationId;
        serviceExecute.mockClear();
        serviceQuery.mockClear();
        await scoped.db.query('select policy_fixture');
        await scoped.db.execute('update policy_fixture set enabled = true');
        await scoped.db.transaction(async (tx) => {
          await tx.query('select policy_fixture_in_transaction');
        });
        expect(serviceExecute).toHaveBeenCalledWith('set local role app_rls');
        const bindings = serviceQuery.mock.calls.filter(([sql]) =>
          String(sql).includes('set_config'),
        );
        expect(bindings).toHaveLength(3);
        for (const [, params] of bindings) expect(params).toEqual([userId, organizationId]);
        const roleOrders = serviceExecute.mock.calls.flatMap(([sql], index) =>
          sql === 'set local role app_rls' ? [serviceExecute.mock.invocationCallOrder[index]!] : [],
        );
        const bindingOrders = serviceQuery.mock.calls.flatMap(([sql], index) =>
          String(sql).includes('set_config') ? [serviceQuery.mock.invocationCallOrder[index]!] : [],
        );
        const bodyOrders = [
          serviceQuery.mock.invocationCallOrder[1]!,
          serviceExecute.mock.invocationCallOrder[2]!,
          serviceQuery.mock.invocationCallOrder[4]!,
        ];
        for (let index = 0; index < 3; index++) {
          expect(roleOrders[index]).toBeLessThan(bindingOrders[index]!);
          expect(bindingOrders[index]).toBeLessThan(bodyOrders[index]!);
        }
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it.each(['lookup', 'mfa', 'ip'] as const)(
    'does not construct a database after %s denial',
    async (gate) => {
      mockAuth.mockResolvedValue({
        userId: 'user_denied_policy',
        getToken: async () => 'opaque-token',
      });
      const { resolveActiveOrganizationId } =
        await import('@/lib/services/active-workspace-service');
      const denial = createError.serviceUnavailable('fixture denial');
      if (gate === 'lookup') vi.mocked(resolveActiveOrganizationId).mockRejectedValueOnce(denial);
      if (gate === 'mfa') mockAssertMfaPolicy.mockRejectedValueOnce(denial);
      if (gate === 'ip') mockAssertIpAllowList.mockRejectedValueOnce(denial);
      await expect(
        getUserScopedDb(new NextRequest('https://example.test/api/organizations/mfa-policy'), {
          mfaGateExemptForOwner: true,
        }),
      ).rejects.toBe(denial);
      expect(serviceTransaction).not.toHaveBeenCalled();
      expect(serviceExecute).not.toHaveBeenCalled();
      expect(rlsWithUser).not.toHaveBeenCalled();
    },
  );

  it.each(['device', 'api-key'] as const)(
    'does not invent session evidence for an admitted %s',
    async (kind) => {
      const { verifyDeveloperTokenSignature } = await import('@/lib/server/developer-token');
      const userId = 'account_without_provider_session';
      const token = kind === 'api-key' ? API_KEY_TOKEN : 'opaque-device-token';
      if (kind === 'device') {
        vi.mocked(verifyDeveloperTokenSignature).mockReturnValueOnce({
          userId,
          jti: 'fixture-device-jti',
          exp: 4_000_000_000,
          sessionFamilyId: 'device-family-is-not-a-provider-session',
        });
      } else {
        mockVerifyKey.mockResolvedValueOnce({
          id: 'policy-key',
          user_id: userId,
          scopes: ['inference:write'],
        });
      }
      const request = new NextRequest(
        'https://example.test/api/organizations/mfa-policy?subject=forged&sessionId=forged',
        {
          method: 'PATCH',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'x-agi-subject': 'forged',
            'x-agi-session-id': 'forged',
          },
          body: JSON.stringify({ sessionIdentity: { subject: 'forged', sessionId: 'forged' } }),
        },
      );
      const scoped = await getUserScopedDb(request, {
        mfaGateExemptForOwner: true,
        ...(kind === 'api-key' ? { apiKeyScope: 'inference:write' as const } : {}),
      });
      expect(scoped).toMatchObject({ userId, organizationId });
      expect(scoped).not.toHaveProperty('sessionIdentity');
      expect(mockAssertMfaPolicy).toHaveBeenCalledExactlyOnceWith(userId, undefined);
      expect(mockVerifyToken).not.toHaveBeenCalled();
      expect(mockAuth).not.toHaveBeenCalled();
      expect(mockGetSession).not.toHaveBeenCalled();
      await scoped.db.query('select sessionless_policy_fixture');
      expect(serviceExecute).toHaveBeenCalledWith('set local role app_rls');
      expect(serviceQuery).toHaveBeenCalledWith(expect.stringContaining('set_config'), [
        userId,
        organizationId,
      ]);
      expect(rlsWithUser).not.toHaveBeenCalled();
    },
  );

  it.each(['cookie', 'bearer'] as const)(
    'keeps session evidence off the default %s scope',
    async (transport) => {
      const userId = 'user_policy_provider';
      const sessionId = 'sess_default_admitted';
      const token = 'opaque-default-session';
      mockAuth.mockResolvedValue({ userId, sessionId, getToken: async () => token });
      mockVerifyToken.mockResolvedValue({ sub: userId, sid: sessionId });
      vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_clerk_secret');
      try {
        const scoped = await getUserScopedDb(
          new NextRequest('https://example.test/api/settings/preferences', {
            headers: transport === 'bearer' ? { authorization: `Bearer ${token}` } : {},
          }),
        );
        expect(scoped).not.toHaveProperty('sessionIdentity');
        expect(mockAssertMfaPolicy).toHaveBeenCalledExactlyOnceWith(userId, {
          subject: userId,
          sessionId,
        });
        expect(rlsWithUser).toHaveBeenCalledExactlyOnceWith(token);
        expect(rlsWithOrg).toHaveBeenCalledExactlyOnceWith(organizationId);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it('rejects opting out of organization resolution on the recovery path', async () => {
    await expect(
      getUserScopedDb(new NextRequest('https://example.test/api/organizations/mfa-policy'), {
        mfaGateExemptForOwner: true,
        resolveOrganization: false,
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(serviceTransaction).not.toHaveBeenCalled();
    expect(rlsWithUser).not.toHaveBeenCalled();
  });
});

describe('owner-policy receipt boundary', () => {
  const organizationId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    vi.clearAllMocks();
    serviceQuery.mockReset().mockImplementation(ownerConnectionAnswers);
    await resetPolicyBoundaries();
  });

  it.each([undefined, { userId: 'another-account', organizationId }])(
    'refuses an absent or mismatched receipt without resolving again',
    async (organizationScope) => {
      const auth = await import('@/lib/api-auth');
      const { resolveActiveOrganizationId } =
        await import('@/lib/services/active-workspace-service');
      const spy = vi.spyOn(auth, 'getClerkAuthUser').mockResolvedValue({
        userId: 'account_receipt',
        organizationScope,
      });
      try {
        await expect(
          getUserScopedDb(
            new NextRequest('https://example.test/api/organizations/mfa-policy', {
              headers: { authorization: 'Bearer opaque-session' },
            }),
            { mfaGateExemptForOwner: true },
          ),
        ).rejects.toMatchObject({ statusCode: 401 });
        expect(resolveActiveOrganizationId).not.toHaveBeenCalled();
        expect(serviceTransaction).not.toHaveBeenCalled();
        expect(rlsWithUser).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    },
  );

  it.each(['sess_receipt', null])(
    'copies receipt and session primitives before auth metadata mutation: %s',
    async (sessionId) => {
      const auth = await import('@/lib/api-auth');
      const receipt = { userId: 'account_receipt', organizationId };
      const sessionIdentity = { subject: 'provider_receipt', sessionId };
      const result = { userId: 'account_receipt', organizationScope: receipt, sessionIdentity };
      const spy = vi.spyOn(auth, 'getClerkAuthUser').mockResolvedValue(result);
      try {
        const scoped = await getUserScopedDb(
          new NextRequest('https://example.test/api/organizations/mfa-policy', {
            headers: { authorization: 'Bearer opaque-session' },
          }),
          { mfaGateExemptForOwner: true },
        );
        expect(scoped.sessionIdentity).toEqual({ subject: 'provider_receipt', sessionId });
        expect(scoped.sessionIdentity).not.toBe(sessionIdentity);
        sessionIdentity.subject = 'mutated-provider';
        sessionIdentity.sessionId = 'mutated-session';
        result.sessionIdentity = {
          subject: 'replacement-provider',
          sessionId: 'replacement-session',
        };
        receipt.userId = 'mutated-account';
        receipt.organizationId = '22222222-2222-4222-8222-222222222222';
        result.userId = 'mutated-principal';
        result.organizationScope = {
          userId: 'replacement-account',
          organizationId: receipt.organizationId,
        };
        expect(scoped.sessionIdentity).toEqual({ subject: 'provider_receipt', sessionId });
        await scoped.db.query('select receipt_fixture');
        expect(serviceQuery).toHaveBeenCalledWith(expect.stringContaining('set_config'), [
          'account_receipt',
          organizationId,
        ]);
        expect(rlsWithUser).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    },
  );

  it.each([organizationId, null])(
    'captures exact owner recovery or Personal scope: %s',
    async (target) => {
      const { resolveActiveOrganizationId } =
        await import('@/lib/services/active-workspace-service');
      const { resolveOrgMembershipForOrganization } =
        await import('@/lib/services/org-sharing-service');
      const { assertTenantNotLockedDown } = await import('@/lib/feature-flags/tenant-lockdown');
      vi.mocked(resolveActiveOrganizationId).mockResolvedValue(target);
      vi.mocked(resolveOrgMembershipForOrganization).mockResolvedValue(
        target
          ? {
              organizationId: target,
              role: 'owner',
            }
          : null,
      );
      mockAuth.mockResolvedValue({
        userId: 'user_owner_recovery',
        getToken: async () => 'opaque-cookie',
      });
      mockAssertMfaPolicy.mockResolvedValue(undefined);
      mockAssertIpAllowList.mockResolvedValue(undefined);
      try {
        const scoped = await getUserScopedDb(
          new NextRequest('https://example.test/api/organizations/mfa-policy'),
          {
            mfaGateExemptForOwner: true,
          },
        );
        expect(scoped.organizationId).toBe(target);
        expect(resolveActiveOrganizationId).toHaveBeenCalledTimes(1);
        expect(assertTenantNotLockedDown).toHaveBeenCalledWith(target);
        expect(resolveOrgMembershipForOrganization).toHaveBeenCalledWith(
          expect.anything(),
          'user_owner_recovery',
          target,
        );
        expect(mockAssertMfaPolicy).toHaveBeenCalledTimes(target ? 0 : 1);
        expect(mockAssertIpAllowList).toHaveBeenCalledTimes(1);
        await scoped.db.query('select owner_recovery_fixture');
        expect(serviceQuery).toHaveBeenCalledWith(expect.stringContaining('set_config'), [
          'user_owner_recovery',
          target ?? '',
        ]);
        expect(rlsWithUser).not.toHaveBeenCalled();
      } finally {
        vi.mocked(resolveOrgMembershipForOrganization).mockResolvedValue(null);
        vi.mocked(resolveActiveOrganizationId).mockResolvedValue(null);
      }
    },
  );
});
