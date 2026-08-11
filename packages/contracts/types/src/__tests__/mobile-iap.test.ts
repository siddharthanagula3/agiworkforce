import { describe, expect, it } from 'vitest';
import {
  MOBILE_IAP_PRODUCT_DEFINITIONS,
  TOP_UP_PRESET_AMOUNTS_USD,
  TOP_UP_UNITS_PER_USD,
  getMobileIapProductDefinition,
} from '../index';

describe('mobile IAP business catalog', () => {
  it('offers every canonical top-up preset at exactly 50 units per intended USD', () => {
    const topUps = MOBILE_IAP_PRODUCT_DEFINITIONS.filter(
      (definition) => definition.kind === 'top_up',
    );

    expect(topUps.map((definition) => definition.amountUsd)).toEqual(TOP_UP_PRESET_AMOUNTS_USD);
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
