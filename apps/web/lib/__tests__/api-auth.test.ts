import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal()),
  getKeyValueStore: vi.fn(() => null),
}));

const mockAuth = vi.fn();
const mockClerkGetUser = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  clerkClient: vi.fn(async () => ({ users: { getUser: mockClerkGetUser } })),
}));

function authSession(userId: string | null): {
  userId: string | null;
  getToken: () => Promise<string>;
} {
  const token = userId ? jwt.sign({ sub: userId }, TEST_DEVELOPER_JWT_SECRET) : '';
  return { userId, getToken: vi.fn(async () => token) };
}

const mockVerifyToken = vi.fn();
vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

const mockNeonQuery = vi.fn();
const mockNeonExecute = vi.fn();
const TEST_DEVELOPER_JWT_SECRET = 'test-developer-jwt-secret-at-least-32-bytes';
process.env['JWT_SECRET'] = TEST_DEVELOPER_JWT_SECRET;

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: (...args: unknown[]) => mockNeonExecute(...args),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

vi.mock('@agiworkforce/data-layer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/data-layer')>();
  const rlsCapableAdapter: unknown = {
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: (...args: unknown[]) => mockNeonExecute(...args),
    transaction: (fn: (db: unknown) => unknown) => fn(rlsCapableAdapter),
    withUser: () => rlsCapableAdapter,
    withOrg: () => rlsCapableAdapter,
    dispose: vi.fn(),
  };
  return { ...actual, createDatabaseClient: vi.fn(() => rlsCapableAdapter) };
});

type FakeRow = Record<string, unknown>;

/**
 * A fixture that stubs the whole query implementation must answer the bridge
 * and lifecycle reads too, or its subject never authenticates.
 */
function identityResolutionRows(sql: string, params: unknown[]): FakeRow[] | null {
  const s = sql.toLowerCase();
  if (s.includes('left join public.identities')) {
    const fallback = params[2] as string | null;
    return [{ identity_id: null, account_id: fallback ?? null, erased: false }];
  }
  if (s.includes('account_status')) {
    return [{ account_status: null, deletion_scheduled_for: null, erased: false }];
  }
  return null;
}

function makeFakeDb() {
  const store = new Map<string, FakeRow>();
  const revokedJtis = new Set<string>();
  const identities = new Map<string, { identityId: string | null; accountId: string }>();
  const accountStatuses = new Map<string, string>();
  const erasedAccounts = new Set<string>();
  const deletionScheduled = new Map<string, string>();
  const linkAttempts: string[] = [];
  let counter = 0;

  async function query(sql: string, params: unknown[] = []): Promise<FakeRow[]> {
    const s = sql.toLowerCase();

    if (s.includes('insert into public.identities')) {
      const [provider, subject, accountId] = params as [string, string, string];
      linkAttempts.push(`${provider}:${subject}:${accountId}`);
      return [];
    }

    if (s.includes('left join public.identities')) {
      const [provider, subject, fallback] = params as [string, string, string | null];
      const mapped = identities.get(`${provider}:${subject}`);
      const accountId = mapped?.accountId ?? fallback ?? null;
      return [
        {
          identity_id: mapped?.identityId ?? null,
          account_id: accountId,
          erased: accountId !== null && erasedAccounts.has(accountId),
        },
      ];
    }

    if (s.includes('account_status')) {
      const userId = params[0] as string;
      return [
        {
          account_status: accountStatuses.get(userId) ?? null,
          deletion_scheduled_for: deletionScheduled.get(userId) ?? null,
          erased: erasedAccounts.has(userId),
        },
      ];
    }

    if (s.includes('from revoked_jwts')) {
      const jti = params[0] as string;
      return revokedJtis.has(jti) ? [{ jti }] : [];
    }

    if (s.includes('count(*)') && s.includes('api_keys')) {
      const userId = params[0] as string;
      const count = [...store.values()].filter(
        (r) => r['user_id'] === userId && r['revoked_at'] == null,
      ).length;
      return [{ count: String(count) }];
    }

    if (s.startsWith('insert into api_keys')) {
      const [userId, name, keyHash, keyPrefix, scopes] = params as [
        string,
        string,
        string,
        string,
        string[],
      ];
      counter += 1;
      const row: FakeRow = {
        id: `key-${counter}`,
        user_id: userId,
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes,
        last_used_at: null,
        expires_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      };
      store.set(row['id'] as string, row);
      return [row];
    }

    if (s.includes('key_prefix = $1')) {
      const keyPrefix = params[0] as string;
      return [...store.values()].filter(
        (r) => r['key_prefix'] === keyPrefix && r['revoked_at'] == null,
      );
    }

    if (s.includes('from api_keys') || s.includes('from public.api_keys')) {
      const id = params[0] as string;
      const row = store.get(id);
      return row ? [row] : [];
    }

    return [];
  }

  async function execute(sql: string, params: unknown[] = []): Promise<number> {
    const s = sql.toLowerCase();

    if (s.includes('set revoked_at')) {
      const [id, userId] = params as [string, string];
      const row = store.get(id);
      if (row && row['user_id'] === userId && row['revoked_at'] == null) {
        row['revoked_at'] = new Date().toISOString();
        return 1;
      }
      return 0;
    }

    if (s.includes('set last_used_at')) {
      const [lastUsedAt, id] = params as [string, string];
      const row = store.get(id);
      if (row) row['last_used_at'] = lastUsedAt;
      return 1;
    }

    return 0;
  }

  mockNeonQuery.mockImplementation(query);
  mockNeonExecute.mockImplementation(execute);
  return {
    store,
    revokedJtis,
    identities,
    accountStatuses,
    erasedAccounts,
    deletionScheduled,
    linkAttempts,
  };
}

