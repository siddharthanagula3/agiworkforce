/**
 * /api/upgrade — double-credit regression
 *
 * A double-submit must not grant the upgrade-delta credits twice. Step 5 is an
 * atomic compare-and-swap (`update ... where coalesce(plan_tier,'free') = $cur`)
 * and Step 6 (the additive, non-idempotent add_credits grant) only runs when
 * that update affected exactly one row. A concurrent second request that
 * arrives after the tier already moved affects zero rows and must NOT credit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user-123' })) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/pricing', () => ({
  STRIPE_PRICE_IDS: { max: { monthly: 'price_max_monthly', yearly: 'price_max_yearly' } },
}));
vi.mock('@/lib/services/credit-service', () => ({
  // Returning null skips Step 2 (Stripe customer-balance proration) so the test
  // focuses on the Step 5/6 credit-grant gate.
  CreditService: { getBalance: vi.fn(async () => null) },
}));
// Plain (non-vi.fn) client so the global `mockReset: true` cannot wipe these
// implementations between tests. getStripe() caches a singleton, so a stable
// object is correct.
vi.mock('stripe', () => {
  const client = {
    customers: { retrieve: async () => ({}), update: async () => ({}) },
    subscriptions: {
      retrieve: async () => ({ items: { data: [{ id: 'si_1' }] } }),
      update: async () => ({}),
    },
  };
  return {
    default: class StripeMock {
      constructor() {
        return client;
      }
    },
  };
});

const mockQuery = vi.fn();
const mockExecute = vi.fn();
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mockQuery, execute: mockExecute }),
}));

import { POST } from '@/app/api/upgrade/route';

const SUB_ROW = {
  id: 'sub-1',
  status: 'active',
  plan_tier: 'pro',
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: 'subsc_1',
  stripe_price_id: 'price_old',
};

function makeRequest() {
  return new NextRequest('http://localhost/api/upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'max', billingInterval: 'monthly' }),
  });
}

const addCreditsCalled = () =>
  mockExecute.mock.calls.some((c) => typeof c[0] === 'string' && c[0].includes('add_credits'));

const getCasUpdateSql = (): string => {
  const call = mockExecute.mock.calls.find(
    (c) => typeof c[0] === 'string' && c[0].includes('update subscriptions'),
  );
  expect(call, 'expected an update subscriptions statement').toBeDefined();
  return (call![0] as string).toLowerCase().replace(/\s+/g, ' ');
};

/** updateRowCount drives the compare-and-swap result for Step 5. */
function setupDb(updateRowCount: number) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('from subscriptions')) return [SUB_ROW];
    if (sql.includes('from token_credits')) return [{ id: 'acct-1' }];
    return [];
  });
  mockExecute.mockImplementation(async (sql: string) => {
    if (sql.includes('update subscriptions')) return updateRowCount;
    return 1;
  });
}

describe('POST /api/upgrade — double-credit gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_dummy';
  });

  it('grants the delta credits once when the tier transition succeeds (rowcount 1)', async () => {
    setupDb(1);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(addCreditsCalled()).toBe(true);
  });

  it('does NOT grant credits on a concurrent double-submit where the tier already moved (rowcount 0)', async () => {
    setupDb(0);
    const res = await POST(makeRequest());
    // The upgrade still returns success (Stripe already updated / webhook
    // reconciles), but the additive credit grant is suppressed.
    expect(res.status).toBe(200);
    expect(addCreditsCalled()).toBe(false);
  });

  it('uses a COALESCE compare-and-swap on plan_tier (NULL-tier safe)', async () => {
    setupDb(1);
    await POST(makeRequest());
    const sql = getCasUpdateSql();
    expect(sql).toContain("coalesce(plan_tier, 'free') = $4");
  });
});
