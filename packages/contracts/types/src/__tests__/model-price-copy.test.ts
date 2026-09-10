import { describe, expect, it } from 'vitest';
import { MODEL_PRICE_NOTE, formatModelPriceInCredits } from '../model-price-copy';

describe('formatModelPriceInCredits', () => {
  it('quotes a model in credits per million tokens, never dollars', () => {
    const line = formatModelPriceInCredits(2, 10, 0.2);
    expect(line).toBe('100 credits / 1M input · 500 credits / 1M output · 10 credits / 1M cached');
    expect(line).not.toContain('$');
  });

  it('omits the cached band when the catalogue has no cached rate', () => {
    expect(formatModelPriceInCredits(2, 10)).toBe(
      '100 credits / 1M input · 500 credits / 1M output',
    );
  });

  it('keeps a sub-credit rate visible instead of rounding it to zero', () => {
    expect(formatModelPriceInCredits(0.0002, 0.0004)).toBe(
      '0.01 credits / 1M input · 0.02 credits / 1M output',
    );
  });

  it('reports a free model and an unpriced one differently', () => {
    expect(formatModelPriceInCredits(0, 0)).toBe('Included');
    expect(formatModelPriceInCredits()).toBe('N/A');
  });

  it('states what a credit means without naming a currency', () => {
    expect(MODEL_PRICE_NOTE).toBe('Credits reflect canonical value; token counts vary by model.');
  });
});
