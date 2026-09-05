import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockGetSubscription, mockGetClerkAuthUser } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockGetSubscription: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  })),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: (...args: unknown[]) => mockGetSubscription(...args) },
}));

import { POST as VERIFY, PUT as REISSUE } from '../verify-domain/route';
import {
  DOMAIN_VERIFICATION_CHALLENGE_TTL_MS,
  domainChallengeExpiresAt,
  issueDomainVerificationToken,
} from '@/lib/server/sso/domain-verification';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const DOMAIN = 'example.com';

const ISSUED_AT = Date.UTC(2026, 0, 1, 0, 0, 0);

function req(method: string) {
  return new Request('http://localhost/api/admin/sso/verify-domain', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ connectionId: CONNECTION_ID }),
  }) as never;
}

function draftRow(token: string | null) {
  return {
    id: CONNECTION_ID,
    organization_id: ORG_ID,
    provider_type: 'saml',
    domain: DOMAIN,
    display_name: 'Okta',
    metadata_url: 'https://example.okta.com/app/abc/sso/saml/metadata',
    oidc_discovery_url: null,
    oidc_client_id: null,
    clerk_connection_id: null,
    acs_url: null,
    sp_entity_id: null,
    sp_metadata_url: null,
    domain_verified_at: null,
    domain_verification_token: token,
    attribute_mapping: {},
    is_active: false,
    created_by: 'owner-user',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function withDraft(token: string | null) {
  const writes: { sql: string; params: unknown[] }[] = [];
  mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.startsWith('select role from organization_members')) return [{ role: 'owner' }];
    if (text.includes('from sso_connections where id =')) return [draftRow(token)];
    if (text.startsWith('update sso_connections')) {
      writes.push({ sql: text, params });
      const nextToken = typeof params[1] === 'string' ? (params[1] as string) : (token ?? null);
      return [
        {
          ...draftRow(nextToken),
          ...(text.includes('domain_verified_at = now()')
            ? { domain_verified_at: '2026-01-08T00:00:00.000Z', domain_verification_token: null }
            : {}),
        },
      ];
    }
    throw new Error(`unexpected sql in test: ${text}`);
  });
  return writes;
}

describe('POST /api/admin/sso/verify-domain, challenge expiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'owner-user' });
    mockGetSubscription.mockResolvedValue({ plan_tier: 'enterprise', status: 'active' });
    mockExecute.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses a challenge whose window has passed', async () => {
    const token = issueDomainVerificationToken(ISSUED_AT);
    vi.useFakeTimers();
    vi.setSystemTime(ISSUED_AT + DOMAIN_VERIFICATION_CHALLENGE_TTL_MS + 60_000);

    const writes = withDraft(token);
    const response = await VERIFY(req('POST'));

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      verified: boolean;
      reason: string;
      error: string;
      domainVerification: unknown;
    };
    expect(body.verified).toBe(false);
    expect(body.reason).toBe('challenge_expired');
    expect(body.error).toMatch(/expired/i);
    expect(body.domainVerification).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it('refuses a token issued before challenges carried an expiry', async () => {
    const writes = withDraft('a'.repeat(48));

    const response = await VERIFY(req('POST'));

    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('challenge_expired');
    expect(writes).toHaveLength(0);
  });

  it('still verifies while the challenge is live', async () => {
    const token = issueDomainVerificationToken(ISSUED_AT);
    vi.useFakeTimers();
    vi.setSystemTime(ISSUED_AT + 60_000);

    const writes = withDraft(token);

    const dns = await import('node:dns/promises');
    vi.spyOn(dns.Resolver.prototype, 'resolveTxt').mockResolvedValue([
      [`agiworkforce-sso-verification=${token}`],
    ]);

    const response = await VERIFY(req('POST'));

    expect(response.status).toBe(200);
    expect((await response.json()).verified).toBe(true);
    expect(writes.some((w) => w.sql.includes('domain_verified_at = now()'))).toBe(true);
  });

  it('cannot be replayed against an already-verified connection', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
      if (text.startsWith('select role from organization_members')) return [{ role: 'owner' }];
      if (text.includes('from sso_connections where id =')) {
        return [
          {
            ...draftRow(null),
            domain_verified_at: '2026-01-08T00:00:00.000Z',
            clerk_connection_id: 'conn_live',
          },
        ];
      }
      throw new Error(`unexpected sql in test: ${text}`);
    });

    const dns = await import('node:dns/promises');
    const resolveTxt = vi.spyOn(dns.Resolver.prototype, 'resolveTxt');

    const response = await VERIFY(req('POST'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      verified: boolean;
      connection: { domainVerification: unknown; domainChallengeExpiresAt: string | null };
    };
    expect(body.verified).toBe(true);
    expect(resolveTxt).not.toHaveBeenCalled();
    expect(body.connection.domainVerification).toBeNull();
    expect(body.connection.domainChallengeExpiresAt).toBeNull();
  });

  it('reissues a challenge that is live again, and advertises its deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(ISSUED_AT + DOMAIN_VERIFICATION_CHALLENGE_TTL_MS + 60_000);

    const writes = withDraft('a'.repeat(48));
    const response = await REISSUE(req('PUT'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      connection: { domainChallengeExpiresAt: string | null };
      domainVerification: { recordValue: string };
    };

    const issued = writes[0]?.params[1] as string;
    expect(typeof issued).toBe('string');
    expect(body.domainVerification.recordValue).toBe(`agiworkforce-sso-verification=${issued}`);

    const expiresAt = domainChallengeExpiresAt(issued);
    expect(expiresAt).not.toBeNull();
    expect(expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(body.connection.domainChallengeExpiresAt).toBe(expiresAt!.toISOString());
  });
});
