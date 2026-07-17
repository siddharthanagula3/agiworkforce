import 'server-only';
import {
  getModelMetadataById,
  getProviderConfig,
  listCanonicalModels,
  normalizeModelId,
} from '@agiworkforce/types';
import { isPromoExpired } from '@agiworkforce/routing';
import { logger } from '@/lib/logger';

/**
 * LLM Cost Calculator
 * Calculates cost in cents based on provider, model, and token usage.
 *
 * Single source of truth:
 * - model pricing: `packages/contracts/types/src/models.json`
 * - provider defaults: `packages/contracts/types/src/models.json`
 *
 * Runtime overrides remain supported for emergency pricing patches, but
 * canonical pricing should be changed in the shared catalog.
 *
 * Promotional pricing: catalog entries may carry `promo_expires_at` +
 * `post_promo_prices` (e.g. Sonnet 5's promo ends 2026-08-31). `getPricing`
 * switches every rate field -- input, output, AND cached_input/cached_write,
 * not just the headline input/output rates -- to the post-promo block once
 * `isPromoExpired` (from `@agiworkforce/routing`, the same date-boundary
 * logic `effectiveInputPrice`/`effectiveOutputPrice` use) says the cutoff has
 * passed. The 1h cache-write rate is never read from the catalog at all --
 * `calculateCost` derives it as 2x whatever `inputCostPer1MTokens` resolves
 * to, so it inherits the promo/post-promo switch automatically.
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /**
   * Tokens served from the prompt cache (cache-read hits), billed at the model's
   * discounted cached_input rate instead of the full input rate. Optional: when
   * omitted, the entire prompt bills at the full input rate (prior behavior).
   *
   * Token-accounting convention (handled in calculateCost):
   *  - Anthropic reports input_tokens DISJOINT from cache reads, so the cached
   *    count is ADDITIONAL to promptTokens.
   *  - OpenAI / Gemini / DeepSeek report INCLUSIVE prompt counts where the cached
   *    tokens are a SUBSET of promptTokens.
   * Either way each token is billed exactly once.
   */
  cacheReadInputTokens?: number;
  /**
   * Tokens written to the cache (Anthropic cache_creation). Billed at the
   * model's cached_write rate (falls back to 1.25× input — Anthropic 5m write).
   * Always ADDITIONAL to promptTokens (Anthropic-only counter in practice).
   */
  cacheCreationInputTokens?: number;
  /**
   * Subset of cacheCreationInputTokens written to Anthropic's 1-hour cache
   * (billed at 2x input instead of the 5m rate's 1.25x). Anthropic only
   * reports this breakdown (`usage.cache_creation.ephemeral_1h_input_tokens`)
   * when a request mixes 5m and 1h TTLs; when omitted, the entire
   * cacheCreationInputTokens total is billed at the 5m rate.
   */
  cacheCreation1hInputTokens?: number;
}

export interface ModelPricing {
  inputCostPer1MTokens: number; // Cost per 1M input tokens in dollars
  outputCostPer1MTokens: number; // Cost per 1M output tokens in dollars
  cachedInputCostPer1MTokens?: number; // Cost per 1M cache-read tokens (when cacheable)
  cachedWriteCostPer1MTokens?: number; // Cost per 1M cache-write tokens (Anthropic)
  /** True for Anthropic-style accounting where input_tokens excludes cache tokens. */
  cacheTokensDisjointFromInput?: boolean;
}

// Default fallback if provider is unknown
const FALLBACK_PRICING: ModelPricing = {
  inputCostPer1MTokens: 1.0,
  outputCostPer1MTokens: 4.0,
};
const runtimePricingOverrides: Record<string, ModelPricing> = {};
const PROVIDER_ALIASES: Record<string, string> = {
  grok: 'xai',
  x_ai: 'xai',
  zhipuai: 'zhipu',
  zhipu_ai: 'zhipu',
  managedcloud: 'managed_cloud',
  'managed-cloud': 'managed_cloud',
  openrouter: 'open_router',
  'open-router': 'open_router',
};

function normalizeProviderId(provider: string | null | undefined): string | null {
  if (!provider) {
    return null;
  }

  const normalizedProvider = provider.trim().toLowerCase();
  return PROVIDER_ALIASES[normalizedProvider] ?? normalizedProvider;
}

