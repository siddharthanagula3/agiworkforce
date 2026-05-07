/**
 * @agiworkforce/routing
 *
 * Shared heuristic classifier and Indic-script detector for the AGI Workforce
 * auto-routing system. Pure-TypeScript, zero side effects, zero shared module
 * state — safe to call from any surface (web, desktop, mobile, extensions).
 *
 * See `tasks/auto-routing-spec.md` §3–4 for the canonical behaviour.
 *
 * Public API:
 *   - `classifyTaskLocally(message, history, attachments?)` — heuristic taxonomy.
 *   - `applyConversationContext(local, ctx)` — 5-turn sticky pivot.
 *   - `estimateTokens(text, model?)` — provider-specific tokenizer estimates.
 *   - `detectIndicScript(text, threshold?)` — Pool C language gate.
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
export type {
  ClassifierResult,
  ConversationContext,
  RoutingAttachment,
  RoutingMessage,
  RoutingTaskType,
} from './types';
