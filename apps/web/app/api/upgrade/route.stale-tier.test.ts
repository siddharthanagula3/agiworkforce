import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const stripeMocks = vi.hoisted(() => ({
  retrieveSubscription: vi.fn(),
  listSubscriptions: vi.fn(),
  updateSubscription: vi.fn(),
}));

const pricingMocks = vi.hoisted(() => ({
  getPriceSelectionForCurrency: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(
    async (
      callback: (tx: { query: typeof dbMocks.query; execute: typeof dbMocks.execute }) => unknown,
    ) => callback({ query: dbMocks.query, execute: dbMocks.execute }),
  ),
}));

const SCOPED_USER_ID = 'user_123';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_123' })) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@shared/utils/env', async (importOriginal) => ({
  ...(await importOriginal()),
  requireEnv: vi.fn(() => 'sk_test_dummy'),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/server/localized-pricing-service', () => ({
  getPriceSelectionForCurrency: (...args: unknown[]) =>
    pricingMocks.getPriceSelectionForCurrency(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: dbMocks.query,
    execute: dbMocks.execute,
    transaction: dbMocks.transaction,
  }),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: dbMocks.query,
      execute: dbMocks.execute,
      transaction: dbMocks.transaction,
    },
    userId: SCOPED_USER_ID,
    organizationId: null,
  })),
}));
vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: (_metadata: unknown, priceId: string | null | undefined) =>
    priceId === 'price_max15x_usd' ? 'max_15x' : priceId === 'price_pro_usd' ? 'pro' : null,
}));
vi.mock('stripe', () => ({
  default: class StripeMock {
    subscriptions = {
      retrieve: stripeMocks.retrieveSubscription,
      list: stripeMocks.listSubscriptions,
      update: stripeMocks.updateSubscription,
    };
  },
}));

import { POST } from './route';
import { createUpgradePreviewToken } from '@/lib/server/stripe-upgrade-preview-token';

const SECRET = 'sk_test_dummy';
const PRORATION_DATE = Math.floor(Date.parse('2026-08-04T00:00:00.000Z') / 1000);

function request(body: Record<string, unknown>) {
  return new NextRequest('https://agiworkforce.com/api/upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/upgrade, stale plan_tier vs the live Stripe price', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The window this test exists for. /api/upgrade does not write plan_tier.
    // the webhook does, so the column lags Stripe. Here the DB still says
    // `basic` while Stripe is already on max_15x. `basic -> pro` passes the
    // early DB check as a genuine upgrade, which is exactly why the live price
    // has to be re-checked: against it this is max_15x -> pro, a downgrade.
    dbMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from subscriptions')) {
        return [
          {
            status: 'active',
            plan_tier: 'basic',
            stripe_subscription_id: 'sub_live123',
            stripe_customer_id: 'cus_123',
          },
        ];
      }
      if (sql.includes('from profiles')) return [{ stripe_customer_id: 'cus_123' }];
      return [];
    });
    dbMocks.execute.mockResolvedValue(1);
    stripeMocks.retrieveSubscription.mockResolvedValue({
      id: 'sub_live123',
      customer: 'cus_123',
      status: 'active',
      currency: 'usd',
      cancel_at_period_end: false,
      metadata: { user_id: 'user_123' },
      items: {
        data: [
          {
            id: 'si_123',
            price: { id: 'price_max15x_usd', recurring: { interval: 'month', interval_count: 1 } },
            quantity: 1,
          },
        ],
      },
    });
    pricingMocks.getPriceSelectionForCurrency.mockResolvedValue({
      priceId: 'price_pro_usd',
      currency: 'usd',
      amountMinor: 2_000,
    });
  });

  it('refuses a downgrade that the stale DB tier would have read as an upgrade', async () => {
    // always_invoice would return the difference as customer balance rather than
    // a refund, leaving someone who had just paid the full jump to Max 15x
    // sitting on Pro with the money stuck as credit.
    const response = await POST(
      request({
        plan: 'pro',
        billingInterval: 'monthly',
        previewToken: createUpgradePreviewToken(
          {
            userId: 'user_123',
            plan: 'pro',
            billingInterval: 'monthly',
            stripeSubscriptionId: 'sub_live123',
            seats: 1,
            prorationDate: PRORATION_DATE,
          },
          SECRET,
        ),
      }),
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toMatch(/cannot upgrade from max_15x to pro/i);
    expect(stripeMocks.updateSubscription).not.toHaveBeenCalled();
  });
});
