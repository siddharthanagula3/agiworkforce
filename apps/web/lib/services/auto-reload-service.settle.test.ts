import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { TOP_UP_CONVERSION, quoteTopUp, type TopUpQuote } from '@agiworkforce/types';
import type { NormalizedPayment } from '@/lib/server/payments/domain';
type ScanModule0 = typeof import('@/app/api/stripe-webhook/lib/db');

const mocks = vi.hoisted(() => ({
  grantCreditTopUp: vi.fn(),
  isCreditTopUpApplied: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/app/api/stripe-webhook/lib/db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  grantCreditTopUp: mocks.grantCreditTopUp,
  isCreditTopUpApplied: mocks.isCreditTopUpApplied,
}));

import { settleAutoReloadPayment } from './auto-reload-service';

const TAX_CENTS = 360;

function reloadQuote(amountUsd: number): TopUpQuote {
  const quote = quoteTopUp(amountUsd, { autoReload: true });
  if (!quote) throw new Error(`no auto-reload quote for $${amountUsd}`);
  return quote;
}

function payment(quote: TopUpQuote, overrides: Partial<NormalizedPayment> = {}): NormalizedPayment {
  return {
    reference: 'pi_reload_1',
    status: 'succeeded',
    amountReceived: { currency: 'USD', minorUnits: quote.priceCents + TAX_CENTS },
    metadata: {
      user_id: 'user_reload',
      auto_reload_attempt_id: 'attempt_1',
      conversion: TOP_UP_CONVERSION,
      amount_usd: String(quote.amountUsd),
      price_cents: String(quote.priceCents),
      credit_amount_cents: String(quote.budgetCents),
      top_up_units: String(quote.credits),
      auto_reload: 'true',
      tax_cents: String(TAX_CENTS),
      billing_country: 'US',
    },
    failureCode: null,
    declineCode: null,
    ...overrides,
  } as NormalizedPayment;
}

const execute = vi.fn();
const db = { query: vi.fn(), execute } as unknown as DatabaseAdapter;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.grantCreditTopUp.mockResolvedValue(undefined);
  mocks.isCreditTopUpApplied.mockResolvedValue(false);
  execute.mockResolvedValue(1);
});

describe('settleAutoReloadPayment', () => {
  it('grants the reload pack and records the discounted price it charged, in dollars', async () => {
    const quote = reloadQuote(50);

    await settleAutoReloadPayment(db, payment(quote));

    expect(quote).toMatchObject({ discountPercent: 10, priceCents: 4_500, credits: 2_500 });
    expect(mocks.grantCreditTopUp).toHaveBeenCalledWith(db, {
      userId: 'user_reload',
      creditAmountCents: quote.budgetCents,
      chargedCents: 4_500,
      chargedCurrency: 'USD',
      receiptId: 'pi_reload_1',
      purchaseCountry: 'US',
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('update public.auto_reload_settings'),
      ['user_reload', 'attempt_1'],
    );
  });

  it('closes the attempt without granting a reload twice', async () => {
    mocks.isCreditTopUpApplied.mockResolvedValueOnce(true);

    await settleAutoReloadPayment(db, payment(reloadQuote(50)));

    expect(mocks.grantCreditTopUp).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('refuses a payment that did not collect the price plus tax in dollars', async () => {
    const quote = reloadQuote(100);

    for (const amountReceived of [
      { currency: 'USD', minorUnits: quote.priceCents },
      { currency: 'EUR', minorUnits: quote.priceCents + TAX_CENTS },
    ]) {
      await expect(settleAutoReloadPayment(db, payment(quote, { amountReceived }))).rejects.toThrow(
        'Auto-reload payment mismatch',
      );
    }
    expect(mocks.grantCreditTopUp).not.toHaveBeenCalled();
  });
});
