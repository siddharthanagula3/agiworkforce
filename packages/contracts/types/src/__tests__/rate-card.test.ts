import { describe, expect, it } from 'vitest';

import {
  centsFromMicrousdCeil,
  creditsFromMicrousd,
  customerChargeMicrousd,
  FEATURE_RATE_CARD,
  MICROUSD_PER_CREDIT,
  RATE_CARD_FEATURES,
  RATE_CARD_PROVIDER_COGS_ENV,
  resolveFeatureRate,
} from '../rate-card';
import { TOP_UP_UNITS_PER_USD } from '../billing-topups';

describe('FEATURE_RATE_CARD', () => {
  it('carries one row per feature, each sourced and dated', () => {
    for (const feature of RATE_CARD_FEATURES) {
      const entry = FEATURE_RATE_CARD[feature];
      expect(entry).toBeDefined();
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('separates the customer price from the provider cost on every row', () => {
    for (const feature of RATE_CARD_FEATURES) {
      const entry = FEATURE_RATE_CARD[feature];
      if (entry.customerBasis === 'rate_card') {
        expect(typeof entry.customerMicrousd).toBe('number');
      } else {
        expect(entry.customerMicrousd).toBeNull();
      }
      if (entry.providerCogsMicrousd !== null) {
        expect(entry.providerCogsMicrousd).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('prices search at the published provider rates', () => {
    expect(FEATURE_RATE_CARD.web_search_perplexity.providerCogsMicrousd).toBe(5_000);
    expect(FEATURE_RATE_CARD.web_search_grounding.providerCogsMicrousd).toBe(14_000);
  });

  it('charges search at the provider cost rounded up to a whole cent', () => {
    for (const feature of ['web_search_perplexity', 'web_search_grounding'] as const) {
      const entry = FEATURE_RATE_CARD[feature];
      expect(entry.customerMicrousd).toBe(
        centsFromMicrousdCeil(entry.providerCogsMicrousd ?? 0) * 10_000,
      );
    }
  });

  it('keeps the image and voice customer prices the product already charges', () => {
    expect(FEATURE_RATE_CARD.image_generation_openai_medium.customerMicrousd).toBe(50_000);
    expect(FEATURE_RATE_CARD.image_generation_openai_high.customerMicrousd).toBe(210_000);
    expect(FEATURE_RATE_CARD.image_generation_google.customerMicrousd).toBe(30_000);
    expect(FEATURE_RATE_CARD.voice_live_minute.customerMicrousd).toBe(50_000);
  });

  it('marks every inferred provider figure as an estimate', () => {
    expect(FEATURE_RATE_CARD.image_generation_openai_low.estimate).toBe(true);
    expect(FEATURE_RATE_CARD.image_generation_openai_medium.estimate).toBe(true);
    expect(FEATURE_RATE_CARD.image_generation_openai_high.estimate).toBe(true);
    expect(FEATURE_RATE_CARD.voice_live_minute.estimate).toBe(true);
    expect(FEATURE_RATE_CARD.web_search_perplexity.estimate).toBeUndefined();
    expect(FEATURE_RATE_CARD.web_search_grounding.estimate).toBeUndefined();
  });
});

describe('resolveFeatureRate', () => {
  it('returns the published rate when no override is set', () => {
    const rate = resolveFeatureRate('web_search_perplexity', {});
    expect(rate.providerCogsMicrousd).toBe(5_000);
    expect(rate.overrideApplied).toBe(false);
    expect(rate.overrideEnv).toBe(RATE_CARD_PROVIDER_COGS_ENV.web_search_perplexity);
  });

  it('honours a valid provider-cost override', () => {
    const rate = resolveFeatureRate('web_search_grounding', {
      AGI_GOOGLE_GROUNDING_MICROUSD_PER_CALL: '9000',
    });
    expect(rate.providerCogsMicrousd).toBe(9_000);
    expect(rate.overrideApplied).toBe(true);
  });

  it('reports an unusable override instead of pricing from it', () => {
    const rate = resolveFeatureRate('web_search_perplexity', {
      AGI_PERPLEXITY_SEARCH_MICROUSD_PER_CALL: 'not-a-number',
    });
    expect(rate.providerCogsMicrousd).toBe(5_000);
    expect(rate.overrideInvalid).toBe(true);
    expect(rate.overrideApplied).toBe(false);
  });

  it('leaves features without an override untouched', () => {
    const rate = resolveFeatureRate('image_generation_google', {});
    expect(rate.overrideEnv).toBeUndefined();
    expect(rate.providerCogsMicrousd).toBe(67_000);
  });
});

describe('customerChargeMicrousd', () => {
  it('waives an interactive-chat feature only while it is included', () => {
    expect(customerChargeMicrousd('web_search_perplexity', { included: true })).toBe(0);
    expect(customerChargeMicrousd('web_search_perplexity', { included: false })).toBe(10_000);
    expect(customerChargeMicrousd('web_search_grounding', { included: false })).toBe(20_000);
  });

  it('charges a no-plan feature regardless of surface', () => {
    expect(customerChargeMicrousd('image_generation_openai_high', { included: true })).toBe(
      210_000,
    );
  });
});

describe('credit conversion', () => {
  it('derives the credit size from the public top-up rate', () => {
    expect(MICROUSD_PER_CREDIT).toBe(1_000_000 / TOP_UP_UNITS_PER_USD);
    expect(creditsFromMicrousd(MICROUSD_PER_CREDIT)).toBe(1);
    expect(creditsFromMicrousd(0)).toBe(0);
  });

  it('rounds a partial cent up so a charge is never free', () => {
    expect(centsFromMicrousdCeil(1)).toBe(1);
    expect(centsFromMicrousdCeil(5_000)).toBe(1);
    expect(centsFromMicrousdCeil(14_000)).toBe(2);
  });
});
