/**
 * modelConstants.ts — catalog-derived model metadata for the VS Code extension
 *
 * Single source of truth lives in `packages/contracts/types/src/models.json`.
 * This module adapts that shared catalog into the small, UI-friendly shape
 * the extension needs for pickers, token tracking, and context budgeting.
 */

import * as vscode from 'vscode';
import {
  canAccessModelForSubscriptionTier,
  getCoreManualModelOptions,
  getModelContextLimits,
  getModelCostRates,
  getModelMetadataById,
  getPickerModelTier,
  normalizeModelId,
  resolveAutoModeModel,
  evaluateModelEnvironment,
  PROVIDER_DISPLAY,
  type ModelAvailability,
  type ProviderId,
  type EnvironmentAvailability,
  type ModelEnvironment,
} from '@agiworkforce/types';

export interface ModelPickerOption {
  id: string;
  label: string;
  description: string;
  detail: string;
  /**
   * Catalog availability (absent field in models.json ⇒ "live"). Non-live rows
   * (`coming_soon` / `unavailable`) are DISPLAY-ONLY: the webview renders them
   * disabled with a "Coming soon" suffix (mirrors the web picker) and they are
   * never selectable or routable — same invariant as
   * `getSelectableModels()` vs `getDisplayModels()` in packages/contracts/types.
   */
  availability: ModelAvailability;
}

// ─── Environment-gating helper ────────────────────────────────────────────────
//
// Phase A: returns { configured: false } for every environment so any future
// model that sets `requiresEnvironment` is gated (locked) until Phase B wires
// the real E2B / local-runtime availability signal.
//
// Phase B: replace this stub with real availability checks (e.g. query the
// managed-compute beta status from the bridge or desktop agent).
export function environmentAvailability(_env: ModelEnvironment): EnvironmentAvailability {
  return { configured: false };
}

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

// ─── Tier reachability ────────────────────────────────────────────────────────
//
// VSCODE-PICKER-TIER-01. The picker previously rendered the entire managed-cloud
// catalog unconditionally, so a signed-out user (or one in Local mode) saw every
// cloud model as if it were selectable. That is a trust-boundary presentation
// bug: it implies managed-cloud reachability that does not exist.
//
// The gate reuses the shared catalog's per-model subscription rule after the
// VS Code surface entitlement is applied. BYOK remains available independently
// of a managed subscription; the app-server performs provider/key admission.
// Local mode exposes only CLI-discovered local models. Managed developer access
// starts at Pro, matching the server-owned AGI Work entitlement.
//
// Deliberately NOT filtered out of the list. models.json contains zero
// ollama/lmstudio rows (local models arrive only via runtime discovery from the
// app-server), so hiding unreachable rows would leave an EMPTY picker whenever a
// local runtime is not already running. Unreachable models stay visible and are
// marked, mirroring the existing `coming_soon` disabled-row treatment.

/** The hint appended to a model the current tier cannot actually reach. */
export const MODEL_LOCKED_HINT = 'Sign in or add a provider key';

/**
 * True when `tier` can actually route `modelId` today.
 *
 * `tier === undefined` means "caller did not resolve a tier" and preserves the
 * pre-gate behaviour (everything reachable) so existing call sites and tests do
 * not silently start locking rows.
 */
export function isModelReachableForTier(modelId: string, tier: string | undefined): boolean {
  if (tier === undefined) return true;
  if (tier === 'byok') return true;
  if (tier === 'local' || tier === 'free' || tier === 'basic') return false;
  return canAccessModelForSubscriptionTier(modelId, tier);
}

function getPickerCapabilityLabel(modelId: string, catalogDetail: string): string {
  const tier = getPickerModelTier(modelId);
  const tierLabel = tier === 'premium' ? 'Premium' : tier === 'economy' ? 'Economy' : 'Balanced';
  return catalogDetail === '' ? tierLabel : catalogDetail;
}

// ─── Grouped QuickPick builder ────────────────────────────────────────────────

