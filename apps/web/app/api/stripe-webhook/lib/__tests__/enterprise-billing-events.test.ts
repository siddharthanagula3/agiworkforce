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
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
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

const enterpriseBillingMocks = vi.hoisted(() => ({
  syncEnterpriseContractFromSubscription: vi.fn().mockResolvedValue(undefined),
  recordEnterpriseInvoiceEvent: vi.fn().mockResolvedValue(undefined),
  endEnterpriseContractIfPresent: vi.fn().mockResolvedValue(undefined),
  resolveEnterprisePlanTier: vi.fn().mockResolvedValue(null),
  auditUnknownStripePriceIfEnterpriseConfigured: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/services/enterprise-billing-service', () => enterpriseBillingMocks);

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';

import { dispatchStripeEvent } from '../handlers';

function makeDb(rowsFor: (sql: string) => unknown[] = () => []) {
  const record = async (sql: string) => {
    if (sql.includes('select id, user_id, plan_tier') && sql.includes('from subscriptions')) {
      const overridden = rowsFor(sql);
      if (overridden.length > 0) return overridden;
      return [
        {
          id: 'row_1',
          user_id: 'user_1',
          plan_tier: 'pro',
          status: 'active',
          current_period_start: new Date().toISOString(),
        },
      ];
    }
    if (sql.includes('update subscriptions set')) return [{ id: 'row_1' }];
    return rowsFor(sql);
  };
  return {
    query: vi.fn(record),
    execute: vi.fn(record),
  } as unknown as DatabaseAdapter;
}

const NOW = Math.floor(Date.now() / 1000);

function subscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: {},
    items: { data: [{ price: { id: 'price_current' } }] },
    current_period_start: NOW,
    current_period_end: NOW + 30 * 24 * 60 * 60,
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function event(type: string, object: unknown): Stripe.Event {
  return { id: `evt_${type}`, type, created: NOW, data: { object } } as unknown as Stripe.Event;
}

describe('enterprise billing event wiring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('syncs the enterprise contract on customer.subscription.created', async () => {
    const sub = subscription();
    await dispatchStripeEvent(makeDb(), {} as Stripe, event('customer.subscription.created', sub));

    expect(enterpriseBillingMocks.syncEnterpriseContractFromSubscription).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      sub,
      { eventCreatedAt: NOW },
    );
  });

  it('syncs the enterprise contract on customer.subscription.updated', async () => {
    const sub = subscription();
    await dispatchStripeEvent(makeDb(), {} as Stripe, event('customer.subscription.updated', sub));

    expect(enterpriseBillingMocks.syncEnterpriseContractFromSubscription).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      sub,
      { eventCreatedAt: NOW },
    );
  });

  it('rolls the contract term dates on a paid renewal invoice', async () => {
    const sub = subscription();
    const stripe = {
      subscriptions: { retrieve: vi.fn().mockResolvedValue(sub) },
    } as unknown as Stripe;
    const invoice = { id: 'in_1', subscription: 'sub_1' } as unknown as Stripe.Invoice;

    await dispatchStripeEvent(makeDb(), stripe, event('invoice.paid', invoice));

    expect(enterpriseBillingMocks.syncEnterpriseContractFromSubscription).toHaveBeenCalledWith(
      expect.anything(),
      stripe,
      sub,
      { eventCreatedAt: NOW },
    );
    expect(enterpriseBillingMocks.recordEnterpriseInvoiceEvent).toHaveBeenCalledWith(
      expect.anything(),
      invoice,
      { eventCreatedAt: NOW },
    );
  });

  it('records every ledger-relevant invoice event type', async () => {
    const eventTypes = [
      'invoice.created',
      'invoice.finalized',
      'invoice.updated',
      'invoice.marked_uncollectible',
      'invoice.voided',
      'invoice.overdue',
      'invoice.payment_failed',
    ];

    for (const type of eventTypes) {
      enterpriseBillingMocks.recordEnterpriseInvoiceEvent.mockClear();
      const invoice = {
        id: `in_${type}`,
        customer: 'cus_1',
        subscription: null,
      } as unknown as Stripe.Invoice;
      await dispatchStripeEvent(makeDb(), {} as Stripe, event(type, invoice));
      expect(
        enterpriseBillingMocks.recordEnterpriseInvoiceEvent,
        `${type} did not record an enterprise invoice ledger entry`,
      ).toHaveBeenCalledWith(expect.anything(), invoice, { eventCreatedAt: NOW });
    }
  });

  it('ends the enterprise contract on cancellation, retaining every row', async () => {
    const db = makeDb((sql) =>
      sql.includes('select user_id, plan_tier')
        ? [{ user_id: 'user_1', plan_tier: 'enterprise' }]
        : [],
    );
    const sub = subscription({ id: 'sub_cancel', canceled_at: NOW });

    await dispatchStripeEvent(db, {} as Stripe, event('customer.subscription.deleted', sub));

    expect(enterpriseBillingMocks.endEnterpriseContractIfPresent).toHaveBeenCalledWith(
      expect.anything(),
      'sub_cancel',
      new Date(NOW * 1000).toISOString(),
      NOW,
    );
  });
});
