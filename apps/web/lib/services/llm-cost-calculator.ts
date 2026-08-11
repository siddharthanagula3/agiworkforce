import 'server-only';
import {
  getModelMetadataById,
  getProviderConfig,
  listCanonicalModels,
  normalizeModelId,
  resolveEffectiveModelPricingForInputTokens,
} from '@agiworkforce/types';
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
 * Effective pricing: `getPricing` composes THREE catalog mechanisms, keyed off
 * caller-supplied request facts (never an internal clock read
 * inside the pricing path, so the same inputs always bill the same):
 *  1. `pricingSchedule` — dated windows resolved by the shared catalog pricing
 *     resolver (`@agiworkforce/types`). Bounds are UTC
 *     calendar days, inclusive on both sides, and every rate field moves
 *     together: input, output, cache read, and both cache-write tiers. No
 *     shipped model schedules a price today; the mechanism exists for an
 *     announced PRODUCT price change.
 *  2. `promo_expires_at` + `post_promo_prices` — the older two-phase form,
 *     applied by that same shared resolver. No model currently sets both.
 *  3. `inputTokenPricingTiers` — ordered strict input-token thresholds applied
 *     after the date and promotion layers, so a short-context override can
 *     never overwrite a provider's published large-request rates.
 * Cache read/write rates come from the catalog when declared; when they are
 * not, `resolveCacheRates` below decides. It is the single definition inside
 * this app; the gateway and the desktop calculator mirror its numbers, and
 * `apps/cli/src/model_catalog.rs` still does not (it prices an unpriced cache
 * read at $0 for non-OpenAI/Anthropic providers) — a known, untracked-here gap.
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

/** The subset of a model's rates needed to price its cached tokens. */
export type CacheRateInputs = Pick<
  ModelPricing,
  | 'inputCostPer1MTokens'
  | 'cachedInputCostPer1MTokens'
  | 'cachedWriteCostPer1MTokens'
  | 'cachedWrite1hCostPer1MTokens'
  | 'cacheTokensDisjointFromInput'
>;

/**
 * Multipliers on the input rate for a cache WRITE the catalog leaves unpriced.
 *
 * There is no read entry: an unpriced cache READ is billed at the plain input
 * rate, so there is no multiplier to name (see `resolveCacheRates`).
 *
 * This is the one definition for the web surfaces (`calculateCost`,
 * `lib/cost-tracker.ts`, `lib/prompt-cache-helper.ts`). The desktop calculator
 * (`apps/desktop/src-tauri/src/core/llm/cost_calculator.rs`) and the gateway
 * (`services/api-gateway/src/services/managedUsageBilling.ts`) mirror these
 * numbers — neither can import from this app — so the three must change
 * together. `apps/cli/src/model_catalog.rs:427` carries a fourth, still
 * unconverged copy (tracked gap, out of this module's reach).
 */
export const CACHE_WRITE_FALLBACK_MULTIPLIERS = {
  /** Anthropic's published 5m-TTL cache-write surcharge. */
  write5m: 1.25,
  /** Anthropic's published 1h-TTL cache-write surcharge. */
  write1h: 2,
} as const;

/**
 * Per-million cache read/write rates for already-resolved pricing.
 *
 * Catalog-declared rates win. An unpriced cache READ falls back to the FULL
 * input rate: a discount the provider does not publish is never invented, and
 * over-costing a cached token is recoverable where billing a tenth of the real
 * rate is not. That branch keys on the ABSENCE of a catalog `cached_input`
 * price and NOT on `capabilities.caching` — no billing path checks that
 * capability — so it covers both caching-capable models with no read price and
 * models that report cached tokens without declaring caching at all. Those
 * cache reads bill at full input price instead of a flat discount the catalog
 * never published.
 *
 * The write fallback is provider-shaped: with
 * Anthropic-style disjoint accounting the written tokens are billed ONLY as a
 * write, so an undeclared rate falls back to the published surcharges. With
 * inclusive-prompt accounting (OpenAI/Gemini/DeepSeek) the written tokens are
 * part of the prompt and are subtracted from the billable-input bucket, so an
 * undeclared write rate falls back to the plain input rate — that is exactly
 * "free cache writes" (each token billed once, at the input rate), which is
 * what inclusive providers with no write surcharge get. Models that declare
 * `cached_write` are billed at the catalog-owned rate.
 */
