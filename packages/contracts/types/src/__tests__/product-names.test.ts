import { describe, expect, it } from 'vitest';
import {
  PRODUCT_INSTALLED_NAMES,
  PRODUCT_NAMES,
  productNameWithArticle,
  type ProductKey,
} from '../product-names';

describe('product name registry', () => {
  it('installs only products that have an in-product name', () => {
    for (const product of Object.keys(PRODUCT_INSTALLED_NAMES)) {
      expect(PRODUCT_NAMES).toHaveProperty(product);
    }
  });

  it('puts the article that the registry name is spoken with before it', () => {
    for (const product of Object.keys(PRODUCT_NAMES) as ProductKey[]) {
      expect(productNameWithArticle(product)).toMatch(
        new RegExp(`^an? ${PRODUCT_NAMES[product]}$`),
      );
    }
    expect(productNameWithArticle('work')).toBe(`a ${PRODUCT_NAMES.work}`);
    expect(productNameWithArticle('chat')).toBe(`a ${PRODUCT_NAMES.chat}`);
    expect(productNameWithArticle('extension')).toBe(`an ${PRODUCT_NAMES.extension}`);
    expect(productNameWithArticle('cli')).toBe(`a ${PRODUCT_NAMES.cli}`);
  });
});
