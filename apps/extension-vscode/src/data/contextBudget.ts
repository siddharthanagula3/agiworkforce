
import { estimateTextTokens } from '@agiworkforce/agent-core';
import {
  MODEL_CONTEXT_LIMITS,
  DEFAULT_CONTEXT_LIMIT,
  CHARS_PER_TOKEN,
  normalizeConfiguredModelId,
} from '../features/model-picker/modelConstants';
import { Config } from '../platform/config';

const MODE_BUDGET_PERCENT: Record<string, number> = {
  chat: 3,
  agent: 5,
};

export interface ContextBudget {
  modelContextWindow: number;
  budgetPercent: number;
  budgetTokens: number;
  budgetChars: number;
  indexerChars: number;
}

/**
 * Calculate the context budget for the given mode.
 *
 * @param mode - 'chat' (3% default) or 'agent' (5% default)
 * @returns Context budget with token and character limits.
 */
export function getContextBudget(mode: 'chat' | 'agent'): ContextBudget {
  const model = normalizeConfiguredModelId(Config.model());

  const modelContextWindow = MODEL_CONTEXT_LIMITS[model] ?? DEFAULT_CONTEXT_LIMIT;
  const budgetPercent = MODE_BUDGET_PERCENT[mode] ?? 3;

  const clampedPercent = Math.max(1, Math.min(20, budgetPercent));

  const budgetTokens = Math.floor(modelContextWindow * (clampedPercent / 100));
  const budgetChars = budgetTokens * CHARS_PER_TOKEN;

  const indexerChars = Math.floor(budgetChars * 0.4);

  return {
    modelContextWindow,
    budgetPercent: clampedPercent,
    budgetTokens,
    budgetChars,
    indexerChars,
  };
}

export function estimateTokens(text: string): number {
  return estimateTextTokens(text);
}
