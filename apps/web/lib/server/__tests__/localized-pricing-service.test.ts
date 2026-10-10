import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlanPriceInr, getPublishedMonthlyPriceCents } from '@agiworkforce/types';

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

const PUBLISHED_PRO_MONTHLY_CENTS = getPublishedMonthlyPriceCents('pro');

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

describe('getPriceSelectionForCurrency · GST-inclusive INR prices', () => {
  const INR_MINOR_PER_RUPEE = 100;

  beforeEach(() => {
    retrievePrice.mockReset();
    configuredPriceId.mockReset();
  });

  it.each([
    ['basic', 'monthly'],
    ['team', 'monthly'],
    ['team', 'yearly'],
  ] as const)(
    'opens %s %s INR checkout on a Price created tax-inclusive',
    async (plan, interval) => {
      const amountMinor = Math.round((getPlanPriceInr(plan, interval) ?? 0) * INR_MINOR_PER_RUPEE);
      configuredPriceId.mockReturnValue(`price_fixture_${plan}_${interval}_inr`);
      retrievePrice.mockResolvedValue({
        currency: 'inr',
        unit_amount: amountMinor,
        tax_behavior: 'inclusive',
        currency_options: null,
      });

      const { getPriceSelectionForCurrency } = await loadService();

      await expect(getPriceSelectionForCurrency(plan, interval, 'inr')).resolves.toEqual({
        priceId: `price_fixture_${plan}_${interval}_inr`,
        currency: 'inr',
        amountMinor,
      });
    },
  );

  it('keeps INR checkout closed on a Price that would add GST on top', async () => {
    configuredPriceId.mockReturnValue('price_fixture_basic_monthly_inr');
    retrievePrice.mockResolvedValue({
      currency: 'inr',
      unit_amount: Math.round((getPlanPriceInr('basic') ?? 0) * INR_MINOR_PER_RUPEE),
      tax_behavior: 'exclusive',
      currency_options: null,
    });

    const { getPriceSelectionForCurrency } = await loadService();

    await expect(getPriceSelectionForCurrency('basic', 'monthly', 'inr')).resolves.toBeNull();
  });

  it('keeps a USD Price tax-exclusive', async () => {
    configuredPriceId.mockReturnValue('price_fixture_pro_monthly_usd');
    retrievePrice.mockResolvedValue({
      currency: 'usd',
      unit_amount: PUBLISHED_PRO_MONTHLY_CENTS,
      tax_behavior: 'inclusive',
      currency_options: null,
    });

    const { getPriceSelectionForCurrency } = await loadService();

    await expect(getPriceSelectionForCurrency('pro', 'monthly', 'usd')).resolves.toBeNull();
  });

  it('marks the localized INR catalog entry as tax included and checkout ready', async () => {
    configuredPriceId.mockImplementation((plan: string, interval: string) =>
      plan === 'basic' && interval === 'monthly' ? 'price_fixture_basic_monthly_inr' : undefined,
    );
    retrievePrice.mockResolvedValue({
      currency: 'inr',
      unit_amount: Math.round((getPlanPriceInr('basic') ?? 0) * INR_MINOR_PER_RUPEE),
      tax_behavior: 'inclusive',
      currency_options: null,
    });

    const { getLocalizedPricingCatalog } = await loadService();
    const catalog = await getLocalizedPricingCatalog('IN');

    expect(catalog.plans.basic.monthly).toMatchObject({
      currency: 'inr',
      taxIncluded: true,
      checkoutReady: true,
    });
  });
});
