import { describe, expect, it } from 'vitest';
import {
  centsFromMicrousdCeil,
  customerChargeMicrousd,
  FEATURE_RATE_CARD,
  requireProviderDefaultModel,
} from '@agiworkforce/types';

import { LIVE_SESSION_CENTS_PER_MINUTE } from '@/lib/voice/live-voice-billing';
import {
  googleGroundingPricingSource,
  perplexitySearchPricingSource,
  perplexitySearchUsdPerThousandRequests,
  resolveGoogleGroundingPricingTier,
} from '@/lib/web-search/web-search-pricing';

/**
 * `live-voice-billing.ts` owns the live-voice charge and is edited by another
 * lane, so the rate card mirrors it rather than replacing it. This is the
 * guard that the mirror never drifts from the constant it mirrors.
 */
describe('live voice rate card entry', () => {
  it('agrees with the constant the live voice route bills from', () => {
    expect(centsFromMicrousdCeil(customerChargeMicrousd('voice_live_minute'))).toBe(
      LIVE_SESSION_CENTS_PER_MINUTE,
    );
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
