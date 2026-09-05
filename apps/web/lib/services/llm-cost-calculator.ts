import 'server-only';
import {
  getModelMetadataById,
  getProviderCacheTokenBillingClass,
  getProviderConfig,
  listCanonicalModels,
  normalizeModelId,
  resolveEffectiveModelPricingForInputTokens,
} from '@agiworkforce/types';
import * as modelCatalogRegistry from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { getOptionalEnv } from '@shared/utils/env';

export function isCacheTokensDisjointFromInput(providerId: string | null | undefined): boolean {
  if (!providerId) return false;
  return getProviderCacheTokenBillingClass(providerId) === 'additional_to_input';
}

export interface RoutePriceSheet {
  provider: string;
  isDefault: boolean;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  cacheReadPerMillion: number | null;
  cacheWritePerMillion: number | null;
  cacheWrite1hPerMillion: number | null;
}

export interface RouteRegistryPricingLookup {
  getRoutePricing?: (routeId: string) => RoutePriceSheet | null | undefined;
  getRoutePricingForModel?: (modelId: string) => RoutePriceSheet[] | undefined;
}

const registryModuleLookup = modelCatalogRegistry as unknown as RouteRegistryPricingLookup;
let routeRegistryLookup: RouteRegistryPricingLookup = registryModuleLookup;

function registryExport<Key extends keyof RouteRegistryPricingLookup>(
  lookup: RouteRegistryPricingLookup,
  key: Key,
): RouteRegistryPricingLookup[Key] | undefined {
  return key in lookup ? lookup[key] : undefined;
}

export function setRouteRegistryPricingLookup(lookup: RouteRegistryPricingLookup | null): void {
  routeRegistryLookup = lookup ?? registryModuleLookup;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheCreation1hInputTokens?: number;
}

export interface ModelPricing {
  inputCostPer1MTokens: number;
  outputCostPer1MTokens: number;
  cachedInputCostPer1MTokens?: number;
  cachedWriteCostPer1MTokens?: number;
  cachedWrite1hCostPer1MTokens?: number;
  cacheTokensDisjointFromInput?: boolean;
}

export type CacheRateInputs = Pick<
  ModelPricing,
  | 'inputCostPer1MTokens'
  | 'cachedInputCostPer1MTokens'
  | 'cachedWriteCostPer1MTokens'
  | 'cachedWrite1hCostPer1MTokens'
  | 'cacheTokensDisjointFromInput'
>;

export const CACHE_WRITE_FALLBACK_MULTIPLIERS = {
  write5m: 1.25,
  write1h: 2,
} as const;

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

const FALLBACK_PRICING: ModelPricing = {
  inputCostPer1MTokens: 1.0,
  outputCostPer1MTokens: 4.0,
};

const UNPRICED_MODEL_POLICY_ENV_VAR = 'AGI_PRICING_UNPRICED_POLICY';
const UNPRICED_MODEL_POLICY_WARN = 'warn';
const UNPRICED_MODEL_POLICY_REFUSE = 'refuse';
type UnpricedModelPolicy = typeof UNPRICED_MODEL_POLICY_WARN | typeof UNPRICED_MODEL_POLICY_REFUSE;

export class UnpricedModelError extends Error {
  readonly code = 'unpriced_model';
  readonly provider: string;
  readonly model: string;

  constructor(provider: string, model: string) {
    super(
      `No registry, route or provider-default price is declared for ${provider}/${model}. Set ` +
        `${UNPRICED_MODEL_POLICY_ENV_VAR}=${UNPRICED_MODEL_POLICY_WARN} to allow emergency ` +
        'fallback pricing while the catalog is repaired.',
    );
    this.name = 'UnpricedModelError';
    this.provider = provider;
    this.model = model;
  }
}

export function resolveUnpricedModelPolicy(): UnpricedModelPolicy {
  return getOptionalEnv(UNPRICED_MODEL_POLICY_ENV_VAR) === UNPRICED_MODEL_POLICY_WARN
    ? UNPRICED_MODEL_POLICY_WARN
    : UNPRICED_MODEL_POLICY_REFUSE;
}

let unpricedModelFallbackCount = 0;

export function getUnpricedModelFallbackCount(): number {
  return unpricedModelFallbackCount;
}

export function resetUnpricedModelFallbackCount(): void {
  unpricedModelFallbackCount = 0;
}

function resolveUnpricedFallback(provider: string, model: string): ModelPricing {
  if (resolveUnpricedModelPolicy() === UNPRICED_MODEL_POLICY_WARN) {
    unpricedModelFallbackCount += 1;
    logger.warn(
      {
        provider,
        model,
        event: 'llm_cost_calculator_unpriced_model_fallback',
        fallbackCount: unpricedModelFallbackCount,
      },
      'LLM cost calculator: no price declared for this model, applying emergency fallback pricing',
    );
    return FALLBACK_PRICING;
  }
  throw new UnpricedModelError(provider, model);
}
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