export function resolveCacheRates(pricing: CacheRateInputs): {
  read: number;
  write5m: number;
  write1h: number;
} {
  const input = pricing.inputCostPer1MTokens;
  const disjoint = pricing.cacheTokensDisjointFromInput === true;
  return {
    read: pricing.cachedInputCostPer1MTokens ?? input,
    write5m:
      pricing.cachedWriteCostPer1MTokens ??
      (disjoint ? input * CACHE_WRITE_FALLBACK_MULTIPLIERS.write5m : input),
    write1h:
      pricing.cachedWrite1hCostPer1MTokens ??
      (disjoint ? input * CACHE_WRITE_FALLBACK_MULTIPLIERS.write1h : input),
  };
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
  private static resolveTierInputTokens(
    provider: string,
    model: string,
    now: Date,
    promptTokens: number,
    cacheReadTokens = 0,
    cacheCreationTokens = 0,
  ): number {
    const untieredPricing = this.getPricing(provider, model, now, 0);
    return untieredPricing.cacheTokensDisjointFromInput
      ? promptTokens + cacheReadTokens + cacheCreationTokens
      : promptTokens;
  }

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

  /**
   * Calculate the unrounded provider cost in dollars.
   *
   * Multi-call agent flows must add these exact request costs before applying
   * the ledger's whole-cent rounding. Calling `calculateCost` for every step
   * would round each sub-cent request independently, while combining token
   * counters before this call would incorrectly apply nonlinear input-length
   * tiers across request boundaries.
   */
  static calculateCostDollars(
    provider: string,
    model: string,
    usage: TokenUsage,
    now: Date = new Date(),
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

      // Threshold pricing is based on TOTAL input in one provider request.
      // Inclusive accounting already reports cache tokens inside promptTokens;
      // disjoint accounting reports them separately and must add both buckets.
      // Resolve the accounting shape without a tier first, then price the exact
      // request total. This remains catalog-driven and adds no model-ID branch.
      const tierInputTokens = this.resolveTierInputTokens(
        provider,
        model,
        now,
        promptTokens,
        cacheReadTokens,
        cacheCreationTokens,
      );
      const pricing = this.getPricing(provider, model, now, tierInputTokens);

      // Split the prompt into billable (full-rate) input vs cached portions so each
      // token bills exactly once at the correct rate. For inclusive-prompt providers
      // (OpenAI/Gemini/DeepSeek) the cached count is a SUBSET of promptTokens and must
      // be subtracted; for Anthropic the cache tokens are disjoint (additional), so
      // promptTokens already excludes them — don't subtract.
      const {
        read: cacheReadRate,
        write5m: cacheWrite5mRate,
        write1h: cacheWrite1hRate,
      } = resolveCacheRates(pricing);

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
   * Per-million cache-write rate (5m/default TTL) for a model on `now`.
   * Used by the prompt-cache analytics path so it reports the same write price
   * the billing path charges.
   */
  static getCacheWriteCostPerMtok(
    provider: string,
    model: string,
    now: Date = new Date(),
    inputTokens = 0,
    cacheReadTokens = 0,
    cacheCreationTokens = 0,
  ): number {
    try {
      const tierInputTokens = this.resolveTierInputTokens(
        provider,
        model,
        now,
        inputTokens,
        cacheReadTokens,
        cacheCreationTokens,
      );
      return resolveCacheRates(this.getPricing(provider, model, now, tierInputTokens)).write5m;
    } catch {
      return FALLBACK_PRICING.inputCostPer1MTokens;
    }
  }

  static getCacheReadCostPerMtok(
    provider: string,
    model: string,
    now: Date = new Date(),
    inputTokens = 0,
    cacheReadTokens = 0,
    cacheCreationTokens = 0,
  ): number {
    try {
      const tierInputTokens = this.resolveTierInputTokens(
        provider,
        model,
        now,
        inputTokens,
        cacheReadTokens,
        cacheCreationTokens,
      );
      return resolveCacheRates(this.getPricing(provider, model, now, tierInputTokens)).read;
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
   * `inputTokens` is TOTAL input in this single provider request (ordinary +
   * cache read/write buckets when the provider reports those disjointly).
   * Always returns valid pricing (never throws)
   */
  static getPricing(
    provider: string,
    model: string,
    now: Date = new Date(),
    inputTokens = 0,
  ): ModelPricing {
    try {
      const canonicalModelId = normalizeModelId(model);
      if (canonicalModelId && runtimePricingOverrides[canonicalModelId]) {
        return runtimePricingOverrides[canonicalModelId];
      }

      const resolvedModelId = canonicalModelId ?? model;
      const metadata = getModelMetadataById(resolvedModelId);
      if (metadata) {
        const effective = resolveEffectiveModelPricingForInputTokens(metadata, now, inputTokens);
        return {
          inputCostPer1MTokens: effective.inputCost,
          outputCostPer1MTokens: effective.outputCost,
          cachedInputCostPer1MTokens: effective.cached_input,
          cachedWriteCostPer1MTokens: effective.cached_write,
          cachedWrite1hCostPer1MTokens: effective.cached_write_1h,
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
  static getInputCostPerMtok(
    provider: string,
    model: string,
    now: Date = new Date(),
    inputTokens = 0,
    cacheReadTokens = 0,
    cacheCreationTokens = 0,
  ): number {
    try {
      const tierInputTokens = this.resolveTierInputTokens(
        provider,
        model,
        now,
        inputTokens,
        cacheReadTokens,
        cacheCreationTokens,
      );
      return this.getPricing(provider, model, now, tierInputTokens).inputCostPer1MTokens;
    } catch {
      return FALLBACK_PRICING.inputCostPer1MTokens;
    }
  }

  /**
   * Add a new model pricing at runtime
   * Useful for dynamically adding newly released models.
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
