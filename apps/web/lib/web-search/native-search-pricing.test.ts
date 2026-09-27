import { describe, expect, it, vi } from 'vitest';
import { FEATURE_RATE_CARD, chargeCreditsForMicrousd } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import {
  nativeServerToolMicrousdPerRequest,
  offersDynamicFilteringWebTool,
} from './native-search-pricing';

describe('nativeServerToolMicrousdPerRequest', () => {
  it('prices a model-native web search at the provider rate the rate card publishes', () => {
    expect(nativeServerToolMicrousdPerRequest('anthropic', 'web_search')).toBe(
      FEATURE_RATE_CARD.web_search_anthropic.providerCogsMicrousd,
    );
    expect(nativeServerToolMicrousdPerRequest('openai', 'web_search')).toBe(
      FEATURE_RATE_CARD.web_search_openai.providerCogsMicrousd,
    );
  });

  it('charges each model-native web search two credits', () => {
    for (const provider of ['anthropic', 'openai']) {
      expect(chargeCreditsForMicrousd(nativeServerToolMicrousdPerRequest(provider, 'web_search'))).toBe(
        2,
      );
    }
  });

  it('adds nothing for a native web fetch, which the provider bills as tokens', () => {
    expect(nativeServerToolMicrousdPerRequest('anthropic', 'web_fetch')).toBe(0);
    expect(nativeServerToolMicrousdPerRequest('openai', 'web_fetch')).toBe(0);
  });

  it('prices nothing for a provider that runs no native server tool here', () => {
    expect(nativeServerToolMicrousdPerRequest('google', 'web_search')).toBe(0);
    expect(nativeServerToolMicrousdPerRequest('', 'web_search')).toBe(0);
  });
});

describe('offersDynamicFilteringWebTool', () => {
  it('recognises the dynamic-filtering web tool versions and every later one', () => {
    expect(offersDynamicFilteringWebTool([{ type: 'web_search_20260209' }])).toBe(true);
    expect(offersDynamicFilteringWebTool([{ type: 'web_fetch_20260301' }])).toBe(true);
  });

  it('does not count an older web tool, a function tool or an empty tool list', () => {
    expect(offersDynamicFilteringWebTool([{ type: 'web_search_20250305' }])).toBe(false);
    expect(
      offersDynamicFilteringWebTool([{ type: 'function', function: { name: 'web_search' } }]),
    ).toBe(false);
    expect(offersDynamicFilteringWebTool([null, 'web_search_20260209'])).toBe(false);
    expect(offersDynamicFilteringWebTool(undefined)).toBe(false);
  });
});
