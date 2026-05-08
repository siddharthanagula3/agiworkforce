import { describe, expect, it } from 'vitest';

import { PERPLEXITY_MODEL_CATALOG } from '../catalog';

describe('PERPLEXITY_MODEL_CATALOG', () => {
  it('is non-empty', () => {
    expect(PERPLEXITY_MODEL_CATALOG.length).toBeGreaterThan(0);
  });

  it('only contains models with provider === "perplexity"', () => {
    for (const m of PERPLEXITY_MODEL_CATALOG) {
      expect(m.provider).toBe('perplexity');
    }
  });

  it('every entry exposes id + provider (ModelInfo shape)', () => {
    for (const m of PERPLEXITY_MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
    }
  });
});
