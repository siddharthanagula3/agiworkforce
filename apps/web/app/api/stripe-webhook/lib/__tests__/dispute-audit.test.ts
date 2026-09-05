import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/lib/services/credit-service', () => ({ CreditService: creditMocks }));

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

function withProfile() {
  return makeDb((sql) => (sql.includes('from profiles') ? [{ id: 'user_123', email: null }] : []));
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
    creditMocks.getBalance.mockResolvedValue({ credits_remaining_cents: 0 });
    const { db, calls } = withProfile();

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
