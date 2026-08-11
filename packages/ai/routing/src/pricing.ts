/**
 * Pricing, promo-expiry, deprecation, and tokenizer-drift helpers for the
 * model catalog. Pure functions over models.json; no shared mutable state —
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

// Import through the package root so legacy `moduleResolution: node` consumers
// (notably the VS Code extension host) do not need to understand package
// `exports` subpaths merely to load the classifier.
import {
  isModelPromoExpired,
  modelsCatalogJson as modelsCatalog,
  resolveEffectiveModelPricingForInputTokens,
  type EffectiveModelPricing,
  type ModelMetadata,
} from '@agiworkforce/types';

// Narrow read-shape over the catalog — only the pricing-relevant fields. Kept
// local so changes to the full models.json shape stay isolated here. Exported
// so tests can build a typed fixture catalog to inject.
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

/**
 * Inflation factor used to scale token estimates for known-drifted models.
 * Returns `1.0 + tokenizer_drift_factor` so callers can multiply directly:
 * `inflatedTokens = tokensEstimate * tokenizerDriftFactor(modelId)`.
 *
 * Models without a `tokenizer_drift_factor` field return `1.0` (identity).
 */
export function tokenizerDriftFactor(modelId: string, catalog: Catalog = CATALOG): number {
  const entry = catalog.models[modelId];
  if (!entry) return 1.0;
  const raw = entry.tokenizer_drift_factor;
  if (typeof raw !== 'number') return 1.0;
  return 1.0 + raw;
}

/**
 * Maximum reasonable inflation under tokenizer drift for the given model.
 * Use this for upper-bound cost estimation; the realized inflation is
 * payload-dependent and typically sits BETWEEN 1.0× and this maximum.
 */
export const ESTIMATE_INFLATION = {
  conservative: (modelId: string, catalog: Catalog = CATALOG): number =>
    tokenizerDriftFactor(modelId, catalog),
} as const;

/** True when `modelId` is past its provider-side deprecation date at `now`. */
export function isDeprecated(
  modelId: string,
  now: Date = new Date(),
  catalog: Catalog = CATALOG,
): boolean {
  const entry = catalog.models[modelId];
  if (!entry) return true; // Missing entries are treated as deprecated.
  if (entry.deprecation_date == null) return false;
  const cutoff = Date.parse(entry.deprecation_date);
  if (Number.isNaN(cutoff)) return false;
  return now.getTime() >= cutoff;
}

/** True when `modelId` is past its promotional pricing cutoff at `now`. */
export function isPromoExpired(
  modelId: string,
  now: Date = new Date(),
  catalog: Catalog = CATALOG,
): boolean {
  const entry = catalog.models[modelId];
  return entry ? isModelPromoExpired(entry, now) : false;
}

/**
 * Effective input price ($/M tokens) for `modelId` at `now`.
 * Post-promo prices automatically apply once `promo_expires_at` has passed.
 */
export function effectiveInputPrice(
  modelId: string,
  now: Date = new Date(),
  catalog: Catalog = CATALOG,
): number {
  return effectiveModelPricing(modelId, 0, now, catalog)?.inputCost ?? 0;
}

/** Effective output price ($/M tokens) for `modelId` at `now`. */
export function effectiveOutputPrice(
  modelId: string,
  now: Date = new Date(),
  catalog: Catalog = CATALOG,
): number {
  return effectiveModelPricing(modelId, 0, now, catalog)?.outputCost ?? 0;
}

/**
 * Resolve routing-estimate pricing from the same catalog layers as billing:
 * dated windows, the legacy post-promo override, then ordered input-length tiers.
 */
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
