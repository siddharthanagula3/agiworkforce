import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockGetSubscription, mockGetClerkAuthUser, mockLogSecurityEvent } =
  vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockExecute: vi.fn(),
    mockGetSubscription: vi.fn(),
    mockGetClerkAuthUser: vi.fn(),
    mockLogSecurityEvent: vi.fn(),
  }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...args),
  recordAuditEvent: vi.fn(async () => undefined),
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

import { DELETE, GET, POST } from '../route';
import { PATCH } from '../[id]/route';
import { POST as VERIFY_POST } from '../verify-domain/route';
import { getSSOAdminAccess } from '@/lib/server/sso/sso-access';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

function onPlan(planTier: string) {
  mockGetSubscription.mockResolvedValue({ plan_tier: planTier, status: 'active' });
}

const VALID_CREATE_BODY = {
  organization_id: ORG_ID,
  provider_type: 'saml' as const,
  domain: 'example.com',
  metadata_url: 'https://example.okta.com/app/abc/sso/saml/metadata',
};

describe('SSO entitlement gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'owner-user' });
    mockQuery.mockResolvedValue([]);
    mockExecute.mockResolvedValue(undefined);
  });

  const deniedPlans = ['local-only', 'byok', 'free', 'basic', 'pro', 'max', 'max_15x', 'team'];

  it.each(deniedPlans)('refuses GET for a %s subscriber', async (plan) => {
    onPlan(plan);

    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string; currentPlan: string };
    expect(body.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(body.currentPlan).toBe(plan);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each(deniedPlans)('refuses POST for a %s subscriber before any write', async (plan) => {
    onPlan(plan);

    const response = await POST(
      jsonRequest('http://localhost/api/admin/sso', 'POST', VALID_CREATE_BODY),
    );

    expect(response.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it.each(deniedPlans)('refuses DELETE for a %s subscriber', async (plan) => {
    onPlan(plan);

    const response = await DELETE(
      jsonRequest(`http://localhost/api/admin/sso?id=${CONNECTION_ID}`, 'DELETE'),
    );

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it.each(deniedPlans)('refuses PATCH for a %s subscriber', async (plan) => {
    onPlan(plan);

    const response = await PATCH(
      jsonRequest(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', {
        is_active: true,
      }),
      { params: Promise.resolve({ id: CONNECTION_ID }) },
    );

    expect(response.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each(deniedPlans)('refuses domain verification for a %s subscriber', async (plan) => {
    onPlan(plan);

    const response = await VERIFY_POST(
      jsonRequest('http://localhost/api/admin/sso/verify-domain', 'POST', {
        connectionId: CONNECTION_ID,
      }),
    );

    expect(response.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('records the denial as a security event so repeated probing is visible', async () => {
    onPlan('pro');

    await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-user',
        eventType: 'authorization_failed',
        details: expect.objectContaining({ action: 'sso-entitlement-denied', plan: 'pro' }),
      }),
    );
  });

  it('fails closed when there is no subscription at all', async () => {
    mockGetSubscription.mockResolvedValue(null);

    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('fails closed for an enterprise plan whose subscription has lapsed', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'enterprise', status: 'canceled' });

    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(403);
  });

  it('admits an active enterprise subscriber', async () => {
    onPlan('enterprise');
    mockQuery.mockResolvedValueOnce([]);

    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { access: { plan: string; canManageSSO: boolean } };
    expect(body.access).toEqual({ plan: 'enterprise', canManageSSO: true });
  });

  it('rejects an unauthenticated caller before consulting billing', async () => {
    mockGetClerkAuthUser.mockRejectedValue(new Error('no session'));

    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(401);
    expect(mockGetSubscription).not.toHaveBeenCalled();
  });
});

describe('getSSOAdminAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('derives the answer from the capability catalog, not a tier ordering', async () => {
    const db = { query: mockQuery, execute: mockExecute } as never;

    mockGetSubscription.mockResolvedValue({ plan_tier: 'enterprise', status: 'active' });
    await expect(getSSOAdminAccess(db, 'u')).resolves.toEqual({
      plan: 'enterprise',
      canManageSSO: true,
    });

    mockGetSubscription.mockResolvedValue({ plan_tier: 'team', status: 'active' });
    await expect(getSSOAdminAccess(db, 'u')).resolves.toEqual({
      plan: 'team',
      canManageSSO: false,
    });
  });
});
