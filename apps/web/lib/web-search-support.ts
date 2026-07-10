/**
 * Web-search provider support — the single source of truth for "does turning on the
 * composer's Web search toggle actually produce web results for this model".
 *
 * Two distinct facts, deliberately separated:
 *
 *  1. The model's catalog `capabilities.search` flag (does the *model* support search
 *     at all). Several providers set `search:true` for models whose provider we do NOT
 *     yet wire a search path for (xai/qwen/moonshot/deepseek/…), which made the toggle
 *     *cosmetic*: it lit a checkmark, the request went out with no search tool, and the
 *     model replied "I can't browse the internet".
 *
 *  2. Whether AGI actually executes web search for the model's PROVIDER — this file.
 *     - anthropic / google / openai: the v1 chat route injects a provider-native
 *       server tool (`web_search_20260209` / `{google_search:{}}` / `web_search_preview`)
 *       — see request-processor.ts `appendWebSearchTool`.
 *     - perplexity: Sonar models search natively (no injection needed).
 *     - managed_cloud (Auto): resolved server-side to a concrete model; genuine search
 *       queries route to Perplexity/Gemini, so the toggle stays available.
 *
 * The composer gates the toggle on BOTH facts so it is never cosmetic. Kept in
 * apps/web (both consumers — the composer and the v1 request processor — live here);
 * `WEB_SEARCH_INJECTION_PROVIDERS` is the shared list so the injection branches and the
 * UI gate cannot drift.
 */

/** Providers for which the v1 route injects a native web-search server tool. */
export const WEB_SEARCH_INJECTION_PROVIDERS: ReadonlySet<string> = new Set([
  'anthropic',
  'google',
  'openai',
]);

/** True when the v1 chat route injects a native web-search tool for `provider`. */
export function providerInjectsWebSearchTool(provider: string | undefined | null): boolean {
  return provider ? WEB_SEARCH_INJECTION_PROVIDERS.has(provider.toLowerCase()) : false;
}

/**
 * Providers for which enabling web search actually yields results — the injection
 * providers plus perplexity (native Sonar search) and managed_cloud (Auto resolves to
 * a search-capable model server-side). Used to gate the composer toggle.
 */
export const WEB_SEARCH_CAPABLE_PROVIDERS: ReadonlySet<string> = new Set([
  ...WEB_SEARCH_INJECTION_PROVIDERS,
  'perplexity',
  'managed_cloud',
]);

/**
 * True when turning on the composer Web search toggle for a model on `provider`
 * actually produces web results. `false` for `search:true` catalog models whose
 * provider has no wired search path (xai/qwen/moonshot/deepseek/zhipu/groq/…), so the
 * composer can disable the toggle with a tooltip instead of lying.
 */
export function providerSupportsWebSearch(provider: string | undefined | null): boolean {
  return provider ? WEB_SEARCH_CAPABLE_PROVIDERS.has(provider.toLowerCase()) : false;
}
