import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
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
    allocateCreditsForPeriod: vi.fn().mockResolvedValue(''),
    resetCreditsForNewPeriod: vi.fn().mockResolvedValue(''),
    carryCreditsForUpgradePeriod: vi.fn().mockResolvedValue(''),
  },
}));
vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),
  CreditService: { getBalance: vi.fn(), deductCredits: vi.fn() },
}));
vi.mock('@/lib/services/enterprise-billing-service', () => ({
  syncEnterpriseContractFromSubscription: vi.fn().mockResolvedValue(undefined),
  recordEnterpriseInvoiceEvent: vi.fn().mockResolvedValue(undefined),
  endEnterpriseContractIfPresent: vi.fn().mockResolvedValue(undefined),
  resolveEnterprisePlanTier: vi.fn().mockResolvedValue(null),
  auditUnknownStripePriceIfEnterpriseConfigured: vi.fn().mockResolvedValue(undefined),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';
import {
  CENTS_PER_USD,
  CREDITS_PER_USD,
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  TOP_UP_PRESET_AMOUNTS_USD,
  isValidTopUpPurchase,
  topUpUnitsForUsd,
} from '@agiworkforce/types';
import { MICROUSD_PER_LEDGER_CENT } from '@/lib/server/managed-usage-policy';
import { handleCreditTopUp } from '@/app/api/stripe-webhook/lib/db';

const USER = 'user_topup';
const ACCOUNT = 'account_topup';

interface Grant {
  accountId: string;
  microusd: unknown;
  description: unknown;
  transactionType: unknown;
}

function ledger() {
  const grants: Grant[] = [];
  let balanceMicrousd = 0;

  const run = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (text.includes("transaction_type = 'purchase'")) {
      const description = String(params[1]);
      return grants.some((grant) => grant.description === description) ? [{ id: 'txn_1' }] : [];
    }
    if (text.includes('from subscriptions')) {
      return [
        {
          id: 'sub_row',
          current_period_start: '2026-08-01T00:00:00.000Z',
          current_period_end: '2026-09-01T00:00:00.000Z',
        },
      ];
    }
    if (text.includes('from token_credits') && text.includes('subscription_id')) {
      return [{ id: ACCOUNT }];
    }
    if (text.includes('credits_allocated_microusd - credits_used_microusd')) {
      return [{ remaining_microusd: balanceMicrousd }];
    }
    if (text.includes('add_credits_microusd')) {
      const microusd = params[2];
      if (typeof microusd !== 'number' || !Number.isSafeInteger(microusd) || microusd <= 0) {
        throw new Error(`add_credits_microusd refused a non-integer amount: ${String(microusd)}`);
      }
      balanceMicrousd += microusd;
      grants.push({
        accountId: String(params[1]),
        microusd,
        description: params[3],
        transactionType: params[4],
      });
      return [];
    }
    return [];
  };

  return {
    db: { query: vi.fn(run), execute: vi.fn(run) } as unknown as DatabaseAdapter,
    grants,
    balance: () => balanceMicrousd,
  };
}

function session(amountUsd: number, sessionId: string): Stripe.Checkout.Session {
  const amountCents = amountUsd * CENTS_PER_USD;
  return {
    id: sessionId,
    currency: 'usd',
    amount_subtotal: amountCents,
    amount_total: amountCents,
    payment_intent: 'pi_1',
    payment_status: 'paid',
    metadata: {
      type: 'credit_topup',
      user_id: USER,
      credit_amount_cents: String(amountCents),
      top_up_units: String(topUpUnitsForUsd(amountUsd)),
    },
  } as unknown as Stripe.Checkout.Session;
}

function stripeFor(amountUsd: number): Stripe {
  const amountCents = amountUsd * CENTS_PER_USD;
  return {
    paymentIntents: {
      retrieve: async () => ({
        id: 'pi_1',
        status: 'succeeded',
        currency: 'usd',
        amount_received: amountCents,
      }),
    },
  } as unknown as Stripe;
}

describe('a purchased top-up grants exactly what was paid for', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(TOP_UP_PRESET_AMOUNTS_USD.map((amountUsd) => [amountUsd] as const))(
    'grants $%s at fifty credits per dollar in whole microUSD',
    async (amountUsd) => {
      const { db, grants, balance } = ledger();
      await handleCreditTopUp(db, stripeFor(amountUsd), session(amountUsd, `cs_${amountUsd}`));

      const amountCents = amountUsd * CENTS_PER_USD;
      expect(grants).toHaveLength(1);
      expect(grants[0]!.microusd).toBe(amountCents * MICROUSD_PER_LEDGER_CENT);
      expect(grants[0]!.transactionType).toBe('purchase');
      expect(grants[0]!.accountId).toBe(ACCOUNT);
      expect(Number.isSafeInteger(balance())).toBe(true);
      expect(topUpUnitsForUsd(amountUsd)).toBe(amountUsd * CREDITS_PER_USD);
    },
  );

  it.each(TOP_UP_PRESET_AMOUNTS_USD.map((amountUsd) => [amountUsd] as const))(
    'grants $%s once however many events carry the same session',
    async (amountUsd) => {
      const { db, grants, balance } = ledger();
      const paid = session(amountUsd, `cs_repeat_${amountUsd}`);
      await handleCreditTopUp(db, stripeFor(amountUsd), paid);
      await handleCreditTopUp(db, stripeFor(amountUsd), paid);
      await handleCreditTopUp(db, stripeFor(amountUsd), { ...paid } as Stripe.Checkout.Session);

      expect(grants).toHaveLength(1);
      expect(balance()).toBe(amountUsd * CENTS_PER_USD * MICROUSD_PER_LEDGER_CENT);
    },
  );

  it('refuses metadata that claims more units than the money bought', async () => {
    for (const amountUsd of TOP_UP_PRESET_AMOUNTS_USD) {
      for (const claimedUnits of [
        amountUsd * CREDITS_PER_USD + 1,
        amountUsd * CREDITS_PER_USD * 2,
        Number.MAX_SAFE_INTEGER,
      ]) {
        const { db, grants } = ledger();
        const tampered = session(amountUsd, `cs_tampered_${amountUsd}_${claimedUnits}`);
        tampered.metadata!['top_up_units'] = String(claimedUnits);
        await handleCreditTopUp(db, stripeFor(amountUsd), tampered).catch(() => undefined);
        expect(grants).toEqual([]);
      }
    }
  });

  it('refuses a session whose charged total does not match the balance it claims', async () => {
    for (const amountUsd of TOP_UP_PRESET_AMOUNTS_USD) {
      const { db, grants } = ledger();
      const underpaid = session(amountUsd, `cs_underpaid_${amountUsd}`);
      await handleCreditTopUp(db, stripeFor(amountUsd - 1), underpaid).catch(() => undefined);
      expect(grants).toEqual([]);
    }
  });

  it('refuses a currency the ledger does not settle in', async () => {
    for (const amountUsd of TOP_UP_PRESET_AMOUNTS_USD) {
      const { db, grants } = ledger();
      const foreign = session(amountUsd, `cs_foreign_${amountUsd}`);
      (foreign as { currency: string }).currency = 'eur';
      await handleCreditTopUp(db, stripeFor(amountUsd), foreign).catch(() => undefined);
      expect(grants).toEqual([]);
    }
  });

  it('prices every preset with whole cents and whole credits inside the sold range', () => {
    for (const amountUsd of TOP_UP_PRESET_AMOUNTS_USD) {
      const amountCents = amountUsd * CENTS_PER_USD;
      expect(Number.isSafeInteger(amountCents)).toBe(true);
      expect(Number.isSafeInteger(amountCents * MICROUSD_PER_LEDGER_CENT)).toBe(true);
      expect(Number.isSafeInteger(topUpUnitsForUsd(amountUsd))).toBe(true);
      expect(amountUsd).toBeGreaterThanOrEqual(MIN_TOP_UP_AMOUNT_USD);
      expect(amountUsd).toBeLessThanOrEqual(MAX_TOP_UP_AMOUNT_USD);
      expect(isValidTopUpPurchase({ amountCents, units: topUpUnitsForUsd(amountUsd) })).toBe(true);
    }
  });

  it('refuses a fractional dollar amount rather than rounding it into credits', () => {
    for (const fractional of [10.5, 19.99, 100.01, 0.5]) {
      expect(topUpUnitsForUsd(fractional)).toBeNull();
      expect(
        isValidTopUpPurchase({
          amountCents: Math.round(fractional * CENTS_PER_USD),
          units: Math.round(fractional * CREDITS_PER_USD),
        }),
      ).toBe(false);
    }
  });
});
