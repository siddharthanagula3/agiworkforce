import { getCurrentCookieUserRlsDb } from '@/lib/server/rls-db';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { NextRequest } from 'next/server';

import { resetSessionStartCache, unreadableSessionStartCount } from '@/lib/auth/session-age';
type ScanModule0 = typeof import('@agiworkforce/data-layer');

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/server/session-sightings', () => ({
  noteSessionSighting: vi.fn(),
}));

vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal()),
  getKeyValueStore: vi.fn(() => null),
}));

const mockAuth = vi.fn();
const mockClerkGetUser = vi.fn();
const mockClerkGetSession = vi.fn();
const mockClerkRevokeSession = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  clerkClient: vi.fn(async () => ({
    users: { getUser: mockClerkGetUser },
    sessions: {
      getSession: (...args: unknown[]) => mockClerkGetSession(...args),
      revokeSession: (...args: unknown[]) => mockClerkRevokeSession(...args),
    },
  })),
}));

function authSession(
  userId: string | null,
  sessionId?: string,
): {
  userId: string | null;
  sessionId?: string;
  getToken: () => Promise<string>;
} {
  const token = userId ? jwt.sign({ sub: userId }, TEST_DEVELOPER_JWT_SECRET) : '';
  return {
    userId,
    ...(sessionId ? { sessionId } : {}),
    getToken: vi.fn(async () => token),
  };
}

const mockVerifyToken = vi.fn();
vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

const mockNeonQuery = vi.fn();
const mockNeonExecute = vi.fn();
const TEST_DEVELOPER_JWT_SECRET = 'test-developer-jwt-secret-at-least-32-bytes';
process.env['JWT_SECRET'] = TEST_DEVELOPER_JWT_SECRET;
process.env['CSRF_SECRET'] = 'api-auth-step-up-secret-at-least-32-bytes';

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => makeTransactionAdapter()),
}));

vi.mock('@agiworkforce/data-layer', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return { ...actual, createDatabaseClient: vi.fn(() => makeTransactionAdapter()) };
});

type FakeRow = Record<string, unknown>;
const PROJECT_ID = '11111111-2222-4333-8444-555555555555';
type FixtureAdapter = {
  query: (sql: string, params?: unknown[]) => Promise<FakeRow[]>;
  execute: (...args: unknown[]) => Promise<number>;
  transaction: (callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
  withUser: (token: string) => FixtureAdapter;
  withOrg: (organization: string | null) => FixtureAdapter;
  dispose: () => void;
};

// Handle-lifetime model only; this does not implement PostgreSQL transactions or RLS.
function makeTransactionAdapter() {
  let active = false;
  function adapter(user: string | null, org: string | null): FixtureAdapter {
    return {
      query: (sql: string, params?: unknown[]) => {
        if (active || /insert into api_keys|update public\.developer_projects/i.test(sql)) {
          throw new Error('Issuance query escaped its transaction');
        }
        return mockNeonQuery(sql, params);
      },
      execute: (...args: unknown[]) => {
        if (active) throw new Error('Outer execute during transaction');
        return mockNeonExecute(...args);
      },
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        if (active) throw new Error('Nested transaction');
        active = true;
        let open = true;
        const tx = {
          query: (...args: unknown[]) => {
            if (!open) throw new Error('Transaction handle escaped');
            return mockNeonQuery(...args);
          },
          execute: (...args: unknown[]) => {
            if (!open) throw new Error('Transaction handle escaped');
            return mockNeonExecute(...args);
          },
          transaction: () => {
            throw new Error('Nested transaction');
          },
          withUser: () => {
            throw new Error('Transaction scope escape');
          },
          withOrg: () => {
            throw new Error('Transaction scope escape');
          },
        };
        try {
          return await callback(tx);
        } finally {
          open = false;
          active = false;
        }
      },
      withUser: (token: string) => {
        if (active) throw new Error('Outer scope change during transaction');
        return adapter(token, org);
      },
      withOrg: (organization: string | null) => {
        if (active) throw new Error('Outer scope change during transaction');
        return adapter(user, organization);
      },
      dispose: vi.fn(),
    };
  }
  return adapter(null, null);
}

function normalizedLookupSql(sql: string): string {
  return sql
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function expectProjectAdmissionLookup() {
  const lookups = mockNeonQuery.mock.calls.filter(([sql]) =>
    String(sql).includes('key_prefix = $1'),
  );
  expect(lookups.length).toBeGreaterThan(0);
  for (const [sql, params] of lookups) {
    expect(normalizedLookupSql(String(sql))).toBe(
      'select id, user_id, name, key_hash, key_prefix, scopes, created_at, expires_at, last_used_at from api_keys where key_prefix = $1 and revoked_at is null and (expires_at is null or expires_at > now()) and (api_keys.project_id is null or exists (select 1 from public.developer_projects p where p.id = api_keys.project_id and p.user_id = api_keys.user_id and p.archived_at is null)) limit 2',
    );
    expect(params).toEqual([expect.stringMatching(/^[0-9a-f]{16}$/)]);
  }
}

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
  const projects = new Map<string, { user_id: string; archived_at: string | null }>();
  const lookup = { error: false };
  const revokedJtis = new Set<string>();
  const identities = new Map<string, { identityId: string | null; accountId: string }>();
  const accountStatuses = new Map<string, string>();
  const erasedAccounts = new Set<string>();
  const deletionScheduled = new Map<string, string>();
  const linkAttempts: string[] = [];
  let counter = 0;

  async function query(sql: string, params: unknown[] = []): Promise<FakeRow[]> {
    const s = sql.toLowerCase();

    if (s.includes('update public.developer_projects')) {
      expect(normalizedLookupSql(sql)).toBe(
        'update public.developer_projects set updated_at = now() where id = $1 and user_id = $2 and archived_at is null returning id',
      );
      const [projectId, userId] = params as [string, string];
      const project = projects.get(projectId);
      return project?.user_id === userId && project.archived_at === null ? [{ id: projectId }] : [];
    }

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
        expires_at: params[5] ?? null,
        project_id: params[6] ?? null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      };
      store.set(row['id'] as string, row);
      return [row];
    }

    if (s.includes('key_prefix = $1')) {
      if (lookup.error) throw new Error('project admission lookup unavailable');
      const keyPrefix = params[0] as string;
      const hasProjectGate = normalizedLookupSql(s).includes(
        'and (api_keys.project_id is null or exists (select 1 from public.developer_projects p where p.id = api_keys.project_id and p.user_id = api_keys.user_id and p.archived_at is null))',
      );
      return [...store.values()].filter((r) => {
        const project = projects.get(r['project_id'] as string);
        return (
          r['key_prefix'] === keyPrefix &&
          (!s.includes('revoked_at is null') || r['revoked_at'] == null) &&
          (!s.includes('(expires_at is null or expires_at > now())') ||
            r['expires_at'] == null ||
            Date.parse(String(r['expires_at'])) > Date.now()) &&
          (!hasProjectGate ||
            r['project_id'] == null ||
            (project?.user_id === r['user_id'] && project.archived_at === null))
        );
      });
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
    projects,
    lookup,
    revokedJtis,
    identities,
    accountStatuses,
    erasedAccounts,
    deletionScheduled,
    linkAttempts,
  };
}

import { POST as createApiKeyRoute } from '@/app/api/settings/api-keys/route';
import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant } from '@/lib/server/step-up/grant-token';
import { DELETE as revokeApiKeyRoute } from '@/app/api/settings/api-keys/[keyId]/route';
import {
  assertAccountActive,
  getClerkAuthUser,
  getOptionalAuthUser,
  getSuspendedAccountUser,
} from '@/lib/api-auth';
import { noteSessionSighting } from '@/lib/server/session-sightings';
import { logger } from '@/lib/logger';
import { SURFACE_TOKEN_HEADER } from '@agiworkforce/types';
import { isPasskeyRequiredError } from '@/lib/server/account-security/gate';
import {
  createUpstashKeyValueStore,
  type KeyValueStore,
  type UpstashRedisLike,
} from '@agiworkforce/key-value';
import { getKeyValueStore } from '@/lib/server/key-value';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { clearIpAllowListCacheForTests } from '@/lib/services/organization-ip-allow-list-cache';
import * as activeWorkspace from '@/lib/services/active-workspace-service';
import * as membershipService from '@/lib/services/org-sharing-service';
import * as lockdownGate from '@/lib/feature-flags/tenant-lockdown';
import * as accountSecurityGate from '@/lib/server/account-security/gate';
import * as mfaGate from '@/lib/mfa-policy-gate';
import * as ipGate from '@/lib/ip-allow-list-gate';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import {
  getTenantScope,
  newSpanId,
  newTraceId,
  runWithTraceContext,
} from '@/lib/observability/trace-context';

