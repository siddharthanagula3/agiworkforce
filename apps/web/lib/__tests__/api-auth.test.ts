
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

const mockAuth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

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

type FakeRow = Record<string, unknown>;

function makeFakeDb() {
  const store = new Map<string, FakeRow>();
  const revokedJtis = new Set<string>();
  let counter = 0;

  async function query(sql: string, params: unknown[] = []): Promise<FakeRow[]> {
    const s = sql.toLowerCase();

    if (s.includes('from profiles')) {
      return [];
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
  return { store, revokedJtis };
}

import { POST as createApiKeyRoute } from '@/app/api/settings/api-keys/route';
import { DELETE as revokeApiKeyRoute } from '@/app/api/settings/api-keys/[keyId]/route';
import { getClerkAuthUser } from '@/lib/api-auth';

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
  });

  it('issue → authenticate round trip: a key from the real POST route authenticates via the real Bearer path', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValueOnce({ userId: 'user-round-trip' });
    const createRes = await createApiKeyRoute(makeCreateRequest());
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      api_key: { id: string; scopes: string[] };
      full_key: string;
    };
    expect(created.full_key).toMatch(/^sk_live_[0-9a-f]{16}_[0-9a-f]{48}$/);
    expect(created.api_key.scopes).toEqual(['models:read', 'inference:write']);

    mockAuth.mockResolvedValueOnce({ userId: null });
    const authResult = await getClerkAuthUser(makeBearerRequest(created.full_key), {
      apiKeyScope: 'inference:write',
    });

    expect(authResult).toEqual({ userId: 'user-round-trip' });
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('enforces the selected scope and denies API keys on routes without an API-key contract', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValueOnce({ userId: 'scoped-user' });
    const createRes = await createApiKeyRoute(makeCreateRequest('models only', ['models:read']));
    const created = (await createRes.json()) as { full_key: string };

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
    mockAuth.mockResolvedValueOnce({ userId: 'scope-required-user' });

    const response = await createApiKeyRoute(makeCreateRequest('scope-less', []));

    expect(response.status).toBe(400);
  });

  it('rejects a key after it is revoked through the real DELETE route', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValueOnce({ userId: 'user-revoke-me' });
    const createRes = await createApiKeyRoute(makeCreateRequest());
    const created = (await createRes.json()) as { api_key: { id: string }; full_key: string };

    mockAuth.mockResolvedValueOnce({ userId: 'user-revoke-me' });
    const { req, ctx } = makeRevokeRequest(created.api_key.id);
    const revokeRes = await revokeApiKeyRoute(req, ctx);
    expect(revokeRes.status).toBe(200);

    mockAuth.mockResolvedValueOnce({ userId: null });
    await expect(
      getClerkAuthUser(makeBearerRequest(created.full_key), {
        apiKeyScope: 'inference:write',
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a malformed sk_live_-shaped key without a matching DB row', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValueOnce({ userId: null });
    await expect(
      getClerkAuthUser(makeBearerRequest('sk_live_0000000000000000_not_a_real_secret_at_all'), {
        apiKeyScope: 'inference:write',
      }),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(mockNeonQuery).toHaveBeenCalled();
  });

  it('rejects a too-short sk_live_ token before any DB lookup (parse-time rejection)', async () => {
    makeFakeDb();

    mockAuth.mockResolvedValueOnce({ userId: null });
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
      mockAuth.mockResolvedValueOnce({ userId: 'clerk-session-user' });
      mockVerifyToken.mockRejectedValueOnce(new Error('invalid token'));

      await expect(
        getClerkAuthUser(makeBearerRequest('irrelevant-because-session-wins')),
      ).rejects.toMatchObject({ statusCode: 401 });

      expect(mockAuth).not.toHaveBeenCalled();
    });

    it('an Authorization header of exactly "Bearer " (empty token) normalizes away and is treated as no bearer at all', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce({ userId: 'clerk-session-user' });

      const req = new NextRequest('http://localhost/api/some-route', {
        headers: { authorization: 'Bearer ' },
      });
      expect(req.headers.get('authorization')).toBe('Bearer');
      expect(req.headers.get('authorization')?.startsWith('Bearer ')).toBe(false);

      const result = await getClerkAuthUser(req);
      expect(result).toEqual({ userId: 'clerk-session-user' });
    });

    it('a verified bearer resolves a DIFFERENT user than the cookie would have — bearer wins, cookie principal is never returned', async () => {
      makeFakeDb();
      const { ApiKeyService } = await import('@/lib/services/api-key-service');
      const { getNeonDb } = await import('@/lib/server/neon-db');
      const { rawKey } = await ApiKeyService.createApiKey(getNeonDb(), 'user-a-bearer', 'k', [
        'inference:write',
      ]);

      mockAuth.mockResolvedValueOnce({ userId: 'user-b-cookie' });

      const result = await getClerkAuthUser(makeBearerRequest(rawKey), {
        apiKeyScope: 'inference:write',
      });

      expect(result).toEqual({ userId: 'user-a-bearer' });
      expect(mockAuth).not.toHaveBeenCalled();
    });

    it('a verified bearer resolves the same user the cookie session has — auth() is still never consulted', async () => {
      makeFakeDb();
      const { ApiKeyService } = await import('@/lib/services/api-key-service');
      const { getNeonDb } = await import('@/lib/server/neon-db');
      const { rawKey } = await ApiKeyService.createApiKey(getNeonDb(), 'same-user', 'k', [
        'inference:write',
      ]);

      mockAuth.mockResolvedValueOnce({ userId: 'same-user' });

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
      mockAuth.mockResolvedValueOnce({ userId: 'clerk-session-user' });

      const req = new NextRequest('http://localhost/api/some-route');
      const result = await getClerkAuthUser(req);

      expect(result).toEqual({ userId: 'clerk-session-user' });
      expect(queriedApiKeysTable()).toBe(false);
    });

    it('Path 2b (Clerk Bearer JWT) still authenticates via verifyToken when there is no cookie session', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce({ userId: null });
      mockVerifyToken.mockResolvedValueOnce({ sub: 'clerk-jwt-user', email: 'user@example.com' });
      process.env['CLERK_SECRET_KEY'] = 'test-clerk-secret-key';

      const result = await getClerkAuthUser(
        makeBearerRequest('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjbGVyay1qd3QtdXNlciJ9.sig'),
      );

      expect(result).toEqual({ userId: 'clerk-jwt-user', email: 'user@example.com' });
      expect(queriedApiKeysTable()).toBe(false);
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
    });

    it('rejects a garbage Bearer token when there is no cookie session either', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce({ userId: null });
      mockVerifyToken.mockRejectedValueOnce(new Error('invalid token'));

      await expect(
        getClerkAuthUser(makeBearerRequest('garbage-not-a-key-or-jwt')),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('rejects when there is no Authorization header and no Clerk session at all', async () => {
      makeFakeDb();
      mockAuth.mockResolvedValueOnce({ userId: null });

      const req = new NextRequest('http://localhost/api/some-route');
      await expect(getClerkAuthUser(req)).rejects.toMatchObject({ statusCode: 401 });
    });
  });
});
