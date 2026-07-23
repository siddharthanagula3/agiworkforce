// packages/contracts/types/src/design-system/effort.ts

/** Provider-facing effort axis. Every surface filters this through model metadata. */
export type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const EFFORT_LABEL: Readonly<Record<Effort, string>> = Object.freeze({
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'xHigh',
  max: 'Max',
});

/** Anthropic thinking.budget_tokens by effort level. */
export const ANTHROPIC_THINKING_BUDGET: Readonly<
  Record<Exclude<Effort, 'none' | 'minimal'>, number>
> = Object.freeze({
  low: 4096,
  medium: 16384,
  high: 32768,
  xhigh: 49152,
  max: 65536,
});

// NOTE: `effortToProviderParams()` and `GEMINI_THINKING_BUDGET` were removed
// 2026-07-10 (reasoning-effort-capability wave). They were DEAD (grep-confirmed:
// zero callers) AND wrong per the live matrix: the helper emitted Anthropic
// `thinking:{type:"enabled",budget_tokens}` — which now 400s on Opus 4.8 — and
// capped OpenAI at a fixed set with no per-model `supportedEfforts`. The correct,
// live path is per-model `reasoning.control` + request-processor.ts +
// openai-reasoning-effort.ts. The remaining exports here (`Effort`, `EFFORT_LABEL`,
// `ANTHROPIC_THINKING_BUDGET`) are STILL live-imported
// (request-processor.ts, ComposerFooter, unified-chat, mobile/vscode pickers) so
// the file is kept — only the drifted function + its exclusive helper were deleted.
// See docs/research/reasoning-effort-capability-matrix-2026-07-10.md flag #1.