export class LLMCostCalculator {
  /**
   * Calculate cost in cents for token usage
   * @throws Never - returns 0 on error for safety
   */
  static calculateCost(
    provider: string,
    model: string,
    usage: TokenUsage,
    now: Date = new Date(),
  ): number {
    try {
      // Validate inputs
      if (!provider || typeof provider !== 'string') {
        logger.warn({ provider, model }, 'LLM cost calculator: Invalid provider, using fallback');
        return this.calculateWithFallback(usage);
      }

      if (!model || typeof model !== 'string') {
        logger.warn({ provider, model }, 'LLM cost calculator: Invalid model, using fallback');
        return this.calculateWithFallback(usage);
      }

      if (
        !usage ||
        typeof usage.promptTokens !== 'number' ||
        typeof usage.completionTokens !== 'number'
      ) {
        logger.warn({ provider, model, usage }, 'LLM cost calculator: Invalid usage data');
        return 0;
      }

      // Validate token counts are non-negative
      const promptTokens = Math.max(0, usage.promptTokens);
      const completionTokens = Math.max(0, usage.completionTokens);
      const cacheReadTokens = Math.max(0, usage.cacheReadInputTokens ?? 0);
      const cacheCreationTokens = Math.max(0, usage.cacheCreationInputTokens ?? 0);
      // Anthropic only reports the 1h/5m split when a request mixes TTLs; clamp
      // to the total so a stale/inconsistent breakdown can never over-count.
      const cacheCreation1hTokens = Math.min(
        cacheCreationTokens,
        Math.max(0, usage.cacheCreation1hInputTokens ?? 0),
      );
      const cacheCreation5mTokens = cacheCreationTokens - cacheCreation1hTokens;

      const pricing = this.getPricing(provider, model, now);

      // Split the prompt into billable (full-rate) input vs cached portions so each
      // token bills exactly once at the correct rate. For inclusive-prompt providers
      // (OpenAI/Gemini/DeepSeek) the cached count is a SUBSET of promptTokens and must
      // be subtracted; for Anthropic the cache tokens are disjoint (additional), so
      // promptTokens already excludes them — don't subtract.
      const cacheReadRate =
        pricing.cachedInputCostPer1MTokens ?? pricing.inputCostPer1MTokens * 0.1;
      // 5m write rate: 1.25x input (Anthropic default ephemeral cache).
      const cacheWrite5mRate =
        pricing.cachedWriteCostPer1MTokens ?? pricing.inputCostPer1MTokens * 1.25;
      // 1h write rate: 2x input (Anthropic's extended-TTL cache option).
      const cacheWrite1hRate = pricing.inputCostPer1MTokens * 2.0;

      const billableInput = pricing.cacheTokensDisjointFromInput
        ? promptTokens
        : Math.max(0, promptTokens - cacheReadTokens - cacheCreationTokens);

      const inputCost = (billableInput / 1_000_000) * pricing.inputCostPer1MTokens;
      const cacheReadCost = (cacheReadTokens / 1_000_000) * cacheReadRate;
      const cacheWriteCost =
        (cacheCreation5mTokens / 1_000_000) * cacheWrite5mRate +
        (cacheCreation1hTokens / 1_000_000) * cacheWrite1hRate;
      const outputCost = (completionTokens / 1_000_000) * pricing.outputCostPer1MTokens;

      const totalCostDollars = inputCost + cacheReadCost + cacheWriteCost + outputCost;
      // Convert to cents and round to nearest cent
      return Math.round(totalCostDollars * 100);
    } catch (error) {
      logger.error({ error, provider, model }, 'LLM cost calculator: Unexpected error');
      return 0;
    }
  }

  /**
   * Calculate cost using fallback pricing
   */
  private static calculateWithFallback(usage: TokenUsage): number {
    const promptTokens = Math.max(0, usage?.promptTokens || 0);
    const completionTokens = Math.max(0, usage?.completionTokens || 0);

    const inputCost = (promptTokens / 1_000_000) * FALLBACK_PRICING.inputCostPer1MTokens;
    const outputCost = (completionTokens / 1_000_000) * FALLBACK_PRICING.outputCostPer1MTokens;

    return Math.round((inputCost + outputCost) * 100);
  }

