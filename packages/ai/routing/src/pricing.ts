/**
 * Pricing, promo-expiry, deprecation, and tokenizer-drift helpers for the
 * model catalog. Pure functions over models.json; no shared mutable state.
 * safe to call from any surface.
 *
 * Relocated from `three-tier-router.ts` (whose routing half is being retired)
 * so these pricing/display utilities have a stable home independent of routing.
 *
 * Promo handling: `effectiveInputPrice`/`effectiveOutputPrice` + `isPromoExpired`
 * switch to `post_promo_prices` automatically once `promo_expires_at` has passed.
 * Deprecation: `isDeprecated` is true once `deprecation_date` is in the past.
 *
 * Every helper takes an optional trailing `catalog` argument (defaulting to the
 * bundled `models.json`) purely for testability: unit tests inject a synthetic
 * fixture so the pricing *logic* is verified against controlled values rather
 * than the live catalog's magic numbers (which change on every weekly sync).
 *
 * @module routing/pricing
 * @packageDocumentation
 */

import {
  isModelPromoExpired,
  modelsCatalogJson as modelsCatalog,
  resolveEffectiveModelPricingForInputTokens,
  type EffectiveModelPricing,
  type ModelMetadata,
} from '@agiworkforce/types';

export interface CatalogModel {
  readonly id: string;
  readonly provider: string;
  readonly inputCost?: number;
  readonly outputCost?: number;
  readonly cached_input?: number;
  readonly cached_write?: number;
  readonly cached_write_1h?: number;
  readonly pricingSchedule?: ModelMetadata['pricingSchedule'];
  readonly inputTokenPricingTiers?: ModelMetadata['inputTokenPricingTiers'];
  readonly longContext?: ModelMetadata['longContext'];
  readonly promo_expires_at?: string | null;
  readonly post_promo_prices?: {
    readonly input: number;
    readonly output: number;
    readonly cached_input?: number;
    readonly cached_write?: number;
    readonly cached_write_1h?: number;
  };
  readonly deprecation_date?: string | null;
  readonly tokenizer_drift_factor?: number;
}

export interface Catalog {
  readonly models: Record<string, CatalogModel>;
}

const CATALOG: Catalog = modelsCatalog as unknown as Catalog;

export function tokenizerDriftFactor(modelId: string, catalog: Catalog = CATALOG): number {
  const entry = catalog.models[modelId];
  if (!entry) return 1.0;
  const raw = entry.tokenizer_drift_factor;
  if (typeof raw !== 'number') return 1.0;
  return 1.0 + raw;
}

export const ESTIMATE_INFLATION = {
  conservative: (modelId: string, catalog: Catalog = CATALOG): number =>
    tokenizerDriftFactor(modelId, catalog),
} as const;

export function isDeprecated(
  modelId: string,
  now: Date = new Date(),
  catalog: Catalog = CATALOG,
): boolean {
  const entry = catalog.models[modelId];
  if (!entry) return true;
  if (entry.deprecation_date == null) return false;
  const cutoff = Date.parse(entry.deprecation_date);
  if (Number.isNaN(cutoff)) return false;
  return now.getTime() >= cutoff;
}

export function isPromoExpired(
  modelId: string,
  now: Date = new Date(),
  catalog: Catalog = CATALOG,
): boolean {
  const entry = catalog.models[modelId];
  return entry ? isModelPromoExpired(entry, now) : false;
}

export function effectiveInputPrice(
  modelId: string,
  now: Date = new Date(),
  catalog: Catalog = CATALOG,
): number {
  return effectiveModelPricing(modelId, 0, now, catalog)?.inputCost ?? 0;
}

export function effectiveOutputPrice(
  modelId: string,
  now: Date = new Date(),
  catalog: Catalog = CATALOG,
): number {
  return effectiveModelPricing(modelId, 0, now, catalog)?.outputCost ?? 0;
}

export function effectiveModelPricing(
  modelId: string,
  inputTokens: number,
  now: Date = new Date(),
  catalog: Catalog = CATALOG,
): EffectiveModelPricing | null {
  const entry = catalog.models[modelId];
  if (!entry) return null;
  const priced = {
    inputCost: entry.inputCost ?? 0,
    outputCost: entry.outputCost ?? 0,
    ...(entry.cached_input === undefined ? {} : { cached_input: entry.cached_input }),
    ...(entry.cached_write === undefined ? {} : { cached_write: entry.cached_write }),
    ...(entry.cached_write_1h === undefined ? {} : { cached_write_1h: entry.cached_write_1h }),
    ...(entry.pricingSchedule === undefined ? {} : { pricingSchedule: entry.pricingSchedule }),
    ...(entry.promo_expires_at === undefined ? {} : { promo_expires_at: entry.promo_expires_at }),
    ...(entry.post_promo_prices === undefined
      ? {}
      : { post_promo_prices: entry.post_promo_prices }),
    ...(entry.inputTokenPricingTiers === undefined
      ? {}
      : { inputTokenPricingTiers: entry.inputTokenPricingTiers }),
    ...(entry.longContext === undefined ? {} : { longContext: entry.longContext }),
  };
  return resolveEffectiveModelPricingForInputTokens(priced, now, inputTokens);
}
