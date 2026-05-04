/**
 * modelConstants.ts — catalog-derived model metadata for the VS Code extension
 *
 * Single source of truth lives in `packages/types/src/models.json`.
 * This module adapts that shared catalog into the small, UI-friendly shape
 * the extension needs for pickers, token tracking, and context budgeting.
 */

import {
  getCoreManualModelOptions,
  getModelContextLimits,
  getModelCostRates,
  getModelMetadataById,
  normalizeModelId,
  resolveAutoModeModel,
} from '@agiworkforce/types';

export interface ModelPickerOption {
  id: string;
  label: string;
  description: string;
  detail: string;
}

const DEFAULT_CONTEXT_LIMIT = 128_000;

const AUTO_MODEL_DEFAULTS = {
  'auto-balanced': resolveAutoModeModel('auto-balanced', 'pro') ?? 'gpt-5.5',
  'auto-economy': resolveAutoModeModel('auto-economy', 'hobby') ?? 'gpt-5.5-mini',
  'auto-premium': resolveAutoModeModel('auto-premium', 'max') ?? 'claude-opus-4-6',
} as const;

const MANUAL_MODEL_OPTIONS = getCoreManualModelOptions();
const MANUAL_MODEL_IDS = MANUAL_MODEL_OPTIONS.map((option) => option.id);

const manualContextLimits = getModelContextLimits(MANUAL_MODEL_IDS);
const manualCostRates = getModelCostRates(MANUAL_MODEL_IDS);

function getAutoContextLimit(modelId: string): number {
  return getModelMetadataById(modelId)?.contextWindow ?? DEFAULT_CONTEXT_LIMIT;
}

function getAutoCostRate(modelId: string): { input: number; output: number } {
  const rate = getModelCostRates([modelId])[modelId];
  return rate ? { input: rate.input, output: rate.output } : { input: 0, output: 0 };
}

export const MODEL_PICKER_OPTIONS: ModelPickerOption[] = [
  {
    id: 'auto-balanced',
    label: 'Auto (Balanced)',
    description: 'Smart routing — best model per task',
    detail: 'Recommended: AGI Workforce picks the optimal model automatically',
  },
  {
    id: 'auto-economy',
    label: 'Auto (Economy)',
    description: 'Smart routing — fastest and cheapest',
    detail: 'Best for quick questions and simple tasks',
  },
  {
    id: 'auto-premium',
    label: 'Auto (Premium)',
    description: 'Smart routing — highest quality',
    detail: 'Best for complex reasoning and long contexts',
  },
  ...MANUAL_MODEL_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    description: option.description,
    detail: option.detail,
  })),
];

const MODEL_PICKER_OPTION_IDS = new Set(MODEL_PICKER_OPTIONS.map((option) => option.id));

export function normalizeConfiguredModelId(modelId: string | null | undefined): string {
  const normalized = normalizeModelId(modelId) ?? modelId ?? 'auto-balanced';
  return MODEL_PICKER_OPTION_IDS.has(normalized) ? normalized : 'auto-balanced';
}

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  ...manualContextLimits,
  'auto-balanced': getAutoContextLimit(AUTO_MODEL_DEFAULTS['auto-balanced']),
  'auto-economy': getAutoContextLimit(AUTO_MODEL_DEFAULTS['auto-economy']),
  'auto-premium': getAutoContextLimit(AUTO_MODEL_DEFAULTS['auto-premium']),
};

export const MODEL_COST_RATES: Record<string, { input: number; output: number }> = {
  ...Object.fromEntries(
    Object.entries(manualCostRates).map(([modelId, rates]) => [
      modelId,
      { input: rates.input, output: rates.output },
    ]),
  ),
  'auto-balanced': getAutoCostRate(AUTO_MODEL_DEFAULTS['auto-balanced']),
  'auto-economy': getAutoCostRate(AUTO_MODEL_DEFAULTS['auto-economy']),
  'auto-premium': getAutoCostRate(AUTO_MODEL_DEFAULTS['auto-premium']),
};

/** Chars-per-token heuristic used for estimation when exact counts are unavailable. */
export const CHARS_PER_TOKEN = 4;

/** Blended cost per 1M tokens for rough single-rate estimation (dashboard). */
export const MODEL_COST_BLENDED: Record<string, number> = Object.fromEntries(
  Object.entries(MODEL_COST_RATES).map(([model, rates]) => [
    model,
    (rates.input + rates.output) / 2,
  ]),
);

/** Fallback blended rate when model is not in the table. */
export const DEFAULT_BLENDED_RATE = 5.0;

export { DEFAULT_CONTEXT_LIMIT };