  /**
   * Get pricing for a model
   * Always returns valid pricing (never throws)
   */
  static getPricing(provider: string, model: string, now: Date = new Date()): ModelPricing {
    try {
      const canonicalModelId = normalizeModelId(model);
      if (canonicalModelId && runtimePricingOverrides[canonicalModelId]) {
        return runtimePricingOverrides[canonicalModelId];
      }

      const resolvedModelId = canonicalModelId ?? model;
      const metadata = getModelMetadataById(resolvedModelId);
      if (metadata) {
        // Once promo_expires_at has passed, bill every rate field -- not
        // just input/output -- from post_promo_prices. Leaving cached_input/
        // cached_write on the pre-promo top-level fields would keep
        // undercharging cache reads/writes after the headline rate already
        // reverted (the bug this whole method exists to fix).
        const postPromo =
          metadata.post_promo_prices && isPromoExpired(resolvedModelId, now)
            ? metadata.post_promo_prices
            : undefined;
        return {
          inputCostPer1MTokens: postPromo?.input ?? metadata.inputCost,
          outputCostPer1MTokens: postPromo?.output ?? metadata.outputCost,
          cachedInputCostPer1MTokens: postPromo?.cached_input ?? metadata.cached_input,
          cachedWriteCostPer1MTokens: postPromo?.cached_write ?? metadata.cached_write,
          // Anthropic reports input_tokens disjoint from cache_read/cache_creation.
          cacheTokensDisjointFromInput: metadata.provider === 'anthropic',
        };
      }

      const providerId = normalizeProviderId(provider);
      if (providerId) {
        const providerConfig = getProviderConfig(providerId);
        if (providerConfig?.defaultPricing) {
          logger.debug(
            { provider: providerId, model },
            'LLM cost calculator: Using provider default pricing from catalog',
          );
          return {
            inputCostPer1MTokens: providerConfig.defaultPricing.inputPerMillion,
            outputCostPer1MTokens: providerConfig.defaultPricing.outputPerMillion,
          };
        }
      }

      // Ultimate fallback
      logger.debug({ provider, model }, 'LLM cost calculator: Using ultimate fallback pricing');
      return FALLBACK_PRICING;
    } catch {
      return FALLBACK_PRICING;
    }
  }

  /**
   * Estimate cost before making request (for pre-check)
   * @throws Never - returns 0 on error for safety
   */
  static estimateCost(
    provider: string,
    model: string,
    estimatedPromptTokens: number,
    estimatedCompletionTokens: number = 1000,
    now: Date = new Date(),
  ): number {
    try {
      // Validate inputs
      if (typeof estimatedPromptTokens !== 'number' || estimatedPromptTokens < 0) {
        logger.warn(
          { estimatedPromptTokens },
          'LLM cost calculator: Invalid prompt tokens estimate',
        );
        return 0;
      }

      if (typeof estimatedCompletionTokens !== 'number' || estimatedCompletionTokens < 0) {
        estimatedCompletionTokens = 1000; // Use default
      }

      return this.calculateCost(
        provider,
        model,
        {
          promptTokens: estimatedPromptTokens,
          completionTokens: estimatedCompletionTokens,
          totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
        },
        now,
      );
    } catch (error) {
      logger.error({ error, provider, model }, 'LLM cost calculator: Error in estimateCost');
      return 0;
    }
  }

  /**
   * Get input cost per million tokens for a model
   * Used for prompt caching calculations
   */
  static getInputCostPerMtok(provider: string, model: string, now: Date = new Date()): number {
    try {
      return this.getPricing(provider, model, now).inputCostPer1MTokens;
    } catch {
      return FALLBACK_PRICING.inputCostPer1MTokens;
    }
  }

  /**
   * Add a new model pricing at runtime
   * Useful for dynamically adding new models (e.g., Claude 5, GPT-6)
   */
  static addModelPricing(model: string, inputCost: number, outputCost: number): void {
    const canonicalModelId = normalizeModelId(model) ?? model;
    runtimePricingOverrides[canonicalModelId] = {
      inputCostPer1MTokens: inputCost,
      outputCostPer1MTokens: outputCost,
    };
  }

  /**
   * Get all available model names
   */
  static getAvailableModels(): string[] {
    const modelIds = new Set(listCanonicalModels().map((model) => model.id));
    Object.keys(runtimePricingOverrides).forEach((modelId) => modelIds.add(modelId));
    return [...modelIds];
  }
}