export function normalizeProviderId(provider: string | null | undefined): string | null {
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
    routeId?: string | null,
  ): number {
    const untieredPricing = this.getPricing(provider, model, now, 0, routeId);
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
    routeId?: string | null,
  ): number {
    const costCents = this.calculateCostDollars(provider, model, usage, now, routeId) * 100;
    return costCents > 0 ? Math.max(1, Math.ceil(costCents)) : 0;
  }

  static calculateCostMicrousd(
    provider: string,
    model: string,
    usage: TokenUsage,
    now: Date = new Date(),
    routeId?: string | null,
  ): number {
    return Math.ceil(this.calculateCostDollars(provider, model, usage, now, routeId) * 1_000_000);
  }

  static calculateCostDollars(
    provider: string,
    model: string,
    usage: TokenUsage,
    now: Date = new Date(),
    routeId?: string | null,
  ): number {
    try {
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

      const promptTokens = Math.max(0, usage.promptTokens);
      const completionTokens = Math.max(0, usage.completionTokens);
      const cacheReadTokens = Math.max(0, usage.cacheReadInputTokens ?? 0);
      const cacheCreationTokens = Math.max(0, usage.cacheCreationInputTokens ?? 0);
      const cacheCreation1hTokens = Math.min(
        cacheCreationTokens,
        Math.max(0, usage.cacheCreation1hInputTokens ?? 0),
      );
      const cacheCreation5mTokens = cacheCreationTokens - cacheCreation1hTokens;

      const tierInputTokens = this.resolveTierInputTokens(
        provider,
        model,
        now,
        promptTokens,
        cacheReadTokens,
        cacheCreationTokens,
        routeId,
      );
      const pricing = this.getPricing(provider, model, now, tierInputTokens, routeId);

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
      if (error instanceof UnpricedModelError) throw error;
      logger.error({ error, provider, model }, 'LLM cost calculator: Unexpected error');
      return 0;
    }
  }

  static getCacheWriteCostPerMtok(
    provider: string,
    model: string,
    now: Date = new Date(),
    inputTokens = 0,
    cacheReadTokens = 0,
    cacheCreationTokens = 0,
    routeId?: string | null,
  ): number {
    try {
      const tierInputTokens = this.resolveTierInputTokens(
        provider,
        model,
        now,
        inputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        routeId,
      );
      return resolveCacheRates(this.getPricing(provider, model, now, tierInputTokens, routeId))
        .write5m;
    } catch (error) {
      if (error instanceof UnpricedModelError) throw error;
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
    routeId?: string | null,
  ): number {
    try {
      const tierInputTokens = this.resolveTierInputTokens(
        provider,
        model,
        now,
        inputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        routeId,
      );
      return resolveCacheRates(this.getPricing(provider, model, now, tierInputTokens, routeId))
        .read;
    } catch (error) {
      if (error instanceof UnpricedModelError) throw error;
      return FALLBACK_PRICING.inputCostPer1MTokens;
    }
  }

  private static calculateWithFallbackDollars(usage: TokenUsage): number {
    const promptTokens = Math.max(0, usage?.promptTokens || 0);
    const completionTokens = Math.max(0, usage?.completionTokens || 0);

    const inputCost = (promptTokens / 1_000_000) * FALLBACK_PRICING.inputCostPer1MTokens;
    const outputCost = (completionTokens / 1_000_000) * FALLBACK_PRICING.outputCostPer1MTokens;

    return inputCost + outputCost;
  }

  private static toModelPricingFromRouteSheet(
    sheet: RoutePriceSheet,
    fallbackProviderId: string | null,
  ): ModelPricing | null {
    if (sheet.inputPerMillion === null || sheet.outputPerMillion === null) {
      return null;
    }
    return {
      inputCostPer1MTokens: sheet.inputPerMillion,
      outputCostPer1MTokens: sheet.outputPerMillion,
      cachedInputCostPer1MTokens: sheet.cacheReadPerMillion ?? undefined,
      cachedWriteCostPer1MTokens: sheet.cacheWritePerMillion ?? undefined,
      cachedWrite1hCostPer1MTokens: sheet.cacheWrite1hPerMillion ?? undefined,
      cacheTokensDisjointFromInput: isCacheTokensDisjointFromInput(
        sheet.provider ?? fallbackProviderId,
      ),
    };
  }

  private static resolveRegistryRoutePricing(
    routeId: string | null | undefined,
    providerId: string | null,
    modelId: string,
  ): ModelPricing | null {
    const getRoutePricing = registryExport(routeRegistryLookup, 'getRoutePricing');
    const routeSheet = routeId ? getRoutePricing?.(routeId) : undefined;
    if (routeSheet) {
      const pricing = this.toModelPricingFromRouteSheet(routeSheet, providerId);
      if (pricing) return pricing;
    }

    const getRoutePricingForModel = registryExport(routeRegistryLookup, 'getRoutePricingForModel');
    const modelSheets = providerId ? getRoutePricingForModel?.(modelId) : undefined;
    const matchedSheet =
      modelSheets?.find((sheet) => sheet.provider === providerId && sheet.isDefault) ??
      modelSheets?.find((sheet) => sheet.provider === providerId);
    if (matchedSheet) {
      const pricing = this.toModelPricingFromRouteSheet(matchedSheet, providerId);
      if (pricing) return pricing;
    }

    return null;
  }

  static getPricing(
    provider: string,
    model: string,
    now: Date = new Date(),
    inputTokens = 0,
    routeId?: string | null,
  ): ModelPricing {
    try {
      const canonicalModelId = normalizeModelId(model);
      if (canonicalModelId && runtimePricingOverrides[canonicalModelId]) {
        return runtimePricingOverrides[canonicalModelId];
      }

      const providerId = normalizeProviderId(provider);
      const resolvedModelId = canonicalModelId ?? model;

      const registryRoutePricing = this.resolveRegistryRoutePricing(
        routeId,
        providerId,
        resolvedModelId,
      );
      if (registryRoutePricing) {
        return registryRoutePricing;
      }

      const metadata = getModelMetadataById(resolvedModelId);
      if (metadata) {
        const effective = resolveEffectiveModelPricingForInputTokens(metadata, now, inputTokens);
        return {
          inputCostPer1MTokens: effective.inputCost,
          outputCostPer1MTokens: effective.outputCost,
          cachedInputCostPer1MTokens: effective.cached_input,
          cachedWriteCostPer1MTokens: effective.cached_write,
          cachedWrite1hCostPer1MTokens: effective.cached_write_1h,
          cacheTokensDisjointFromInput: isCacheTokensDisjointFromInput(metadata.provider),
        };
      }

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

      return resolveUnpricedFallback(provider, model);
    } catch (error) {
      if (error instanceof UnpricedModelError) throw error;
      return FALLBACK_PRICING;
    }
  }

  /**
   * Estimate cost before making request (for pre-check).
   * @throws UnpricedModelError when the model cannot be priced and
   *   AGI_PRICING_UNPRICED_POLICY is not set to warn.
   */
  static estimateCost(
    provider: string,
    model: string,
    estimatedPromptTokens: number,
    estimatedCompletionTokens: number = 1000,
    now: Date = new Date(),
  ): number {
    try {
      if (typeof estimatedPromptTokens !== 'number' || estimatedPromptTokens < 0) {
        logger.warn(
          { estimatedPromptTokens },
          'LLM cost calculator: Invalid prompt tokens estimate',
        );
        return 0;
      }

      if (typeof estimatedCompletionTokens !== 'number' || estimatedCompletionTokens < 0) {
        estimatedCompletionTokens = 1000;
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
      if (error instanceof UnpricedModelError) throw error;
      logger.error({ error, provider, model }, 'LLM cost calculator: Error in estimateCost');
      return 0;
    }
  }

  static getInputCostPerMtok(
    provider: string,
    model: string,
    now: Date = new Date(),
    inputTokens = 0,
    cacheReadTokens = 0,
    cacheCreationTokens = 0,
    routeId?: string | null,
  ): number {
    try {
      const tierInputTokens = this.resolveTierInputTokens(
        provider,
        model,
        now,
        inputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        routeId,
      );
      return this.getPricing(provider, model, now, tierInputTokens, routeId).inputCostPer1MTokens;
    } catch (error) {
      if (error instanceof UnpricedModelError) throw error;
      return FALLBACK_PRICING.inputCostPer1MTokens;
    }
  }

  static addModelPricing(model: string, inputCost: number, outputCost: number): void {
    const canonicalModelId = normalizeModelId(model) ?? model;
    runtimePricingOverrides[canonicalModelId] = {
      inputCostPer1MTokens: inputCost,
      outputCostPer1MTokens: outputCost,
    };
  }

  static getAvailableModels(): string[] {
    const modelIds = new Set(listCanonicalModels().map((model) => model.id));
    Object.keys(runtimePricingOverrides).forEach((modelId) => modelIds.add(modelId));
    return [...modelIds];
  }
}
