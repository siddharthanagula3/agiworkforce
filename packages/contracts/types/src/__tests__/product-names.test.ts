import { describe, expect, it } from 'vitest';
import { PRODUCT_INSTALLED_NAMES, PRODUCT_NAMES } from '../product-names';

describe('product name registry', () => {
  it('installs only products that have an in-product name', () => {
    for (const product of Object.keys(PRODUCT_INSTALLED_NAMES)) {
      expect(PRODUCT_NAMES).toHaveProperty(product);
    }
  });
});
