import 'server-only';

import { modelRegistry } from '@agiworkforce/model-registry';

import pricingConfig from './grounding-pricing.json';

interface GroundingPricingTier {
  poolWindow: 'month' | 'day';
  poolFreeRequests: number;
  usdPerThousandBeyondPool: number;
}

interface GroundingPricingConfig {
  source: string;
  fetchedAt: string;
  provider: string;
  currentTier: GroundingPricingTier;
  previousTier: GroundingPricingTier;
}

interface RegistryModelEntry {
  identity?: { provider?: string };
  lifecycle?: { status?: string };
}
type RegistryModelsMap = Record<string, RegistryModelEntry>;

const config = pricingConfig as GroundingPricingConfig;

function isActivelyRoutedModel(modelId: string): boolean {
  const models = modelRegistry.models as unknown as RegistryModelsMap;
  const entry = models[modelId];
  return entry?.identity?.provider === config.provider && entry?.lifecycle?.status === 'active';
}

/**
 * The grounding pricing tier for `modelId`. `currentTier` covers every
 * actively routed model in this app's registry (`lifecycle.status ===
 * 'active'`), the tier row `grounding-pricing.json` sources from the vendor's
 * current pricing page. `previousTier` is the vendor's older, lower-volume
 * row, kept for completeness and for anything outside this app's active
 * registry, rather than guessing that an unrecognized model gets the newer
 * terms.
 */
export function resolveGroundingPricingTier(modelId: string): GroundingPricingTier {
  return isActivelyRoutedModel(modelId) ? config.currentTier : config.previousTier;
}

export function groundingPricingSource(): { source: string; fetchedAt: string } {
  return { source: config.source, fetchedAt: config.fetchedAt };
}
