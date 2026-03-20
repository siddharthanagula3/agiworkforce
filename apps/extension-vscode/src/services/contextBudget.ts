/**
 * contextBudget.ts -- Model-aware context budget calculation
 *
 * Computes available context tokens based on the selected model's context window.
 * Allocates 3% for chat mode and 5% for agent mode by default.
 * Users can override via `agiWorkforce.contextBudgetPercent`.
 *
 * Uses the 4-chars-per-token heuristic (consistent with tokenCounter.ts).
 */

import * as vscode from 'vscode';

// ─── Model context limits (tokens) ──────────────────────────────────────────

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4.6': 1_000_000,
  'claude-sonnet-4.6': 200_000,
  'claude-haiku-4.5': 200_000,
  'gpt-5-pro': 256_000,
  'gpt-5.2': 128_000,
  'gpt-5-nano': 128_000,
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

const DEFAULT_CONTEXT_LIMIT = 128_000;

/** Chars per token heuristic (same as tokenCounter.ts). */
const CHARS_PER_TOKEN = 4;

// ─── Budget modes ────────────────────────────────────────────────────────────

const MODE_BUDGET_PERCENT: Record<string, number> = {
  chat: 3,
  agent: 5,
};

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ContextBudget {
  /** Total context window of the selected model (tokens). */
  modelContextWindow: number;
  /** Budget percentage being used. */
  budgetPercent: number;
  /** Budget in tokens. */
  budgetTokens: number;
  /** Budget in approximate characters (tokens * 4). */
  budgetChars: number;
  /** Recommended max chars for the workspace indexer section. */
  indexerChars: number;
}

/**
 * Calculate the context budget for the given mode.
 *
 * @param mode - 'chat' (3% default) or 'agent' (5% default)
 * @returns Context budget with token and character limits.
 */
export function getContextBudget(mode: 'chat' | 'agent'): ContextBudget {
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  const model = config.get<string>('model') ?? 'auto-balanced';
  const userOverride = config.get<number>('contextBudgetPercent');

  const modelContextWindow = MODEL_CONTEXT_LIMITS[model] ?? DEFAULT_CONTEXT_LIMIT;
  const budgetPercent = userOverride ?? MODE_BUDGET_PERCENT[mode] ?? 3;

  // Clamp to 1-20% range.
  const clampedPercent = Math.max(1, Math.min(20, budgetPercent));

  const budgetTokens = Math.floor(modelContextWindow * (clampedPercent / 100));
  const budgetChars = budgetTokens * CHARS_PER_TOKEN;

  // Allocate roughly 40% of the character budget to the indexer section,
  // with the rest going to diagnostics, git, workspace tree, pinned files, etc.
  const indexerChars = Math.floor(budgetChars * 0.4);

  return {
    modelContextWindow,
    budgetPercent: clampedPercent,
    budgetTokens,
    budgetChars,
    indexerChars,
  };
}

/**
 * Estimate token count from a string using the 4-char heuristic.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
