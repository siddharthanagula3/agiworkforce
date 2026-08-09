import 'server-only';

import { getModelMetadataById, resolveEffectiveModelPricing } from '@agiworkforce/types';
import { logger } from './logger';
import {
  CACHE_WRITE_FALLBACK_MULTIPLIERS,
  resolveCacheRates,
} from '@/lib/services/llm-cost-calculator';

/**
 * Minimal request shape this module needs: a message list with a findable
 * system entry. Deliberately NOT the canonical `ChatRequest` (its `system`
 * field is separate from `messages`, so a `role === 'system'` scan would
 * never match) and NOT `lib/llm-providers`' `LLMProviderRequest` (that
 * module is being retired). Structural typing means any caller whose
 * request shape includes a `messages` array with role/content entries
 * satisfies this without a cast.
 */
export interface PromptCacheRequest {
  messages: Array<{
    role: string;
    content: string;
  }>;
}

/**
 * Determines if a model supports prompt caching, driven by the model catalog.
 *
 * Source of truth is `capabilities.caching` in models.json (derived during
 * `pnpm sync:models` from the presence of a cached-read price). We also accept a
 * non-null `cached_input` directly as a fallback for catalog entries that carry
 * pricing but predate the capability flag. Unknown models are treated as not
 * cache-capable; a model name is not evidence of a provider feature.
 */
function getCachingModel(model: string) {
  const meta = getModelMetadataById(model);
  if (!meta || (meta.capabilities?.caching !== true && meta.cached_input == null)) return null;
  return meta;
}

/**
 * The model's published per-million cache-READ price on `pricedAt`, or
 * `undefined` when the catalog prices no cache read for it (or does not know
 * the model at all). Dated `pricingSchedule` windows resolve the same way the
 * billing path resolves them, so analytics quote the rate the request was
 * billed at.
 *
 * Known limitation: the older `post_promo_prices` two-phase form is NOT layered
 * on here, while the caller's `inputCostPerMtok` comes from
 * `LLMCostCalculator.getPricing`, which does layer it. No shipped model sets
 * `post_promo_prices.cached_input`, so the two rates cannot disagree today; the
 * moment one does, this must resolve promos the same way `getPricing` does.
 */
function getDeclaredCacheReadPerMtok(
  model: string | undefined,
  pricedAt: Date,
): number | undefined {
  const meta = model ? getModelMetadataById(model) : null;
  if (!meta) return undefined;
  const cachedInput = resolveEffectiveModelPricing(meta, pricedAt).cached_input;
  return typeof cachedInput === 'number' ? cachedInput : undefined;
}

/**
 * Determines if prompt caching should be enabled for a request
 * Caching is beneficial when:
 * 1. System prompt is large (>1000 tokens = ~4000 chars)
 * 2. Context will be reused (documents, RAG)
 * 3. The model supports caching (catalog `capabilities.caching`)
 */
export function shouldEnablePromptCache(request: PromptCacheRequest, model: string): boolean {
  const metadata = getCachingModel(model);
  if (!metadata) {
    return false;
  }

  // Find system message
  const systemMessage = request.messages.find((msg) => msg.role === 'system');
  if (!systemMessage) {
    return false;
  }

  // Estimate tokens: ~1 token per 4 characters
  const estimatedTokens = Math.ceil(systemMessage.content.length / 4);
  const providerMinimumTokens = metadata.promptCacheMinimumTokens ?? 1000;

  // Enable caching once the prompt reaches the provider's per-model minimum.
  // This ensures cache write cost is justified by reuse
  if (estimatedTokens >= providerMinimumTokens) {
    return true;
  }

  // Also enable for document/RAG queries (indicated by certain patterns)
  const isDocumentQuery =
    systemMessage.content.includes('document') ||
    systemMessage.content.includes('context:') ||
    systemMessage.content.includes('passage') ||
    systemMessage.content.includes('excerpt') ||
    systemMessage.content.toLowerCase().includes('rag');

  if (isDocumentQuery && estimatedTokens >= Math.max(500, providerMinimumTokens)) {
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
    /**
     * Model the response came from, used to read its published cache-READ
     * price. Optional because a caller may have none; without it the read
     * falls back to the input rate and the reported saving is zero rather than
     * an invented discount.
     */
    model?: string;
  },
  inputCostPerMtok: number,
  /**
   * Per-million cache-WRITE price for this model, resolved from the catalog by
   * the caller (`LLMCostCalculator.getCacheWriteCostPerMtok`, which is date- and
   * provider-aware). Omitted only by callers with no model context, where the
   * Anthropic-published surcharge is the historical default. Passing the
   * resolved rate is what keeps models that declare NO write price — every
   * pre-GPT-5.6 OpenAI model — reported at their free-write cost instead of an
   * invented 25% surcharge.
   */
  cacheWriteCostPerMtok: number = inputCostPerMtok * CACHE_WRITE_FALLBACK_MULTIPLIERS.write5m,
  /**
   * Instant the rates are read at. The live caller
   * (`app/api/llm/v1/chat/completions/lib/response-builder.ts`) passes the same
   * `pricedAt` it used for the input and cache-write rates, so all three rates
   * come from one pricing window even across a UTC day boundary. Defaults to
   * now for callers that resolve rates themselves.
   */
  pricedAt: Date = new Date(),
): {
  tokensSavedByCache: number;
  savedCostCents: number;
  cacheWriteCostCents: number;
} {
  const cachedTokens = response.cachedInputTokens || 0;
  const cacheWriteTokens = response.cacheCreationInputTokens || 0;

  // The saving is the gap between the input rate and the model's OWN cache-read
  // rate. A flat 0.1x here was wrong in both directions: it under-reported
  // DeepSeek (which reads at 0.02x input) and claimed a 90% saving for every
  // model the catalog leaves unpriced -- minimax-m3, grok-4.5, and any caller
  // that passes no `model` at all -- none of which is a saving anyone received.
  // Those now report zero saved, because `resolveCacheRates` prices an unpriced
  // read at the full input rate.
  const declaredCacheRead = getDeclaredCacheReadPerMtok(response.model, pricedAt);
  const { read: cacheReadCostPerMtok } = resolveCacheRates({
    inputCostPer1MTokens: inputCostPerMtok,
    cachedInputCostPer1MTokens: declaredCacheRead,
  });

  // inputCostPerMtok is in dollars per 1M tokens, so convert: tokens * $/Mtok / 1M * 100 cents/$
  const savedCostCents = (cachedTokens * (inputCostPerMtok - cacheReadCostPerMtok)) / 10_000;

  // The full write cost, not just the surcharge, is reported here.
  // Note: Anthropic 1h TTL write is 2.0x — indistinguishable from 5m at this call
  // site (NormalizedUsage conflates both; tracked gap in cost-tracker.ts).
  const cacheWriteCostCents = (cacheWriteTokens * cacheWriteCostPerMtok) / 10_000;

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
