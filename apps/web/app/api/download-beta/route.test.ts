import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/neon-db');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  privilegedQuery: vi.fn(),
  getUserScopedDb: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.getUserScopedDb(...args),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.privilegedQuery(...args) }),
}));

import { GET } from './route';

const SCOPED_USER = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: SCOPED_USER,
    organizationId: null,
  });
  mocks.query.mockResolvedValue([]);
  mocks.privilegedQuery.mockResolvedValue([]);
});

function request() {
  return new NextRequest('http://localhost/api/download-beta?platform=mac');
}

describe('GET /api/download-beta', () => {
  it('reads the entitlement through the rls scoped handle, not the schema owner pool', async () => {
    mocks.query.mockResolvedValueOnce([{ status: 'active' }]);
    vi.stubEnv('NEXT_PUBLIC_DOWNLOAD_URL_MAC', 'https://downloads.agiworkforce.com/mac.dmg');

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringMatching(/from subscriptions/i), [
      SCOPED_USER,
    ]);
    vi.unstubAllEnvs();
  });

  it('lets a Team seat member with no subscription of their own download', async () => {
    vi.stubEnv('NEXT_PUBLIC_DOWNLOAD_URL_MAC', 'https://downloads.agiworkforce.com/mac.dmg');
    mocks.privilegedQuery.mockImplementation(async (sql: string) =>
      sql.includes('from public.organization_members membership')
        ? [
            {
              organization_id: '33333333-3333-4333-8333-333333333333',
              owner_user_id: 'owner-1',
              billing_plan_tier: 'team',
              licensed_seats: 5,
              seat_rank: 2,
              subscription_id: 'subscription-owner-1',
              status: 'active',
              current_period_start: '2026-09-05T00:00:00.000Z',
              current_period_end: '2026-10-05T00:00:00.000Z',
              cancel_at_period_end: false,
              stripe_subscription_id: 'sub_owner_1',
              stripe_price_id: null,
              apple_original_transaction_id: null,
              google_purchase_token: null,
              plan_catalog_version: null,
            },
          ]
        : [],
    );

    const response = await GET(request());

    expect(response.status).toBe(307);
    vi.unstubAllEnvs();
  });

  it('refuses a caller with no active subscription', async () => {
    mocks.query.mockResolvedValueOnce([{ status: 'canceled' }]);

    const response = await GET(request());

    expect(response.status).toBe(403);
  });
});
