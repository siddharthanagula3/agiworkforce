/**
 * A completed Checkout Session whose tax Stripe could not calculate is a sale
 * the company owes tax on and did not collect tax for. The webhook used to
 * provision the entitlement without ever reading `automatic_tax`, so the only
 * evidence was inside Stripe. These cases pin the two halves of the policy in
 * lib/billing/tax-policy.ts:
 *
 *   1. an uncalculated sale is recorded loudly, and a calculated one records
 *      the amount that was charged;
 *   2. the buyer's tax identifiers and postal address are never copied into
 *      this database — they stay on the Stripe Customer and the Stripe invoice.
 *
 * Entitlement itself is deliberately unaffected: the customer has already paid,
 * and the fail-closed guard for an unpaid/incomplete checkout is the Stripe
 * subscription status (pinned in __tests__/api/stripe-session-payment-authority.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  allocateCredits: vi.fn(),
  carryUpgradeCredits: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: mocks.allocateCredits,
    carryCreditsForUpgradePeriod: mocks.carryUpgradeCredits,
  },
}));
vi.mock('@/lib/services/credit-service', () => ({ CreditService: {} }));
vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: () => 'pro',
  isValidPlanTier: (tier: unknown) => tier === 'pro',
  isPriceIdRegistered: () => true,
  getTierMapping: () => ({ price_pro_monthly: { tier: 'pro', interval: 'monthly' } }),
}));

import { upsertSubscriptionFromSession } from '../db';

const VAT_NUMBER = 'DE811234567';
const BUYER_STREET = '12 Torstrasse';

function makeStripe() {
  return {
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({ id: 'cs_tax', total_details: null }),
      },
    },
    customers: {
      retrieve: vi.fn().mockResolvedValue({ id: 'cus_1', email: 'b@example.com', deleted: false }),
    },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'sub_live_1',
        status: 'active',
        cancel_at_period_end: false,
        canceled_at: null,
        items: {
          data: [
            {
              quantity: 1,
              price: { id: 'price_pro_monthly' },
              current_period_start: 1_700_000_000,
              current_period_end: 1_702_592_000,
            },
          ],
        },
      }),
    },
  } as never;
}

function makeSession(
  automaticTax: { enabled: boolean; status: string | null } | undefined,
  amountTax: number | null,
) {
  return {
    id: 'cs_tax',
    customer: 'cus_1',
    subscription: 'sub_live_1',
    client_reference_id: 'user_1',
    metadata: { user_id: 'user_1', plan_tier: 'pro' },
    line_items: { data: [{ price: { id: 'price_pro_monthly' }, quantity: 1 }] },
    ...(automaticTax ? { automatic_tax: automaticTax } : {}),
    total_details: amountTax === null ? null : { amount_tax: amountTax },
    customer_details: {
      email: 'b@example.com',
      tax_ids: [{ type: 'eu_vat', value: VAT_NUMBER }],
      address: { line1: BUYER_STREET, city: 'Berlin', country: 'DE', postal_code: '10119' },
    },
  } as never;
}

function subscriptionUpsertCalls() {
  return mocks.query.mock.calls.filter(([sql]) =>
    String(sql).includes('insert into subscriptions'),
  );
}

describe('checkout tax outcome is recorded for every provisioned sale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('select id from profiles where id')) return [{ id: 'user_1' }];
      if (sql.includes('insert into subscriptions')) return [{ id: 'sub_db_1' }];
      return [];
    });
    mocks.execute.mockResolvedValue(1);
  });

  const db = () => ({ query: mocks.query, execute: mocks.execute }) as never;

  it('records the tax Stripe charged when the calculation completed', async () => {
    await upsertSubscriptionFromSession(
      db(),
      makeStripe(),
      makeSession({ enabled: true, status: 'complete' }, 380),
    );

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({ taxStatus: 'complete', taxAmountMinor: 380 }),
      expect.stringContaining('tax calculated'),
    );
    expect(loggerMocks.error).not.toHaveBeenCalled();
    expect(subscriptionUpsertCalls()).toHaveLength(1);
  });

  it('flags a sale whose tax calculation FAILED instead of provisioning silently', async () => {
    await upsertSubscriptionFromSession(
      db(),
      makeStripe(),
      makeSession({ enabled: true, status: 'failed' }, 0),
    );

    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ taxStatus: 'failed', sessionId: 'cs_tax' }),
      expect.stringContaining('TAX NOT COLLECTED'),
    );
    // The buyer paid, so access is still granted; the shortfall is an
    // accounting problem, not a reason to withhold what was sold.
    expect(subscriptionUpsertCalls()).toHaveLength(1);
  });

  it('flags a session that was created without automatic tax at all', async () => {
    await upsertSubscriptionFromSession(db(), makeStripe(), makeSession(undefined, null));

    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ taxStatus: 'not_requested' }),
      expect.stringContaining('TAX NOT COLLECTED'),
    );
  });

  it('never writes the buyer tax id or postal address into this database', async () => {
    await upsertSubscriptionFromSession(
      db(),
      makeStripe(),
      makeSession({ enabled: true, status: 'complete' }, 380),
    );

    const written = JSON.stringify([...mocks.query.mock.calls, ...mocks.execute.mock.calls]);
    expect(written).not.toContain(VAT_NUMBER);
    expect(written).not.toContain(BUYER_STREET);
    expect(written).not.toMatch(/tax_id|billing_address/);
  });

  it('never writes the tax id VALUE into the logs either', async () => {
    await upsertSubscriptionFromSession(
      db(),
      makeStripe(),
      makeSession({ enabled: true, status: 'complete' }, 380),
    );

    const logged = JSON.stringify([
      ...loggerMocks.info.mock.calls,
      ...loggerMocks.warn.mock.calls,
      ...loggerMocks.error.mock.calls,
      ...loggerMocks.debug.mock.calls,
    ]);
    expect(logged).not.toContain(VAT_NUMBER);
    expect(logged).toContain('eu_vat');
  });
});
