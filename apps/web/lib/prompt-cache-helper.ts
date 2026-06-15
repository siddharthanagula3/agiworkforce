import 'server-only';

import { getModelMetadataById } from '@agiworkforce/types';
import { LLMProviderRequest } from './llm-providers/base';
import { logger } from './logger';

/**
 * Determines if a model supports prompt caching, driven by the model catalog.
 *
 * Source of truth is `capabilities.caching` in models.json (derived during
 * `pnpm sync:models` from the presence of a cached-read price). We also accept a
 * non-null `cached_input` directly as a fallback for catalog entries that carry
 * pricing but predate the capability flag. This replaces the old
 * `claude-`/`gpt-` string-prefix heuristic, which silently excluded
 * Gemini 2.5+/3.x and DeepSeek/Zhipu/Moonshot models that also cache.
 */
function modelSupportsCaching(model: string): boolean {
  const meta = getModelMetadataById(model);
  if (!meta) {
    // Unknown to the catalog: fall back to the legacy markers so behavior never
    // silently regresses for a model the catalog hasn't picked up yet.
    const lower = model.toLowerCase();
    return lower.includes('claude-') || lower.includes('gpt-');
  }
  return meta.capabilities?.caching === true || meta.cached_input != null;
}

/**
 * Determines if prompt caching should be enabled for a request
 * Caching is beneficial when:
 * 1. System prompt is large (>1000 tokens = ~4000 chars)
 * 2. Context will be reused (documents, RAG)
 * 3. The model supports caching (catalog `capabilities.caching`)
 */
export function shouldEnablePromptCache(request: LLMProviderRequest, model: string): boolean {
  if (!modelSupportsCaching(model)) {
    return false;
  }

  // Find system message
  const systemMessage = request.messages.find((msg) => msg.role === 'system');
  if (!systemMessage) {
    return false;
  }

  // Estimate tokens: ~1 token per 4 characters
  const estimatedTokens = Math.ceil(systemMessage.content.length / 4);

  // Enable caching if system prompt is substantial (>1000 tokens)
  // This ensures cache write cost is justified by reuse
  if (estimatedTokens > 1000) {
    return true;
  }

  // Also enable for document/RAG queries (indicated by certain patterns)
  const isDocumentQuery =
    systemMessage.content.includes('document') ||
    systemMessage.content.includes('context:') ||
    systemMessage.content.includes('passage') ||
    systemMessage.content.includes('excerpt') ||
    systemMessage.content.toLowerCase().includes('rag');

  if (isDocumentQuery && estimatedTokens > 500) {
    return true;
  }

  return false;
}

/**
 * Calculate potential savings from prompt caching
 */
export function calculateCacheSavings(
  response: {
    cacheCreationInputTokens?: number;
    cachedInputTokens?: number;
    promptTokens?: number;
  },
  inputCostPerMtok: number,
): {
  tokensSavedByCache: number;
  savedCostCents: number;
  cacheWriteCostCents: number;
} {
  const cachedTokens = response.cachedInputTokens || 0;
  const cacheWriteTokens = response.cacheCreationInputTokens || 0;

  // Cached tokens cost 10% of normal price (cache-read discount = 90% off).
  // inputCostPerMtok is in dollars per 1M tokens, so convert: tokens * $/Mtok / 1M * 100 cents/$
  const normalCostCents = (cachedTokens * inputCostPerMtok) / 10_000;
  const cachedCostCents = (cachedTokens * inputCostPerMtok * 0.1) / 10_000;
  const savedCostCents = normalCostCents - cachedCostCents;

  // Cache write costs 1.25× the normal input rate (Anthropic 5m TTL: +25% surcharge over
  // the standard input rate). The full write cost, not just the surcharge, is reported here.
  // Note: Anthropic 1h TTL write is 2.0× — indistinguishable from 5m at this call site
  // (NormalizedUsage conflates both; tracked gap in cost-tracker.ts).
  const cacheWriteCostCents = (cacheWriteTokens * inputCostPerMtok * 1.25) / 10_000;

  return {
    tokensSavedByCache: cachedTokens,
    savedCostCents: Math.round(savedCostCents),
    cacheWriteCostCents: Math.round(cacheWriteCostCents),
  };
}

/**
 * Log cache analytics for monitoring
 */
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
  // Only log if caching was used
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
