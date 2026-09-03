import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockExecute = vi.fn();
const mockQuery = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    execute: mockExecute,
    query: mockQuery,
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

const mockGetUserScopedDb = vi.fn();
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));

const mockCreateApiKey = vi.fn();
vi.mock('@/lib/services/api-key-service', () => ({
  ApiKeyService: {
    createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
    revokeApiKey: vi.fn(),
  },
}));

import { NextRequest } from 'next/server';
import { recordAuditEvent, sanitizeAuditDetail, type AuditEventDetail } from '@/lib/security-audit';
import { POST as createApiKey } from '@/app/api/settings/api-keys/route';

const SECRETS = {
  agiApiKey: 'sk_live_0123456789abcdef_thisisthesecretpart',
  stripeTestKey: 'sk_test_51NabcdEFGHijklMNOPqrstUVWX',
  stripeWebhookSecret: 'whsec_9f8e7d6c5b4a39281706fedcba9876543210',
  clerkJwt:
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsImlhdCI6MTcwMDAwMDAwMH0.c2lnbmF0dXJlLXZhbHVlLWhlcmU',
  githubPat: 'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
  slackToken: 'xoxb-1234567890-0987654321-AbCdEfGhIjKlMnOpQrSt',
  scimBearer: 'Bearer scim_9c8b7a6d5e4f3g2h1i0j9k8l7m6n5o4p',
  privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhki\n-----END PRIVATE KEY-----',
  awsKeyId: 'AKIAIOSFODNN7EXAMPLE',
  samlAssertion:
    'PHNhbWxwOlJlc3BvbnNlIHhtbG5zOnNhbWxwPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6cHJvdG9jb2wi',
} as const;

const PROMPT_CONTENT =
  'User asked: my credit card is 4242 4242 4242 4242, please summarise the attached medical report.';

function lastExecuteParams(): unknown[] {
  const calls = mockExecute.mock.calls as Array<[string, unknown[]]>;
  const insert = calls.filter(([sql]) => /INSERT INTO security_audit_logs/i.test(sql)).at(-1);
  if (!insert) throw new Error('no audit INSERT was issued');
  return insert[1];
}

function lastDetails(): Record<string, unknown> {
  return JSON.parse(String(lastExecuteParams()[6])) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue(1);
  mockQuery.mockResolvedValue([]);
  mockGetUserScopedDb.mockImplementation(async () => {
    const authUser = await mockGetClerkAuthUser();
    return {
      db: {
        query: mockQuery,
        execute: mockExecute,
        transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
      },
      userId: authUser?.userId,
      organizationId: null,
    };
  });
});

describe('sanitizeAuditDetail — key allowlist', () => {
  it('drops every key that is not part of the documented detail shape', () => {
    const hostile = {
      resourceId: 'key_abc',
      apiKey: SECRETS.agiApiKey,
      token: SECRETS.clerkJwt,
      accessToken: SECRETS.clerkJwt,
      password: 'hunter2',
      authorization: SECRETS.scimBearer,
      samlAssertion: SECRETS.samlAssertion,
      messages: [PROMPT_CONTENT],
      prompt: PROMPT_CONTENT,
      stripeSecret: SECRETS.stripeWebhookSecret,
    } as unknown as AuditEventDetail;

    const safe = sanitizeAuditDetail(hostile);

    expect(safe).toEqual({ resourceId: 'key_abc' });
    const serialized = JSON.stringify(safe);
    for (const secret of Object.values(SECRETS)) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).not.toContain(PROMPT_CONTENT);
    expect(serialized).not.toContain('hunter2');
  });

  it('drops nested objects — the usual way message content leaks in', () => {
    const safe = sanitizeAuditDetail({
      resourceName: 'ok',
      source: { conversation: [PROMPT_CONTENT] },
    } as unknown as AuditEventDetail);

    expect(safe).toEqual({ resourceName: 'ok' });
  });

  it('returns an empty object for undefined / non-object input', () => {
    expect(sanitizeAuditDetail(undefined)).toEqual({});
    expect(sanitizeAuditDetail('sk_live_leak' as unknown as AuditEventDetail)).toEqual({});
  });
});

