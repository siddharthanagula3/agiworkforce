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
  MAX_TOP_UP_AMOUNT_USD,
  MICROUSD_PER_CREDIT,
  MIN_TOP_UP_AMOUNT_USD,
  TOP_UP_CONVERSION,
  TOP_UP_PRESET_AMOUNTS_USD,
  TOP_UP_UNITS_PER_USD,
  isValidTopUpPurchase,
  quoteTopUp,
  topUpUnitsForUsd,
  type TopUpQuote,
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
  metadata: unknown;
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
        metadata: params[5],
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

function quote(amountUsd: number): TopUpQuote {
  const quoted = quoteTopUp(amountUsd);
  if (!quoted) throw new Error(`no quote for $${amountUsd}`);
  return quoted;
}

function session(amountUsd: number, sessionId: string): Stripe.Checkout.Session {
  const quoted = quote(amountUsd);
  return {
    id: sessionId,
    currency: 'usd',
    amount_subtotal: quoted.priceCents,
    amount_total: quoted.priceCents,
    payment_intent: 'pi_1',
    payment_status: 'paid',
    metadata: {
      type: 'credit_topup',
      user_id: USER,
      conversion: TOP_UP_CONVERSION,
      amount_usd: String(quoted.amountUsd),
      price_cents: String(quoted.priceCents),
      discount_percent: String(quoted.discountPercent),
      credit_amount_cents: String(quoted.budgetCents),
      top_up_units: String(quoted.credits),
      auto_reload: 'false',
    },
  } as unknown as Stripe.Checkout.Session;
}

function legacySession(amountUsd: number, sessionId: string): Stripe.Checkout.Session {
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
      top_up_units: String(amountUsd * TOP_UP_UNITS_PER_USD),
    },
  } as unknown as Stripe.Checkout.Session;
}

function stripeReceiving(amountReceivedCents: number): Stripe {
  return {
    paymentIntents: {
      retrieve: async () => ({
        id: 'pi_1',
        status: 'succeeded',
        currency: 'usd',
        amount_received: amountReceivedCents,
      }),
    },
  } as unknown as Stripe;
}

