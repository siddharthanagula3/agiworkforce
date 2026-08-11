import { afterEach, describe, expect, it } from 'vitest';
import { MOBILE_IAP_PRODUCT_DEFINITIONS, TOP_UP_UNITS_PER_USD } from '@agiworkforce/types';
import { getMobileIapCatalogState, resolveMobileIapProduct } from './mobile-iap-catalog';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('mobile IAP deployment catalog', () => {
  it('fails closed when native billing is disabled', () => {
    delete process.env['MOBILE_IAP_ENABLED'];
    expect(getMobileIapCatalogState('ios')).toMatchObject({ enabled: false, products: [] });
  });

  it('projects only registered store IDs from canonical business definitions', () => {
    const subscription = MOBILE_IAP_PRODUCT_DEFINITIONS.find(
      (definition) => definition.kind === 'subscription',
    )!;
    const topUp = MOBILE_IAP_PRODUCT_DEFINITIONS.find(
      (definition) => definition.kind === 'top_up',
    )!;
    process.env['MOBILE_IAP_ENABLED'] = '1';
    process.env['MOBILE_IAP_APPLE_PRODUCT_IDS_JSON'] = JSON.stringify({
      [subscription.key]: 'fixture.apple.subscription',
      [topUp.key]: 'fixture.apple.topup',
    });

    const state = getMobileIapCatalogState('ios');
    expect(state.enabled).toBe(true);
    expect(state.products).toEqual([
      { ...subscription, productId: 'fixture.apple.subscription' },
      { ...topUp, productId: 'fixture.apple.topup' },
    ]);
    expect(resolveMobileIapProduct('ios', 'fixture.apple.topup')).toMatchObject({
      kind: 'top_up',
      units: topUp.amountUsd * TOP_UP_UNITS_PER_USD,
    });
  });

  it('rejects unknown keys and duplicate store IDs', () => {
    process.env['MOBILE_IAP_ENABLED'] = '1';
    process.env['MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON'] = JSON.stringify({
      fixture_unknown: 'fixture.google.same',
    });
    expect(() => getMobileIapCatalogState('android')).toThrow(/unknown product key/i);

    const [first, second] = MOBILE_IAP_PRODUCT_DEFINITIONS;
    process.env['MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON'] = JSON.stringify({
      [first!.key]: 'fixture.google.same',
      [second!.key]: 'fixture.google.same',
    });
    expect(() => getMobileIapCatalogState('android')).toThrow(/same store ID/i);
  });
});
