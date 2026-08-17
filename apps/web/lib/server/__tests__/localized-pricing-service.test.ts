import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublishedPlanPriceCents } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const retrievePrice = vi.fn();

vi.mock('stripe', () => ({
  default: class {
    prices = { retrieve: retrievePrice };
  },
}));

vi.mock('@shared/utils/env', () => ({
  getOptionalEnv: () => 'sk_test_dummy',
  requireEnv: () => 'sk_test_dummy',
}));

const configuredPriceId = vi.fn();

vi.mock('@/lib/pricing', () => ({
  getConfiguredPriceId: (...args: unknown[]) => configuredPriceId(...args),
}));

async function loadService() {
  vi.resetModules();
  return import('../localized-pricing-service');
}

const PUBLISHED_PRO_MONTHLY_CENTS = getPublishedPlanPriceCents('pro', 'monthly');

describe('getPriceSelectionForCurrency · USD catalog divergence', () => {
  beforeEach(() => {
    retrievePrice.mockReset();
    configuredPriceId.mockReset();
    configuredPriceId.mockReturnValue('price_fixture_pro_monthly_usd');
  });

  it('sells at the published USD price when the Stripe catalog agrees', async () => {
    retrievePrice.mockResolvedValue({
      currency: 'usd',
      unit_amount: PUBLISHED_PRO_MONTHLY_CENTS,
      currency_options: null,
    });

    const { getPriceSelectionForCurrency } = await loadService();

    await expect(getPriceSelectionForCurrency('pro', 'monthly', 'usd')).resolves.toEqual({
      priceId: 'price_fixture_pro_monthly_usd',
      currency: 'usd',
      amountMinor: PUBLISHED_PRO_MONTHLY_CENTS,
    });
  });

  it('refuses checkout when the Stripe price charges more than the published USD price', async () => {
    retrievePrice.mockResolvedValue({
      currency: 'usd',
      unit_amount: PUBLISHED_PRO_MONTHLY_CENTS + 999,
      currency_options: null,
    });

    const { getPriceSelectionForCurrency } = await loadService();

    await expect(getPriceSelectionForCurrency('pro', 'monthly', 'usd')).resolves.toBeNull();
  });

  it('keeps Stripe multi-currency amounts authoritative outside USD', async () => {
    retrievePrice.mockResolvedValue({
      currency: 'usd',
      unit_amount: PUBLISHED_PRO_MONTHLY_CENTS,
      currency_options: { gbp: { unit_amount: 1_799 } },
    });

    const { getPriceSelectionForCurrency } = await loadService();

    await expect(getPriceSelectionForCurrency('pro', 'monthly', 'gbp')).resolves.toEqual({
      priceId: 'price_fixture_pro_monthly_usd',
      currency: 'gbp',
      amountMinor: 1_799,
    });
  });
});
