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
const SECOND_ORG_ID = '33333333-3333-4333-8333-333333333333';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const CALLER = 'owner-user';
const ORG_OWNER = 'org-owner';

interface WorldOrganization {
  id: string;
  role: string;
  billingUserId: string;
}

const world = {
  organizations: [] as WorldOrganization[],
  subscriptions: new Map<string, { plan_tier: string; status: string }>(),
};

function norm(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim().toLowerCase();
}

function answer(sql: string, params: unknown[] = []): unknown[] {
  const q = norm(sql);
  if (q === 'select organization_id, role from organization_members where user_id = $1') {
    return world.organizations.map(({ id, role }) => ({ organization_id: id, role }));
  }
  if (q.startsWith('select organization_id from organization_members where user_id = $1')) {
    return world.organizations
      .filter(({ role }) => role === 'owner' || role === 'admin')
      .map(({ id }) => ({ organization_id: id }));
  }
  if (q.startsWith('select role from organization_members where organization_id = $1')) {
    const organization = world.organizations.find(({ id }) => id === params[0]);
    return organization ? [{ role: organization.role }] : [];
  }
  if (q.includes('from public.organizations o left join public.subscriptions s')) {
    const organization = world.organizations.find(({ id }) => id === params[0]);
    const billing = organization ? world.subscriptions.get(organization.billingUserId) : undefined;
    return [
      {
        user_id: billing ? organization!.billingUserId : null,
        plan_tier: billing?.plan_tier ?? null,
        status: billing?.status ?? null,
      },
    ];
  }
  return [];
}

function connectionStatements(): string[] {
  return mockQuery.mock.calls
    .map(([sql]) => norm(String(sql)))
    .filter((sql) => sql.includes('sso_connections'));
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

function ownOrganizationOn(planTier: string, status = 'active') {
  world.organizations = [{ id: ORG_ID, role: 'owner', billingUserId: CALLER }];
  world.subscriptions = new Map([[CALLER, { plan_tier: planTier, status }]]);
}

const VALID_CREATE_BODY = {
  organization_id: ORG_ID,
  provider_type: 'saml' as const,
  domain: 'example.com',
  metadata_url: 'https://example.okta.com/app/abc/sso/saml/metadata',
};

beforeEach(() => {
  vi.clearAllMocks();
  ownOrganizationOn('enterprise');
  mockGetClerkAuthUser.mockResolvedValue({ userId: CALLER });
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => answer(sql, params));
  mockExecute.mockResolvedValue(undefined);
  mockGetSubscription.mockImplementation(
    async (_db: unknown, userId: string) => world.subscriptions.get(userId) ?? null,
  );
});

