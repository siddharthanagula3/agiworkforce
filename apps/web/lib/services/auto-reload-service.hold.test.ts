import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  readStripeBillingInstrument: vi.fn(),
  chargeStripeOffSession: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query, execute: mocks.execute }),
}));
vi.mock('@/lib/services/bonus-credit-service', () => ({
  getPrepaidCreditBalances: vi.fn(async () => ({ bonusCredits: 0, purchasedCredits: 0 })),
}));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  evaluateActiveWorkspacePolicy: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/server/payments/stripe-provider', () => ({
  calculateStripeOffSessionTax: vi.fn(),
  cancelStripePayment: vi.fn(),
  chargeStripeOffSession: mocks.chargeStripeOffSession,
  listStripeCustomerPayments: vi.fn(),
  readStripeBillingInstrument: mocks.readStripeBillingInstrument,
  retrieveStripePayment: vi.fn(),
}));

import { sweepAutoReloads } from './auto-reload-service';

const USERS = ['user_deleting', 'user_disputing', 'user_clear'];

function prime(holds: Record<string, Record<string, boolean> | Error>) {
  const leased = new Set<string>();
  mocks.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const userId = String(params[0]);
    if (sql.includes('order by user_id')) return USERS.map((id) => ({ user_id: id }));
    if (sql.includes('as deletion_scheduled')) {
      const hold = holds[userId];
      if (hold instanceof Error) throw hold;
      return [{ deletion_scheduled: false, dispute_open: false, ...hold }];
    }
    if (sql.includes('set reload_attempt_id = gen_random_uuid()')) {
      leased.add(userId);
      return [{ reload_attempt_id: `attempt_${userId}` }];
    }
    if (sql.includes('from public.auto_reload_settings')) {
      return [
        {
          enabled: true,
          threshold_credits: 500,
          amount_usd: 20,
          reload_attempt_id: leased.has(userId) ? `attempt_${userId}` : null,
          reload_payment_intent_id: null,
          lease_expired: false,
          last_attempt_at: null,
        },
      ];
    }
    if (sql.includes('from public.credit_transactions')) return [{ purchased_microusd: 0 }];
    if (sql.includes('from public.subscriptions')) {
      return [
        {
          plan_tier: 'pro',
          status: 'active',
          stripe_customer_id: `cus_${userId.replace(/_/g, '')}`,
          stripe_subscription_id: `sub_${userId.replace(/_/g, '')}`,
        },
      ];
    }
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_CHECKOUT_ENABLED', '1');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
  mocks.execute.mockResolvedValue(1);
  mocks.readStripeBillingInstrument.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('auto-reload during a billing hold', () => {
  it('charges nothing while deletion is scheduled or a dispute is open, and still runs the others', async () => {
    prime({ user_deleting: { deletion_scheduled: true }, user_disputing: { dispute_open: true } });

    const report = await sweepAutoReloads(Date.now() + 60_000);

    expect(report.outcomes['held']).toBe(2);
    expect(report.errored).toBe(0);
    expect(mocks.chargeStripeOffSession).not.toHaveBeenCalled();
    expect(mocks.readStripeBillingInstrument).toHaveBeenCalledTimes(1);
    expect(mocks.readStripeBillingInstrument).toHaveBeenCalledWith('sub_userclear');
  });

  it('isolates an account whose hold state cannot be read', async () => {
    prime({ user_deleting: new Error('connection reset') });

    const report = await sweepAutoReloads(Date.now() + 60_000);

    expect(report.errored).toBe(1);
    expect(report.considered).toBe(3);
    expect(mocks.chargeStripeOffSession).not.toHaveBeenCalled();
    expect(mocks.readStripeBillingInstrument).toHaveBeenCalledTimes(2);
  });
});
