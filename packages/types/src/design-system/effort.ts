// packages/types/src/design-system/effort.ts

/** UI-facing effort axis. Locked vocabulary per DECISIONS.md D5. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const EFFORT_LABEL: Readonly<Record<Effort, string>> = Object.freeze({
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'xHigh',
  max: 'Max',
});

/** Anthropic thinking.budget_tokens by effort level. */
export const ANTHROPIC_THINKING_BUDGET: Readonly<Record<Effort, number>> = Object.freeze({
  low: 4096,
  medium: 16384,
  high: 32768,
  xhigh: 49152,
  max: 65536,
});

/** OpenAI reasoning.effort string by effort level. OpenAI has no Max effort. */
export const OPENAI_REASONING_EFFORT: Readonly<
  Partial<Record<Effort, 'low' | 'medium' | 'high' | 'xhigh'>>
> = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
});

// NOTE: `effortToProviderParams()` and `GEMINI_THINKING_BUDGET` were removed
// 2026-07-10 (reasoning-effort-capability wave). They were DEAD (grep-confirmed:
// zero callers) AND wrong per the live matrix: the helper emitted Anthropic
// `thinking:{type:"enabled",budget_tokens}` — which now 400s on Opus 4.8 — and
// capped OpenAI at a fixed set with no per-model `supportedEfforts`. The correct,
// live path is per-model `reasoning.control` + request-processor.ts +
// openai-reasoning-effort.ts. The remaining exports here (`Effort`, `EFFORT_LABEL`,
// `ANTHROPIC_THINKING_BUDGET`, `OPENAI_REASONING_EFFORT`) are STILL live-imported
// (request-processor.ts, ComposerFooter, unified-chat, mobile/vscode pickers) so
// the file is kept — only the drifted function + its exclusive helper were deleted.
// See docs/research/reasoning-effort-capability-matrix-2026-07-10.md flag #1.