describe('SSO entitlement gate', () => {
  const deniedPlans = ['local-only', 'byok', 'free', 'basic', 'pro', 'max', 'max_15x', 'team'];

  it.each(deniedPlans)('refuses GET for an organization on %s', async (plan) => {
    ownOrganizationOn(plan);

    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string; currentPlan: string };
    expect(body.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(body.currentPlan).toBe(plan);
    expect(connectionStatements()).toEqual([]);
  });

  it.each(deniedPlans)('refuses POST for an organization on %s before any write', async (plan) => {
    ownOrganizationOn(plan);

    const response = await POST(
      jsonRequest('http://localhost/api/admin/sso', 'POST', VALID_CREATE_BODY),
    );

    expect(response.status).toBe(403);
    expect(connectionStatements()).toEqual([]);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it.each(deniedPlans)('refuses DELETE for an organization on %s', async (plan) => {
    ownOrganizationOn(plan);

    const response = await DELETE(
      jsonRequest(`http://localhost/api/admin/sso?id=${CONNECTION_ID}`, 'DELETE'),
    );

    expect(response.status).toBe(403);
    expect(connectionStatements()).toEqual([]);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it.each(deniedPlans)('refuses PATCH for an organization on %s', async (plan) => {
    ownOrganizationOn(plan);

    const response = await PATCH(
      jsonRequest(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', {
        is_active: true,
      }),
      { params: Promise.resolve({ id: CONNECTION_ID }) },
    );

    expect(response.status).toBe(403);
    expect(connectionStatements()).toEqual([]);
  });

  it.each(deniedPlans)('refuses domain verification for an organization on %s', async (plan) => {
    ownOrganizationOn(plan);

    const response = await VERIFY_POST(
      jsonRequest('http://localhost/api/admin/sso/verify-domain', 'POST', {
        connectionId: CONNECTION_ID,
      }),
    );

    expect(response.status).toBe(403);
    expect(connectionStatements()).toEqual([]);
  });

  it('records the denial as a security event so repeated probing is visible', async () => {
    ownOrganizationOn('pro');

    await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: CALLER,
        eventType: 'authorization_failed',
        details: expect.objectContaining({ action: 'sso-entitlement-denied', plan: 'pro' }),
      }),
    );
  });

  it('fails closed when the organization has no subscription at all', async () => {
    world.subscriptions.clear();

    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(403);
    expect(connectionStatements()).toEqual([]);
  });

  it('fails closed for an organization whose Enterprise subscription has lapsed', async () => {
    ownOrganizationOn('enterprise', 'canceled');

    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(403);
  });

  it('admits the owner of an organization on an active Enterprise plan', async () => {
    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { access: { plan: string; canManageSSO: boolean } };
    expect(body.access).toEqual({ plan: 'enterprise', canManageSSO: true });
  });

  it('admits an administrator on a free personal plan when the organization holds Enterprise', async () => {
    world.organizations = [{ id: ORG_ID, role: 'admin', billingUserId: ORG_OWNER }];
    world.subscriptions = new Map([[ORG_OWNER, { plan_tier: 'enterprise', status: 'active' }]]);

    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { access: { plan: string; canManageSSO: boolean } };
    expect(body.access).toEqual({ plan: 'enterprise', canManageSSO: true });
  });

  it('refuses an administrator holding Enterprise personally when the organization does not', async () => {
    world.organizations = [{ id: ORG_ID, role: 'admin', billingUserId: ORG_OWNER }];
    world.subscriptions = new Map([
      [ORG_OWNER, { plan_tier: 'team', status: 'active' }],
      [CALLER, { plan_tier: 'enterprise', status: 'active' }],
    ]);

    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
      currentPlan: 'team',
    });
  });

  it('refuses to configure an organization that is not on Enterprise while another one is', async () => {
    world.organizations = [
      { id: ORG_ID, role: 'owner', billingUserId: CALLER },
      { id: SECOND_ORG_ID, role: 'owner', billingUserId: ORG_OWNER },
    ];
    world.subscriptions = new Map([
      [CALLER, { plan_tier: 'enterprise', status: 'active' }],
      [ORG_OWNER, { plan_tier: 'team', status: 'active' }],
    ]);

    const response = await POST(
      jsonRequest('http://localhost/api/admin/sso', 'POST', {
        ...VALID_CREATE_BODY,
        organization_id: SECOND_ORG_ID,
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
      currentPlan: 'team',
    });
    expect(connectionStatements()).toEqual([]);
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          action: 'sso-entitlement-denied',
          organization_id: SECOND_ORG_ID,
          plan: 'team',
        }),
      }),
    );
  });

  it('lists connections only for the organizations whose plan includes SSO', async () => {
    world.organizations = [
      { id: ORG_ID, role: 'owner', billingUserId: CALLER },
      { id: SECOND_ORG_ID, role: 'admin', billingUserId: ORG_OWNER },
    ];
    world.subscriptions = new Map([
      [CALLER, { plan_tier: 'enterprise', status: 'active' }],
      [ORG_OWNER, { plan_tier: 'team', status: 'active' }],
    ]);

    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(200);
    const listed = mockQuery.mock.calls.find(([sql]) =>
      norm(String(sql)).includes('from sso_connections where organization_id = any($1)'),
    );
    expect(listed?.[1]).toEqual([[ORG_ID]]);
  });

  it('rejects an unauthenticated caller before consulting billing', async () => {
    mockGetClerkAuthUser.mockRejectedValue(new Error('no session'));

    const response = await GET(jsonRequest('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(401);
    expect(mockGetSubscription).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('getSSOAdminAccess', () => {
  const db = { query: mockQuery, execute: mockExecute } as never;

  it('derives the answer from the capability catalog, not a tier ordering', async () => {
    await expect(getSSOAdminAccess(db, CALLER)).resolves.toEqual({
      plan: 'enterprise',
      canManageSSO: true,
    });

    ownOrganizationOn('team');
    await expect(getSSOAdminAccess(db, CALLER)).resolves.toEqual({
      plan: 'team',
      canManageSSO: false,
    });
  });

  it('counts only the organizations the caller administers', async () => {
    world.organizations = [{ id: ORG_ID, role: 'member', billingUserId: ORG_OWNER }];
    world.subscriptions = new Map([[ORG_OWNER, { plan_tier: 'enterprise', status: 'active' }]]);

    await expect(getSSOAdminAccess(db, CALLER)).resolves.toEqual({
      plan: 'free',
      canManageSSO: false,
    });
  });
});