function makeCreateRequest(
  userId: string,
  name = 'round-trip key',
  scopes = ['models:read', 'inference:write'],
): NextRequest {
  const { token } = createStepUpGrant({
    userId,
    action: 'api_credential.reveal',
    resourceId: null,
    method: 'first_factor',
  });
  return new NextRequest('http://localhost/api/settings/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [STEP_UP_TOKEN_HEADER]: token },
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

  // This predicate-sensitive model is not PostgreSQL, RLS, or concurrent archive proof.
  it.each([
    'null',
    'live',
    'archived',
    'foreign',
    'missing',
    'revoked',
    'expired',
    'lookup-error',
  ] as const)('uses canonical project admission for a %s key', async (state) => {
    const fakeDb = makeFakeDb();
    const { ApiKeyService } = await import('@/lib/services/api-key-service');
    const { getNeonDb } = await import('@/lib/server/neon-db');
    fakeDb.projects.set(PROJECT_ID, { user_id: 'project-key-owner', archived_at: null });
    const { apiKey, rawKey } = await ApiKeyService.createApiKey(
      getNeonDb(),
      'project-key-owner',
      'project admission',
      ['models:read'],
      null,
      state === 'null' ? null : PROJECT_ID,
    );
    const admissions = mockNeonQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('update public.developer_projects'),
    );
    expect(admissions).toHaveLength(state === 'null' ? 0 : 1);
    if (state !== 'null') expect(admissions[0]?.[1]).toEqual([PROJECT_ID, 'project-key-owner']);
    if (state === 'missing') {
      fakeDb.projects.delete(PROJECT_ID);
    } else {
      fakeDb.projects.set(PROJECT_ID, {
        user_id: state === 'foreign' ? 'another-owner' : 'project-key-owner',
        archived_at: state === 'archived' ? new Date().toISOString() : null,
      });
    }
    const row = fakeDb.store.get(apiKey.id)!;
    if (state === 'revoked') row['revoked_at'] = new Date().toISOString();
    if (state === 'expired') row['expires_at'] = new Date(Date.now() - 60_000).toISOString();
    fakeDb.lookup.error = state === 'lookup-error';
    mockAuth.mockResolvedValue(authSession('cookie-must-not-rescue-key'));
    mockNeonQuery.mockClear();
    mockNeonExecute.mockClear();
    const verify = vi.spyOn(argon2, 'verify');
    try {
      if (state === 'null' || state === 'live') {
        await expect(
          getClerkAuthUser(makeBearerRequest(rawKey), { apiKeyScope: 'models:read' }),
        ).resolves.toEqual({ userId: 'project-key-owner', apiKeyId: apiKey.id });
        await expect(
          getClerkAuthUser(makeBearerRequest(rawKey), { apiKeyScope: 'inference:write' }),
        ).rejects.toMatchObject({ statusCode: 403 });
        await expect(getClerkAuthUser(makeBearerRequest(rawKey))).rejects.toMatchObject({
          statusCode: 403,
        });
        expect(verify).toHaveBeenCalled();
        expect(mockNeonExecute).toHaveBeenCalledWith(
          'UPDATE api_keys SET last_used_at = $1 WHERE id = $2',
          [expect.any(String), apiKey.id],
        );
      } else {
        await expect(
          getClerkAuthUser(makeBearerRequest(rawKey), { apiKeyScope: 'models:read' }),
        ).rejects.toMatchObject({ statusCode: 401 });
        expect(verify).not.toHaveBeenCalled();
        expect(
          mockNeonExecute.mock.calls.some(([sql]) => String(sql).includes('SET last_used_at')),
        ).toBe(false);
      }
      expectProjectAdmissionLookup();
      expect(mockAuth).not.toHaveBeenCalled();
      expect(mockVerifyToken).not.toHaveBeenCalled();
    } finally {
      verify.mockRestore();
    }
  });

  it('issue → authenticate round trip: a key from the real POST route authenticates via the real Bearer path', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValue(authSession('user-round-trip'));
    const createRes = await createApiKeyRoute(makeCreateRequest('user-round-trip'));
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

    expect(authResult).toEqual({ userId: 'user-round-trip', apiKeyId: 'key-1' });
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('enforces the selected scope and denies API keys on routes without an API-key contract', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValue(authSession('scoped-user'));
    const createRes = await createApiKeyRoute(
      makeCreateRequest('scoped-user', 'models only', ['models:read']),
    );
    const created = (await createRes.json()) as { full_key: string };

    mockAuth.mockResolvedValue(authSession(null));

    await expect(
      getClerkAuthUser(makeBearerRequest(created.full_key), {
        apiKeyScope: 'models:read',
      }),
    ).resolves.toEqual({ userId: 'scoped-user', apiKeyId: 'key-1' });

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
    ).resolves.toEqual({ userId: 'legacy-user', apiKeyId: 'key-1' });
    await expect(getClerkAuthUser(makeBearerRequest(rawKey))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('rejects new key issuance without at least one scope', async () => {
    makeFakeDb();
    mockAuth.mockResolvedValue(authSession('scope-required-user'));

    const response = await createApiKeyRoute(
      makeCreateRequest('scope-required-user', 'scope-less', []),
    );

    expect(response.status).toBe(400);
  });

  it('rejects a key after it is revoked through the real DELETE route', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValue(authSession('user-revoke-me'));
    const createRes = await createApiKeyRoute(makeCreateRequest('user-revoke-me'));
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
      expect(result).toEqual({
        userId: 'clerk-session-user',
        sessionIdentity: { subject: 'clerk-session-user', sessionId: null },
      });
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

      expect(result).toEqual({ userId: 'user-a-bearer', apiKeyId: 'key-1' });
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

      expect(result).toEqual({ userId: 'same-user', apiKeyId: 'key-1' });
      expect(mockAuth).not.toHaveBeenCalled();
    });
  });

  describe('unchanged: cookie-only and bearer-only (no cookie) paths', () => {
    it('cookie-only request (no Authorization header at all) still resolves via Path 1', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));

      const req = new NextRequest('http://localhost/api/some-route');
      const result = await getClerkAuthUser(req);

      expect(result).toEqual({
        userId: 'clerk-session-user',
        sessionIdentity: { subject: 'clerk-session-user', sessionId: null },
      });
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

      expect(result).toEqual({
        userId: 'clerk-jwt-user',
        email: 'user@example.com',
        sessionIdentity: { subject: 'clerk-jwt-user', sessionId: null },
      });
      expect(queriedApiKeysTable()).toBe(false);
    });

    it.each([
      ['the web origin', { azp: 'https://agiworkforce.com' }, 'web'],
      ['the extension origin', { azp: 'chrome-extension://abcdefghijklmnop' }, 'chrome'],
    ])('binds a Clerk bearer token to the surface %s proves', async (_label, claims, bound) => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce(authSession(null));
      mockVerifyToken.mockResolvedValueOnce({ sub: 'clerk-jwt-user', ...claims });
      process.env['CLERK_SECRET_KEY'] = 'test-clerk-secret-key';

      const result = await getClerkAuthUser(
        makeBearerRequest('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjbGVyay1qd3QtdXNlciJ9.sig'),
      );

      expect(result).toEqual({
        userId: 'clerk-jwt-user',
        boundSurface: bound,
        sessionIdentity: { subject: 'clerk-jwt-user', sessionId: null },
      });
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
      const createRes = await createApiKeyRoute(
        makeCreateRequest('scoped-user', 'scoped', ['models:read']),
      );
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

    beforeEach(() => {
      vi.stubEnv('CLERK_SECRET_KEY', 'test-clerk-secret-key');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    function bindOrgPolicy(
      organizationId: string | null,
      requireMfa: boolean,
      mappedAccountId?: string,
    ) {
      mockNeonQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
        if (mappedAccountId && sql.toLowerCase().includes('left join public.identities')) {
          return [{ identity_id: 'identity-mfa', account_id: mappedAccountId, erased: false }];
        }
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
      ).resolves.toEqual({
        userId: 'clerk-session-user',
        sessionIdentity: { subject: 'clerk-session-user', sessionId: null },
      });
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
      mockClerkGetUser.mockResolvedValueOnce({ id: 'clerk-session-user', twoFactorEnabled: true });

      await expect(
        getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
      ).resolves.toEqual({
        userId: 'clerk-session-user',
        sessionIdentity: { subject: 'clerk-session-user', sessionId: null },
      });
    });

    it.each(['cookie', 'bearer'] as const)(
      'uses the mapped account policy and native enrollment for %s auth',
      async (transport) => {
        bindOrgPolicy(ORGANIZATION_ID, true, 'product-mfa-account');
        mockAuth.mockResolvedValue(authSession('native-mfa-subject'));
        mockVerifyToken.mockResolvedValue({ sub: 'native-mfa-subject' });
        mockClerkGetUser.mockImplementation(async (subject: string) => ({
          id: subject,
          twoFactorEnabled: subject === 'native-mfa-subject',
        }));
        const request = () =>
          new NextRequest('http://localhost/api/some-route', {
            headers: transport === 'bearer' ? { authorization: 'Bearer native-mfa-token' } : {},
          });

        await expect(getClerkAuthUser(request())).resolves.toMatchObject({
          userId: 'product-mfa-account',
          sessionIdentity: { subject: 'native-mfa-subject', sessionId: null },
        });
        expect(mockClerkGetUser).toHaveBeenCalledExactlyOnceWith('native-mfa-subject');
        expect(mockNeonQuery).toHaveBeenCalledWith(expect.stringContaining(') governing'), [
          'product-mfa-account',
        ]);

        mockClerkGetUser.mockClear();
        mockClerkGetUser.mockImplementation(async (subject: string) => ({
          id: subject,
          twoFactorEnabled: subject === 'product-mfa-account',
        }));
        await expect(getClerkAuthUser(request())).rejects.toSatisfy(isMfaRequiredError);
        expect(mockClerkGetUser).toHaveBeenCalledExactlyOnceWith('native-mfa-subject');
      },
    );
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
        sessionIdentity: { subject: 'clerk-session-user', sessionId: null },
      });
    });

    it('lets a cookie session through when the caller ip is inside the allowed subnet', async () => {
      bindOrgIpPolicy(ORGANIZATION_ID, ['203.0.113.0/24']);
      mockAuth.mockResolvedValueOnce(authSession('clerk-session-user'));

      await expect(getClerkAuthUser(requestFromIp('203.0.113.5'))).resolves.toEqual({
        userId: 'clerk-session-user',
        sessionIdentity: { subject: 'clerk-session-user', sessionId: null },
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
      ).resolves.toEqual({
        userId: 'owner-user',
        sessionIdentity: { subject: 'owner-user', sessionId: null },
        organizationScope: { userId: 'owner-user', organizationId: ORGANIZATION_ID },
      });
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
    resetSessionStartCache();
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
      sessionIdentity: { subject: 'provider-subject-9', sessionId: null },
    });
  });

  it.each(['cookie', 'bearer'] as const)(
    'keeps the verified native subject and session separate from the mapped account for %s auth',
    async (transport) => {
      const db = makeFakeDb();
      db.identities.set('clerk:native-mapped-subject', {
        identityId: 'identity-mapped-session',
        accountId: 'product-mapped-account',
      });
      const sessionId = `sess_mapped_identity_${transport}`;
      mockClerkGetSession.mockResolvedValueOnce({
        id: sessionId,
        userId: 'native-mapped-subject',
        status: 'active',
        createdAt: Date.now(),
      });
      const headers = {
        'x-account-id': 'forged-product-account',
        'x-user-id': 'forged-native-subject',
        'x-session-id': 'forged-session',
      };
      if (transport === 'bearer') {
        process.env['CLERK_SECRET_KEY'] = 'test-clerk-secret-key';
        mockVerifyToken.mockResolvedValueOnce({
          sub: 'native-mapped-subject',
          sid: sessionId,
          email: 'verified@example.com',
        });
      } else {
        mockAuth.mockResolvedValueOnce(authSession('native-mapped-subject', sessionId));
      }
      const request = new NextRequest(
        'http://localhost/api/settings/email?accountId=forged-product-account&subject=forged-native-subject',
        {
          headers: {
            ...headers,
            ...(transport === 'bearer' ? { authorization: 'Bearer native-session-token' } : {}),
          },
        },
      );

      await expect(getClerkAuthUser(request)).resolves.toEqual({
        userId: 'product-mapped-account',
        identityId: 'identity-mapped-session',
        sessionIdentity: { subject: 'native-mapped-subject', sessionId },
        ...(transport === 'bearer' ? { email: 'verified@example.com' } : {}),
      });
      expect(mockClerkGetSession).toHaveBeenCalledExactlyOnceWith(sessionId);
      expect(noteSessionSighting).toHaveBeenCalledExactlyOnceWith(
        'product-mapped-account',
        'native-mapped-subject',
        sessionId,
        request,
      );
      if (transport === 'bearer') expect(mockAuth).not.toHaveBeenCalled();
    },
  );

  it('does not admit a suspended cookie to the shared reader', async () => {
    const db = makeFakeDb();
    db.accountStatuses.set('suspended-share-reader', 'suspended');
    mockAuth.mockResolvedValueOnce(authSession('suspended-share-reader'));
    await expect(getCurrentCookieUserRlsDb(cookieRequest())).resolves.toBeNull();
  });

  it('does not admit a cookie that still requires passkey verification', async () => {
    makeFakeDb();
    const query = mockNeonQuery.getMockImplementation()!;
    mockNeonQuery.mockImplementation((sql: string, params: unknown[] = []) =>
      sql.toLowerCase().includes('from public.account_security_enrollments')
        ? Promise.resolve([{ enrolled_at: new Date(Date.now() - 86_400_000).toISOString() }])
        : query(sql, params),
    );
    mockAuth.mockResolvedValueOnce(authSession('unverified-share-reader'));
    await expect(getCurrentCookieUserRlsDb(cookieRequest())).resolves.toBeNull();
  });

  it('does not admit an erased cookie to the shared reader', async () => {
    const db = makeFakeDb();
    db.erasedAccounts.add('erased-share-reader');
    mockAuth.mockResolvedValueOnce(authSession('erased-share-reader'));
    await expect(getCurrentCookieUserRlsDb(cookieRequest())).resolves.toBeNull();
  });

  it('links an account that predates the mapping rather than failing its request', async () => {
    const db = makeFakeDb();
    mockAuth.mockResolvedValueOnce(authSession('unmapped-user'));

    await expect(getClerkAuthUser(cookieRequest())).resolves.toEqual({
      userId: 'unmapped-user',
      sessionIdentity: { subject: 'unmapped-user', sessionId: null },
    });
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
      message:
        'Your account has been suspended under section 11 of our Terms of Service. You can appeal, and a person reviews every appeal and tells you what triggered it.',
    });
  });

  it('lets a scheduled deletion sign in, because cancelling it is done signed in', async () => {
    const db = makeFakeDb();
    db.accountStatuses.set('leaving-user', 'deletion_scheduled');
    mockAuth.mockResolvedValueOnce(authSession('leaving-user'));

    await expect(getClerkAuthUser(cookieRequest())).resolves.toEqual({
      userId: 'leaving-user',
      sessionIdentity: { subject: 'leaving-user', sessionId: null },
    });
  });

  it('derives a scheduled deletion from the date 0071 records, and still lets it sign in', async () => {
    const db = makeFakeDb();
    db.accountStatuses.set('leaving-by-date', 'active');
    db.deletionScheduled.set('leaving-by-date', '2026-10-01T00:00:00.000Z');
    mockAuth.mockResolvedValueOnce(authSession('leaving-by-date'));

    await expect(getClerkAuthUser(cookieRequest())).resolves.toEqual({
      userId: 'leaving-by-date',
      sessionIdentity: { subject: 'leaving-by-date', sessionId: null },
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
    const createRes = await createApiKeyRoute(
      makeCreateRequest('erased-key-owner', 'still valid', ['models:read']),
    );
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
    const createRes = await createApiKeyRoute(makeCreateRequest('locked-key-user'));
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
    ).resolves.toEqual({
      userId: 'unlocked-cookie-user',
      sessionIdentity: { subject: 'unlocked-cookie-user', sessionId: null },
    });
  });

  it('lets a personal workspace through, having no workspace to lock', async () => {
    makeFakeDb();
    bindWorkspace(null, true);
    mockAuth.mockResolvedValue(authSession('personal-user'));

    await expect(
      getClerkAuthUser(new NextRequest('http://localhost/api/some-route')),
    ).resolves.toEqual({
      userId: 'personal-user',
      sessionIdentity: { subject: 'personal-user', sessionId: null },
    });
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
    ).resolves.toEqual({
      userId: 'degraded-user',
      sessionIdentity: { subject: 'degraded-user', sessionId: null },
    });
  });
});

