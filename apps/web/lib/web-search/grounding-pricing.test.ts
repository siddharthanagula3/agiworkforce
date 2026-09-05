import { describe, expect, it } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';

import { groundingPricingSource, resolveGroundingPricingTier } from './grounding-pricing';

const GOOGLE_MODELS = listCanonicalModels().filter((model) => model.provider === 'google');

describe('resolveGroundingPricingTier', () => {
  it('resolves the current tier for every routed Google model', () => {
    expect(GOOGLE_MODELS.length).toBeGreaterThan(0);
    for (const model of GOOGLE_MODELS) {
      const tier = resolveGroundingPricingTier(model.id);
      expect(tier.poolWindow).toBe('month');
      expect(tier.poolFreeRequests).toBe(5000);
      expect(tier.usdPerThousandBeyondPool).toBe(14);
    }
  });

  it('falls back to the older, lower-volume tier for a model outside the registry', () => {
    const tier = resolveGroundingPricingTier('not-a-registered-model');
    expect(tier.poolWindow).toBe('day');
    expect(tier.poolFreeRequests).toBe(1500);
    expect(tier.usdPerThousandBeyondPool).toBe(35);
  });
});

describe('groundingPricingSource', () => {
  it('carries a source URL and a fetch date', () => {
    const source = groundingPricingSource();
    expect(source.source).toMatch(/^https:\/\//);
    expect(source.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
