/**
 * modelConstants.ts — catalog-derived model metadata for the VS Code extension
 *
 * Single source of truth lives in `packages/types/src/models.json`.
 * This module adapts that shared catalog into the small, UI-friendly shape
 * the extension needs for pickers, token tracking, and context budgeting.
 */

import * as vscode from 'vscode';
import {
  getCoreManualModelOptions,
  getModelContextLimits,
  getModelCostRates,
  getModelMetadataById,
  normalizeModelId,
  resolveAutoModeModel,
  PROVIDER_DISPLAY,
  CAPABILITY_LABEL,
  type ProviderId,
  type CapabilityTier,
} from '@agiworkforce/types';

export interface ModelPickerOption {
  id: string;
  label: string;
  description: string;
  detail: string;
}

// ─── Capability tier per model ────────────────────────────────────────────────

/**
 * Maps model IDs to a capability tier for picker sub-labels.
 * Mirrors the CLI's models.rs catalog: fastest/balanced/most-capable.
 * Derived from speed + quality fields in models.json.
 */
export const MODEL_CAPABILITY: Record<string, CapabilityTier> = {
  // Anthropic
  'claude-haiku-4.5': 'fastest',
  'claude-sonnet-4.6': 'balanced',
  'claude-opus-4.6': 'most-capable',
  // OpenAI
  'gpt-5.4-mini': 'fastest',
  'gpt-5.4-codex': 'fastest',
  'gpt-5.4': 'balanced',
  'gpt-5.4-pro': 'most-capable',
  // Google
  'gemini-3.1-flash-lite': 'fastest',
  'gemini-3.1-pro-preview': 'balanced',
  // DeepSeek
  'deepseek-chat': 'balanced',
  'deepseek-reasoner': 'most-capable',
  // Qwen
  'qwen-max': 'balanced',
  // Moonshot
  'kimi-k2.5-thinking': 'most-capable',
  // Zhipu
  'glm-4.7': 'balanced',
  // xAI
  'grok-4': 'most-capable',
};

// ─── Provider → ProviderId bridge ─────────────────────────────────────────────
// The Provider type (used in ModelMetadata.provider) uses snake_case identifiers
// that mostly overlap with ProviderId from design-system. Map the mismatches.

const PROVIDER_TO_DISPLAY_ID: Partial<Record<string, ProviderId>> = {
  managed_cloud: 'agi-cloud',
  ollama_cloud: 'ollama',
  lmstudio: 'lmstudio',
};

function resolveProviderId(provider: string): ProviderId | null {
  if (PROVIDER_TO_DISPLAY_ID[provider] !== undefined) {
    return PROVIDER_TO_DISPLAY_ID[provider] as ProviderId;
  }
  if (provider in PROVIDER_DISPLAY) {
    return provider as ProviderId;
  }
  return null;
}

// ─── Codicon per provider ─────────────────────────────────────────────────────

function codiconForProvider(providerId: ProviderId): string {
  const display = PROVIDER_DISPLAY[providerId];
  if (display.isLocal) return '$(home)';
  if (providerId === 'agi-cloud') return '$(sparkle)';
  return '$(cloud)';
}

// ─── Grouped QuickPick builder ────────────────────────────────────────────────

export interface GroupedQuickPickItem extends vscode.QuickPickItem {
  /** undefined for separator items */
  modelId?: string;
}

/**
 * Builds a grouped vscode.QuickPickItem array for the model picker.
 *
 * Layout:
 *   1. "Best (auto)" prominent at top
 *   2. Separator
 *   3. Per-provider sections (Separator header + model items)
 *      - Each model item: label = codicon + model name, description = capability
 *        sub-label (+ "· Thinking" when supportsEffort), detail = model ID
 */
export function buildGroupedQuickPickItems(): GroupedQuickPickItem[] {
  const items: GroupedQuickPickItem[] = [
    {
      label: '$(sparkle) Best (auto)',
      description: 'Auto-balanced — picks the right model per request',
      detail: 'Recommended',
      modelId: 'auto-balanced',
    },
    {
      label: '$(zap) Auto (Economy)',
      description: 'Smart routing — fastest and cheapest',
      detail: 'Best for quick questions and simple tasks',
      modelId: 'auto-economy',
    },
    {
      label: '$(star-full) Auto (Premium)',
      description: 'Smart routing — highest quality',
      detail: 'Best for complex reasoning and long contexts',
      modelId: 'auto-premium',
    },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
  ];

  // Group manual models by provider in the order they appear in providersInOrder
  const manualOptions = getCoreManualModelOptions();

  // Build ordered provider list from the models that appear in our manual options
  const providerOrder: string[] = [];
  const seenProviders = new Set<string>();
  for (const opt of manualOptions) {
    const p = String(opt.provider);
    if (!seenProviders.has(p)) {
      seenProviders.add(p);
      providerOrder.push(p);
    }
  }

  for (const provider of providerOrder) {
    const providerId = resolveProviderId(provider);
    const providerDisplay = providerId ? PROVIDER_DISPLAY[providerId] : null;
    const providerLabel = providerDisplay?.label ?? provider;

    // Provider section header
    items.push({ label: providerLabel, kind: vscode.QuickPickItemKind.Separator });

    const modelsForProvider = manualOptions.filter((o) => String(o.provider) === provider);
    for (const opt of modelsForProvider) {
      const capTier: CapabilityTier = MODEL_CAPABILITY[opt.id] ?? 'balanced';
      const capLabel = CAPABILITY_LABEL[capTier];
      const supportsThinking = providerId
        ? (PROVIDER_DISPLAY[providerId]?.supportsEffort ?? false)
        : false;

      // Also check individual model's thinking capability from catalog
      const metadata = getModelMetadataById(opt.id);
      const modelHasThinking = metadata?.capabilities.thinking ?? false;

      const descriptionParts: string[] = [capLabel];
      if (supportsThinking && modelHasThinking) {
        descriptionParts.push('Thinking');
      }
      const description = descriptionParts.join(' · ');

      const codicon = providerId ? codiconForProvider(providerId) : '$(robot)';

      items.push({
        label: `${codicon} ${opt.label}`,
        description,
        detail: opt.id,
        modelId: opt.id,
      });
    }
  }

  return items;
}

// ─── Provider info for a given model ID ───────────────────────────────────────

export interface ModelProviderInfo {
  providerId: ProviderId | null;
  providerLabel: string;
  brandColor: string;
}

export function getModelProviderInfo(modelId: string): ModelProviderInfo {
  const metadata = getModelMetadataById(modelId);
  if (!metadata) {
    return { providerId: 'agi-cloud', providerLabel: 'AGI Cloud', brandColor: '#F59E0B' };
  }
  const providerId = resolveProviderId(String(metadata.provider));
  if (!providerId) {
    return { providerId: null, providerLabel: String(metadata.provider), brandColor: '#71717A' };
  }
  const display = PROVIDER_DISPLAY[providerId];
  return { providerId, providerLabel: display.label, brandColor: display.brandColor };
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
