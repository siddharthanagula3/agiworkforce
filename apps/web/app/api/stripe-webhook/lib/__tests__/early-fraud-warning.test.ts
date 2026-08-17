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
const logSecurityEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent, logSecurityEvent }));

vi.mock('@/lib/price-tier-mapping', () => ({
  isPriceIdRegistered: () => true,
  resolvePlanTier: () => 'pro',
  isValidPlanTier: () => true,
  getTierMapping: () => ({}),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: vi.fn().mockResolvedValue(undefined),
    resetCreditsForNewPeriod: vi.fn().mockResolvedValue(undefined),
    carryCreditsForUpgradePeriod: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: vi.fn().mockResolvedValue({ credits_remaining_cents: 0 }),
    deductCredits: vi.fn().mockResolvedValue({ success: true }),
  },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';

import { dispatchStripeEvent } from '../handlers';

function makeDb(rowsFor: (sql: string) => unknown[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const record = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return rowsFor(sql);
  };
  return {
    db: { query: vi.fn(record), execute: vi.fn(record) } as unknown as DatabaseAdapter,
    calls,
  };
}

function warningEvent(overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: 'evt_efw',
    type: 'radar.early_fraud_warning.created',
    data: {
      object: {
        id: 'issfr_123',
        charge: 'ch_efw',
        fraud_type: 'made_with_stolen_card',
        actionable: true,
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

const chargesRetrieve = vi.fn();
const stripeStub = { charges: { retrieve: chargesRetrieve } } as unknown as Stripe;

const withProfile = () =>
  makeDb((sql) => (sql.includes('from profiles') ? [{ id: 'user_efw', email: null }] : []));

describe('radar.early_fraud_warning.created is handled, not swallowed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chargesRetrieve.mockResolvedValue({ id: 'ch_efw', customer: 'cus_efw' });
  });

  it('records the warning against the owning account with a stable reason code', async () => {
    const { db } = withProfile();

    await dispatchStripeEvent(db, stripeStub, warningEvent());

    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_efw',
        eventType: 'suspicious_activity',
        severity: 'high',
        endpoint: '/api/stripe-webhook',
        details: expect.objectContaining({
          reason: 'stripe_early_fraud_warning',
          warningId: 'issfr_123',
          chargeId: 'ch_efw',
          fraudType: 'made_with_stolen_card',
          actionable: true,
        }),
      }),
    );
  });

  it('carries the appeal route so the record is actionable by a human on both sides', async () => {
    const { db } = withProfile();

    await dispatchStripeEvent(db, stripeStub, warningEvent());

    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ appealPath: '/support' }),
      }),
    );
  });

  it('does not revoke credits or downgrade the subscription on a warning alone', async () => {
    const { db, calls } = withProfile();

    await dispatchStripeEvent(db, stripeStub, warningEvent());

    expect(calls.some((call) => /update subscriptions/i.test(call.sql))).toBe(false);
  });

  it('still records a non-actionable warning rather than dropping it', async () => {
    const { db } = withProfile();

    await dispatchStripeEvent(db, stripeStub, warningEvent({ actionable: false }));

    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ actionable: false }),
      }),
    );
  });

  it('records the warning without a user when no account owns the charge', async () => {
    const { db } = makeDb(() => []);

    await dispatchStripeEvent(db, stripeStub, warningEvent());

    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ reason: 'stripe_early_fraud_warning' }),
      }),
    );
    expect(logSecurityEvent.mock.calls[0]?.[0]).not.toHaveProperty('userId');
  });

  it('is not reported as an unhandled event type', async () => {
    const { db } = withProfile();

    await dispatchStripeEvent(db, stripeStub, warningEvent());

    expect(loggerMocks.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'radar.early_fraud_warning.created' }),
      'Unhandled Stripe event type',
    );
  });
});
