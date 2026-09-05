import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockGetSubscription, mockGetClerkAuthUser, mockLoggerError } =
  vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockExecute: vi.fn(),
    mockGetSubscription: vi.fn(),
    mockGetClerkAuthUser: vi.fn(),
    mockLoggerError: vi.fn(),
  }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: mockLoggerError, warn: vi.fn(), debug: vi.fn() },
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
vi.mock('@/lib/server/sso/domain-verification', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/sso/domain-verification')>();
  return { ...actual, verifyDomainOwnership: vi.fn(async () => ({ verified: true })) };
});

import { POST as VERIFY, PUT as REISSUE } from '../verify-domain/route';
import { issueDomainVerificationToken } from '@/lib/server/sso/domain-verification';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = issueDomainVerificationToken();

function req(method: string) {
  return new Request('http://localhost/api/admin/sso/verify-domain', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ connectionId: CONNECTION_ID }),
  }) as never;
}

const DRAFT_ROW = {
  id: CONNECTION_ID,
  organization_id: ORG_ID,
  provider_type: 'saml',
  domain: 'example.com',
  display_name: 'Okta',
  metadata_url: 'https://example.okta.com/app/abc/sso/saml/metadata',
  oidc_discovery_url: null,
  oidc_client_id: null,
  clerk_connection_id: null,
  acs_url: null,
  sp_entity_id: null,
  sp_metadata_url: null,
  domain_verified_at: null,
  domain_verification_token: TOKEN,
  attribute_mapping: {},
  is_active: false,
  created_by: 'owner-user',
  created_at: '2026-08-04T00:00:00.000Z',
  updated_at: '2026-08-04T00:00:00.000Z',
};

function dbFailingOn(match: string, error: Error) {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.includes(match)) throw error;
    if (text.startsWith('select role from organization_members')) return [{ role: 'owner' }];
    if (text.includes('from sso_connections where id =')) return [{ ...DRAFT_ROW }];
    throw new Error(`unexpected sql in test: ${text}`);
  });
}

function pgError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('SSO domain verification under backend failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'owner-user' });
    mockGetSubscription.mockResolvedValue({ plan_tier: 'enterprise', status: 'active' });
    mockExecute.mockResolvedValue(undefined);
  });

  it('reports an unreachable database as 503, not as an unverified domain', async () => {
    dbFailingOn('from sso_connections where id =', new Error('fetch failed'));

    const response = await VERIFY(req('POST'));

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string; verified?: boolean };
    expect(body.error).toBe('Database temporarily unavailable');
    expect(body.verified).toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('reports a missing sso_connections relation as a server fault with telemetry', async () => {
    dbFailingOn(
      'from sso_connections where id =',
      pgError('42P01', 'relation "sso_connections" does not exist'),
    );

    const response = await VERIFY(req('POST'));

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('Internal server error');
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('reports a failed membership lookup as a server fault rather than a 403', async () => {
    dbFailingOn('from organization_members', new Error('fetch failed'));

    const response = await VERIFY(req('POST'));

    expect(response.status).toBe(503);
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('maps the same failure the same way when reissuing a challenge', async () => {
    dbFailingOn('from sso_connections where id =', new Error('fetch failed'));

    const response = await REISSUE(req('PUT'));

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('Database temporarily unavailable');
  });

  it('returns 409, not 500, when another organization wins the verification race', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
      if (text.startsWith('select role from organization_members')) return [{ role: 'owner' }];
      if (text.includes('from sso_connections where id =')) return [{ ...DRAFT_ROW }];
      if (text.startsWith('update sso_connections set domain_verified_at = now()')) {
        throw pgError(
          '23505',
          'duplicate key value violates unique constraint "idx_sso_connections_domain_verified"',
        );
      }
      throw new Error(`unexpected sql in test: ${text}`);
    });

    const response = await VERIFY(req('POST'));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/already been verified by another organization/);
  });
});
