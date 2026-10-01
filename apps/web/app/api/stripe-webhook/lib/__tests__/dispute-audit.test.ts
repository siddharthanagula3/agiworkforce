import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/services/notification-service');

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));

const recordAuditEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent,
  logSecurityEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/services/notification-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  recordNotification: vi.fn().mockResolvedValue({ recorded: true }),
}));

vi.mock('@/lib/price-tier-mapping', () => ({
  isPriceIdRegistered: () => true,
  resolvePlanTier: () => 'pro',
  isValidPlanTier: () => true,
  getTierMapping: () => ({}),
  getEnterpriseProductId: () => null,
  isEnterpriseProductId: () => false,
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: vi.fn().mockResolvedValue(undefined),
    resetCreditsForNewPeriod: vi.fn().mockResolvedValue(undefined),
    carryCreditsForUpgradePeriod: vi.fn().mockResolvedValue(undefined),
  },
}));

const creditMocks = vi.hoisted(() => ({
  getBalance: vi.fn().mockResolvedValue({ credits_remaining_cents: 1500 }),
  deductCredits: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),
  CreditService: creditMocks,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';

import { dispatchStripeEvent } from '../handlers';

interface Call {
  sql: string;
  params: unknown[];
}

function makeDb(rowsFor: (sql: string) => unknown[]) {
  const calls: Call[] = [];
  const record = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return rowsFor(sql);
  };
  const db = {
    query: vi.fn(record),
    execute: vi.fn(record),
  } as unknown as DatabaseAdapter;
  return { db, calls };
}

const disputeEvent = {
  id: 'evt_dispute',
  type: 'charge.dispute.created',
  data: {
    object: {
      id: 'dp_123',
      charge: 'ch_123',
      amount: 2000,
      reason: 'fraudulent',
    },
  },
} as unknown as Stripe.Event;

const chargesRetrieve = vi.fn();
const stripeStub = { charges: { retrieve: chargesRetrieve } } as unknown as Stripe;

function withProfile(revokedMicrousd = 15_000_000) {
  return makeDb((sql) => {
    if (sql.includes('from profiles')) return [{ id: 'user_123', email: null }];
    if (sql.includes('from public.billing_disputes')) {
      return [{ id: 'dp_123', outcome: 'open', revoked_at: null }];
    }
    if (sql.includes('revoke_disputed_credits_microusd')) {
      return [{ account_id: 'account_1', revoked_microusd: revokedMicrousd, top_up_microusd: 0 }];
    }
    return [];
  });
}

describe('charge.dispute.created records why access was removed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chargesRetrieve.mockResolvedValue({ id: 'ch_123', customer: 'cus_123' });
    creditMocks.getBalance.mockResolvedValue({ credits_remaining_cents: 1500 });
    creditMocks.deductCredits.mockResolvedValue({ success: true });
  });

  it('writes an audit row with a stable reason code and the dispute reference', async () => {
    const { db } = withProfile();

    await dispatchStripeEvent(db, stripeStub, disputeEvent);

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_123',
        eventType: 'plan_changed',
        detail: expect.objectContaining({
          reason: 'charge_dispute_created',
          resourceType: 'subscription',
          resourceId: 'dp_123',
          status: 'past_due',
        }),
      }),
    );
  });

  it('still records the reason when the account had no credits left to claw back', async () => {
    const { db, calls } = withProfile(0);

    await dispatchStripeEvent(db, stripeStub, disputeEvent);

    expect(
      calls.some((call) => /update subscriptions set status = 'past_due'/.test(call.sql)),
    ).toBe(true);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ reason: 'charge_dispute_created' }),
      }),
    );
  });

  it('records nothing when no user owns the disputed charge', async () => {
    const { db } = makeDb(() => []);

    await dispatchStripeEvent(db, stripeStub, disputeEvent);

    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe('a dispute closed in our favor restores what its opening revoked', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['charge.dispute.updated', 'charge.dispute.closed', 'charge.dispute.funds_reinstated'])(
    'restores the held credits on %s',
    async (type) => {
      const { db, calls } = makeDb((sql) => {
        if (sql.includes('id <> $2')) return [];
        if (sql.includes('update public.billing_disputes') && sql.includes('returning id')) {
          return [{ id: 'dp_123' }];
        }
        if (sql.includes('from public.billing_disputes')) {
          return [
            {
              id: 'dp_123',
              user_id: 'user_123',
              stripe_customer_id: 'cus_123',
              outcome: 'open',
              revoked_account_id: 'account_1',
              revoked_credits_microusd: 15_000_000,
              revoked_top_up_microusd: 0,
              prior_subscription_status: 'active',
              prior_cancel_at_period_end: false,
              revoked_at: '2026-09-01T00:00:00.000Z',
              restored_at: null,
            },
          ];
        }
        if (sql.includes('restore_disputed_credits_microusd')) return [{ restored: 15_000_000 }];
        return [];
      });

      await dispatchStripeEvent(db, stripeStub, {
        id: 'evt_dispute_won',
        type,
        created: 1_790_000_000,
        data: { object: { id: 'dp_123', charge: 'ch_123', amount: 2000, status: 'won' } },
      } as unknown as Stripe.Event);

      const restore = calls.find((call) => call.sql.includes('restore_disputed_credits_microusd'));
      expect(restore?.params).toEqual(['user_123', 'dp_123', 'account_1', 15_000_000, 0]);
      expect(recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({ reason: 'charge_dispute_won', resourceId: 'dp_123' }),
        }),
      );
    },
  );
});
