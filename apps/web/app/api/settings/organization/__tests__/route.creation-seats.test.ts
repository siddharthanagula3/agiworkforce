import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockTransaction, mockTeamAccess, mockRetrieveSubscription } =
  vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockExecute: vi.fn(),
    mockTransaction: vi.fn(),
    mockTeamAccess: vi.fn(),
    mockRetrieveSubscription: vi.fn(),
  }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'team-owner' })),
}));
vi.mock('@shared/utils/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/utils/env')>()),
  requireEnv: vi.fn(() => 'sk_test_dummy'),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  getTeamAdminAccess: (...args: unknown[]) => mockTeamAccess(...args),
  requireTeamAdminAccess: (...args: unknown[]) => mockTeamAccess(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  })),
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    subscriptions = { retrieve: mockRetrieveSubscription };
  },
}));

import { POST } from '../route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const organization = {
  id: organizationId,
  name: 'Demo Team',
  slug: 'demo-team',
  created_by: 'team-owner',
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
};

function createRequest() {
  return new Request('http://localhost:3000/api/settings/organization', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Demo Team', slug: 'demo-team' }),
  }) as never;
}

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    plan_tier: 'team',
    status: 'active',
    stripe_subscription_id: 'sub_live123',
    stripe_customer_id: 'cus_live123',
    ...overrides,
  };
}

function stubQueries(subscription: Record<string, unknown>) {
  mockQuery.mockImplementation(async (sql: unknown) => {
    const text = String(sql);
    if (text.includes('from public.subscriptions')) return [subscription];
    if (text.includes('insert into public.organizations')) return [organization];
    if (text.includes('from public.organization_members')) return [];
    if (text.includes('pg_advisory_xact_lock')) return [];
    throw new Error(`Unexpected query: ${text}`);
  });
}

function insertCall() {
  return mockQuery.mock.calls.find(([sql]) =>
    String(sql).includes('insert into public.organizations'),
  );
}

describe('POST /api/settings/organization, purchased seats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTeamAccess.mockResolvedValue({ plan: 'team', canManageTeam: true, maxMembers: null });
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => mockQuery(...args),
        execute: (...args: unknown[]) => mockExecute(...args),
      }),
    );
  });

  it('lands the seat count the buyer paid for, because the purchase precedes the organization', async () => {
    stubQueries(subscriptionRow());
    mockRetrieveSubscription.mockResolvedValueOnce({ items: { data: [{ quantity: 5 }] } });

    const response = await POST(createRequest());

    expect(response.status).toBe(201);
    expect(mockRetrieveSubscription).toHaveBeenCalledWith('sub_live123');
    const [sql, params] = insertCall() ?? [];
    expect(String(sql)).toContain('licensed_seats');
    expect(params).toEqual(['Demo Team', 'demo-team', 'team-owner', 5, 'team']);
    expect(String(sql)).not.toContain('stripe_subscription_id');
    expect(String(sql)).not.toContain('stripe_customer_id');
  });

  it('answers a caller who already has an organization without calling Stripe', async () => {
    mockQuery.mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes('from public.organization_members')) {
        return [{ organization_id: organizationId, user_id: 'team-owner', role: 'owner' }];
      }
      throw new Error(`Unexpected query: ${text}`);
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(409);
    expect(mockRetrieveSubscription).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses to create the organization when the paid seat count cannot be read', async () => {
    stubQueries(subscriptionRow());
    mockRetrieveSubscription.mockRejectedValueOnce(new Error('Stripe is unreachable'));

    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(insertCall()).toBeUndefined();
  });

  it('does not invent seats for a plan that is not sold by the seat', async () => {
    stubQueries(subscriptionRow({ plan_tier: 'pro' }));

    const response = await POST(createRequest());

    expect(response.status).toBe(201);
    expect(mockRetrieveSubscription).not.toHaveBeenCalled();
    const [, params] = insertCall() ?? [];
    expect(params).toEqual(['Demo Team', 'demo-team', 'team-owner', 1, null]);
  });

  it('ignores a seat quantity carried by a lapsed subscription', async () => {
    stubQueries(subscriptionRow({ status: 'canceled' }));

    const response = await POST(createRequest());

    expect(response.status).toBe(201);
    expect(mockRetrieveSubscription).not.toHaveBeenCalled();
    const [, params] = insertCall() ?? [];
    expect(params?.[3]).toBe(1);
  });
});
