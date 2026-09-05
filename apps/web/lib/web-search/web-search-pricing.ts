import 'server-only';

import { modelRegistry } from '@agiworkforce/model-registry';

import pricingConfig from './web-search-pricing.json';

interface GroundingPricingTier {
  poolWindow: 'month' | 'day';
  poolFreeRequests: number;
  usdPerThousandBeyondPool: number;
}

interface GoogleGroundingPricingConfig {
  source: string;
  fetchedAt: string;
  provider: string;
  currentTier: GroundingPricingTier;
  previousTier: GroundingPricingTier;
}

interface PerplexitySearchPricingConfig {
  source: string;
  fetchedAt: string;
  usdPerThousandRequests: number;
}

interface WebSearchPricingConfig {
  googleGrounding: GoogleGroundingPricingConfig;
  perplexitySearch: PerplexitySearchPricingConfig;
}

interface RegistryModelEntry {
  identity?: { provider?: string };
  lifecycle?: { status?: string };
}
type RegistryModelsMap = Record<string, RegistryModelEntry>;

const config = pricingConfig as WebSearchPricingConfig;

function isActivelyRoutedModel(modelId: string): boolean {
  const models = modelRegistry.models as unknown as RegistryModelsMap;
  const entry = models[modelId];
  return (
    entry?.identity?.provider === config.googleGrounding.provider &&
    entry?.lifecycle?.status === 'active'
  );
}

/**
 * The grounding pricing tier for `modelId`. `currentTier` covers every
 * actively routed model in this app's registry (`lifecycle.status ===
 * 'active'`), the tier row `web-search-pricing.json` sources from the
 * vendor's current pricing page. `previousTier` is the vendor's older,
 * lower-volume row, kept for completeness and for anything outside this
 * app's active registry, rather than guessing that an unrecognized model
 * gets the newer terms.
 */
export function resolveGoogleGroundingPricingTier(modelId: string): GroundingPricingTier {
  return isActivelyRoutedModel(modelId)
    ? config.googleGrounding.currentTier
    : config.googleGrounding.previousTier;
}

export function googleGroundingPricingSource(): { source: string; fetchedAt: string } {
  return { source: config.googleGrounding.source, fetchedAt: config.googleGrounding.fetchedAt };
}

/**
 * Perplexity's Search API bills per successful request, one billing unit
 * regardless of how many queries that request carried; this app sends one
 * query per call, so one call is one billed unit.
 */
export function perplexitySearchUsdPerThousandRequests(): number {
  return config.perplexitySearch.usdPerThousandRequests;
}

export function perplexitySearchPricingSource(): { source: string; fetchedAt: string } {
  return { source: config.perplexitySearch.source, fetchedAt: config.perplexitySearch.fetchedAt };
}
