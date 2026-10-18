/**
 * Pricing and tokenizer-drift helpers over the bundled model catalog. Every
 * helper takes an optional trailing `catalog` so tests can inject a fixture
 * instead of the live catalog's prices.
 *
 * @module routing/pricing
 * @packageDocumentation
 */

import {
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
