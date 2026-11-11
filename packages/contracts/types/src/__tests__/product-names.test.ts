import { describe, expect, it } from 'vitest';
import { PRODUCT_NAMES, productNameWithArticle, type ProductKey } from '../product-names';

describe('product name registry', () => {
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
