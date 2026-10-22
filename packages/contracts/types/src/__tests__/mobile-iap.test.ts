import { describe, expect, it } from 'vitest';
import {
  MOBILE_IAP_PRODUCT_DEFINITIONS,
  MOBILE_IAP_TOP_UP_AMOUNTS_USD,
  PURCHASED_CREDIT_EXPIRY_RULES,
  TOP_UP_UNITS_PER_USD,
  getMobileIapProductDefinition,
  mobileIapCountrySellsTopUps,
  mobileIapStorefrontSellsTopUps,
} from '../index';

describe('mobile IAP business catalog', () => {
  it('offers every store top-up at exactly 50 credits per intended USD', () => {
    const topUps = MOBILE_IAP_PRODUCT_DEFINITIONS.filter(
      (definition) => definition.kind === 'top_up',
    );

    expect(topUps.map((definition) => definition.amountUsd)).toEqual(MOBILE_IAP_TOP_UP_AMOUNTS_USD);
    for (const definition of topUps) {
      expect(definition.units).toBe(definition.amountUsd * TOP_UP_UNITS_PER_USD);
    }
  });

  it('has no duplicate logical product keys and no store product IDs', () => {
    const keys = MOBILE_IAP_PRODUCT_DEFINITIONS.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(MOBILE_IAP_PRODUCT_DEFINITIONS.every((definition) => !('productId' in definition))).toBe(
      true,
    );
  });

  it('fails closed for unrecognized logical product keys', () => {
    expect(getMobileIapProductDefinition('fixture-unregistered-product')).toBeNull();
  });
});

describe('mobile IAP top-up markets', () => {
  it('sells no store top-up where purchased credits expire', () => {
    for (const rule of PURCHASED_CREDIT_EXPIRY_RULES) {
      expect(mobileIapCountrySellsTopUps(rule.country)).toBe(false);
      expect(mobileIapStorefrontSellsTopUps(rule.appStoreStorefront)).toBe(false);
      expect(mobileIapStorefrontSellsTopUps(rule.country.toLowerCase())).toBe(false);
    }
  });

  it('sells top-ups in other App Store and Google Play countries', () => {
    expect(mobileIapStorefrontSellsTopUps('USA')).toBe(true);
    expect(mobileIapStorefrontSellsTopUps('US')).toBe(true);
    expect(mobileIapCountrySellsTopUps('DE')).toBe(true);
    expect(mobileIapCountrySellsTopUps(null)).toBe(true);
  });

  it('sells no top-up when the storefront is missing or unreadable', () => {
    expect(mobileIapStorefrontSellsTopUps(null)).toBe(false);
    expect(mobileIapStorefrontSellsTopUps('')).toBe(false);
    expect(mobileIapStorefrontSellsTopUps('US1')).toBe(false);
    expect(mobileIapStorefrontSellsTopUps('UNITED')).toBe(false);
  });
});
