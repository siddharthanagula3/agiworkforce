import { describe, expect, it } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';

import {
  isActivelyRoutedModel,
  googleGroundingPricingSource,
  perplexitySearchPricingSource,
  perplexitySearchUsdPerThousandRequests,
  resolveGoogleGroundingPricingTier,
} from './web-search-pricing';

const GOOGLE_MODELS = listCanonicalModels().filter((model) => model.provider === 'google');
const ROUTED_GOOGLE_MODELS = GOOGLE_MODELS.filter((model) => isActivelyRoutedModel(model.id));
const RETIRED_GOOGLE_MODELS = GOOGLE_MODELS.filter((model) => !isActivelyRoutedModel(model.id));

describe('resolveGoogleGroundingPricingTier', () => {
  it('resolves the current tier for every routed Google model', () => {
    expect(ROUTED_GOOGLE_MODELS.length).toBeGreaterThan(0);
    for (const model of ROUTED_GOOGLE_MODELS) {
      const tier = resolveGoogleGroundingPricingTier(model.id);
      expect(tier.poolWindow).toBe('month');
      expect(tier.poolFreeRequests).toBe(5000);
      expect(tier.usdPerThousandBeyondPool).toBe(14);
    }
  });

  it('keeps a retired Google model on the tier it was billed under', () => {
    for (const model of RETIRED_GOOGLE_MODELS) {
      expect(resolveGoogleGroundingPricingTier(model.id).poolWindow).toBe('day');
    }
  });

  it('falls back to the older, lower-volume tier for a model outside the registry', () => {
    const tier = resolveGoogleGroundingPricingTier('not-a-registered-model');
    expect(tier.poolWindow).toBe('day');
    expect(tier.poolFreeRequests).toBe(1500);
    expect(tier.usdPerThousandBeyondPool).toBe(35);
  });
});

describe('googleGroundingPricingSource', () => {
  it('carries a source URL and a fetch date', () => {
    const source = googleGroundingPricingSource();
    expect(source.source).toMatch(/^https:\/\//);
    expect(source.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('perplexitySearchUsdPerThousandRequests', () => {
  it('reads the published rate', () => {
    expect(perplexitySearchUsdPerThousandRequests()).toBe(5);
  });
});

describe('perplexitySearchPricingSource', () => {
  it('carries a source URL and a fetch date', () => {
    const source = perplexitySearchPricingSource();
    expect(source.source).toMatch(/^https:\/\//);
    expect(source.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
