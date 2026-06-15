/**
 * Cache retention helper · mirrors openclaw's prompt-cache-retention.ts
 * Source: ~/Desktop/reference/openclaw/src/agents/pi-embedded-runner/prompt-cache-retention.ts
 *
 * Differences from the reference:
 *  - `modelApi` parameter dropped (AGI has no separate modelApi concept);
 *    Google eligibility uses `provider === 'google'` instead of
 *    `modelApi === "google-generative-ai"`.
 *  - Exported for use inside apps/web only (not a shared package yet).
 *
 * Cache stability rule (reference bootstrap/state.ts:223):
 *  Do NOT change cache_control mid-session in response to dynamic conditions
 *  (token counts, agent states, etc.). The retention value should be latched
 *  on first evaluation and held for the session.
 */

import { getModelMetadataById } from '@agiworkforce/types';

export type CacheRetention = 'none' | 'short' | 'long';

/**
 * Identify Google models that support implicit context caching.
 * Gemini 2.5+ and 3.x models support automatic context caching (~90% off on
 * cache-read hits per current Google pricing); earlier gemini families do not.
 *
 * Catalog-driven with a guarded prefix fallback. Eligibility is decided FIRST by
 * the model catalog (`capabilities.caching`, derived during `pnpm sync:models`
 * from the presence of a cached-read price; a non-null `cached_input` is also
 * accepted directly). Every cache-supporting Gemini model in models.json now
 * carries a cached_input price, so the catalog is authoritative for known models.
 *
 * The gemini-2.5/gemini-3.x STRING-PREFIX heuristic is retained ONLY as a
 * fallback for models NOT YET in the catalog (e.g. a freshly announced Gemini
 * priced upstream before a curation entry exists). It is no longer the primary
 * path. This avoids both silent under-classification (a real cacheable Gemini
 * the catalog hasn't picked up) and the prior over-reliance on string prefixes.
 *
 * NOTE: This function controls only whether explicit `cacheRetention` extra
 * params are honored for Google models. The GoogleProvider itself does NOT
 * currently send a `cache_control` request field (Gemini implicit caching is
 * fully automatic — no client-side opt-in marker is needed). The function is
 * therefore near-vestigial for the Google path; it gates the extraParams
 * passthrough in resolveCacheRetention so callers that opt into explicit
 * retention get it respected rather than silently dropped.
 */
export function isGooglePromptCacheEligible(provider: string, modelId?: string): boolean {
  if (provider !== 'google' || !modelId) {
    return false;
  }
  // Catalog is the single source of truth — a Google model is cache-eligible iff
  // its catalog entry declares it (capabilities.caching, set in models.curation.json)
  // or carries a cached_input price. No id-prefix heuristics: a new Gemini model
  // becomes eligible purely by its curation entry + `pnpm sync:models`.
  const meta = getModelMetadataById(modelId);
  return (
    meta?.provider === 'google' &&
    (meta.capabilities?.caching === true || meta.cached_input != null)
  );
}

/**
 * Resolve cache retention for a request.
 *
 * Precedence (highest first):
 *  1. Explicit `cacheRetention` in extraParams ('none' | 'short' | 'long').
 *  2. Legacy `cacheControlTtl` in extraParams ('5m' → 'short', '1h' → 'long').
 *  3. Provider-family defaults:
 *     - 'anthropic' direct  → 'short' (5-minute ephemeral)
 *     - 'openrouter' with modelId starting 'anthropic/' → 'short'
 *     - 'google' with gemini-2.5 / gemini-3.x → undefined (no auto-default)
 *     - 'openai'           → undefined (auto-prefix caching, no TTL knob)
 *     - others             → undefined
 *
 * Returns `undefined` for providers where caching is automatic or unsupported.
 */
export function resolveCacheRetention(
  extraParams: Record<string, unknown> | undefined,
  provider: string,
  modelId?: string,
): CacheRetention | undefined {
  const providerLower = provider.toLowerCase();
  const googleEligible = isGooglePromptCacheEligible(providerLower, modelId);

  // Determine whether this provider family supports explicit cache markers.
  const isAnthropicDirect = providerLower === 'anthropic';
  const isOpenRouterAnthropic =
    providerLower === 'openrouter' && (modelId ?? '').startsWith('anthropic/');
  const supportsExplicit = isAnthropicDirect || isOpenRouterAnthropic || googleEligible;

  if (!supportsExplicit) {
    // openai and others: automatic caching, no TTL knob to expose.
    return undefined;
  }

  // 1. Honor explicit cacheRetention in extraParams.
  const newVal = extraParams?.['cacheRetention'];
  if (newVal === 'none' || newVal === 'short' || newVal === 'long') {
    return newVal;
  }

  // 2. Map legacy cacheControlTtl.
  const legacy = extraParams?.['cacheControlTtl'];
  if (legacy === '5m') {
    return 'short';
  }
  if (legacy === '1h') {
    return 'long';
  }

  // 3. Provider-family defaults.
  if (isAnthropicDirect || isOpenRouterAnthropic) {
    return 'short';
  }

  // Google: no default · caller must opt in explicitly.
  return undefined;
}

/**
 * Convert a CacheRetention value to the Anthropic API TTL string.
 * 'short' → '5m' (default ephemeral), 'long' → '1h'.
 * Returns undefined when retention is 'none' (cache_control should be omitted).
 */
export function retentionToAnthropicTtl(retention: CacheRetention): '5m' | '1h' | undefined {
  if (retention === 'short') return '5m';
  if (retention === 'long') return '1h';
  return undefined;
}

/**
 * Build an Anthropic cache_control block for the given retention.
 * Returns null when retention is 'none' or undefined (block should be omitted).
 */
export function buildAnthropicCacheControl(
  retention: CacheRetention | undefined,
): { type: 'ephemeral'; ttl?: '5m' | '1h' } | null {
  if (!retention || retention === 'none') return null;
  const ttl = retentionToAnthropicTtl(retention);
  // Include ttl only when it's explicitly '1h'; Anthropic default is already '5m'.
  return ttl === '1h' ? { type: 'ephemeral', ttl } : { type: 'ephemeral' };
}
