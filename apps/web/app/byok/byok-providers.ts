import { modelsCatalogJson } from '@agiworkforce/types';

/**
 * BYOK provider chips for `/byok`, keyed by CANONICAL CATALOG ID.
 *
 * The page copy promises these chips come "straight from the catalog". They
 * did not: the list was a hand-typed array of display names, so when `mistral`
 * and `groq` were dropped from `models.json` (`5a165d78b`, 2026-07-22 — every
 * retired vendor IDs now canonicalize to current catalog routes) the public
 * page kept advertising both as
 * supported BYOK providers. Neither has an adapter in
 * `packages/ai/providers/`, a key field in the Desktop BYOK panel
 * (`apps/desktop/src/features/settings/tabs/ModelsKeys/index.tsx`), or a
 * dispatch arm in the CLI (`apps/cli/src/models/provider_dispatch.rs`).
 *
 * Resolving the label out of `modelsCatalogJson` makes the promise literally
 * true and makes a retired provider impossible to advertise: an id the catalog
 * no longer carries resolves to `undefined` and is dropped from the row.
 *
 * Local runtimes are rendered separately by the page from the canonical
 * Desktop runtime list in `marketing-constants.ts`.
 */
export const BYOK_PROVIDER_IDS = [
  'anthropic',
  'openai',
  'google',
  'xai',
  'deepseek',
  'qwen',
  'moonshot',
  'perplexity',
  'zhipu',
  'open_router',
  'nvidia_nim',
] as const;

const catalogProviders = modelsCatalogJson.providers as Record<string, { label?: string }>;

/** Catalog labels for the BYOK ids above, minus any id the catalog dropped. */
export function byokProviderLabels(): string[] {
  return BYOK_PROVIDER_IDS.map((id) => catalogProviders[id]?.label).filter(
    (label): label is string => typeof label === 'string' && label.length > 0,
  );
}
