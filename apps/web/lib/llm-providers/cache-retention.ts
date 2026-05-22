/**
 * Cache retention helper — mirrors openclaw's prompt-cache-retention.ts
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

export type CacheRetention = 'none' | 'short' | 'long';

/**
 * Identify Google models that support prompt-caching via the provider API.
 * Only gemini-2.5 and gemini-3.x are eligible; earlier gemini families are not.
 */
export function isGooglePromptCacheEligible(provider: string, modelId?: string): boolean {
  if (provider !== 'google') {
    return false;
  }
  const normalized = (modelId ?? '').toLowerCase();
  // eslint-disable-next-line no-restricted-syntax
  return normalized.startsWith('gemini-2.5') || normalized.startsWith('gemini-3');
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

  // Google: no default — caller must opt in explicitly.
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