describe('sanitizeAuditDetail — value scrubbing', () => {
  for (const [label, secret] of Object.entries(SECRETS)) {
    it(`redacts a ${label} smuggled into an allowlisted field`, () => {
      const safe = sanitizeAuditDetail({ resourceName: secret });
      expect(safe['resourceName']).toBe('[redacted]');
      expect(JSON.stringify(safe)).not.toContain(secret);
    });
  }

  it('redacts secrets inside string arrays too', () => {
    const safe = sanitizeAuditDetail({ scopes: ['models:read', SECRETS.githubPat] });
    expect(safe['scopes']).toEqual(['models:read', '[redacted]']);
  });

  it('truncates long free-text so a pasted document cannot be stored', () => {
    const safe = sanitizeAuditDetail({ reason: 'a'.repeat(5000) });
    expect(String(safe['reason']).length).toBeLessThanOrEqual(256);
  });

  it('keeps ordinary identifiers, roles, plans and counts intact', () => {
    const safe = sanitizeAuditDetail({
      resourceId: 'b3f0c2de-4c1a-4f0e-9a77-2c6b8de9f012',
      targetUserId: 'user_2abcDEF456ghiJKL',
      role: 'admin',
      previousRole: 'member',
      planTier: 'enterprise',
      count: 12,
      isCurrent: true,
    });

    expect(safe).toEqual({
      resourceId: 'b3f0c2de-4c1a-4f0e-9a77-2c6b8de9f012',
      targetUserId: 'user_2abcDEF456ghiJKL',
      role: 'admin',
      previousRole: 'member',
      planTier: 'enterprise',
      count: 12,
      isCurrent: true,
    });
  });
});

describe('recordAuditEvent — persisted parameters carry no secret material', () => {
  it('scrubs secrets before they reach db.execute', async () => {
    await recordAuditEvent({
      userId: 'user_actor',
      eventType: 'api_key_created',
      endpoint: '/api/settings/api-keys',
      detail: {
        resourceId: 'key_abc',
        resourceName: SECRETS.agiApiKey,
      } as unknown as AuditEventDetail,
    });

    const serializedParams = JSON.stringify(lastExecuteParams());
    for (const secret of Object.values(SECRETS)) {
      expect(serializedParams).not.toContain(secret);
    }
    expect(lastDetails()['resourceName']).toBe('[redacted]');
  });
});

describe('POST /api/settings/api-keys — the generated key never lands in the audit row', () => {
  it('records the key id and label but not the secret', async () => {
    const rawKey = 'sk_live_9f2b7c1d4e6a8b0c_theActualSecretMaterialHere';

    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_actor' });
    mockQuery.mockResolvedValue([{ count: '0' }]);
    mockCreateApiKey.mockResolvedValue({
      apiKey: {
        id: 'key_abc',
        user_id: 'user_actor',
        name: 'CI deploy key',
        key_prefix: 'sk_live_9f2b',
        scopes: ['models:read'],
        created_at: '2026-08-04T00:00:00Z',
        last_used_at: null,
      },
      rawKey,
    });

    const response = await createApiKey(
      new NextRequest('https://app.example.com/api/settings/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'CI deploy key', scopes: ['models:read'] }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ full_key: rawKey });

    for (const [, params] of mockExecute.mock.calls as Array<[string, unknown[]]>) {
      expect(JSON.stringify(params)).not.toContain(rawKey);
    }

    const details = lastDetails();
    expect(details['resourceId']).toBe('key_abc');
    expect(details['resourceName']).toBe('CI deploy key');
    expect(JSON.stringify(details)).not.toContain(rawKey);
  });
});
