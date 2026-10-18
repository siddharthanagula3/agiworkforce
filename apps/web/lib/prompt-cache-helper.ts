import 'server-only';

import {
  getModelMetadataById,
  resolveEffectiveModelPricingForInputTokens,
} from '@agiworkforce/types';
import { logger } from './logger';
import {
  CACHE_WRITE_FALLBACK_MULTIPLIERS,
  isCacheTokensDisjointFromInput,
  resolveCacheRates,
} from '@/lib/services/llm-cost-calculator';

function getDeclaredCacheReadPerMtok(
  model: string | undefined,
  pricedAt: Date,
  inputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number | undefined {
  const meta = model ? getModelMetadataById(model) : null;
  if (!meta) return undefined;
  const tierInputTokens = isCacheTokensDisjointFromInput(meta.provider)
    ? inputTokens + cacheReadTokens + cacheWriteTokens
    : inputTokens;
  const cachedInput = resolveEffectiveModelPricingForInputTokens(
    meta,
    pricedAt,
    tierInputTokens,
  ).cached_input;
  return typeof cachedInput === 'number' ? cachedInput : undefined;
}

export function calculateCacheSavings(
  response: {
    cacheCreationInputTokens?: number;
    cachedInputTokens?: number;
    promptTokens?: number;
    model?: string;
  },
  inputCostPerMtok: number,
  cacheWriteCostPerMtok: number = inputCostPerMtok * CACHE_WRITE_FALLBACK_MULTIPLIERS.write5m,
  pricedAt: Date = new Date(),
  cacheReadCostPerMtok?: number,
): {
  tokensSavedByCache: number;
  savedCostCents: number;
  cacheWriteCostCents: number;
} {
  const cachedTokens = response.cachedInputTokens || 0;
  const cacheWriteTokens = response.cacheCreationInputTokens || 0;

  const declaredCacheRead =
    cacheReadCostPerMtok ??
    getDeclaredCacheReadPerMtok(
      response.model,
      pricedAt,
      response.promptTokens ?? 0,
      cachedTokens,
      cacheWriteTokens,
    );
  const { read: effectiveCacheReadCostPerMtok } = resolveCacheRates({
    inputCostPer1MTokens: inputCostPerMtok,
    cachedInputCostPer1MTokens: declaredCacheRead,
  });

  const savedCostCents =
    (cachedTokens * (inputCostPerMtok - effectiveCacheReadCostPerMtok)) / 10_000;

  const cacheWriteCostCents = (cacheWriteTokens * cacheWriteCostPerMtok) / 10_000;

  return {
    tokensSavedByCache: cachedTokens,
    savedCostCents: Math.round(savedCostCents),
    cacheWriteCostCents: Math.round(cacheWriteCostCents),
  };
}

export function logCacheAnalytics(
  userId: string,
  model: string,
  provider: string,
  response: {
    cacheCreationInputTokens?: number;
    cachedInputTokens?: number;
    promptTokens?: number;
  },
  savings: ReturnType<typeof calculateCacheSavings>,
): void {
  if (response.cacheCreationInputTokens || response.cachedInputTokens) {
    logger.info(
      {
        userId,
        model,
        provider,
        cacheWriteTokens: response.cacheCreationInputTokens || 0,
        cachedTokens: response.cachedInputTokens || 0,
        totalPromptTokens: response.promptTokens || 0,
        savedCostCents: savings.savedCostCents,
        cacheWriteCostCents: savings.cacheWriteCostCents,
      },
      'Cache analytics',
    );
  }
}
