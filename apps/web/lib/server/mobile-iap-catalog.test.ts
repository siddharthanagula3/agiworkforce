import { afterEach, describe, expect, it } from 'vitest';
import { MOBILE_IAP_PRODUCT_DEFINITIONS, TOP_UP_UNITS_PER_USD } from '@agiworkforce/types';
import {
  getMobileIapAndroidReplacementModes,
  getMobileIapCatalogState,
  resolveMobileIapProduct,
} from './mobile-iap-catalog';

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

  it('keeps registered products verifiable after new purchases are switched off', () => {
    const topUp = MOBILE_IAP_PRODUCT_DEFINITIONS.find(
      (definition) => definition.kind === 'top_up',
    )!;
    process.env['MOBILE_IAP_ENABLED'] = 'false';
    process.env['MOBILE_IAP_APPLE_PRODUCT_IDS_JSON'] = JSON.stringify({
      [topUp.key]: 'fixture.apple.previous-topup',
    });

    expect(getMobileIapCatalogState('ios')).toMatchObject({ enabled: false, products: [] });
    expect(resolveMobileIapProduct('ios', 'fixture.apple.previous-topup')).toMatchObject({
      key: topUp.key,
      productId: 'fixture.apple.previous-topup',
    });
    expect(resolveMobileIapProduct('ios', 'fixture.apple.unregistered')).toBeNull();
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
  it('sells a Google Play subscription only with the base plan it is configured for', () => {
    const subscription = MOBILE_IAP_PRODUCT_DEFINITIONS.find(
      (definition) => definition.kind === 'subscription',
    )!;
    process.env['MOBILE_IAP_ENABLED'] = '1';
    process.env['MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON'] = JSON.stringify({
      [subscription.key]: 'fixture.google.subscription',
    });
    expect(() => getMobileIapCatalogState('android')).toThrow(/must name the base plan/i);

    process.env['MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON'] = JSON.stringify({
      [subscription.key]: { productId: 'fixture.google.subscription', basePlanId: 'monthly' },
    });
    expect(getMobileIapCatalogState('android').products).toEqual([
      {
        ...subscription,
        productId: 'fixture.google.subscription',
        googleOffer: { basePlanId: 'monthly', offerId: null },
      },
    ]);

    process.env['MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON'] = JSON.stringify({
      [subscription.key]: {
        productId: 'fixture.google.subscription',
        basePlanId: 'monthly',
        offerId: 'launch',
      },
    });
    expect(getMobileIapCatalogState('android').products[0]).toMatchObject({
      googleOffer: { basePlanId: 'monthly', offerId: 'launch' },
    });
  });

  it('refuses a base plan where the store has none', () => {
    const subscription = MOBILE_IAP_PRODUCT_DEFINITIONS.find(
      (definition) => definition.kind === 'subscription',
    )!;
    const topUp = MOBILE_IAP_PRODUCT_DEFINITIONS.find(
      (definition) => definition.kind === 'top_up',
    )!;
    process.env['MOBILE_IAP_ENABLED'] = '1';
    process.env['MOBILE_IAP_APPLE_PRODUCT_IDS_JSON'] = JSON.stringify({
      [subscription.key]: { productId: 'fixture.apple.subscription', basePlanId: 'monthly' },
    });
    expect(() => getMobileIapCatalogState('ios')).toThrow(/only a Google Play subscription/i);

    process.env['MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON'] = JSON.stringify({
      [topUp.key]: { productId: 'fixture.google.topup', basePlanId: 'monthly' },
    });
    expect(() => getMobileIapCatalogState('android')).toThrow(/only a Google Play subscription/i);
  });

  it("uses Google Play's recommended replacement mode per direction unless the deployment sets one", () => {
    delete process.env['MOBILE_IAP_GOOGLE_REPLACEMENT_MODES_JSON'];
    expect(getMobileIapAndroidReplacementModes()).toEqual({
      upgrade: 'charge-prorated-price',
      downgrade: 'deferred',
    });

    process.env['MOBILE_IAP_GOOGLE_REPLACEMENT_MODES_JSON'] = JSON.stringify({
      upgrade: 'with-time-proration',
      downgrade: 'without-proration',
    });
    expect(getMobileIapAndroidReplacementModes()).toEqual({
      upgrade: 'with-time-proration',
      downgrade: 'without-proration',
    });

    process.env['MOBILE_IAP_GOOGLE_REPLACEMENT_MODES_JSON'] = JSON.stringify({
      upgrade: 'charge-prorated-price',
      downgrade: 'charge-prorated-price',
    });
    expect(() => getMobileIapAndroidReplacementModes()).toThrow(/downgrade/i);

    process.env['MOBILE_IAP_GOOGLE_REPLACEMENT_MODES_JSON'] = JSON.stringify({ upgrade: 'soon' });
    expect(() => getMobileIapAndroidReplacementModes()).toThrow(/replacement mode/i);
  });
});