import { POST as createApiKeyRoute } from '@/app/api/settings/api-keys/route';
import { DELETE as revokeApiKeyRoute } from '@/app/api/settings/api-keys/[keyId]/route';
import { assertAccountActive, getClerkAuthUser } from '@/lib/api-auth';
import {
  createUpstashKeyValueStore,
  type KeyValueStore,
  type UpstashRedisLike,
} from '@agiworkforce/key-value';
import { getKeyValueStore } from '@/lib/server/key-value';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { clearIpAllowListCacheForTests } from '@/lib/services/organization-ip-allow-list-cache';
import {
  getTenantScope,
  newSpanId,
  newTraceId,
  runWithTraceContext,
} from '@/lib/observability/trace-context';

function makeCreateRequest(
  name = 'round-trip key',
  scopes = ['models:read', 'inference:write'],
): NextRequest {
  return new NextRequest('http://localhost/api/settings/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, scopes }),
  });
}

function makeRevokeRequest(keyId: string): {
  req: NextRequest;
  ctx: { params: Promise<{ keyId: string }> };
} {
  return {
    req: new NextRequest(`http://localhost/api/settings/api-keys/${keyId}`, { method: 'DELETE' }),
    ctx: { params: Promise.resolve({ keyId }) },
  };
}

function makeBearerRequest(token: string): NextRequest {
  return new NextRequest('http://localhost/api/some-route', {
    headers: { authorization: `Bearer ${token}` },
  });
}

function queriedApiKeysTable(): boolean {
  return mockNeonQuery.mock.calls.some(([sql]) => String(sql).toLowerCase().includes('api_keys'));
}

