/**
 * Web-search provider support — re-export shim.
 *
 * Canonical implementation moved to `packages/ai/search/src/web-search-support.ts`
 * (WP4, 2026-07-11) so web/desktop/mobile composer UIs share ONE decision of
 * "does the Web search toggle actually produce results for this provider"
 * instead of each surface growing its own copy and drifting. This file stays
 * so existing imports (`@/lib/web-search-support`, e.g.
 * `features/chat/components/Composer/ChatComposerNew.tsx`) keep working
 * unchanged — no consumer needs to move.
 *
 * See the canonical file for the full design rationale (native harness
 * execution facts, the WP4 generic-tool fallback, and composer gating).
 */

export {
  providerSupportsWebSearch,
  providerInjectsWebSearchTool,
  isWebSearchAvailable,
  webSearchNeedsGenericTool,
  WEB_SEARCH_INJECTION_PROVIDERS,
  WEB_SEARCH_CAPABLE_PROVIDERS,
} from '@agiworkforce/search';
