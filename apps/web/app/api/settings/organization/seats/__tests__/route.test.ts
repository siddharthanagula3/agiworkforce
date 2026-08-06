import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockRequireTeamAdminAccess } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockRequireTeamAdminAccess: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'org-a-admin' })),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: (...args: unknown[]) => mockRequireTeamAdminAccess(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: (...args: unknown[]) => mockQuery(...args) })),
}));

import * as seatsRoute from '../route';
import { GET } from '../route';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

const membership = {
  organization_id: ORG_A,
  user_id: 'org-a-admin',
  role: 'admin',
  provisioning_source: 'manual',
  provisioned_at: null,
  joined_at: '2026-07-23T00:00:00.000Z',
};

function get(organizationId: string) {
  return new Request(
    `http://localhost:3000/api/settings/organization/seats?organizationId=${organizationId}`,
  ) as never;
}

describe('GET /api/settings/organization/seats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTeamAdminAccess.mockResolvedValue({
      plan: 'team',
      canManageTeam: true,
      maxMembers: 10,
      seatsConsumed: 6,
      seatsAvailable: 4,
      seatSource: 'billing',
    });
  });

  it('exposes NO mutation, because licensed seats are what the customer paid for', () => {
    // A PATCH here would let an org admin grant themselves seats they never
    // bought. 0085 also rejects the write at the database from the app role.
    expect(seatsRoute).not.toHaveProperty('PATCH');
    expect(seatsRoute).not.toHaveProperty('PUT');
    expect(seatsRoute).not.toHaveProperty('POST');
    expect(seatsRoute).not.toHaveProperty('DELETE');
  });

  it('returns the seat state after proving membership in the named organization', async () => {
    mockQuery
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([
        {
          licensed_seats: 10,
          seats_consumed: 6,
          stripe_subscription_id: 'sub_live',
          owner_user_id: 'org-a-owner',
        },
      ])
      .mockResolvedValueOnce([{ pending_count: '2' }]);

    const response = await GET(get(ORG_A));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      seats: {
        licensedSeats: number;
        seatsConsumed: number;
        seatsAvailable: number;
        pendingInvitations: number;
        seatsWritable: boolean;
        seatSource: string;
      };
      currentUserRole: string;
    };

    expect(body.seats).toMatchObject({
      licensedSeats: 10,
      seatsConsumed: 6,
      seatsAvailable: 4,
      pendingInvitations: 2,
      seatsWritable: false,
      seatSource: 'billing',
    });
    expect(body.currentUserRole).toBe('admin');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([ORG_A, 'org-a-admin']);
  });

  it('says plainly when the seat count is not backed by a purchase yet', async () => {
    mockQuery
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([
        {
          licensed_seats: 2,
          seats_consumed: 2,
          stripe_subscription_id: null,
          owner_user_id: 'org-a-owner',
        },
      ])
      .mockResolvedValueOnce([{ pending_count: '0' }]);

    const response = await GET(get(ORG_A));
    const body = (await response.json()) as {
      seats: { seatSource: string; seatsWritableReason: string };
    };

    expect(body.seats.seatSource).toBe('unprovisioned');
    expect(body.seats.seatsWritableReason).toMatch(/billing provisioning/i);
  });

  it('refuses to report another organization seat count', async () => {
    mockQuery.mockResolvedValueOnce([]); // no membership in ORG_B

    const response = await GET(get(ORG_B));

    expect(response.status).toBe(403);
    // No seat row was read at all.
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('licensed_seats'))).toBe(
      false,
    );
  });

  it('rejects a missing or malformed organizationId', async () => {
    const response = await GET(
      new Request('http://localhost:3000/api/settings/organization/seats') as never,
    );
    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