describe('getClerkAuthUser · API-key issue/verify unification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
  });

  it('issue → authenticate round trip: a key from the real POST route authenticates via the real Bearer path', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValue(authSession('user-round-trip'));
    const createRes = await createApiKeyRoute(makeCreateRequest());
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      api_key: { id: string; scopes: string[] };
      full_key: string;
    };
    expect(created.full_key).toMatch(/^sk_live_[0-9a-f]{16}_[0-9a-f]{48}$/);
    expect(created.api_key.scopes).toEqual(['models:read', 'inference:write']);

    mockAuth.mockResolvedValue(authSession(null));
    const authResult = await getClerkAuthUser(makeBearerRequest(created.full_key), {
      apiKeyScope: 'inference:write',
    });

    expect(authResult).toEqual({ userId: 'user-round-trip' });
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('enforces the selected scope and denies API keys on routes without an API-key contract', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValue(authSession('scoped-user'));
    const createRes = await createApiKeyRoute(makeCreateRequest('models only', ['models:read']));
    const created = (await createRes.json()) as { full_key: string };

    mockAuth.mockResolvedValue(authSession(null));

    await expect(
      getClerkAuthUser(makeBearerRequest(created.full_key), {
        apiKeyScope: 'models:read',
      }),
    ).resolves.toEqual({ userId: 'scoped-user' });

    await expect(
      getClerkAuthUser(makeBearerRequest(created.full_key), {
        apiKeyScope: 'inference:write',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(getClerkAuthUser(makeBearerRequest(created.full_key))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('keeps legacy empty-scope keys compatible only with declared public API scopes', async () => {
    const fakeDb = makeFakeDb();
    const { ApiKeyService } = await import('@/lib/services/api-key-service');
    const { getNeonDb } = await import('@/lib/server/neon-db');
    const { apiKey, rawKey } = await ApiKeyService.createApiKey(
      getNeonDb(),
      'legacy-user',
      'legacy',
      ['models:read', 'inference:write', 'usage:read'],
    );
    const storedRow = fakeDb.store.get(apiKey.id);
    if (!storedRow) throw new Error('Expected the legacy fixture row to exist');
    storedRow['scopes'] = [];

    await expect(
      getClerkAuthUser(makeBearerRequest(rawKey), { apiKeyScope: 'usage:read' }),
    ).resolves.toEqual({ userId: 'legacy-user' });
    await expect(getClerkAuthUser(makeBearerRequest(rawKey))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('rejects new key issuance without at least one scope', async () => {
    makeFakeDb();
    mockAuth.mockResolvedValue(authSession('scope-required-user'));

    const response = await createApiKeyRoute(makeCreateRequest('scope-less', []));

    expect(response.status).toBe(400);
  });

  it('rejects a key after it is revoked through the real DELETE route', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValue(authSession('user-revoke-me'));
    const createRes = await createApiKeyRoute(makeCreateRequest());
    const created = (await createRes.json()) as { api_key: { id: string }; full_key: string };

    mockAuth.mockResolvedValue(authSession('user-revoke-me'));
    const { req, ctx } = makeRevokeRequest(created.api_key.id);
    const revokeRes = await revokeApiKeyRoute(req, ctx);
    expect(revokeRes.status).toBe(200);

    mockAuth.mockResolvedValue(authSession(null));
    await expect(
      getClerkAuthUser(makeBearerRequest(created.full_key), {
        apiKeyScope: 'inference:write',
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a malformed sk_live_-shaped key without a matching DB row', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValueOnce(authSession(null));
    await expect(
      getClerkAuthUser(makeBearerRequest('sk_live_0000000000000000_not_a_real_secret_at_all'), {
        apiKeyScope: 'inference:write',
      }),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(mockNeonQuery).toHaveBeenCalled();
    expect(mockNeonExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO security_audit_logs'),
      expect.arrayContaining(['auth_failed', JSON.stringify({ reason: 'invalid_api_key' })]),
    );
  });

  it('rejects a too-short sk_live_ token before any DB lookup (parse-time rejection)', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValueOnce(authSession(null));
    await expect(
      getClerkAuthUser(makeBearerRequest('sk_live_tooshort'), {
        apiKeyScope: 'inference:write',
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  describe('WEB-AUTH-BEARER-COOKIE-PRINCIPAL-DIVERGENCE-01: bearer precedence over cookie', () => {
    it('a bearer that fails verification is rejected even with a valid session cookie riding along', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));
      mockVerifyToken.mockRejectedValueOnce(new Error('invalid token'));

      await expect(
        getClerkAuthUser(makeBearerRequest('irrelevant-because-session-wins')),
      ).rejects.toMatchObject({ statusCode: 401 });

      expect(mockAuth).not.toHaveBeenCalled();
    });

    it('an Authorization header of exactly "Bearer " (empty token) normalizes away and is treated as no bearer at all', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));

      const req = new NextRequest('http://localhost/api/some-route', {
        headers: { authorization: 'Bearer ' },
      });
      expect(req.headers.get('authorization')).toBe('Bearer');
      expect(req.headers.get('authorization')?.startsWith('Bearer ')).toBe(false);

      const result = await getClerkAuthUser(req);
      expect(result).toEqual({ userId: 'clerk-session-user' });
    });

    it('a verified bearer resolves a DIFFERENT user than the cookie would have, bearer wins, cookie principal is never returned', async () => {
      makeFakeDb();
      const { ApiKeyService } = await import('@/lib/services/api-key-service');
      const { getNeonDb } = await import('@/lib/server/neon-db');
      const { rawKey } = await ApiKeyService.createApiKey(getNeonDb(), 'user-a-bearer', 'k', [
        'inference:write',
      ]);

      mockAuth.mockResolvedValueOnce(authSession('user-b-cookie'));

      const result = await getClerkAuthUser(makeBearerRequest(rawKey), {
        apiKeyScope: 'inference:write',
      });

      expect(result).toEqual({ userId: 'user-a-bearer' });
      expect(mockAuth).not.toHaveBeenCalled();
    });

    it('a verified bearer resolves the same user the cookie session has, auth() is still never consulted', async () => {
      makeFakeDb();
      const { ApiKeyService } = await import('@/lib/services/api-key-service');
      const { getNeonDb } = await import('@/lib/server/neon-db');
      const { rawKey } = await ApiKeyService.createApiKey(getNeonDb(), 'same-user', 'k', [
        'inference:write',
      ]);

      mockAuth.mockResolvedValueOnce(authSession('same-user'));

      const result = await getClerkAuthUser(makeBearerRequest(rawKey), {
        apiKeyScope: 'inference:write',
      });

      expect(result).toEqual({ userId: 'same-user' });
      expect(mockAuth).not.toHaveBeenCalled();
    });
  });

  describe('unchanged: cookie-only and bearer-only (no cookie) paths', () => {
    it('cookie-only request (no Authorization header at all) still resolves via Path 1', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));

      const req = new NextRequest('http://localhost/api/some-route');
      const result = await getClerkAuthUser(req);

      expect(result).toEqual({ userId: 'clerk-session-user' });
      expect(queriedApiKeysTable()).toBe(false);
    });

    it('Path 2b (Clerk Bearer JWT) still authenticates via verifyToken when there is no cookie session', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce(authSession(null));
      mockVerifyToken.mockResolvedValueOnce({ sub: 'clerk-jwt-user', email: 'user@example.com' });
      process.env['CLERK_SECRET_KEY'] = 'test-clerk-secret-key';

      const result = await getClerkAuthUser(
        makeBearerRequest('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjbGVyay1qd3QtdXNlciJ9.sig'),
      );

      expect(result).toEqual({ userId: 'clerk-jwt-user', email: 'user@example.com' });
      expect(queriedApiKeysTable()).toBe(false);
    });

    it.each([
      ['the web origin', { azp: 'https://agiworkforce.com' }, 'web'],
      ['the extension origin', { azp: 'chrome-extension://abcdefghijklmnop' }, 'chrome'],
      ['the mobile template claim', { surface: 'mobile' }, 'mobile'],
    ])('binds a Clerk bearer token to the surface %s proves', async (_label, claims, bound) => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce(authSession(null));
      mockVerifyToken.mockResolvedValueOnce({ sub: 'clerk-jwt-user', ...claims });
      process.env['CLERK_SECRET_KEY'] = 'test-clerk-secret-key';

      const result = await getClerkAuthUser(
        makeBearerRequest('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjbGVyay1qd3QtdXNlciJ9.sig'),
      );

      expect(result).toEqual({ userId: 'clerk-jwt-user', boundSurface: bound });
    });

    it('authenticates a first-party developer device token and enforces its subject', async () => {
      makeFakeDb();
      const token = jwt.sign(
        {
          userId: 'device-user',
          sub: 'device-user',
          email: 'device@example.com',
          surface: 'developer',
        },
        TEST_DEVELOPER_JWT_SECRET,
        {
          expiresIn: 3600,
          issuer: 'agiworkforce-api-gateway',
          audience: 'agiworkforce',
          jwtid: 'device-jti-current',
        },
      );

      await expect(getClerkAuthUser(makeBearerRequest(token))).resolves.toEqual({
        userId: 'device-user',
        email: 'device@example.com',
        surfaceClass: 'developer',
      });
      expect(mockAuth).not.toHaveBeenCalled();
    });

    it('rejects a cryptographically valid developer token after revocation', async () => {
      const db = makeFakeDb();
      db.revokedJtis.add('device-jti-revoked');
      const token = jwt.sign(
        {
          userId: 'device-user',
          sub: 'device-user',
          surface: 'developer',
        },
        TEST_DEVELOPER_JWT_SECRET,
        {
          expiresIn: 3600,
          issuer: 'agiworkforce-api-gateway',
          audience: 'agiworkforce',
          jwtid: 'device-jti-revoked',
        },
      );

      await expect(getClerkAuthUser(makeBearerRequest(token))).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(mockNeonExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO security_audit_logs'),
        expect.arrayContaining([
          'device-user',
          'auth_failed',
          JSON.stringify({ reason: 'revoked_developer_token' }),
        ]),
      );
    });

    it('rejects a garbage Bearer token when there is no cookie session either', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce(authSession(null));
      mockVerifyToken.mockRejectedValueOnce(new Error('invalid token'));

      await expect(
        getClerkAuthUser(makeBearerRequest('garbage-not-a-key-or-jwt')),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('rejects when there is no Authorization header and no Clerk session at all', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce(authSession(null));

      const req = new NextRequest('http://localhost/api/some-route');
      await expect(getClerkAuthUser(req)).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('tenant scope propagation onto the active trace context', () => {
    it('stamps the resolved user id onto the ambient trace context for a cookie session', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));

      const context = { traceId: newTraceId(), spanId: newSpanId(), sampled: true };
      await runWithTraceContext(context, async () => {
        await getClerkAuthUser(new NextRequest('http://localhost/api/some-route'));
        expect(getTenantScope().userId).toBe('clerk-session-user');
      });
    });

    it('stamps the resolved user id for a verified API-key bearer', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValue(authSession('scoped-user'));
      const createRes = await createApiKeyRoute(makeCreateRequest('scoped', ['models:read']));
      const created = (await createRes.json()) as { full_key: string };

      mockAuth.mockResolvedValue(authSession(null));

      const context = { traceId: newTraceId(), spanId: newSpanId(), sampled: true };
      await runWithTraceContext(context, async () => {
        await getClerkAuthUser(makeBearerRequest(created.full_key), {
          apiKeyScope: 'models:read',
        });
        expect(getTenantScope().userId).toBe('scoped-user');
      });
    });

    it('leaves no tenant scope stamped when authentication is rejected', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce(authSession(null));

      const context = { traceId: newTraceId(), spanId: newSpanId(), sampled: true };
      await runWithTraceContext(context, async () => {
        await expect(
          getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
        ).rejects.toMatchObject({ statusCode: 401 });
        expect(getTenantScope().userId).toBeUndefined();
      });
    });
  });

  describe('organization mfa enforcement at the auth boundary', () => {
    const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

    function bindOrgPolicy(organizationId: string | null, requireMfa: boolean) {
      mockNeonQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
        const identityRows = identityResolutionRows(sql, params);
        if (identityRows) return identityRows;
        const s = sql.toLowerCase();
        if (s.includes(') governing')) {
          return organizationId ? [{ organization_id: organizationId }] : [];
        }
        if (s.includes('from public.user_settings')) {
          return organizationId ? [{ organization_id: organizationId }] : [];
        }
        if (s.includes('from public.organization_admin_policies')) {
          return organizationId
            ? [
                {
                  organization_id: organizationId,
                  default_privacy_mode: 'byok',
                  allowed_privacy_modes: ['local', 'byok'],
                  allow_managed_compute: false,
                  require_local_to_byok_preview: true,
                  chat_sync_surfaces: ['web', 'desktop', 'mobile'],
                  allow_cli_cloud_sync: false,
                  allow_vscode_cloud_sync: false,
                  allow_chrome_cloud_sync: false,
                  audit_export_enabled: true,
                  retention_days: 365,
                  retention_enforced: false,
                  external_sharing_enabled: true,
                  metadata: { requireMfa },
                  updated_at: '2026-08-22T00:00:00.000Z',
                },
              ]
            : [];
        }
        return [];
      });
    }

    it('lets a cookie session through when its organization does not require mfa', async () => {
      bindOrgPolicy(ORGANIZATION_ID, false);
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));

      await expect(
        getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
      ).resolves.toEqual({ userId: 'clerk-session-user' });
      expect(mockClerkGetUser).not.toHaveBeenCalled();
    });

    it('blocks a cookie session with a plain mfa_required error when the organization requires it and the user is unenrolled', async () => {
      bindOrgPolicy(ORGANIZATION_ID, true);
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));
      mockClerkGetUser.mockResolvedValueOnce({ twoFactorEnabled: false });

      await expect(
        getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
      ).rejects.toSatisfy((error: unknown) => isMfaRequiredError(error));
    });

    it('lets an enrolled caller through when the organization requires mfa', async () => {
      bindOrgPolicy(ORGANIZATION_ID, true);
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));
      mockClerkGetUser.mockResolvedValueOnce({ twoFactorEnabled: true });

      await expect(
        getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
      ).resolves.toEqual({ userId: 'clerk-session-user' });
    });
  });

  describe('organization ip allow list enforcement at the auth boundary', () => {
    const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

    function bindOrgIpPolicy(organizationId: string | null, ipAllowList: string[]) {
      mockNeonQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
        const identityRows = identityResolutionRows(sql, params);
        if (identityRows) return identityRows;
        const s = sql.toLowerCase();
        if (s.includes(') governing')) {
          return organizationId ? [{ organization_id: organizationId }] : [];
        }
        if (s.includes('from public.user_settings')) {
          return organizationId ? [{ organization_id: organizationId }] : [];
        }
        if (s.includes('from public.organization_admin_policies')) {
          return organizationId
            ? [
                {
                  organization_id: organizationId,
                  default_privacy_mode: 'byok',
                  allowed_privacy_modes: ['local', 'byok'],
                  allow_managed_compute: false,
                  require_local_to_byok_preview: true,
                  chat_sync_surfaces: ['web', 'desktop', 'mobile'],
                  allow_cli_cloud_sync: false,
                  allow_vscode_cloud_sync: false,
                  allow_chrome_cloud_sync: false,
                  audit_export_enabled: true,
                  retention_days: 365,
                  retention_enforced: false,
                  external_sharing_enabled: true,
                  metadata: { ipAllowList },
                  updated_at: '2026-08-22T00:00:00.000Z',
                },
              ]
            : [];
        }
        return [];
      });
    }

    function requestFromIp(forwardedFor: string): NextRequest {
      return new NextRequest('http://localhost/api/some-route', {
        headers: { 'x-forwarded-for': forwardedFor },
      });
    }

    it('lets a cookie session through when the organization has no allow list configured', async () => {
      bindOrgIpPolicy(ORGANIZATION_ID, []);
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));

      await expect(getClerkAuthUser(requestFromIp('198.51.100.9'))).resolves.toEqual({
        userId: 'clerk-session-user',
      });
    });

    it('lets a cookie session through when the caller ip is inside the allowed subnet', async () => {
      bindOrgIpPolicy(ORGANIZATION_ID, ['203.0.113.0/24']);
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));

      await expect(getClerkAuthUser(requestFromIp('203.0.113.5'))).resolves.toEqual({
        userId: 'clerk-session-user',
      });
    });

    it('blocks a cookie session with a plain ip_not_allowed error when the caller ip is outside every allowed subnet', async () => {
      bindOrgIpPolicy(ORGANIZATION_ID, ['203.0.113.0/24']);
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));

      await expect(getClerkAuthUser(requestFromIp('198.51.100.9'))).rejects.toSatisfy(
        (error: unknown) => isIpNotAllowedError(error),
      );
    });

    it('is not fooled by a spoofed leading x-forwarded-for entry', async () => {
      bindOrgIpPolicy(ORGANIZATION_ID, ['203.0.113.0/24']);
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));

      await expect(getClerkAuthUser(requestFromIp('203.0.113.5, 198.51.100.9'))).rejects.toSatisfy(
        (error: unknown) => isIpNotAllowedError(error),
      );
    });

    it('stays enforced for an owner even when the caller opts into the mfa gate exemption', async () => {
      bindOrgIpPolicy(ORGANIZATION_ID, ['203.0.113.0/24']);
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));

      await expect(
        getClerkAuthUser(requestFromIp('198.51.100.9'), { mfaGateExemptForOwner: true }),
      ).rejects.toSatisfy((error: unknown) => isIpNotAllowedError(error));
    });
  });

  describe('mfa gate owner exemption', () => {
    const ORGANIZATION_ID = '33333333-3333-4333-8333-333333333333';

    function bindOrgWithMember(
      organizationId: string,
      requireMfa: boolean,
      role: 'owner' | 'admin' | 'member' | 'viewer',
    ) {
      mockNeonQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
        const identityRows = identityResolutionRows(sql, params);
        if (identityRows) return identityRows;
        const s = sql.toLowerCase();
        if (s.includes(') governing')) {
          return [{ organization_id: organizationId }];
        }
        if (s.includes('from public.user_settings')) {
          return [{ organization_id: organizationId }];
        }
        if (s.includes('from public.organization_members')) {
          return [{ organization_id: organizationId, role }];
        }
        if (s.includes('from public.organization_admin_policies')) {
          return [
            {
              organization_id: organizationId,
              default_privacy_mode: 'byok',
              allowed_privacy_modes: ['local', 'byok'],
              allow_managed_compute: false,
              require_local_to_byok_preview: true,
              chat_sync_surfaces: ['web', 'desktop', 'mobile'],
              allow_cli_cloud_sync: false,
              allow_vscode_cloud_sync: false,
              allow_chrome_cloud_sync: false,
              audit_export_enabled: true,
              retention_days: 365,
              retention_enforced: false,
              external_sharing_enabled: true,
              metadata: { requireMfa },
              updated_at: '2026-08-22T00:00:00.000Z',
            },
          ];
        }
        return [];
      });
    }

    it('lets an unenrolled organization owner through when the caller opts into the exemption', async () => {
      bindOrgWithMember(ORGANIZATION_ID, true, 'owner');
      mockAuth.mockResolvedValueOnce(authSession('owner-user'));
      mockClerkGetUser.mockResolvedValueOnce({ twoFactorEnabled: false });

      await expect(
        getClerkAuthUser(new NextRequest('http://localhost/api/settings/organization/policy'), {
          mfaGateExemptForOwner: true,
        }),
      ).resolves.toEqual({ userId: 'owner-user' });
    });

    it('still blocks an unenrolled owner when the caller did not opt into the exemption', async () => {
      bindOrgWithMember(ORGANIZATION_ID, true, 'owner');
      mockAuth.mockResolvedValueOnce(authSession('owner-user'));
      mockClerkGetUser.mockResolvedValueOnce({ twoFactorEnabled: false });

      await expect(
        getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
      ).rejects.toSatisfy((error: unknown) => isMfaRequiredError(error));
    });

    it('does not exempt an unenrolled admin, only an owner', async () => {
      bindOrgWithMember(ORGANIZATION_ID, true, 'admin');
      mockAuth.mockResolvedValueOnce(authSession('admin-user'));
      mockClerkGetUser.mockResolvedValueOnce({ twoFactorEnabled: false });

      await expect(
        getClerkAuthUser(new NextRequest('http://localhost/api/settings/organization/policy'), {
          mfaGateExemptForOwner: true,
        }),
      ).rejects.toSatisfy((error: unknown) => isMfaRequiredError(error));
    });

    it('does not exempt an unenrolled member', async () => {
      bindOrgWithMember(ORGANIZATION_ID, true, 'member');
      mockAuth.mockResolvedValueOnce(authSession('member-user'));
      mockClerkGetUser.mockResolvedValueOnce({ twoFactorEnabled: false });

      await expect(
        getClerkAuthUser(new NextRequest('http://localhost/api/settings/organization/policy'), {
          mfaGateExemptForOwner: true,
        }),
      ).rejects.toSatisfy((error: unknown) => isMfaRequiredError(error));
    });
  });
});

