import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockTransaction, mockTeamAccess, mockPurchasedSeats } = vi.hoisted(
  () => ({
    mockQuery: vi.fn(),
    mockExecute: vi.fn(),
    mockTransaction: vi.fn(),
    mockTeamAccess: vi.fn(),
    mockPurchasedSeats: vi.fn(),
  }),
);

vi.mock('@/lib/server/purchased-seats', () => ({
  resolvePurchasedSeatsForOwner: (...args: unknown[]) => mockPurchasedSeats(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'team-owner' })),
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

import { GET, POST } from '../route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const organization = {
  id: organizationId,
  name: 'Demo Team',
  slug: 'demo-team',
  created_by: 'team-owner',
  created_at: '2026-07-25T00:00:00.000Z',
  updated_at: '2026-07-25T00:00:00.000Z',
};

function createRequest(body: unknown) {
  return new Request('http://localhost:3000/api/settings/organization', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('organization creation and plan response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no purchased-seat record recovered, which is the pre-existing
    // shape every assertion below was written against.
    mockPurchasedSeats.mockResolvedValue(null);
    mockTeamAccess.mockResolvedValue({
      plan: 'team',
      canManageTeam: true,
      maxMembers: null,
    });
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => mockQuery(...args),
        execute: (...args: unknown[]) => mockExecute(...args),
      }),
    );
  });

  it('creates one organization and its owner membership in the same transaction', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([organization]);
    mockExecute.mockResolvedValueOnce(1);

    const response = await POST(createRequest({ name: 'Demo Team', slug: 'demo-team' }));

    expect(response.status).toBe(201);
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockQuery.mock.calls[0]?.[0]).toContain('pg_advisory_xact_lock');
    expect(mockQuery.mock.calls[1]?.[0]).toContain('organization_members');
    expect(mockQuery.mock.calls[2]?.[0]).toContain('insert into public.organizations');
    // Nothing was recovered, so the insert must NOT name licensed_seats and the
    // row falls to migration 0085's default.
    expect(mockQuery.mock.calls[2]?.[0]).not.toContain('licensed_seats');
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.organization_members'),
      [organizationId, 'team-owner', 'owner'],
    );

    const body = (await response.json()) as {
      organization: { plan: string; maxMembers: number | null; currentUserRole: string };
    };
    expect(body.organization).toMatchObject({
      id: organizationId,
      plan: 'team',
      maxMembers: null,
      currentUserRole: 'owner',
    });
  });

  it('provisions the organization with the seat count the owner already paid for', async () => {
    // The buyer purchased Team seats before creating their organization, so the
    // webhook's owner-matched seat write returned `no_organization` and dropped
    // the count. Without adoption here the row lands on `licensed_seats default
    // 1` and the second invitation trips organizations_seats_within_license —
    // a 409 telling a paying customer to buy seats they already own.
    mockPurchasedSeats.mockResolvedValue({
      seats: 5,
      planTier: 'team',
      stripeSubscriptionId: 'sub_paid',
      stripeCustomerId: 'cus_paid',
    });
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([organization]);
    mockExecute.mockResolvedValueOnce(1);

    const response = await POST(createRequest({ name: 'Demo Team', slug: 'demo-team' }));

    expect(response.status).toBe(201);
    // Resolved before the transaction: a Stripe round trip must not be held
    // inside the advisory lock that serializes org creation for this user.
    expect(mockPurchasedSeats).toHaveBeenCalledBefore(mockTransaction);

    const [insertSql, insertParams] = mockQuery.mock.calls[2] as [string, unknown[]];
    expect(insertSql).toContain('insert into public.organizations');
    expect(insertSql).toContain('licensed_seats');
    expect(insertSql).toContain('seat_billing_updated_at');
    expect(insertParams).toEqual([
      'Demo Team',
      'demo-team',
      'team-owner',
      5,
      'team',
      'sub_paid',
      'cus_paid',
    ]);
    // seats_consumed is trigger-maintained (0085) and must never be written by
    // route code, even on the insert that provisions the license.
    expect(insertSql).not.toContain('seats_consumed');
  });

  it('refuses a second organization after the serialized membership check finds one', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        organization_id: organizationId,
        user_id: 'team-owner',
        role: 'owner',
      },
    ]);

    const response = await POST(createRequest({ name: 'Second Team', slug: 'second-team' }));

    expect(response.status).toBe(409);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('returns the status-gated subscription plan without inventing a member limit', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        organization_id: organizationId,
        user_id: 'team-owner',
        role: 'owner',
        provisioning_source: 'manual',
        provisioned_at: null,
        joined_at: '2026-07-25T00:00:00.000Z',
      },
    ]);
    mockQuery.mockResolvedValueOnce([{ ...organization, member_count: '1' }]);

    const response = await GET(
      new Request('http://localhost:3000/api/settings/organization') as never,
    );
    const body = (await response.json()) as {
      organization: { plan: string; maxMembers: number | null };
      access: { plan: string; canManageTeam: boolean; maxMembers: number | null };
    };

    expect(response.status).toBe(200);
    expect(body.organization).toMatchObject({ plan: 'team', maxMembers: null });
    expect(body.access).toEqual({
      plan: 'team',
      canManageTeam: true,
      maxMembers: null,
    });
  });
});