export interface GroupedQuickPickItem extends vscode.QuickPickItem {
  /** undefined for separator items */
  modelId?: string;
  /**
   * VS Code's native QuickPick has no disabled-row primitive. Callers must
   * reject rows with this flag; the custom webview picker renders it directly.
   */
  disabled?: boolean;
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
export function buildGroupedQuickPickItems(tier?: string): GroupedQuickPickItem[] {
  // Resolve Auto through the shared BYOK/managed routing policy before applying
  // this surface's entitlement gate.
  const autoReachable = (autoId: string): boolean =>
    isModelReachableForTier(resolveAutoModeModel(autoId, tier) ?? autoId, tier);

  const withLockHint = (description: string, reachable: boolean): string =>
    reachable ? description : `${description} · ${MODEL_LOCKED_HINT}`;

  const items: GroupedQuickPickItem[] = [
    {
      label: '$(sparkle) Auto',
      description: withLockHint(
        'Routes each message to the best model for the task and your plan',
        autoReachable('auto'),
      ),
      detail: 'Recommended',
      modelId: 'auto',
      disabled: !autoReachable('auto'),
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
      const metadata = getModelMetadataById(opt.id);

      // Availability invariant: non-live models (`coming_soon`/`unavailable`)
      // are NEVER selectable/routable on any surface. QuickPickItem has no
      // disabled state, so they are excluded here (the webview dropdown shows
      // them disabled with a "Coming soon" suffix instead, matching web).
      if (metadata != null && (metadata.availability ?? 'live') !== 'live') continue;

      // P3 Phase A: gate models whose `requiresEnvironment` flag is set.
      // evaluateModelEnvironment is fail-closed: absent flag → selectable: true
      // (no-op for every current model). Phase B replaces environmentAvailability
      // with a real availability check.
      const requiredEnv = metadata?.requiresEnvironment;
      if (requiredEnv !== undefined) {
        const envResult = evaluateModelEnvironment(
          requiredEnv,
          environmentAvailability(requiredEnv),
        );
        if (!envResult.selectable) continue;
      }

      const modelHasThinking = metadata?.capabilities.thinking ?? false;

      const descriptionParts: string[] = [getPickerCapabilityLabel(opt.id, opt.detail)];
      if (modelHasThinking) {
        descriptionParts.push('Thinking');
      }
      // VSCODE-PICKER-TIER-01: mark rows the active tier cannot route rather
      // than dropping them (see isModelReachableForTier — dropping would empty
      // the picker, because local models are not in the static catalog).
      const reachable = isModelReachableForTier(opt.id, tier);
      if (!reachable) {
        descriptionParts.push(MODEL_LOCKED_HINT);
      }
      const description = descriptionParts.join(' · ');

      const codicon = reachable
        ? providerId
          ? codiconForProvider(providerId)
          : '$(robot)'
        : '$(lock)';

      items.push({
        label: `${codicon} ${opt.label}`,
        description,
        detail: opt.id,
        modelId: opt.id,
        disabled: !reachable,
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

/** Theme-safe provider badge fallbacks for host-generated status messages. */
export const AGI_CLOUD_BRAND_COLOR = 'var(--vscode-activityBarBadge-background)';
export const UNKNOWN_PROVIDER_BRAND_COLOR = 'var(--vscode-descriptionForeground)';

export function getModelProviderInfo(modelId: string): ModelProviderInfo {
  const metadata = getModelMetadataById(modelId);
  if (!metadata) {
    return {
      providerId: 'agi-cloud',
      providerLabel: 'AGI Cloud',
      brandColor: AGI_CLOUD_BRAND_COLOR,
    };
  }
  const providerId = resolveProviderId(String(metadata.provider));
  if (!providerId) {
    return {
      providerId: null,
      providerLabel: String(metadata.provider),
      brandColor: UNKNOWN_PROVIDER_BRAND_COLOR,
    };
  }
  const display = PROVIDER_DISPLAY[providerId];
  return { providerId, providerLabel: display.label, brandColor: display.brandColor };
}

const DEFAULT_CONTEXT_LIMIT = 128_000;

const AUTO_MODEL_DEFAULTS: Record<'auto', string | null> = {
  // Representative model for context/cost DISPLAY only; the single Auto
  // self-routes per task/tier at request time.
  auto: resolveAutoModeModel('auto', 'pro'),
} as const;

const MANUAL_MODEL_OPTIONS = getCoreManualModelOptions();
const MANUAL_MODEL_IDS = MANUAL_MODEL_OPTIONS.map((option) => option.id);

const manualContextLimits = getModelContextLimits(MANUAL_MODEL_IDS);
const manualCostRates = getModelCostRates(MANUAL_MODEL_IDS);

function getAutoContextLimit(modelId: string | null): number {
  return getModelMetadataById(modelId)?.contextWindow ?? DEFAULT_CONTEXT_LIMIT;
}

function getAutoCostRate(modelId: string | null): { input: number; output: number } {
  if (modelId === null) return { input: 0, output: 0 };
  const rate = getModelCostRates([modelId])[modelId];
  return rate ? { input: rate.input, output: rate.output } : { input: 0, output: 0 };
}

export const MODEL_PICKER_OPTIONS: ModelPickerOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'Smart routing — best model per task',
    detail: 'Recommended: AGI Workforce picks the optimal model automatically',
    availability: 'live',
  },
  ...MANUAL_MODEL_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    description: option.description,
    detail: option.detail,
    availability: getModelMetadataById(option.id)?.availability ?? ('live' as ModelAvailability),
  })),
];

/**
 * VSCODE-PICKER-TIER-01. Tier-aware view of {@link MODEL_PICKER_OPTIONS} for the
 * sidebar webview `<select>`, which renders from the static array rather than
 * through {@link buildGroupedQuickPickItems}. Without this the webview picker
 * kept listing the whole managed-cloud catalog as selectable while signed out.
 *
 * `reachable: false` rows are rendered disabled (same treatment as non-live
 * `coming_soon` rows) instead of being removed — see isModelReachableForTier for
 * why removal would empty the picker.
 */
export function getModelPickerOptionsForTier(
  tier?: string,
): Array<ModelPickerOption & { reachable: boolean }> {
  return MODEL_PICKER_OPTIONS.map((option) => ({
    ...option,
    reachable: isModelReachableForTier(resolveAutoModeModel(option.id, tier) ?? option.id, tier),
  }));
}

/**
 * SELECTABLE picker ids — auto modes + live catalog models only. Non-live
 * (`coming_soon`/`unavailable`) ids are display-only and must never round-trip
 * through configuration into a request.
 */
const SELECTABLE_MODEL_PICKER_OPTION_IDS = new Set(
  MODEL_PICKER_OPTIONS.filter((option) => option.availability === 'live').map(
    (option) => option.id,
  ),
);

export function normalizeConfiguredModelId(modelId: string | null | undefined): string {
  const normalized = normalizeModelId(modelId) ?? modelId ?? 'auto';
  return SELECTABLE_MODEL_PICKER_OPTION_IDS.has(normalized) ? normalized : 'auto';
}

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  ...manualContextLimits,
  auto: getAutoContextLimit(AUTO_MODEL_DEFAULTS['auto']),
};

export const MODEL_COST_RATES: Record<string, { input: number; output: number }> = {
  ...Object.fromEntries(
    Object.entries(manualCostRates).map(([modelId, rates]) => [
      modelId,
      { input: rates.input, output: rates.output },
    ]),
  ),
  auto: getAutoCostRate(AUTO_MODEL_DEFAULTS['auto']),
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