describe('getClerkAuthUser · the identity bridge resolves an internal account id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
  });

  function cookieRequest(): NextRequest {
    return new NextRequest('http://localhost/api/some-route');
  }

  function auditedReasons(): string[] {
    return mockNeonExecute.mock.calls
      .filter(([sql]) => String(sql).includes('INSERT INTO security_audit_logs'))
      .flatMap(([, params]) => (Array.isArray(params) ? params : []))
      .filter((value): value is string => typeof value === 'string' && value.startsWith('{'))
      .map((value) => String(value));
  }

  it('returns the account id the identities row names, not the provider subject', async () => {
    const db = makeFakeDb();
    db.identities.set('clerk:provider-subject-9', {
      identityId: 'identity-9',
      accountId: 'account-7',
    });
    mockAuth.mockResolvedValueOnce(authSession('provider-subject-9'));

    await expect(getClerkAuthUser(cookieRequest())).resolves.toEqual({
      userId: 'account-7',
      identityId: 'identity-9',
    });
  });

  it('links an account that predates the mapping rather than failing its request', async () => {
    const db = makeFakeDb();
    mockAuth.mockResolvedValueOnce(authSession('unmapped-user'));

    await expect(getClerkAuthUser(cookieRequest())).resolves.toEqual({ userId: 'unmapped-user' });
    expect(db.linkAttempts).toEqual(['clerk:unmapped-user:unmapped-user']);
  });

  it('refuses a stale provider callback for an account that has already been erased', async () => {
    const db = makeFakeDb();
    db.erasedAccounts.add('erased-user');
    mockAuth.mockResolvedValueOnce(authSession('erased-user'));

    await expect(getClerkAuthUser(cookieRequest())).rejects.toMatchObject({ statusCode: 401 });
    expect(auditedReasons()).toContainEqual(JSON.stringify({ reason: 'erased_account' }));
    expect(db.linkAttempts).toEqual([]);
  });

  it('keeps a locked account out with the recovery a lockout actually has', async () => {
    const db = makeFakeDb();
    db.accountStatuses.set('locked-user', 'locked');
    mockAuth.mockResolvedValueOnce(authSession('locked-user'));

    await expect(getClerkAuthUser(cookieRequest())).rejects.toMatchObject({
      statusCode: 403,
      message: 'Your account is locked. Reset your password at /auth/reset-password to unlock it.',
    });
  });

  it('sends a suspended account somewhere else than a locked one', async () => {
    const db = makeFakeDb();
    db.accountStatuses.set('suspended-user', 'suspended');
    mockAuth.mockResolvedValueOnce(authSession('suspended-user'));

    await expect(getClerkAuthUser(cookieRequest())).rejects.toMatchObject({
      statusCode: 403,
      message: 'Your account has been suspended. Please contact support.',
    });
  });

  it('lets a scheduled deletion sign in, because cancelling it is done signed in', async () => {
    const db = makeFakeDb();
    db.accountStatuses.set('leaving-user', 'deletion_scheduled');
    mockAuth.mockResolvedValueOnce(authSession('leaving-user'));

    await expect(getClerkAuthUser(cookieRequest())).resolves.toEqual({ userId: 'leaving-user' });
  });

  it('derives a scheduled deletion from the date 0071 records, and still lets it sign in', async () => {
    const db = makeFakeDb();
    db.accountStatuses.set('leaving-by-date', 'active');
    db.deletionScheduled.set('leaving-by-date', '2026-10-01T00:00:00.000Z');
    mockAuth.mockResolvedValueOnce(authSession('leaving-by-date'));

    await expect(getClerkAuthUser(cookieRequest())).resolves.toEqual({
      userId: 'leaving-by-date',
    });
  });

  it('applies the same erasure gate to a device token, which never touches the bridge', async () => {
    const db = makeFakeDb();
    db.erasedAccounts.add('device-user');
    const token = jwt.sign(
      { userId: 'device-user', sub: 'device-user', surface: 'developer' },
      TEST_DEVELOPER_JWT_SECRET,
      {
        expiresIn: 3600,
        issuer: 'agiworkforce-api-gateway',
        audience: 'agiworkforce',
        jwtid: 'device-jti-erased',
      },
    );

    await expect(getClerkAuthUser(makeBearerRequest(token))).rejects.toMatchObject({
      statusCode: 403,
      message: 'This account has been deleted.',
    });
  });

  it('applies the same erasure gate to an API key, which carries the account id already', async () => {
    const db = makeFakeDb();
    mockAuth.mockResolvedValue(authSession('erased-key-owner'));
    const createRes = await createApiKeyRoute(makeCreateRequest('still valid', ['models:read']));
    const created = (await createRes.json()) as { full_key: string };

    db.erasedAccounts.add('erased-key-owner');
    mockAuth.mockResolvedValue(authSession(null));

    await expect(
      getClerkAuthUser(makeBearerRequest(created.full_key), { apiKeyScope: 'models:read' }),
    ).rejects.toMatchObject({ statusCode: 403, message: 'This account has been deleted.' });
  });

  it('turns away an account whose erasure was ordered but whose row is still there', async () => {
    const db = makeFakeDb();
    db.accountStatuses.set('gone-user', 'deleted');
    mockAuth.mockResolvedValueOnce(authSession('gone-user'));

    await expect(getClerkAuthUser(cookieRequest())).rejects.toMatchObject({
      statusCode: 403,
      message: 'This account has been deleted.',
    });
  });
});

