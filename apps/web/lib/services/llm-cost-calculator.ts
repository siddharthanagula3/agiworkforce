import 'server-only';
import {
  getModelMetadataById,
  getProviderConfig,
  listCanonicalModels,
  normalizeModelId,
  resolveEffectiveModelPricing,
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
 * Effective-dated pricing: `getPricing` is date-aware through TWO catalog
 * mechanisms, both keyed off the caller-supplied `now` (never a clock read
 * inside the pricing path, so the same inputs always bill the same):
 *  1. `pricingSchedule` — dated windows resolved by
 *     `resolveEffectiveModelPricing` (`@agiworkforce/types`). Bounds are UTC
 *     calendar days, inclusive on both sides, and every rate field moves
 *     together: input, output, cache read, and both cache-write tiers. No
 *     shipped model schedules a price today; the mechanism exists for an
 *     announced PRODUCT price change.
 *  2. `promo_expires_at` + `post_promo_prices` — the older two-phase form,
 *     applied on top via `isPromoExpired` (from `@agiworkforce/routing`, the
 *     same date-boundary logic `effectiveInputPrice`/`effectiveOutputPrice`
 *     use). No model currently sets both.
 * Cache-write rates come from the catalog when declared. When they are not,
 * the fallback depends on the provider's token accounting: Anthropic-style
 * disjoint accounting falls back to the published 1.25x (5m) / 2x (1h)
 * surcharges, while inclusive-prompt providers (OpenAI/Gemini/DeepSeek) fall
 * back to the plain input rate -- a model that declares no write price is not
 * charged a write surcharge it never published.
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
  cachedWriteCostPer1MTokens?: number; // Cost per 1M cache-write tokens (5m TTL when tiered)
  cachedWrite1hCostPer1MTokens?: number; // Cost per 1M 1-hour-TTL cache-write tokens
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
   * Calculate paid managed usage in whole ledger cents. Non-empty provider
   * work consumes at least one cent so sub-cent calls cannot bypass paid caps.
   * @throws Never - returns 0 on error for safety
   */
  static calculateCost(
    provider: string,
    model: string,
    usage: TokenUsage,
    now: Date = new Date(),
  ): number {
    const costCents = this.calculateCostDollars(provider, model, usage, now) * 100;
    // CEIL with a one-cent floor, IDENTICAL to the billing authority:
    // `dollarsToLedgerCents` in services/api-gateway/src/services/
    // managedUsageBilling.ts is `Math.max(1, Math.ceil(costDollars * 100))`, and
    // this is the same rounding on the same quantity, so the product preview and
    // the ledger agree cent-for-cent (both sides read 2026-08-05 and verified
    // equal). They previously diverged — gateway up, this to nearest — so the
    // cost the product showed could sit a cent below what the ledger charged on
    // every request whose fractional part was under .5. Rounding up per-request
    // is also what stops a stream of sub-cent calls slipping past metering.
    return costCents > 0 ? Math.max(1, Math.ceil(costCents)) : 0;
  }

  /**
   * Calculate precise cost in millionths of a dollar for sub-cent internal
   * metering. Rounds up to the nearest microdollar so non-empty work cannot
   * disappear through whole-cent rounding.
   */
  static calculateCostMicrousd(
    provider: string,
    model: string,
    usage: TokenUsage,
    now: Date = new Date(),
  ): number {
    return Math.ceil(this.calculateCostDollars(provider, model, usage, now) * 1_000_000);
  }

  private static calculateCostDollars(
    provider: string,
    model: string,
    usage: TokenUsage,
    now: Date,
  ): number {
    try {
      // Validate inputs
      if (!provider || typeof provider !== 'string') {
        logger.warn({ provider, model }, 'LLM cost calculator: Invalid provider, using fallback');
        return this.calculateWithFallbackDollars(usage);
      }

      if (!model || typeof model !== 'string') {
        logger.warn({ provider, model }, 'LLM cost calculator: Invalid model, using fallback');
        return this.calculateWithFallbackDollars(usage);
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
      const { write5m: cacheWrite5mRate, write1h: cacheWrite1hRate } =
        this.resolveCacheWriteRates(pricing);

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
      return totalCostDollars;
    } catch (error) {
      logger.error({ error, provider, model }, 'LLM cost calculator: Unexpected error');
      return 0;
    }
  }

  /**
   * Resolve the per-million cache-WRITE rates for already-resolved pricing.
   *
   * Catalog-declared rates win. The fallback is provider-shaped: with
   * Anthropic-style disjoint accounting the written tokens are billed ONLY as a
   * write, so an undeclared rate falls back to Anthropic's published 1.25x (5m)
   * / 2x (1h) surcharges. With inclusive-prompt accounting (OpenAI/Gemini/
   * DeepSeek) the written tokens are part of the prompt and are subtracted from
   * the billable-input bucket, so an undeclared write rate falls back to the
   * plain input rate — that is exactly "free cache writes" (each token billed
   * once, at the input rate), which is what pre-GPT-5.6 OpenAI models get. The
   * GPT-5.6 family declares `cached_write` (1.25x input) and is billed for it.
   */
  static resolveCacheWriteRates(pricing: ModelPricing): { write5m: number; write1h: number } {
    const disjoint = pricing.cacheTokensDisjointFromInput === true;
    return {
      write5m:
        pricing.cachedWriteCostPer1MTokens ??
        (disjoint ? pricing.inputCostPer1MTokens * 1.25 : pricing.inputCostPer1MTokens),
      write1h:
        pricing.cachedWrite1hCostPer1MTokens ??
        (disjoint ? pricing.inputCostPer1MTokens * 2.0 : pricing.inputCostPer1MTokens),
    };
  }

  /**
   * Per-million cache-write rate (5m/default TTL) for a model on `now`.
   * Used by the prompt-cache analytics path so it reports the same write price
   * the billing path charges.
   */
  static getCacheWriteCostPerMtok(provider: string, model: string, now: Date = new Date()): number {
    try {
      return this.resolveCacheWriteRates(this.getPricing(provider, model, now)).write5m;
    } catch {
      return FALLBACK_PRICING.inputCostPer1MTokens;
    }
  }

  /**
   * Calculate cost using fallback pricing
   */
  private static calculateWithFallbackDollars(usage: TokenUsage): number {
    const promptTokens = Math.max(0, usage?.promptTokens || 0);
    const completionTokens = Math.max(0, usage?.completionTokens || 0);

    const inputCost = (promptTokens / 1_000_000) * FALLBACK_PRICING.inputCostPer1MTokens;
    const outputCost = (completionTokens / 1_000_000) * FALLBACK_PRICING.outputCostPer1MTokens;

    return inputCost + outputCost;
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
        // Dated pricing windows resolve first; the older promo block, when a
        // model still uses one, is layered on top of the resolved rates.
        const effective = resolveEffectiveModelPricing(metadata, now);
        return {
          inputCostPer1MTokens: postPromo?.input ?? effective.inputCost,
          outputCostPer1MTokens: postPromo?.output ?? effective.outputCost,
          cachedInputCostPer1MTokens: postPromo?.cached_input ?? effective.cached_input,
          cachedWriteCostPer1MTokens: postPromo?.cached_write ?? effective.cached_write,
          cachedWrite1hCostPer1MTokens: postPromo?.cached_write_1h ?? effective.cached_write_1h,
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
