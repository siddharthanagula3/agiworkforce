/**
 * modelConstants.ts — Shared model context limits and pricing
 *
 * Single source of truth for model metadata used across tokenCounter,
 * contextBudget, and other services. Adding/updating a model requires
 * changes only in this file.
 */

// ─── Context window limits per model (tokens) ───────────────────────────────

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4.6': 1_000_000,
  'claude-sonnet-4.6': 200_000,
  'claude-haiku-4.5': 200_000,
  'gpt-5-pro': 256_000,
  'gpt-5.4': 128_000,
  'gpt-5.4-nano': 128_000,
  'gemini-3-pro-preview': 2_000_000,
  'gemini-3-flash-preview': 1_000_000,
  'deepseek-r1': 128_000,
  'deepseek-chat': 128_000,
  'sonar-pro': 128_000,
  'grok-4': 128_000,
  'auto-balanced': 200_000,
  'auto-economy': 128_000,
  'auto-premium': 1_000_000,
};

export const DEFAULT_CONTEXT_LIMIT = 128_000;

/** Chars-per-token heuristic used for estimation when exact counts are unavailable. */
export const CHARS_PER_TOKEN = 4;

// ─── Cost estimates per 1M tokens ────────────────────────────────────────────

/** Per-model pricing with separate input/output rates (per 1M tokens, USD). */
export const MODEL_COST_RATES: Record<string, { input: number; output: number }> = {
  'claude-opus-4.6': { input: 15.0, output: 75.0 },
  'claude-sonnet-4.6': { input: 3.0, output: 15.0 },
  'claude-haiku-4.5': { input: 0.25, output: 1.25 },
  'gpt-5-pro': { input: 10.0, output: 60.0 },
  'gpt-5.4': { input: 2.5, output: 10.0 },
  'gpt-5.4-nano': { input: 0.1, output: 0.5 },
  'gemini-3-pro-preview': { input: 1.25, output: 5.0 },
  'gemini-3-flash-preview': { input: 0.075, output: 0.3 },
  'deepseek-r1': { input: 4.0, output: 16.0 },
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'sonar-pro': { input: 3.0, output: 15.0 },
  'grok-4': { input: 3.0, output: 15.0 },
};

/** Blended cost per 1M tokens for rough single-rate estimation (dashboard). */
export const MODEL_COST_BLENDED: Record<string, number> = Object.fromEntries(
  Object.entries(MODEL_COST_RATES).map(([model, rates]) => [
    model,
    (rates.input + rates.output) / 2,
  ]),
);

/** Fallback blended rate when model is not in the table. */
export const DEFAULT_BLENDED_RATE = 5.0;
