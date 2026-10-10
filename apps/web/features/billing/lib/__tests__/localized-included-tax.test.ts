import { describe, expect, it } from 'vitest';

import { BILLING_CURRENCY_TERMS } from '@agiworkforce/types';

import { localizedIncludedTax, type LocalizedPlanPrices } from '../localized-pricing';

function plans(entry: {
  currency: string;
  taxIncluded: boolean;
}): Pick<LocalizedPlanPrices, 'basic' | 'team'> {
  const price = { amountMinor: 1, localized: true, checkoutReady: true, ...entry };
  return { basic: { monthly: price }, team: { monthly: price, yearly: price } };
}

describe('localizedIncludedTax', () => {
  it('names GST for a tax-inclusive INR price on every interval sold', () => {
    const inr = plans({ currency: 'inr', taxIncluded: true }) as LocalizedPlanPrices;
    const label = BILLING_CURRENCY_TERMS.inr.includedTax?.label;
    expect(localizedIncludedTax(inr, 'basic', 'monthly')).toBe(label);
    expect(localizedIncludedTax(inr, 'team', 'monthly')).toBe(label);
    expect(localizedIncludedTax(inr, 'team', 'yearly')).toBe(label);
  });

  it('says nothing for a USD price, where tax is added at checkout', () => {
    const usd = plans({ currency: 'usd', taxIncluded: false }) as LocalizedPlanPrices;
    expect(localizedIncludedTax(usd, 'basic', 'monthly')).toBeNull();
  });

  it('says nothing when the price is missing', () => {
    expect(localizedIncludedTax(undefined, 'basic', 'monthly')).toBeNull();
  });
});
