/**
 * @agiworkforce/routing
 *
 * Shared heuristic classifier, Indic-script detector, and pricing/promo helpers
 * for the AGI Workforce auto-routing system. Pure-TypeScript, zero side effects,
 * zero shared module state — safe to call from any surface (web, desktop,
 * mobile, extensions).
 *
 * Auto task requirements and slot assignments live in
 * `@agiworkforce/model-registry`; this package owns the pure classifier and
 * trust/capability-aware resolver. The legacy `three-tier-router` is retired.
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
export { resolveAutoRoute } from './auto';
export type {
  AutoRouteDecision,
  AutoFallbackRoute,
  AutoRoutingRequest,
  IntrinsicCapability,
  RoutingProfile,
  RoutingTrustMode,
  SelectedAutoRoute,
  UnavailableAutoRoute,
} from './auto';
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
export { assessModelSwitchCache } from './model-switch-cache';
export type { ModelSwitchCacheAssessment, ModelSwitchCacheInput } from './model-switch-cache';
export type {
  ClassifierResult,
  ConversationContext,
  RoutingAttachment,
  RoutingMessage,
  RoutingTaskType,
} from './types';
