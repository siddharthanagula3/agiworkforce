import 'server-only';

import { modelRegistry } from '@agiworkforce/model-registry';
import { FEATURE_RATE_CARD, MICROUSD_PER_USD } from '@agiworkforce/types';

import pricingConfig from './web-search-pricing.json';

const REQUESTS_PER_PRICED_BLOCK = 1_000;

export interface GroundingPricingTier {
  poolWindow: 'month' | 'day';
  poolFreeRequests: number;
  usdPerThousandBeyondPool: number;
}

interface GroundingPoolTierConfig {
  poolWindow: 'month' | 'day';
  poolFreeRequests: number;
}

interface GoogleGroundingPricingConfig {
  provider: string;
  currentTier: GroundingPoolTierConfig;
  previousTier: GroundingPricingTier;
}

interface WebSearchPricingConfig {
  googleGrounding: GoogleGroundingPricingConfig;
}

interface RegistryModelEntry {
  identity?: { provider?: string };
  lifecycle?: { status?: string };
}
type RegistryModelsMap = Record<string, RegistryModelEntry>;

const config = pricingConfig as WebSearchPricingConfig;

function usdPerThousand(microusdPerCall: number): number {
  return (microusdPerCall / MICROUSD_PER_USD) * REQUESTS_PER_PRICED_BLOCK;
}

export function isActivelyRoutedModel(modelId: string): boolean {
  const models = modelRegistry.models as unknown as RegistryModelsMap;
  const entry = models[modelId];
  return (
    entry?.identity?.provider === config.googleGrounding.provider &&
    entry?.lifecycle?.status === 'active'
  );
}

/**
 * The grounding pricing tier for `modelId`. The current tier's rate is the
 * rate card's published grounding figure; this file owns only the pool shape
 * around it. `previousTier` is the vendor's older, lower-volume row, kept for
 * anything outside this app's active registry rather than guessing that an
 * unrecognized model gets the newer terms.
 */
export function resolveGoogleGroundingPricingTier(modelId: string): GroundingPricingTier {
  if (!isActivelyRoutedModel(modelId)) return config.googleGrounding.previousTier;
  return {
    ...config.googleGrounding.currentTier,
    usdPerThousandBeyondPool: usdPerThousand(
      FEATURE_RATE_CARD.web_search_grounding.providerCogsMicrousd ?? 0,
    ),
  };
}

export function googleGroundingPricingSource(): { source: string; fetchedAt: string } {
  return {
    source: FEATURE_RATE_CARD.web_search_grounding.source,
    fetchedAt: FEATURE_RATE_CARD.web_search_grounding.verifiedOn,
  };
}

/**
 * Perplexity's Search API bills per successful request, one billing unit
 * regardless of how many queries that request carried; this app sends one
 * query per call, so one call is one billed unit.
 */
export function perplexitySearchUsdPerThousandRequests(): number {
  return usdPerThousand(FEATURE_RATE_CARD.web_search_perplexity.providerCogsMicrousd ?? 0);
}

export function perplexitySearchPricingSource(): { source: string; fetchedAt: string } {
  return {
    source: FEATURE_RATE_CARD.web_search_perplexity.source,
    fetchedAt: FEATURE_RATE_CARD.web_search_perplexity.verifiedOn,
  };
}