describe('assertAccountActive, warm Redis cache', () => {
  function asKeyValueStore(client: unknown): KeyValueStore {
    return createUpstashKeyValueStore(client as UpstashRedisLike);
  }

  function fakeCacheRedis() {
    const store = new Map<string, unknown>();
    return {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
        return 'OK';
      }),
      del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The lockdown gate resolves the workspace on the same call, so the count that
  // proves the status cache is warm is the lifecycle read, not every read.
  function lifecycleReads(): number {
    return mockNeonQuery.mock.calls.filter(([sql]) => String(sql).includes('account_status'))
      .length;
  }

  it('reads Postgres once across two consecutive calls for the same user', async () => {
    mockNeonQuery.mockResolvedValue([{ account_status: null }]);
    vi.mocked(getKeyValueStore).mockReturnValue(asKeyValueStore(fakeCacheRedis()));

    await expect(assertAccountActive('user-warm-1')).resolves.toBeUndefined();
    await expect(assertAccountActive('user-warm-1')).resolves.toBeUndefined();

    expect(lifecycleReads()).toBe(1);
  });

  it('rejects from the cached suspended status without a second Postgres read', async () => {
    mockNeonQuery.mockResolvedValue([{ account_status: 'suspended' }]);
    vi.mocked(getKeyValueStore).mockReturnValue(asKeyValueStore(fakeCacheRedis()));

    await expect(assertAccountActive('user-warm-2')).rejects.toMatchObject({ statusCode: 403 });
    await expect(assertAccountActive('user-warm-2')).rejects.toMatchObject({ statusCode: 403 });

    expect(lifecycleReads()).toBe(1);
  });
});

