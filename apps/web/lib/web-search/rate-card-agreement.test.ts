import { describe, expect, it } from 'vitest';
import {
  chargeMicrousdForProviderCost,
  FEATURE_RATE_CARD,
  listCanonicalModels,
  MICROUSD_PER_USD,
  requireProviderDefaultModel,
} from '@agiworkforce/types';

import {
  liveSessionChargeMicrousd,
  liveSessionProviderCostMicrousd,
} from '@/lib/voice/live-voice-billing';
import {
  googleGroundingPricingSource,
  perplexitySearchPricingSource,
  perplexitySearchUsdPerThousandRequests,
  resolveGoogleGroundingPricingTier,
} from '@/lib/web-search/web-search-pricing';

const LIVE_VOICE_MODELS = listCanonicalModels().filter(
  (model) => (model.sessionPerMinuteCost ?? 0) > 0,
);

function perMinuteMicrousd(usdPerMinute: number | undefined): number {
  return Math.ceil((usdPerMinute ?? 0) * MICROUSD_PER_USD);
}

describe('live voice rate card entry', () => {
  it('bills every live voice model from its catalogue session rate at provider cost', () => {
    expect(LIVE_VOICE_MODELS.length).toBeGreaterThan(0);
    for (const model of LIVE_VOICE_MODELS) {
      const providerMicrousd = perMinuteMicrousd(model.sessionPerMinuteCost);
      expect(liveSessionProviderCostMicrousd(60, model.id)).toBe(providerMicrousd);
      expect(liveSessionChargeMicrousd(60, model.id)).toBe(
        chargeMicrousdForProviderCost(providerMicrousd),
      );
    }
  });

  it('keeps its reference figure on a rate the catalogue actually bills', () => {
    expect(FEATURE_RATE_CARD.voice_live_minute.providerCogsBasis).toBe('derived_from_model');
    expect(
      LIVE_VOICE_MODELS.map((model) => perMinuteMicrousd(model.sessionPerMinuteCost)),
    ).toContain(FEATURE_RATE_CARD.voice_live_minute.providerCogsMicrousd);
  });
});

describe('web search pricing', () => {
  it('reads the Perplexity rate from the rate card', () => {
    expect(perplexitySearchUsdPerThousandRequests()).toBe(5);
    expect(perplexitySearchPricingSource()).toEqual({
      source: FEATURE_RATE_CARD.web_search_perplexity.source,
      fetchedAt: FEATURE_RATE_CARD.web_search_perplexity.verifiedOn,
    });
  });

  it('reads the current grounding tier rate from the rate card', () => {
    const tier = resolveGoogleGroundingPricingTier(requireProviderDefaultModel('google'));
    expect(tier.poolWindow).toBe('month');
    expect(googleGroundingPricingSource()).toEqual({
      source: FEATURE_RATE_CARD.web_search_grounding.source,
      fetchedAt: FEATURE_RATE_CARD.web_search_grounding.verifiedOn,
    });
  });
});
