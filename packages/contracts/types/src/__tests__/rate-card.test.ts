import { describe, expect, it } from 'vitest';

import {
  centsFromMicrousdCeil,
  chargeMicrousdForProviderCost,
  creditsFromMicrousd,
  customerChargeMicrousd,
  FEATURE_RATE_CARD,
  MICROUSD_PER_CREDIT,
  RATE_CARD_FEATURES,
  RATE_CARD_PROVIDER_COGS_ENV,
  rateCardUsageLabel,
  resolveFeatureRate,
  unpricedRateCardFeatures,
} from '../rate-card';

describe('FEATURE_RATE_CARD', () => {
  it('carries one row per feature, each sourced and dated', () => {
    for (const feature of RATE_CARD_FEATURES) {
      const entry = FEATURE_RATE_CARD[feature];
      expect(entry).toBeDefined();
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('publishes a positive provider cost on every row', () => {
    for (const feature of RATE_CARD_FEATURES) {
      expect(FEATURE_RATE_CARD[feature].providerCogsMicrousd).toBeGreaterThan(0);
    }
    expect(unpricedRateCardFeatures({})).toEqual([]);
  });

  it('prices search and places at the published provider rates', () => {
    expect(FEATURE_RATE_CARD.web_search_perplexity.providerCogsMicrousd).toBe(5_000);
    expect(FEATURE_RATE_CARD.web_search_grounding.providerCogsMicrousd).toBe(14_000);
    expect(FEATURE_RATE_CARD.web_search_anthropic.providerCogsMicrousd).toBe(10_000);
    expect(FEATURE_RATE_CARD.web_search_openai.providerCogsMicrousd).toBe(10_000);
    expect(FEATURE_RATE_CARD.places_text_search.providerCogsMicrousd).toBe(35_000);
  });

  it('prices a Google image and a live voice minute at provider cost', () => {
    expect(
      creditsFromMicrousd(FEATURE_RATE_CARD.image_generation_google.providerCogsMicrousd ?? 0),
    ).toBe(13.4);
    expect(creditsFromMicrousd(FEATURE_RATE_CARD.voice_live_minute.providerCogsMicrousd ?? 0)).toBe(
      10,
    );
  });

  it('includes every infrastructure row in all plans and names its vendor', () => {
    for (const feature of RATE_CARD_FEATURES) {
      const entry = FEATURE_RATE_CARD[feature];
      if (entry.vendor === undefined) continue;
      expect(entry.includedInPlans).toBe('all_plans');
      expect(customerChargeMicrousd(feature)).toBe(0);
    }
  });

  it('marks every inferred provider figure as an estimate', () => {
    expect(FEATURE_RATE_CARD.image_generation_openai_low.estimate).toBe(true);
    expect(FEATURE_RATE_CARD.image_generation_openai_medium.estimate).toBe(true);
    expect(FEATURE_RATE_CARD.image_generation_openai_high.estimate).toBe(true);
    expect(FEATURE_RATE_CARD.vector_query_request.estimate).toBe(true);
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
    const rate = resolveFeatureRate('network_egress_gib', {
      AGI_EGRESS_MICROUSD_PER_GIB: '90000',
    });
    expect(rate.providerCogsMicrousd).toBe(90_000);
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
    expect(customerChargeMicrousd('web_search_perplexity', { included: false })).toBe(5_000);
    expect(customerChargeMicrousd('web_search_grounding', { included: false })).toBe(14_000);
  });

  it('charges a no-plan feature at provider cost regardless of inclusion', () => {
    expect(customerChargeMicrousd('image_generation_openai_high', { included: true })).toBe(
      FEATURE_RATE_CARD.image_generation_openai_high.providerCogsMicrousd,
    );
  });
});

describe('credit conversion', () => {
  it('holds one credit as 5,000 microUSD of provider cost', () => {
    expect(MICROUSD_PER_CREDIT).toBe(5_000);
    expect(creditsFromMicrousd(MICROUSD_PER_CREDIT)).toBe(1);
    expect(creditsFromMicrousd(0)).toBe(0);
  });

  it('charges provider cost rounded up to a hundredth of a credit, never below it', () => {
    expect(chargeMicrousdForProviderCost(1)).toBe(50);
    expect(chargeMicrousdForProviderCost(14_000)).toBe(14_000);
    for (const microusd of [1, 49, 51, 4.5, 14, 16_106.13, 225_485.78]) {
      expect(chargeMicrousdForProviderCost(microusd)).toBeGreaterThanOrEqual(microusd);
    }
  });

  it('rounds a partial cent up so a ledger debit is never free', () => {
    expect(centsFromMicrousdCeil(1)).toBe(1);
    expect(centsFromMicrousdCeil(5_000)).toBe(1);
    expect(centsFromMicrousdCeil(14_000)).toBe(2);
  });
});

describe('rateCardUsageLabel', () => {
  it('labels every search charge as agentic search', () => {
    for (const feature of [
      'web_search_perplexity',
      'web_search_grounding',
      'web_search_anthropic',
      'web_search_openai',
      'places_text_search',
    ]) {
      expect(rateCardUsageLabel(feature)).toBe('Agentic search');
    }
  });

  it('leaves models and other rows to their own labels', () => {
    expect(rateCardUsageLabel('voice_live_minute')).toBeNull();
    expect(rateCardUsageLabel('fixture-model-under-test')).toBeNull();
    expect(rateCardUsageLabel(null)).toBeNull();
  });
});
