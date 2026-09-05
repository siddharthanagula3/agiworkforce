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

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: vi.fn().mockResolvedValue(null),
    deductCredits: vi.fn().mockResolvedValue({ success: true }),
  },
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
  const db = { query: vi.fn(record), execute: vi.fn(record) } as unknown as DatabaseAdapter;
  return { db, calls };
}

function withProfile() {
  return makeDb((sql) => (sql.includes('from profiles') ? [{ id: 'user_in_1' }] : []));
}

const stripeStub = {} as Stripe;

function preDebitEvent(): Stripe.Event {
  return {
    id: 'evt_pi_processing',
    type: 'payment_intent.processing',
    data: {
      object: {
        id: 'pi_india_1',
        customer: 'cus_india_1',
        currency: 'inr',
        status: 'processing',
        processing: {
          type: 'card',
          card: { customer_notification: { approval_requested: true, completes_at: 1677307005 } },
        },
      },
    },
  } as unknown as Stripe.Event;
}

function mandateFailureEvent(error: Record<string, string>): Stripe.Event {
  return {
    id: 'evt_pi_failed',
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        id: 'pi_india_2',
        customer: 'cus_india_1',
        currency: 'inr',
        status: 'requires_payment_method',
        last_payment_error: error,
      },
    },
  } as unknown as Stripe.Event;
}

function unhandledWarnings() {
  return loggerMocks.warn.mock.calls.filter((call) => call[1] === 'Unhandled Stripe event type');
}

describe('India e-mandate renewals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recognises the pre-debit notification window instead of dropping the event', async () => {
    const { db, calls } = withProfile();

    await dispatchStripeEvent(db, stripeStub, preDebitEvent());

    expect(unhandledWarnings()).toHaveLength(0);
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId: 'pi_india_1',
        customerId: 'cus_india_1',
        approvalRequested: true,
        completesAt: 1677307005,
      }),
      expect.stringContaining('pre-debit notification'),
    );
    expect(calls).toHaveLength(0);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('audits a canceled mandate so the dead renewal is not read as a retryable decline', async () => {
    const { db } = withProfile();

    await dispatchStripeEvent(
      db,
      stripeStub,
      mandateFailureEvent({ code: 'india_recurring_payment_mandate_canceled' }),
    );

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_in_1',
        eventType: 'plan_changed',
        severity: 'warning',
        detail: expect.objectContaining({
          resourceType: 'subscription',
          resourceId: 'pi_india_2',
          reason: 'india_mandate_unrecoverable:india_recurring_payment_mandate_canceled',
        }),
      }),
    );
  });

  it('audits an invalid mandate reported through the decline code', async () => {
    const { db } = withProfile();

    await dispatchStripeEvent(
      db,
      stripeStub,
      mandateFailureEvent({
        code: 'card_declined',
        decline_code: 'payment_intent_mandate_invalid',
      }),
    );

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          reason: 'india_mandate_unrecoverable:payment_intent_mandate_invalid',
        }),
      }),
    );
  });

  it('leaves ordinary declines to the invoice handler', async () => {
    const { db, calls } = withProfile();

    await dispatchStripeEvent(
      db,
      stripeStub,
      mandateFailureEvent({ code: 'card_declined', decline_code: 'insufficient_funds' }),
    );

    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});
