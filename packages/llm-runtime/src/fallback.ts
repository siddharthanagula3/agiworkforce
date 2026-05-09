/**
 * Fallback model chain resolution.
 *
 * When an attempt is classified as `fallbackable` (consecutive 529s,
 * capacity off-switch, safety refusal of a particular model, invalid
 * model after redirect), the retry generator emits a
 * `FallbackTriggeredError` with a target model. THIS module decides
 * which model is the target.
 *
 * **Rule (LOCKED)**: model IDs are NEVER hardcoded. The chain is
 * derived from `models.json` via `@agiworkforce/types`'s catalog
 * helpers (`getModelMetadataById`, `getEconomyFallbackModels`,
 * `getAllowedModelsForTier`). See `CLAUDE.md` "Critical rules".
 *
 * Citation:
 *   - `tasks/research/deep/m8-services-api.md` §4.3 fallback gating.
 *   - `tasks/research/gap-matrix/pkg-api-providers-normalize.md`
 *     "Per-provider model fallback".
 *   - Anthropic `errors.ts:425-934` `get3PModelFallbackSuggestion`.
 */

import {
  getEconomyFallbackModels,
  getModelMetadataById,
  getModelsForProvider,
  type ModelMetadata,
  type Provider,
} from '@agiworkforce/types';

/**
 * Strategy for picking the next model when the current one is failing.
 *
 *   - `same-provider-cheaper` — drop one quality tier within the same
 *     provider (Opus → Sonnet → Haiku). Best for capacity off-switch
 *     style failures: same provider, smaller cost, same vendor lock-in.
 *   - `economy-tier` — switch to the cheapest tools-capable economy
 *     model regardless of provider. Best for cost-sensitive Hobby
 *     users when everything is throttled.
 *   - `cross-provider` — try a different provider's flagship.
 *     Best for provider-side outages.
 */
export type FallbackStrategy = 'same-provider-cheaper' | 'economy-tier' | 'cross-provider';

export interface FallbackChainOptions {
  /** Excluded models — already tried in this conversation. */
  exclude?: ReadonlySet<string>;
  /** Required capabilities the fallback must support. */
  requireTools?: boolean;
  /** Maximum number of fallback steps to enumerate. */
  maxDepth?: number;
}

/**
 * Build the ordered fallback chain for a given starting model.
 *
 * The chain is computed lazily — callers iterate through it and stop
 * as soon as they have a working model. We do NOT eagerly health-check
 * each model because that would explode the per-attempt latency budget.
 *
 * @returns ordered model IDs (excluding `currentModel` itself).
 */
export function buildFallbackChain(
  currentModel: string,
  strategy: FallbackStrategy,
  options: FallbackChainOptions = {},
): string[] {
  const exclude = new Set(options.exclude ?? []);
  exclude.add(currentModel);
  const requireTools = options.requireTools !== false;
  const maxDepth = options.maxDepth ?? 5;

  const current = getModelMetadataById(currentModel);
  if (!current) return [];

  switch (strategy) {
    case 'same-provider-cheaper':
      return sameProviderCheaper(current, exclude, requireTools, maxDepth);
    case 'economy-tier':
      return economyTierFallback(current, exclude, requireTools, maxDepth);
    case 'cross-provider':
      return crossProviderFallback(current, exclude, requireTools, maxDepth);
  }
}

function sameProviderCheaper(
  current: ModelMetadata,
  exclude: Set<string>,
  requireTools: boolean,
  maxDepth: number,
): string[] {
  // Walk all models for this provider, ordered by `(qualityTier desc, cost asc)`.
  // qualityTier ordering: best > balanced > fast.
  const all = getProviderModels(current.provider, exclude, requireTools);
  const tierRank: Record<string, number> = { best: 3, balanced: 2, fast: 1 };
  const currentRank = tierRank[current.qualityTier] ?? 2;
  const candidates = all
    .filter((m) => (tierRank[m.qualityTier] ?? 2) <= currentRank)
    .sort((a, b) => {
      const ar = tierRank[a.qualityTier] ?? 2;
      const br = tierRank[b.qualityTier] ?? 2;
      if (br !== ar) return br - ar; // prefer higher quality first within "<= current"
      return a.inputCost + a.outputCost - (b.inputCost + b.outputCost);
    });
  return candidates.slice(0, maxDepth).map((m) => m.id);
}

function economyTierFallback(
  _current: ModelMetadata,
  exclude: Set<string>,
  requireTools: boolean,
  maxDepth: number,
): string[] {
  const economy = getEconomyFallbackModels();
  return economy
    .filter((m) => !exclude.has(m.model))
    .map((m) => m.model)
    .filter((id) => {
      if (!requireTools) return true;
      const meta = getModelMetadataById(id);
      return meta?.capabilities.tools === true;
    })
    .slice(0, maxDepth);
}

function crossProviderFallback(
  current: ModelMetadata,
  exclude: Set<string>,
  requireTools: boolean,
  maxDepth: number,
): string[] {
  // For each OTHER provider that has at least one tools-capable
  // active model, pick the highest-quality option. Order providers
  // by current's qualityTier first.
  const providers: Provider[] = [
    'anthropic',
    'openai',
    'google',
    'xai',
    'deepseek',
    'perplexity',
    'qwen',
    'moonshot',
    'zhipu',
    'mistral',
    'managed_cloud',
    'ollama',
    'lmstudio',
  ];
  const tierRank: Record<string, number> = { best: 3, balanced: 2, fast: 1 };
  const out: string[] = [];
  for (const p of providers) {
    if (p === current.provider) continue;
    const candidates = getProviderModels(p, exclude, requireTools).sort((a, b) => {
      const ar = tierRank[a.qualityTier] ?? 2;
      const br = tierRank[b.qualityTier] ?? 2;
      if (br !== ar) return br - ar;
      return a.inputCost + a.outputCost - (b.inputCost + b.outputCost);
    });
    const top = candidates[0];
    if (top) out.push(top.id);
    if (out.length >= maxDepth) break;
  }
  return out;
}

function getProviderModels(
  provider: Provider | string,
  exclude: Set<string>,
  requireTools: boolean,
): ModelMetadata[] {
  return getModelsForProvider(provider)
    .filter((m) => !exclude.has(m.id))
    .filter((m) => (requireTools ? m.capabilities.tools === true : true));
}
