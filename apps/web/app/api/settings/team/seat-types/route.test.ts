import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  membership: vi.fn<() => Promise<string | null>>(async () => 'membership-1'),
  readSeatTypeSummary: vi.fn(),
  privileged: { privileged: true },
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ApiAuthModule>()),
  getClerkAuthUser: vi.fn(async () => ({ userId: 'member-1' })),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: vi.fn(() => mocks.privileged),
}));
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<ActiveWorkspaceServiceModule>()),
  resolveOrganizationMembershipId: mocks.membership,
}));
vi.mock('@/lib/services/team-seat-type-service', async (importOriginal) => ({
  ...(await importOriginal<TeamSeatTypeServiceModule>()),
  readSeatTypeSummary: mocks.readSeatTypeSummary,
}));

import { GET } from './route';

type ApiAuthModule = typeof import('@/lib/api-auth');
type RateLimitModule = typeof import('@/lib/rate-limit');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type ActiveWorkspaceServiceModule = typeof import('@/lib/services/active-workspace-service');
type TeamSeatTypeServiceModule = typeof import('@/lib/services/team-seat-type-service');

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';

function read(query: string) {
  return GET(new NextRequest(`https://agiworkforce.com/api/settings/team/seat-types${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership.mockResolvedValue('membership-1');
  mocks.readSeatTypeSummary.mockResolvedValue({
    licensedPremiumSeats: 2,
    premiumSeatsAssigned: 1,
    billing: { interval: 'monthly', currency: 'usd', premiumSeatsSold: true },
  });
});

describe('GET /api/settings/team/seat-types', () => {
  it('tells a member how many paid Premium seats are assigned and how seats are billed', async () => {
    const response = await read(`?organizationId=${ORGANIZATION}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      seatTypes: {
        licensedPremiumSeats: 2,
        premiumSeatsAssigned: 1,
        billing: { interval: 'monthly', currency: 'usd', premiumSeatsSold: true },
      },
    });
    expect(mocks.membership).toHaveBeenCalledWith(mocks.privileged, 'member-1', ORGANIZATION);
    expect(mocks.readSeatTypeSummary).toHaveBeenCalledWith(mocks.privileged, ORGANIZATION);
  });

  it('refuses a caller who is not a member, before any seat count is read', async () => {
    mocks.membership.mockResolvedValue(null);

    const response = await read(`?organizationId=${ORGANIZATION}`);

    expect(response.status).toBe(403);
    expect(mocks.readSeatTypeSummary).not.toHaveBeenCalled();
  });

  it('answers null for a workspace that has no seat types', async () => {
    mocks.readSeatTypeSummary.mockResolvedValue(null);

    const response = await read(`?organizationId=${ORGANIZATION}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ seatTypes: null });
  });

  it.each(['', '?organizationId=not-a-uuid'])('rejects the query "%s"', async (query) => {
    const response = await read(query);

    expect(response.status).toBe(400);
    expect(mocks.membership).not.toHaveBeenCalled();
  });
});
