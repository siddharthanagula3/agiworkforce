import { describe, expect, it } from 'vitest';
import { getPublishedMonthlyPriceCents } from '@agiworkforce/types';
import { getCurrencyForCountry, resolveLocalizedPlanPrice } from '../regional-pricing';

const proStripePrice = {
  currency: 'usd',
  unit_amount: 2_000,
  currency_options: {
    gbp: { unit_amount: 1_799 },
    eur: { unit_amount: 1_899 },
    inr: { unit_amount: 199_900 },
  },
};

describe('regional pricing', () => {
  it('maps deployment country codes to the local ISO currency', () => {
    expect(getCurrencyForCountry('IN')).toBe('inr');
    expect(getCurrencyForCountry('GB')).toBe('gbp');
    expect(getCurrencyForCountry('DE')).toBe('eur');
    expect(getCurrencyForCountry('US')).toBe('usd');
    expect(getCurrencyForCountry('not-a-country')).toBe('usd');
  });

  it('keeps the GST-inclusive India prices exact and marks them as tax included', () => {
    expect(resolveLocalizedPlanPrice('basic', 'monthly', 'inr', null)).toEqual({
      amountMinor: 39_900,
      currency: 'inr',
      localized: true,
      taxIncluded: true,
    });
    expect(resolveLocalizedPlanPrice('pro', 'monthly', 'inr', proStripePrice)?.amountMinor).toBe(
      199_900,
    );
    expect(resolveLocalizedPlanPrice('max', 'monthly', 'inr', null)?.amountMinor).toBe(999_900);
    expect(resolveLocalizedPlanPrice('max_15x', 'monthly', 'inr', null)?.amountMinor).toBe(
      1_999_900,
    );
    expect(resolveLocalizedPlanPrice('team', 'monthly', 'inr', null)?.amountMinor).toBe(249_900);
    expect(resolveLocalizedPlanPrice('team', 'yearly', 'inr', null)).toEqual({
      amountMinor: 2_398_800,
      currency: 'inr',
      localized: true,
      taxIncluded: true,
    });
  });

  it('uses Stripe multi-currency options for other configured countries', () => {
    expect(resolveLocalizedPlanPrice('pro', 'monthly', 'gbp', proStripePrice)).toMatchObject({
      amountMinor: 1_799,
      currency: 'gbp',
      localized: true,
    });
  });

  it('falls back honestly to the authored USD price when a currency is unavailable', () => {
    expect(resolveLocalizedPlanPrice('pro', 'monthly', 'cad', proStripePrice)).toMatchObject({
      amountMinor: 2_000,
      currency: 'usd',
      localized: false,
    });
  });

  it('never lets a Stripe USD amount override the published USD price', () => {
    const published = getPublishedMonthlyPriceCents('pro');
    const liveCatalogPrice = {
      currency: 'usd',
      unit_amount: published + 999,
      currency_options: { usd: { unit_amount: published + 999 } },
    };

    expect(resolveLocalizedPlanPrice('pro', 'monthly', 'usd', liveCatalogPrice)).toEqual({
      amountMinor: published,
      currency: 'usd',
      localized: false,
      taxIncluded: false,
    });
  });
});