describe('tenant lockdown at the auth boundary', () => {
  const LOCKED_ORGANIZATION = '33333333-3333-4333-8333-333333333333';

  // Matching the message too, or a 403 from some other gate would pass for it.
  const LOCKED_OUT = { statusCode: 403, message: expect.stringMatching(/locked down/) };

  /**
   * Wraps whatever the fixture already answers so a key issued through the real
   * route still verifies, and adds the two reads the lockdown gate makes: the
   * caller's workspace and that workspace's override.
   */
  function bindWorkspace(organizationId: string | null, locked: boolean) {
    const inner = mockNeonQuery.getMockImplementation();
    mockNeonQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const s = String(sql).toLowerCase();
      if (s.includes('from public.user_settings')) {
        return organizationId ? [{ organization_id: organizationId }] : [];
      }
      if (s.includes('from public.feature_flags')) {
        return locked && organizationId
          ? [
              {
                flag_name: 'tenant.lockdown',
                user_id: null,
                organization_id: organizationId,
                variant: 'off',
                enabled: false,
                expires_at: null,
              },
            ]
          : [];
      }
      return inner ? ((await inner(sql, params)) as unknown[]) : [];
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
    vi.mocked(getKeyValueStore).mockReturnValue(null as unknown as KeyValueStore);
    process.env['CLERK_SECRET_KEY'] = 'test-clerk-secret-key';
  });

  it('refuses a cookie session whose workspace is locked down', async () => {
    makeFakeDb();
    bindWorkspace(LOCKED_ORGANIZATION, true);
    mockAuth.mockResolvedValue(authSession('locked-cookie-user'));

    await expect(
      getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
    ).rejects.toMatchObject(LOCKED_OUT);
  });

  it('refuses a Clerk bearer token whose workspace is locked down', async () => {
    makeFakeDb();
    bindWorkspace(LOCKED_ORGANIZATION, true);
    mockAuth.mockResolvedValue(authSession(null));
    mockVerifyToken.mockResolvedValue({ sub: 'locked-jwt-user' });

    await expect(
      getClerkAuthUser(
        makeBearerRequest('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJsb2NrZWQtand0LXVzZXIifQ.sig'),
      ),
    ).rejects.toMatchObject(LOCKED_OUT);
  });

  it('refuses a first-party developer device token whose workspace is locked down', async () => {
    makeFakeDb();
    bindWorkspace(LOCKED_ORGANIZATION, true);
    mockAuth.mockResolvedValue(authSession(null));
    const token = jwt.sign(
      { userId: 'locked-device-user', sub: 'locked-device-user', surface: 'developer' },
      TEST_DEVELOPER_JWT_SECRET,
      {
        expiresIn: 3600,
        issuer: 'agiworkforce-api-gateway',
        audience: 'agiworkforce',
        jwtid: 'locked-device-jti',
      },
    );

    await expect(getClerkAuthUser(makeBearerRequest(token))).rejects.toMatchObject(LOCKED_OUT);
  });

  it('refuses an API key whose workspace is locked down, key and scope notwithstanding', async () => {
    makeFakeDb();
    mockAuth.mockResolvedValue(authSession('locked-key-user'));
    const createRes = await createApiKeyRoute(makeCreateRequest());
    const created = (await createRes.json()) as { full_key: string };

    mockAuth.mockResolvedValue(authSession(null));
    bindWorkspace(LOCKED_ORGANIZATION, true);

    await expect(
      getClerkAuthUser(makeBearerRequest(created.full_key), { apiKeyScope: 'inference:write' }),
    ).rejects.toMatchObject(LOCKED_OUT);
  });

  it('says what happened, so a locked-out workspace is not left guessing', async () => {
    makeFakeDb();
    bindWorkspace(LOCKED_ORGANIZATION, true);
    mockAuth.mockResolvedValue(authSession('locked-cookie-user'));

    await expect(
      getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
    ).rejects.toMatchObject({ message: expect.stringMatching(/locked down|Contact support/) });
  });

  it('lets the same principal through once the lockdown is lifted', async () => {
    makeFakeDb();
    bindWorkspace(LOCKED_ORGANIZATION, false);
    mockAuth.mockResolvedValue(authSession('unlocked-cookie-user'));

    await expect(
      getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
    ).resolves.toEqual({ userId: 'unlocked-cookie-user' });
  });

  it('lets a personal workspace through, having no workspace to lock', async () => {
    makeFakeDb();
    bindWorkspace(null, true);
    mockAuth.mockResolvedValue(authSession('personal-user'));

    await expect(
      getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
    ).resolves.toEqual({ userId: 'personal-user' });
  });

  it('does not lock anyone out when the workspace lookup itself fails', async () => {
    // The switch's contract: it can only ever take something down deliberately.
    makeFakeDb();
    const inner = mockNeonQuery.getMockImplementation();
    mockNeonQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (String(sql).toLowerCase().includes('from public.user_settings')) {
        throw new Error('workspace lookup is down');
      }
      return inner ? ((await inner(sql, params)) as unknown[]) : [];
    });
    mockAuth.mockResolvedValue(authSession('degraded-user'));

    await expect(
      getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
    ).resolves.toEqual({ userId: 'degraded-user' });
  });
});

describe('getClerkAuthUser · a database without the identity bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
  });

  it('resolves the account it always did rather than failing every request', async () => {
    makeFakeDb();
    mockNeonQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('public.identities')) {
        throw Object.assign(new Error('relation "public.identities" does not exist'), {
          code: '42P01',
        });
      }
      return String(sql).includes('account_status')
        ? [{ account_status: null, deletion_scheduled_for: null, erased: false }]
        : [];
    });
    mockAuth.mockResolvedValueOnce(authSession('pre-bridge-user'));

    await expect(
      getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
    ).resolves.toEqual({ userId: 'pre-bridge-user' });
  });

  it('fails closed on a database error that is not a missing bridge', async () => {
    makeFakeDb();
    mockNeonQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('public.identities')) throw new Error('connection terminated');
      return String(sql).includes('account_status')
        ? [{ account_status: null, deletion_scheduled_for: null, erased: false }]
        : [];
    });
    mockAuth.mockResolvedValueOnce(authSession('unreachable-db-user'));

    await expect(
      getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
    ).rejects.toThrow();
  });
});