describe('a purchased top-up grants exactly what was paid for', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(TOP_UP_PRESET_AMOUNTS_USD.map((amountUsd) => [amountUsd] as const))(
    'grants the $%s pack its fifty credits per dollar in whole microUSD',
    async (amountUsd) => {
      const { db, grants, balance } = ledger();
      const quoted = quote(amountUsd);
      await handleCreditTopUp(
        db,
        stripeReceiving(quoted.priceCents),
        session(amountUsd, `cs_${amountUsd}`),
      );

      expect(quoted.credits).toBe(amountUsd * TOP_UP_UNITS_PER_USD);
      expect(topUpUnitsForUsd(amountUsd)).toBe(quoted.credits);
      expect(grants).toHaveLength(1);
      expect(grants[0]!.microusd).toBe(quoted.credits * MICROUSD_PER_CREDIT);
      expect(grants[0]!.microusd).toBe(quoted.budgetCents * MICROUSD_PER_LEDGER_CENT);
      expect(grants[0]!.transactionType).toBe('purchase');
      expect(grants[0]!.accountId).toBe(ACCOUNT);
      expect(Number.isSafeInteger(balance())).toBe(true);
    },
  );

  it('grants the $20 pack 1,000 credits, which is $5 of provider cost', async () => {
    const { db, grants } = ledger();
    await handleCreditTopUp(db, stripeReceiving(2_000), session(20, 'cs_twenty'));

    expect(quote(20)).toMatchObject({ credits: 1_000, priceCents: 2_000, budgetCents: 500 });
    expect(grants[0]!.microusd).toBe(5_000_000);
  });

  it('charges the discounted pack price, grants the full pack and records what was paid', async () => {
    const { db, grants } = ledger();
    const quoted = quote(1_000);
    await handleCreditTopUp(db, stripeReceiving(quoted.priceCents), session(1_000, 'cs_thousand'));

    expect(quoted).toMatchObject({ discountPercent: 30, priceCents: 70_000, credits: 50_000 });
    expect(grants[0]!.microusd).toBe(50_000 * MICROUSD_PER_CREDIT);
    expect(JSON.parse(String(grants[0]!.metadata))).toMatchObject({ charged_cents: 70_000 });
  });

  it('records the list price paid for a checkout sold under the first conversion', async () => {
    const { db, grants } = ledger();
    await handleCreditTopUp(db, stripeReceiving(2_000), legacySession(20, 'cs_legacy_price'));

    expect(JSON.parse(String(grants[0]!.metadata))).toMatchObject({ charged_cents: 2_000 });
  });

  it.each(TOP_UP_PRESET_AMOUNTS_USD.map((amountUsd) => [amountUsd] as const))(
    'grants $%s once however many events carry the same session',
    async (amountUsd) => {
      const { db, grants, balance } = ledger();
      const quoted = quote(amountUsd);
      const paid = session(amountUsd, `cs_repeat_${amountUsd}`);
      await handleCreditTopUp(db, stripeReceiving(quoted.priceCents), paid);
      await handleCreditTopUp(db, stripeReceiving(quoted.priceCents), paid);
      await handleCreditTopUp(db, stripeReceiving(quoted.priceCents), {
        ...paid,
      } as Stripe.Checkout.Session);

      expect(grants).toHaveLength(1);
      expect(balance()).toBe(quoted.credits * MICROUSD_PER_CREDIT);
    },
  );

  it('still settles a checkout sold under the first conversion at what it was sold for', async () => {
    const { db, grants } = ledger();
    await handleCreditTopUp(db, stripeReceiving(2_000), legacySession(20, 'cs_legacy'));

    expect(grants).toHaveLength(1);
    expect(grants[0]!.microusd).toBe(2_000 * MICROUSD_PER_LEDGER_CENT);
  });

  it('refuses metadata that claims more units than the money bought', async () => {
    for (const amountUsd of TOP_UP_PRESET_AMOUNTS_USD) {
      const quoted = quote(amountUsd);
      for (const claimedUnits of [
        quoted.credits + 1,
        quoted.credits * 2,
        Number.MAX_SAFE_INTEGER,
      ]) {
        const { db, grants } = ledger();
        const tampered = session(amountUsd, `cs_tampered_${amountUsd}_${claimedUnits}`);
        tampered.metadata!['top_up_units'] = String(claimedUnits);
        await handleCreditTopUp(db, stripeReceiving(quoted.priceCents), tampered).catch(
          () => undefined,
        );
        expect(grants).toEqual([]);
      }
    }
  });

  it('refuses metadata that claims a bigger balance than the pack buys', async () => {
    for (const amountUsd of TOP_UP_PRESET_AMOUNTS_USD) {
      const quoted = quote(amountUsd);
      const { db, grants } = ledger();
      const tampered = session(amountUsd, `cs_budget_${amountUsd}`);
      tampered.metadata!['credit_amount_cents'] = String(amountUsd * CENTS_PER_USD);
      await handleCreditTopUp(db, stripeReceiving(quoted.priceCents), tampered).catch(
        () => undefined,
      );
      expect(grants).toEqual([]);
    }
  });

  it('refuses a session whose charged total does not match the balance it claims', async () => {
    for (const amountUsd of TOP_UP_PRESET_AMOUNTS_USD) {
      const { db, grants } = ledger();
      const underpaid = session(amountUsd, `cs_underpaid_${amountUsd}`);
      await handleCreditTopUp(
        db,
        stripeReceiving(quote(amountUsd).priceCents - 100),
        underpaid,
      ).catch(() => undefined);
      expect(grants).toEqual([]);
    }
  });

  it('refuses a currency the ledger does not settle in', async () => {
    for (const amountUsd of TOP_UP_PRESET_AMOUNTS_USD) {
      const { db, grants } = ledger();
      const foreign = session(amountUsd, `cs_foreign_${amountUsd}`);
      (foreign as { currency: string }).currency = 'eur';
      await handleCreditTopUp(db, stripeReceiving(quote(amountUsd).priceCents), foreign).catch(
        () => undefined,
      );
      expect(grants).toEqual([]);
    }
  });

  it('prices every preset with whole cents and whole credits inside the sold range', () => {
    for (const amountUsd of TOP_UP_PRESET_AMOUNTS_USD) {
      const quoted = quote(amountUsd);
      expect(Number.isSafeInteger(quoted.priceCents)).toBe(true);
      expect(Number.isSafeInteger(quoted.budgetCents)).toBe(true);
      expect(Number.isSafeInteger(quoted.budgetCents * MICROUSD_PER_LEDGER_CENT)).toBe(true);
      expect(Number.isSafeInteger(quoted.credits)).toBe(true);
      expect(amountUsd).toBeGreaterThanOrEqual(MIN_TOP_UP_AMOUNT_USD);
      expect(amountUsd).toBeLessThanOrEqual(MAX_TOP_UP_AMOUNT_USD);
      expect(
        isValidTopUpPurchase({
          conversion: TOP_UP_CONVERSION,
          amountCents: quoted.budgetCents,
          units: quoted.credits,
          priceCents: quoted.priceCents,
          amountUsd,
        }),
      ).toBe(true);
    }
  });

  it('refuses a fractional dollar amount rather than rounding it into credits', () => {
    for (const fractional of [10.5, 19.99, 100.01, 0.5]) {
      expect(topUpUnitsForUsd(fractional)).toBeNull();
      expect(quoteTopUp(fractional)).toBeNull();
      expect(
        isValidTopUpPurchase({
          conversion: TOP_UP_CONVERSION,
          amountCents: Math.round((fractional * TOP_UP_UNITS_PER_USD) / 2),
          units: Math.round(fractional * TOP_UP_UNITS_PER_USD),
          priceCents: Math.round(fractional * CENTS_PER_USD),
          amountUsd: fractional,
        }),
      ).toBe(false);
    }
  });
});