describe('getClerkAuthUser · an identity bridge that cannot be read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
  });

  it('fails closed when the bridge table is missing instead of resolving without it', async () => {
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
    ).rejects.toThrow();
  });

  it('fails closed on any other database error', async () => {
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

describe('getOptionalAuthUser · the gate a signed-out caller does not need', () => {
  const LOCKED_ORGANIZATION = '44444444-4444-4444-8444-444444444444';

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

  function request(): NextRequest {
    return new NextRequest('http://localhost/api/feedback');
  }

  beforeEach(() => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
    vi.mocked(getKeyValueStore).mockReturnValue(null as unknown as KeyValueStore);
  });

  it('answers null for a caller with no session at all', async () => {
    makeFakeDb();
    mockAuth.mockResolvedValue(authSession(null));

    await expect(getOptionalAuthUser(request())).resolves.toBeNull();
  });

  it('answers the account id for an active signed-in caller', async () => {
    const db = makeFakeDb();
    db.identities.set('clerk:optional-subject', {
      identityId: 'identity-optional',
      accountId: 'account-optional',
    });
    mockAuth.mockResolvedValue(authSession('optional-subject'));

    await expect(getOptionalAuthUser(request())).resolves.toEqual({
      userId: 'account-optional',
      identityId: 'identity-optional',
      sessionIdentity: { subject: 'optional-subject', sessionId: null },
    });
  });

  it('serves a suspended account as signed out, so support stays reachable and nothing is attributed', async () => {
    const db = makeFakeDb();
    db.accountStatuses.set('suspended-optional-user', 'suspended');
    mockAuth.mockResolvedValue(authSession('suspended-optional-user'));

    await expect(getOptionalAuthUser(request())).resolves.toBeNull();
  });

  it('serves a caller whose workspace is locked down as signed out', async () => {
    makeFakeDb();
    bindWorkspace(LOCKED_ORGANIZATION, true);
    mockAuth.mockResolvedValue(authSession('locked-optional-user'));

    await expect(getOptionalAuthUser(request())).resolves.toBeNull();
  });

  it('serves a stale cookie for an erased account as signed out', async () => {
    const db = makeFakeDb();
    db.erasedAccounts.add('erased-optional-user');
    mockAuth.mockResolvedValue(authSession('erased-optional-user'));

    await expect(getOptionalAuthUser(request())).resolves.toBeNull();
  });

  it('still refuses a credential it cannot verify, rather than reading it as signed out', async () => {
    makeFakeDb();
    mockAuth.mockResolvedValue(authSession(null));

    const bearer = new NextRequest('http://localhost/api/feedback', {
      headers: { authorization: 'Bearer sk_live_0000000000000000_not_a_real_secret_at_all' },
    });
    await expect(getOptionalAuthUser(bearer)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('getClerkAuthUser: a session may not outlive the absolute lifetime', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SESSION_ID = 'sess_absolute_lifetime';

  function cookieRequest() {
    return new NextRequest('http://localhost/api/chat/conversations');
  }

  function providerSession(createdAt: number, userId = 'aged-user') {
    return { id: SESSION_ID, userId, status: 'active', createdAt, lastActiveAt: createdAt };
  }

  beforeEach(() => {
    resetSessionStartCache();
    mockClerkGetSession.mockReset();
    mockClerkRevokeSession.mockClear();
    mockAuth.mockResolvedValue(authSession('aged-user', SESSION_ID));
  });

  it('refuses a session one second past the limit, on an ordinary route', async () => {
    makeFakeDb();
    const pastTheLimit = Date.now() - (30 * DAY_MS + 1000);
    mockClerkGetSession.mockResolvedValue(providerSession(pastTheLimit));

    await expect(getClerkAuthUser(cookieRequest())).rejects.toMatchObject({ statusCode: 401 });
    expect(mockClerkRevokeSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it('refuses an over-age cookie before constructing the shared-reader RLS scope', async () => {
    makeFakeDb();
    mockClerkGetSession.mockResolvedValue(providerSession(Date.now() - (30 * DAY_MS + 1000)));

    await expect(getCurrentCookieUserRlsDb(cookieRequest())).resolves.toBeNull();
    expect(mockClerkRevokeSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it('serves a session one second inside the limit', async () => {
    makeFakeDb();
    const insideTheLimit = Date.now() - (30 * DAY_MS - 1000);
    mockClerkGetSession.mockResolvedValue(providerSession(insideTheLimit));

    await expect(getClerkAuthUser(cookieRequest())).resolves.toEqual({
      userId: 'aged-user',
      sessionIdentity: { subject: 'aged-user', sessionId: SESSION_ID },
    });
    expect(mockClerkRevokeSession).not.toHaveBeenCalled();
  });

  it('serves the request and counts it when the session start cannot be read', async () => {
    makeFakeDb();
    mockClerkGetSession.mockRejectedValue(new Error('provider unavailable'));
    const before = unreadableSessionStartCount();

    await expect(getClerkAuthUser(cookieRequest())).resolves.toEqual({
      userId: 'aged-user',
      sessionIdentity: { subject: 'aged-user', sessionId: SESSION_ID },
    });
    expect(unreadableSessionStartCount()).toBe(before + 1);
    expect(mockClerkRevokeSession).not.toHaveBeenCalled();
  });

  it('asks the provider once per session, not once per request', async () => {
    makeFakeDb();
    mockClerkGetSession.mockResolvedValue(providerSession(Date.now() - DAY_MS));

    await getClerkAuthUser(cookieRequest());
    await getClerkAuthUser(cookieRequest());
    await getClerkAuthUser(cookieRequest());

    expect(mockClerkGetSession).toHaveBeenCalledTimes(1);
  });

  it('never measures a session against somebody else account', async () => {
    makeFakeDb();
    mockClerkGetSession.mockResolvedValue(
      providerSession(Date.now() - (30 * DAY_MS + 1000), 'another-user'),
    );

    await expect(getClerkAuthUser(cookieRequest())).resolves.toEqual({
      userId: 'aged-user',
      sessionIdentity: { subject: 'aged-user', sessionId: SESSION_ID },
    });
    expect(mockClerkRevokeSession).not.toHaveBeenCalled();
  });

  it('honours a shorter lifetime and measures the bearer branch the same way', async () => {
    makeFakeDb();
    process.env['SESSION_ABSOLUTE_LIFETIME_HOURS'] = '1';
    process.env['CLERK_SECRET_KEY'] = 'test-clerk-secret-key';
    mockAuth.mockResolvedValue(authSession(null));
    mockVerifyToken.mockResolvedValue({ sub: 'aged-user', sid: SESSION_ID });
    mockClerkGetSession.mockResolvedValue(providerSession(Date.now() - (60 * 60 * 1000 + 1000)));

    try {
      const bearer = new NextRequest('http://localhost/api/chat/conversations', {
        headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZ2VkIn0.sig' },
      });
      await expect(getClerkAuthUser(bearer)).rejects.toMatchObject({ statusCode: 401 });
    } finally {
      delete process.env['SESSION_ABSOLUTE_LIFETIME_HOURS'];
    }
  });
});

describe('getClerkAuthUser: a native session token with a surface proof', () => {
  const SESSION_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.session.sig';
  const SURFACE_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.surface.sig';
  const SESSION_ID = 'sess_mobile_native';

  function nativeRequest(proof?: string): NextRequest {
    return new NextRequest('http://localhost/api/chat/conversations', {
      headers: {
        authorization: `Bearer ${SESSION_TOKEN}`,
        ...(proof === undefined ? {} : { [SURFACE_TOKEN_HEADER]: proof }),
      },
    });
  }

  function tokens(byToken: Record<string, Record<string, unknown> | Error>) {
    mockVerifyToken.mockImplementation(async (token: string) => {
      const claims = byToken[token];
      if (!claims) throw new Error('unknown token');
      if (claims instanceof Error) throw claims;
      return claims;
    });
  }

  function authFailureReasons(): string[] {
    return mockNeonExecute.mock.calls
      .filter(([sql]) => String(sql).includes('INSERT INTO security_audit_logs'))
      .map(([, params]) => String((params as unknown[]).find((p) => String(p).includes('reason'))));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionStartCache();
    process.env['CLERK_SECRET_KEY'] = 'test-clerk-secret-key';
    mockAuth.mockResolvedValue(authSession(null));
    mockClerkGetSession.mockResolvedValue({
      id: SESSION_ID,
      userId: 'phone-user',
      status: 'active',
      createdAt: Date.now() - 60_000,
      lastActiveAt: Date.now(),
    });
  });

  it('takes the session from the bearer and the surface from the verified proof', async () => {
    makeFakeDb();
    tokens({
      [SESSION_TOKEN]: { sub: 'phone-user', sid: SESSION_ID },
      [SURFACE_TOKEN]: { sub: 'phone-user', surface: 'mobile' },
    });

    await expect(getClerkAuthUser(nativeRequest(SURFACE_TOKEN))).resolves.toEqual({
      userId: 'phone-user',
      sessionIdentity: { subject: 'phone-user', sessionId: SESSION_ID },
      boundSurface: 'mobile',
    });
    expect(mockVerifyToken).toHaveBeenCalledTimes(2);
    const calls = mockVerifyToken.mock.calls as Array<
      [string, { authorizedParties: readonly string[] }]
    >;
    expect(calls.map(([token]) => token)).toEqual([SESSION_TOKEN, SURFACE_TOKEN]);
    expect(calls[1]?.[1].authorizedParties).toEqual(calls[0]?.[1].authorizedParties);
    expect(mockClerkGetSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it('refuses a proof minted for a different user', async () => {
    makeFakeDb();
    tokens({
      [SESSION_TOKEN]: { sub: 'phone-user', sid: SESSION_ID },
      [SURFACE_TOKEN]: { sub: 'someone-else', surface: 'mobile' },
    });

    await expect(getClerkAuthUser(nativeRequest(SURFACE_TOKEN))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(authFailureReasons().join()).toContain('invalid_surface_token');
  });

  it.each([
    ['forged', new Error('signature verification failed')],
    ['expired', new Error('JWT is expired')],
  ])('refuses a %s proof instead of treating it as absent', async (_label, failure) => {
    makeFakeDb();
    tokens({
      [SESSION_TOKEN]: { sub: 'phone-user', sid: SESSION_ID },
      [SURFACE_TOKEN]: failure,
    });

    await expect(getClerkAuthUser(nativeRequest(SURFACE_TOKEN))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('refuses a proof that carries no surface claim, such as a second session token', async () => {
    makeFakeDb();
    tokens({
      [SESSION_TOKEN]: { sub: 'phone-user', sid: SESSION_ID },
      [SURFACE_TOKEN]: { sub: 'phone-user', sid: SESSION_ID },
    });

    await expect(getClerkAuthUser(nativeRequest(SURFACE_TOKEN))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('refuses an empty proof header rather than ignoring it', async () => {
    makeFakeDb();
    tokens({ [SESSION_TOKEN]: { sub: 'phone-user', sid: SESSION_ID } });

    await expect(getClerkAuthUser(nativeRequest(''))).rejects.toMatchObject({ statusCode: 401 });
  });

  it('never gives a surface template token sent as the bearer a session principal', async () => {
    makeFakeDb();
    tokens({ [SESSION_TOKEN]: { sub: 'phone-user', surface: 'mobile' } });

    await expect(getClerkAuthUser(nativeRequest())).rejects.toMatchObject({ statusCode: 401 });
    expect(authFailureReasons().join()).toContain('surface_token_as_bearer');
    expect(mockClerkGetSession).not.toHaveBeenCalled();
  });

  it('keeps the bearer-only path unchanged when no proof header is sent', async () => {
    makeFakeDb();
    tokens({
      [SESSION_TOKEN]: { sub: 'phone-user', sid: SESSION_ID, azp: 'https://agiworkforce.com' },
    });

    await expect(getClerkAuthUser(nativeRequest())).resolves.toEqual({
      userId: 'phone-user',
      sessionIdentity: { subject: 'phone-user', sessionId: SESSION_ID },
      boundSurface: 'web',
    });
    expect(mockVerifyToken).toHaveBeenCalledTimes(1);
  });

  it('lets a passkey-enrolled account through from the phone once its session is verified', async () => {
    makeFakeDb();
    const delegate = mockNeonQuery.getMockImplementation() as (
      sql: string,
      params?: unknown[],
    ) => Promise<Record<string, unknown>[]>;
    const verifiedSessions = new Set<string>();
    mockNeonQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const s = sql.toLowerCase();
      if (s.includes('from public.account_security_enrollments')) {
        return [{ enrolled_at: new Date(Date.now() - 86_400_000).toISOString() }];
      }
      if (s.includes('from public.account_security_sessions')) {
        return verifiedSessions.has(params[0] as string)
          ? [{ expires_at: new Date(Date.now() + 3_600_000).toISOString() }]
          : [];
      }
      return delegate(sql, params);
    });
    tokens({
      [SESSION_TOKEN]: { sub: 'phone-user', sid: SESSION_ID },
      [SURFACE_TOKEN]: { sub: 'phone-user', surface: 'mobile' },
    });

    await expect(getClerkAuthUser(nativeRequest(SURFACE_TOKEN))).rejects.toSatisfy(
      isPasskeyRequiredError,
    );

    verifiedSessions.add(SESSION_ID);
    await expect(getClerkAuthUser(nativeRequest(SURFACE_TOKEN))).resolves.toEqual({
      userId: 'phone-user',
      sessionIdentity: { subject: 'phone-user', sessionId: SESSION_ID },
      boundSurface: 'mobile',
    });
  });
});

// Source-only UNRUN fixtures. Real auth, selection, and exact owner helper; storage/provider
// adapters and admission-gate spies are not PostgreSQL/RLS or aggregate MFA policy proof.
describe('policy authentication captures one admitted organization', () => {
  const NATIVE = 'policy-native-subject';
  const ACCOUNT = 'policy-product-account';
  const SESSION = 'sess-policy-recovery';
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const options = { mfaGateExemptForOwner: true };
  let db: ReturnType<typeof makeFakeDb>;
  let saved: string | null;
  let roles: Map<string, string>;
  let order: string[];
  let select: MockInstance<typeof activeWorkspace.resolveActiveOrganizationId>;
  let owner: MockInstance<typeof membershipService.resolveOrgMembershipForOrganization>;
  let lockdown: MockInstance<typeof lockdownGate.assertTenantNotLockedDown>;
  let security: MockInstance<typeof accountSecurityGate.assertAccountSecurity>;
  let mfa: MockInstance<typeof mfaGate.assertMfaPolicy>;
  let ip: MockInstance<typeof ipGate.assertIpAllowList>;

  function request(target?: string, bearer = false): NextRequest {
    return new NextRequest('http://localhost/api/settings/organization/policy', {
      headers: {
        ...(target === undefined ? {} : { [MANAGED_CLOUD_ORGANIZATION_HEADER]: target }),
        ...(bearer ? { authorization: 'Bearer verified-policy-session' } : {}),
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionStartCache();
    clearIpAllowListCacheForTests();
    vi.stubEnv('CLERK_SECRET_KEY', 'test-clerk-secret-key');
    vi.mocked(getKeyValueStore).mockReturnValue(null);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected fixture network I/O')));
    mockAuth.mockReset().mockResolvedValue(authSession(NATIVE, SESSION));
    mockVerifyToken.mockReset().mockResolvedValue({ sub: NATIVE, sid: SESSION });
    mockClerkGetSession.mockReset().mockResolvedValue({
      id: SESSION,
      userId: NATIVE,
      status: 'active',
      createdAt: Date.now() - 60_000,
      lastActiveAt: Date.now(),
    });
    mockClerkRevokeSession.mockReset().mockResolvedValue(undefined);
    db = makeFakeDb();
    db.identities.set(`clerk:${NATIVE}`, { identityId: 'policy-identity', accountId: ACCOUNT });
    saved = A;
    roles = new Map([
      [A, 'owner'],
      [B, 'member'],
    ]);
    order = [];
    const query = mockNeonQuery.getMockImplementation()!;
    mockNeonQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const s = normalizedLookupSql(sql);
      if (s.includes('account_status')) order.push('lifecycle');
      if (s.includes('from public.user_settings')) {
        return saved === null ? [] : [{ organization_id: saved }];
      }
      if (s.includes('from public.organization_members')) {
        expect(s).toContain("status = 'active'");
        expect(params[1]).toBe(ACCOUNT);
        const role = roles.get(String(params[0]));
        return role ? [{ organization_id: params[0], role }] : [];
      }
      return query(sql, params);
    });
    const resolve = activeWorkspace.resolveActiveOrganizationId;
    select = vi
      .spyOn(activeWorkspace, 'resolveActiveOrganizationId')
      .mockImplementation((...args) => {
        order.push('selection');
        return resolve(...args);
      });
    const exactOwner = membershipService.resolveOrgMembershipForOrganization;
    owner = vi
      .spyOn(membershipService, 'resolveOrgMembershipForOrganization')
      .mockImplementation((...args) => {
        order.push('owner');
        return exactOwner(...args);
      });
    lockdown = vi.spyOn(lockdownGate, 'assertTenantNotLockedDown').mockImplementation(async () => {
      order.push('lockdown');
    });
    security = vi
      .spyOn(accountSecurityGate, 'assertAccountSecurity')
      .mockImplementation(async () => {
        order.push('security');
      });
    mfa = vi.spyOn(mfaGate, 'assertMfaPolicy').mockImplementation(async () => {
      order.push('mfa');
    });
    ip = vi.spyOn(ipGate, 'assertIpAllowList').mockImplementation(async () => {
      order.push('ip');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([false, true])(
    'uses mapped account and native session evidence (bearer=%s)',
    async (bearer) => {
      const req = request(B, bearer);
      const result = await getClerkAuthUser(req, options);
      expect(result).toMatchObject({
        userId: ACCOUNT,
        sessionIdentity: { subject: NATIVE, sessionId: SESSION },
        organizationScope: { userId: ACCOUNT, organizationId: B },
      });
      expect(select).toHaveBeenCalledExactlyOnceWith(expect.anything(), ACCOUNT, req);
      expect(owner).toHaveBeenCalledExactlyOnceWith(expect.anything(), ACCOUNT, B);
      expect(lockdown).toHaveBeenCalledExactlyOnceWith(B);
      expect(security).toHaveBeenCalledExactlyOnceWith(ACCOUNT, {
        kind: 'session',
        sessionId: SESSION,
      });
      expect(mfa).toHaveBeenCalledExactlyOnceWith(ACCOUNT, { subject: NATIVE, sessionId: SESSION });
      expect(ip).toHaveBeenCalledExactlyOnceWith(ACCOUNT, req);
      expect(noteSessionSighting).toHaveBeenCalledExactlyOnceWith(ACCOUNT, NATIVE, SESSION, req);
      expect(order).toEqual([
        'lifecycle',
        'selection',
        'lockdown',
        'security',
        'owner',
        'mfa',
        'ip',
      ]);
    },
  );

  it('does not let saved owner A exempt an explicit nonowner B from aggregate MFA', async () => {
    mfa.mockRejectedValue(new mfaGate.MfaRequiredError('Aggregate MFA required'));
    await expect(getClerkAuthUser(request(B), options)).rejects.toSatisfy(isMfaRequiredError);
    expect(owner).toHaveBeenCalledWith(expect.anything(), ACCOUNT, B);
    expect(ip).not.toHaveBeenCalled();
    expect(noteSessionSighting).not.toHaveBeenCalled();
  });

  it('allows exact B owner recovery even when saved A is not owned', async () => {
    roles.set(A, 'member');
    roles.set(B, 'owner');
    mfa.mockRejectedValue(new mfaGate.MfaRequiredError('Aggregate MFA required'));
    await expect(getClerkAuthUser(request(B), options)).resolves.toMatchObject({
      organizationScope: { userId: ACCOUNT, organizationId: B },
    });
    expect(mfa).not.toHaveBeenCalled();
    expect(ip).toHaveBeenCalledTimes(1);
  });

  it('returns an explicit Personal receipt and still applies aggregate MFA', async () => {
    await expect(
      getClerkAuthUser(request(activeWorkspace.PERSONAL_WORKSPACE_KEY), options),
    ).resolves.toMatchObject({ organizationScope: { userId: ACCOUNT, organizationId: null } });
    expect(lockdown).toHaveBeenCalledExactlyOnceWith(null);
    expect(mfa).toHaveBeenCalledTimes(1);
  });

  it('preserves equal product and native ids', async () => {
    db.identities.delete(`clerk:${NATIVE}`);
    await expect(
      getClerkAuthUser(request(activeWorkspace.PERSONAL_WORKSPACE_KEY), options),
    ).resolves.toMatchObject({
      userId: NATIVE,
      organizationScope: { userId: NATIVE, organizationId: null },
    });
    expect(mfa).toHaveBeenCalledWith(NATIVE, { subject: NATIVE, sessionId: SESSION });
  });

  it('does not reselect when saved selection changes during account security', async () => {
    security.mockImplementation(async () => {
      saved = B;
    });
    await expect(getClerkAuthUser(request(), options)).resolves.toMatchObject({
      organizationScope: { userId: ACCOUNT, organizationId: A },
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(owner).toHaveBeenCalledWith(expect.anything(), ACCOUNT, A);
    expect(lockdown).toHaveBeenCalledExactlyOnceWith(A);
    expect(mfa).not.toHaveBeenCalled();
  });

  it('does not exempt a mismatched exact owner row', async () => {
    const query = mockNeonQuery.getMockImplementation()!;
    mockNeonQuery.mockImplementation((sql: string, params: unknown[] = []) =>
      normalizedLookupSql(sql).startsWith('select organization_id, role')
        ? Promise.resolve([{ organization_id: A, role: 'owner' }])
        : query(sql, params),
    );
    mfa.mockRejectedValue(new mfaGate.MfaRequiredError('Aggregate MFA required'));
    await expect(getClerkAuthUser(request(B), options)).rejects.toSatisfy(isMfaRequiredError);
    expect(ip).not.toHaveBeenCalled();
  });

  it.each(['admin', 'member', 'viewer'])('keeps aggregate MFA for an exact %s', async (role) => {
    roles.set(B, role);
    await getClerkAuthUser(request(B), options);
    expect(mfa).toHaveBeenCalledExactlyOnceWith(ACCOUNT, { subject: NATIVE, sessionId: SESSION });
  });

  it('does not admit a receipt when exact owner proof throws', async () => {
    owner.mockRejectedValue(new Error('Owner lookup unavailable'));
    await expect(getClerkAuthUser(request(B), options)).rejects.toThrow('Owner lookup unavailable');
    expect(mfa).not.toHaveBeenCalled();
    expect(ip).not.toHaveBeenCalled();
    expect(noteSessionSighting).not.toHaveBeenCalled();
  });

  it.each(['not-a-uuid', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'])(
    'rejects invalid or nonmember target %s before later gates',
    async (target) => {
      await expect(getClerkAuthUser(request(target), options)).rejects.toBeDefined();
      expect(lockdown).not.toHaveBeenCalled();
      expect(security).not.toHaveBeenCalled();
      expect(owner).not.toHaveBeenCalled();
      expect(mfa).not.toHaveBeenCalled();
      expect(ip).not.toHaveBeenCalled();
      expect(noteSessionSighting).not.toHaveBeenCalled();
    },
  );

  it.each(['exception', 'deadline'] as const)('fails closed on selection %s', async (failure) => {
    if (failure === 'deadline') {
      vi.useFakeTimers();
      select.mockImplementation(() => new Promise<string | null>(() => {}));
    } else {
      select.mockRejectedValue(new Error('Selection unavailable'));
    }
    const result = getClerkAuthUser(request(B), options);
    const rejected = expect(result).rejects.toMatchObject({ statusCode: 503 });
    if (failure === 'deadline') await vi.advanceTimersByTimeAsync(2_001);
    await rejected;
    expect(lockdown).not.toHaveBeenCalled();
    expect(security).not.toHaveBeenCalled();
    expect(owner).not.toHaveBeenCalled();
    expect(mfa).not.toHaveBeenCalled();
    expect(ip).not.toHaveBeenCalled();
    expect(noteSessionSighting).not.toHaveBeenCalled();
  });

  it('checks exact target lockdown before account security or ownership', async () => {
    lockdown.mockRejectedValue(new Error('B locked'));
    await expect(getClerkAuthUser(request(B), options)).rejects.toThrow('B locked');
    expect(lockdown).toHaveBeenCalledExactlyOnceWith(B);
    expect(security).not.toHaveBeenCalled();
    expect(owner).not.toHaveBeenCalled();
    expect(noteSessionSighting).not.toHaveBeenCalled();
  });

  it('retains passkey-required native session sightings without admitting a receipt', async () => {
    security.mockRejectedValue(new accountSecurityGate.PasskeyRequiredError());
    const req = request(B);
    await expect(getClerkAuthUser(req, options)).rejects.toSatisfy(isPasskeyRequiredError);
    expect(noteSessionSighting).toHaveBeenCalledExactlyOnceWith(ACCOUNT, NATIVE, SESSION, req);
    expect(owner).not.toHaveBeenCalled();
    expect(mfa).not.toHaveBeenCalled();
    expect(ip).not.toHaveBeenCalled();
  });

  it('does not issue a receipt when the final IP gate refuses an owner', async () => {
    ip.mockRejectedValue(new Error('IP refused'));
    await expect(getClerkAuthUser(request(A), options)).rejects.toThrow('IP refused');
    expect(mfa).not.toHaveBeenCalled();
    expect(noteSessionSighting).not.toHaveBeenCalled();
  });

  it('keeps the default branch aggregate and receipt-free', async () => {
    const result = await getClerkAuthUser(request(A));
    expect(result).not.toHaveProperty('organizationScope');
    expect(owner).not.toHaveBeenCalled();
    expect(mfa).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['lifecycle', 'selection', 'lockdown', 'security', 'mfa', 'ip']);
  });

  it('preserves default lockdown lookup failure behavior without minting a receipt', async () => {
    select.mockRejectedValue(new Error('Default selection unavailable'));
    const result = await getClerkAuthUser(request(B));
    expect(result).not.toHaveProperty('organizationScope');
    expect(lockdown).toHaveBeenCalledExactlyOnceWith(null);
    expect(mfa).toHaveBeenCalledTimes(1);
    expect(ip).toHaveBeenCalledTimes(1);
  });

  it('keeps enrollment exempt without exempting IP admission', async () => {
    await getClerkAuthUser(request(B), { ...options, mfaEnrollment: true });
    expect(mfa).not.toHaveBeenCalled();
    expect(ip).toHaveBeenCalledTimes(1);
  });

  it('refuses unavailable accounts before target selection', async () => {
    db.accountStatuses.set(ACCOUNT, 'suspended');
    await expect(getClerkAuthUser(request(B), options)).rejects.toMatchObject({ statusCode: 403 });
    expect(select).not.toHaveBeenCalled();
    expect(security).not.toHaveBeenCalled();
  });

  it('refuses old native sessions before lifecycle and target selection', async () => {
    mockClerkGetSession.mockResolvedValue({
      id: SESSION,
      userId: NATIVE,
      status: 'active',
      createdAt: 0,
      lastActiveAt: Date.now(),
    });
    await expect(getClerkAuthUser(request(B), options)).rejects.toMatchObject({ statusCode: 401 });
    expect(order).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('ignores forged organization receipts in verified provider claims and request bodies', async () => {
    mockVerifyToken.mockResolvedValue({
      sub: NATIVE,
      sid: SESSION,
      organizationScope: { userId: NATIVE, organizationId: A },
    });
    const req = new NextRequest('http://localhost/api/settings/organization/policy', {
      method: 'POST',
      headers: {
        authorization: 'Bearer verified-policy-session',
        [MANAGED_CLOUD_ORGANIZATION_HEADER]: B,
      },
      body: JSON.stringify({ organizationScope: { userId: NATIVE, organizationId: A } }),
    });
    await expect(getClerkAuthUser(req, options)).resolves.toMatchObject({
      organizationScope: { userId: ACCOUNT, organizationId: B },
    });
  });

  it('still refuses valid API keys when the policy endpoint has no apiKeyScope', async () => {
    const { ApiKeyService } = await import('@/lib/services/api-key-service');
    vi.spyOn(ApiKeyService, 'verifyKey').mockResolvedValue({
      id: 'policy-key',
      user_id: ACCOUNT,
      scopes: ['models:read'],
    } as NonNullable<Awaited<ReturnType<typeof ApiKeyService.verifyKey>>>);
    await expect(
      getClerkAuthUser(makeBearerRequest('sk_live_policy_fixture'), options),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(select).not.toHaveBeenCalled();
    expect(security).not.toHaveBeenCalled();
    expect(owner).not.toHaveBeenCalled();
  });

  it('preserves developer device principal admission without inventing a session', async () => {
    const token = jwt.sign(
      { userId: ACCOUNT, sub: ACCOUNT, surface: 'developer' },
      TEST_DEVELOPER_JWT_SECRET,
      {
        expiresIn: 3600,
        issuer: 'agiworkforce-api-gateway',
        audience: 'agiworkforce',
        jwtid: 'policy-device-fixture',
      },
    );
    await expect(getClerkAuthUser(makeBearerRequest(token), options)).resolves.toMatchObject({
      userId: ACCOUNT,
      surfaceClass: 'developer',
      organizationScope: { userId: ACCOUNT, organizationId: A },
    });
    expect(security).toHaveBeenCalledWith(ACCOUNT, {
      kind: 'device',
      issuedAtSeconds: expect.any(Number),
    });
    expect(mockClerkGetSession).not.toHaveBeenCalled();
    expect(noteSessionSighting).not.toHaveBeenCalled();
  });
});

describe('mapped account absolute session lifetime at canonical auth boundaries', () => {
  const NOW = 1_800_000_000_000;
  const HOUR_MS = 3_600_000;
  const NATIVE = 'native-session-owner';
  const ACCOUNT = 'product-session-account';
  const SESSION = 'sess-mapped-lifetime';
  type Transport = 'cookie' | 'bearer' | 'appeal';
  let db: ReturnType<typeof makeFakeDb>;

  function providerSession(overrides: Record<string, unknown> = {}) {
    return {
      id: SESSION,
      userId: NATIVE,
      status: 'active',
      createdAt: NOW - 60_000,
      lastActiveAt: NOW,
      ...overrides,
    };
  }

  function requestFor(transport: Transport): NextRequest {
    return transport === 'bearer'
      ? makeBearerRequest('verified-native-session-token')
      : new NextRequest('http://localhost/api/account/suspension/appeal');
  }

  function authenticate(transport: Transport, request = requestFor(transport)) {
    return transport === 'appeal' ? getSuspendedAccountUser(request) : getClerkAuthUser(request);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionStartCache();
    clearIpAllowListCacheForTests();
    vi.stubEnv('SESSION_ABSOLUTE_LIFETIME_HOURS', '1');
    vi.stubEnv('CLERK_SECRET_KEY', 'test-clerk-secret-key');
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    vi.mocked(getKeyValueStore).mockReturnValue(null);
    db = makeFakeDb();
    db.identities.set(`clerk:${NATIVE}`, {
      identityId: 'identity-session-owner',
      accountId: ACCOUNT,
    });
    mockAuth.mockResolvedValue(authSession(NATIVE, SESSION));
    mockVerifyToken.mockResolvedValue({ sub: NATIVE, sid: SESSION });
    mockClerkGetSession.mockResolvedValue(providerSession());
    mockClerkRevokeSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe.each(['cookie', 'bearer', 'appeal'] as const)('%s authentication', (transport) => {
    beforeEach(() => {
      if (transport === 'appeal') db.accountStatuses.set(ACCOUNT, 'suspended');
    });

    it('accepts a fresh native session and keeps database and sighting identity product-scoped', async () => {
      const request = requestFor(transport);
      const result = await authenticate(transport, request);

      expect(result).toMatchObject({ userId: ACCOUNT });
      expect(mockClerkGetSession).toHaveBeenCalledExactlyOnceWith(SESSION);
      expect(mockNeonQuery).toHaveBeenCalledWith(expect.stringContaining('account_status'), [
        ACCOUNT,
      ]);
      expect(mockClerkRevokeSession).not.toHaveBeenCalled();
      if (transport === 'appeal') {
        expect(noteSessionSighting).not.toHaveBeenCalled();
      } else {
        expect(result).toMatchObject({ sessionIdentity: { subject: NATIVE, sessionId: SESSION } });
        expect(noteSessionSighting).toHaveBeenCalledExactlyOnceWith(
          ACCOUNT,
          NATIVE,
          SESSION,
          request,
        );
      }
    });

    it('refuses a known over-age session even when provider revocation fails', async () => {
      const failure = new Error('revocation unavailable');
      mockClerkGetSession.mockResolvedValue(providerSession({ createdAt: NOW - HOUR_MS }));
      mockClerkRevokeSession.mockRejectedValueOnce(failure);

      await expect(authenticate(transport)).rejects.toMatchObject({ statusCode: 401 });
      expect(mockClerkRevokeSession).toHaveBeenCalledExactlyOnceWith(SESSION);
      expect(logger.warn).toHaveBeenCalledWith(
        { error: failure, userId: ACCOUNT },
        '[session-age] session past its lifetime could not be revoked',
      );
      expect(noteSessionSighting).not.toHaveBeenCalled();
    });

    it('refuses a known over-age session when revocation succeeds', async () => {
      mockClerkGetSession.mockResolvedValue(providerSession({ createdAt: NOW - HOUR_MS }));

      await expect(authenticate(transport)).rejects.toMatchObject({ statusCode: 401 });
      expect(mockClerkRevokeSession).toHaveBeenCalledExactlyOnceWith(SESSION);
      expect(noteSessionSighting).not.toHaveBeenCalled();
    });

    it.each([
      ['missing session', null],
      ['unknown start', providerSession({ createdAt: null })],
      ['foreign subject', providerSession({ userId: ACCOUNT })],
      ['foreign session', providerSession({ id: 'sess-different' })],
      ['NaN start', providerSession({ createdAt: Number.NaN })],
      ['infinite start', providerSession({ createdAt: Number.POSITIVE_INFINITY })],
    ] as const)(
      'permits an initially %s under existing policy, then denies a valid over-age retry',
      async (_label, first) => {
        mockClerkGetSession
          .mockResolvedValueOnce(first)
          .mockResolvedValue(providerSession({ createdAt: NOW - HOUR_MS }));

        await expect(authenticate(transport)).resolves.toMatchObject({ userId: ACCOUNT });
        expect(mockClerkRevokeSession).not.toHaveBeenCalled();
        expect(unreadableSessionStartCount()).toBe(1);
        await expect(authenticate(transport)).rejects.toMatchObject({ statusCode: 401 });
        expect(mockClerkGetSession).toHaveBeenCalledTimes(2);
        expect(mockClerkRevokeSession).toHaveBeenCalledExactlyOnceWith(SESSION);
      },
    );

    it('permits a provider outage but measures a later readable session', async () => {
      mockClerkGetSession
        .mockRejectedValueOnce(new Error('provider unavailable'))
        .mockResolvedValue(providerSession({ createdAt: NOW - HOUR_MS }));

      await expect(authenticate(transport)).resolves.toMatchObject({ userId: ACCOUNT });
      await expect(authenticate(transport)).rejects.toMatchObject({ statusCode: 401 });
      expect(mockClerkGetSession).toHaveBeenCalledTimes(2);
      expect(unreadableSessionStartCount()).toBe(1);
    });

    it('preserves accounts whose product id already equals their native subject', async () => {
      db.identities.delete(`clerk:${NATIVE}`);
      if (transport === 'appeal') db.accountStatuses.set(NATIVE, 'suspended');

      await expect(authenticate(transport)).resolves.toMatchObject({ userId: NATIVE });
      expect(mockClerkGetSession).toHaveBeenCalledExactlyOnceWith(SESSION);
      expect(unreadableSessionStartCount()).toBe(0);
    });
  });

  it.each(['cookie', 'bearer'] as const)(
    'propagates both identities into the passkey-required sighting for %s auth',
    async (transport) => {
      const query = mockNeonQuery.getMockImplementation() as (
        sql: string,
        params?: unknown[],
      ) => Promise<FakeRow[]>;
      mockNeonQuery.mockImplementation((sql: string, params: unknown[] = []) => {
        if (sql.toLowerCase().includes('from public.account_security_enrollments')) {
          return Promise.resolve([{ enrolled_at: new Date(NOW - HOUR_MS) }]);
        }
        return query(sql, params);
      });
      const request = requestFor(transport);

      await expect(authenticate(transport, request)).rejects.toSatisfy(isPasskeyRequiredError);
      expect(noteSessionSighting).toHaveBeenCalledExactlyOnceWith(
        ACCOUNT,
        NATIVE,
        SESSION,
        request,
      );
      expect(mockClerkGetSession).toHaveBeenCalledExactlyOnceWith(SESSION);
      expect(mockClerkRevokeSession).not.toHaveBeenCalled();
    },
  );

  it('does not invent a native session for an API credential', async () => {
    const { ApiKeyService } = await import('@/lib/services/api-key-service');
    const { getNeonDb } = await import('@/lib/server/neon-db');
    const { rawKey } = await ApiKeyService.createApiKey(getNeonDb(), ACCOUNT, 'scoped', [
      'models:read',
    ]);

    await expect(
      getClerkAuthUser(makeBearerRequest(rawKey), { apiKeyScope: 'models:read' }),
    ).resolves.toEqual({ userId: ACCOUNT, apiKeyId: 'key-1' });
    expect(mockClerkGetSession).not.toHaveBeenCalled();
    expect(mockClerkRevokeSession).not.toHaveBeenCalled();
    expect(noteSessionSighting).not.toHaveBeenCalled();
  });

  it('does not invent a native session for a developer credential', async () => {
    const token = jwt.sign(
      { userId: ACCOUNT, sub: ACCOUNT, surface: 'developer' },
      TEST_DEVELOPER_JWT_SECRET,
      {
        expiresIn: 3600,
        issuer: 'agiworkforce-api-gateway',
        audience: 'agiworkforce',
        jwtid: 'mapped-device-credential',
      },
    );

    await expect(getClerkAuthUser(makeBearerRequest(token))).resolves.toEqual({
      userId: ACCOUNT,
      surfaceClass: 'developer',
    });
    expect(mockClerkGetSession).not.toHaveBeenCalled();
    expect(mockClerkRevokeSession).not.toHaveBeenCalled();
    expect(noteSessionSighting).not.toHaveBeenCalled();
  });
});
