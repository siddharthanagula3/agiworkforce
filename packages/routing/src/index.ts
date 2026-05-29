/**
 * @agiworkforce/routing
 *
 * Shared heuristic classifier, Indic-script detector, and pricing/promo helpers
 * for the AGI Workforce auto-routing system. Pure-TypeScript, zero side effects,
 * zero shared module state — safe to call from any surface (web, desktop,
 * mobile, extensions).
 *
 * See `tasks/auto-routing-spec.md` §3–4 for the canonical behaviour. The legacy
 * `three-tier-router` has been retired (zero non-test callers, stale model
 * table); task→model selection lives in the catalog slot/tier maps
 * (`@agiworkforce/types`) and the auto ranker.
 *
 * Public API:
 *   - `classifyTaskLocally(message, history, attachments?)` — heuristic taxonomy.
 *   - `applyConversationContext(local, ctx)` — 5-turn sticky pivot.
 *   - `estimateTokens(text, model?)` — provider-specific tokenizer estimates.
 *   - `detectIndicScript(text, threshold?)` — Pool C language gate.
 *   - `isDeprecated(modelId, now?)` / `isPromoExpired(modelId, now?)` — guards.
 *   - `effectiveInputPrice(modelId, now?)` / `effectiveOutputPrice(modelId, now?)`
 *     — pricing that auto-switches to `post_promo_prices` past `promo_expires_at`.
 *   - `tokenizerDriftFactor(modelId)` / `ESTIMATE_INFLATION` — tokenizer-drift
 *     inflation for cost/latency re-baselining.
 *
 * @packageDocumentation
 */

// `bundle-analyzable-paths`: named exports only. We do not re-export the
// whole module via `export * from` because that defeats some bundlers'
// tree-shaking heuristics on Next.js Edge.

export { applyConversationContext, classifyTaskLocally, estimateTokens } from './classify';
export {
  DEFAULT_INDIC_RATIO_THRESHOLD,
  detectIndicScript,
  type IndicDetectionResult,
  type IndicScript,
} from './indic';
export {
  effectiveInputPrice,
  effectiveOutputPrice,
  ESTIMATE_INFLATION,
  isDeprecated,
  isPromoExpired,
  tokenizerDriftFactor,
} from './pricing';
export type {
  ClassifierResult,
  ConversationContext,
  RoutingAttachment,
  RoutingMessage,
  RoutingTaskType,
} from './types';
