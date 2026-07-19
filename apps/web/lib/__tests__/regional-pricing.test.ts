import { describe, expect, it } from 'vitest';
import {
  formatLocalizedPrice,
  getCurrencyForCountry,
  resolveLocalizedPlanPrice,
} from '../regional-pricing';

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

  it('keeps founder-set India monthly prices exact', () => {
    expect(resolveLocalizedPlanPrice('basic', 'monthly', 'inr', null).amountMinor).toBe(39_900);
    expect(resolveLocalizedPlanPrice('pro', 'monthly', 'inr', proStripePrice).amountMinor).toBe(
      199_900,
    );
    expect(resolveLocalizedPlanPrice('max', 'monthly', 'inr', null).amountMinor).toBe(999_900);
    expect(resolveLocalizedPlanPrice('max_15x', 'monthly', 'inr', null).amountMinor).toBe(
      2_499_900,
    );
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

  it('formats currencies with their locale-aware symbols and minor units', () => {
    expect(formatLocalizedPrice(199_900, 'inr', 'en-IN')).toBe('₹1,999');
    expect(formatLocalizedPrice(1_799, 'gbp', 'en-GB')).toBe('£17.99');
  });
});
