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
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),

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

const recordNotification = vi.hoisted(() => vi.fn().mockResolvedValue({ recorded: true }));
vi.mock('@/lib/services/notification-service', () => ({ recordNotification }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';

import { dispatchStripeEvent } from '../handlers';

const NOW = Math.floor(Date.now() / 1000);

function failedInvoiceEvent(invoice: Record<string, unknown>): Stripe.Event {
  return {
    id: 'evt_invoice_failed',
    type: 'invoice.payment_failed',
    created: NOW,
    data: { object: invoice },
  } as unknown as Stripe.Event;
}

function makeDb(ownerUserId: string | null) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('select user_id from subscriptions')) {
      return ownerUserId ? [{ user_id: ownerUserId }] : [];
    }
    return [];
  });
  return { query, execute: vi.fn(async () => []) } as unknown as DatabaseAdapter;
}

describe('invoice.payment_failed in-app notice', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tells the subscriber in-app, once per invoice attempt', async () => {
    const db = makeDb('user_1');
    const invoice = { id: 'in_1', customer: 'cus_1', subscription: null, attempt_count: 2 };

    await dispatchStripeEvent(db, {} as Stripe, failedInvoiceEvent(invoice));

    expect(recordNotification).toHaveBeenCalledWith(db, {
      userId: 'user_1',
      category: 'billing',
      severity: 'error',
      title: 'Your payment did not go through',
      message: expect.stringContaining('Update your payment method'),
      target: { kind: 'settings', id: 'billing' },
      dedupeKey: 'invoice-payment-failed:in_1:2',
    });
  });

  it('writes nothing when no subscriber owns the customer', async () => {
    const db = makeDb(null);
    await dispatchStripeEvent(
      db,
      {} as Stripe,
      failedInvoiceEvent({ id: 'in_2', customer: 'cus_unknown', subscription: null }),
    );
    expect(recordNotification).not.toHaveBeenCalled();
  });
});
