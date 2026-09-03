import * as vscode from 'vscode';
import {
  canAccessModelForSubscriptionTier,
  canUseBillingPlanCapability,
  getCoreManualModelOptions,
  getModelContextLimits,
  getModelCostRates,
  getModelMetadataById,
  getPickerModelTier,
  normalizeModelId,
  evaluateModelEnvironment,
  PROVIDER_DISPLAY,
  type ModelAvailability,
  type ProviderId,
  type EnvironmentAvailability,
  type ModelEnvironment,
} from '@agiworkforce/types';
import { getAutoCapabilityEnvelope } from '@agiworkforce/routing';

export interface ModelPickerOption {
  id: string;
  label: string;
  description: string;
  detail: string;
  availability: ModelAvailability;
}

export function environmentAvailability(_env: ModelEnvironment): EnvironmentAvailability {
  return { configured: false };
}

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

function codiconForProvider(providerId: ProviderId): string {
  const display = PROVIDER_DISPLAY[providerId];
  if (display.isLocal) return '$(home)';
  if (providerId === 'agi-cloud') return '$(sparkle)';
  return '$(cloud)';
}

export const MODEL_LOCKED_HINT = 'Sign in or add a provider key';

export function isAutoReachableForTier(autoId: string, tier: string | undefined): boolean {
  if (tier === undefined) return true;
  if (tier === 'byok') return true;
  if (tier === 'local' || !canUseBillingPlanCapability(tier, 'developer_surfaces')) return false;
  return (
    getAutoCapabilityEnvelope({
      selection: autoId,
      subscriptionTier: tier,
      trustMode: 'managed_cloud',
      runtimeProfileId: 'vscode/managed-chat',
    }) !== null
  );
}

export function isModelReachableForTier(modelId: string, tier: string | undefined): boolean {
  if (tier === undefined) return true;
  if (tier === 'byok') return true;
  if (tier === 'local' || !canUseBillingPlanCapability(tier, 'developer_surfaces')) return false;
  return canAccessModelForSubscriptionTier(modelId, tier);
}

function getPickerCapabilityLabel(modelId: string, catalogDetail: string): string {
  const tier = getPickerModelTier(modelId);
  const tierLabel = tier === 'premium' ? 'Premium' : tier === 'economy' ? 'Economy' : 'Balanced';
  return catalogDetail === '' ? tierLabel : catalogDetail;
}

export interface GroupedQuickPickItem extends vscode.QuickPickItem {
  modelId?: string;
  disabled?: boolean;
}

export function buildGroupedQuickPickItems(tier?: string): GroupedQuickPickItem[] {
  const autoReachable = (autoId: string): boolean => isAutoReachableForTier(autoId, tier);

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

  const manualOptions = getCoreManualModelOptions();

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

    items.push({ label: providerLabel, kind: vscode.QuickPickItemKind.Separator });

    const modelsForProvider = manualOptions.filter((o) => String(o.provider) === provider);
    for (const opt of modelsForProvider) {
      const metadata = getModelMetadataById(opt.id);

      if (metadata != null && (metadata.availability ?? 'live') !== 'live') continue;

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

export interface ModelProviderInfo {
  providerId: ProviderId | null;
  providerLabel: string;
  brandColor: string;
}

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

const AUTO_ENVELOPE = getAutoCapabilityEnvelope({
  selection: 'auto',
  subscriptionTier: 'pro',
  trustMode: 'managed_cloud',
  runtimeProfileId: 'vscode/managed-chat',
});

const MANUAL_MODEL_OPTIONS = getCoreManualModelOptions();
const MANUAL_MODEL_IDS = MANUAL_MODEL_OPTIONS.map((option) => option.id);

const manualContextLimits = getModelContextLimits(MANUAL_MODEL_IDS);
const manualCostRates = getModelCostRates(MANUAL_MODEL_IDS);

/**
 * Auto's cost rate is the WORST case across every route it can pick, not one
 * representative's. A budget estimate that under-states the price of a route
 * Auto might actually take is worse than one that over-states it.
 */
function getAutoCostRate(modelIds: readonly string[]): { input: number; output: number } {
  if (modelIds.length === 0) return { input: 0, output: 0 };
  const rates = getModelCostRates([...modelIds]);
  let input = 0;
  let output = 0;
  for (const modelId of modelIds) {
    const rate = rates[modelId];
    if (!rate) continue;
    input = Math.max(input, rate.input);
    output = Math.max(output, rate.output);
  }
  return { input, output };
}

export const MODEL_PICKER_OPTIONS: ModelPickerOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'Smart routing, best model per task',
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

export function getModelPickerOptionsForTier(
  tier?: string,
): Array<ModelPickerOption & { reachable: boolean }> {
  return MODEL_PICKER_OPTIONS.map((option) => ({
    ...option,
    reachable: option.id.startsWith('auto')
      ? isAutoReachableForTier(option.id, tier)
      : isModelReachableForTier(option.id, tier),
  }));
}

const SELECTABLE_MODEL_PICKER_OPTION_IDS = new Set(
  MODEL_PICKER_OPTIONS.filter((option) => option.availability === 'live').map(
    (option) => option.id,
  ),
);

export function normalizeSelectableConfiguredModelId(
  modelId: string | null | undefined,
): string | null {
  const candidate = modelId ?? 'auto';
  const normalized = normalizeModelId(candidate) ?? candidate;
  return SELECTABLE_MODEL_PICKER_OPTION_IDS.has(normalized) ? normalized : null;
}

export function normalizeConfiguredModelId(modelId: string | null | undefined): string {
  return normalizeSelectableConfiguredModelId(modelId) ?? 'auto';
}

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  ...manualContextLimits,
  auto: AUTO_ENVELOPE?.contextWindow ?? DEFAULT_CONTEXT_LIMIT,
};

export const MODEL_COST_RATES: Record<string, { input: number; output: number }> = {
  ...Object.fromEntries(
    Object.entries(manualCostRates).map(([modelId, rates]) => [
      modelId,
      { input: rates.input, output: rates.output },
    ]),
  ),
  auto: getAutoCostRate(AUTO_ENVELOPE?.reachableModelKeys ?? []),
};

export const CHARS_PER_TOKEN = 4;

export const MODEL_COST_BLENDED: Record<string, number> = Object.fromEntries(
  Object.entries(MODEL_COST_RATES).map(([model, rates]) => [
    model,
    (rates.input + rates.output) / 2,
  ]),
);

export const DEFAULT_BLENDED_RATE = 5.0;

export { DEFAULT_CONTEXT_LIMIT };
