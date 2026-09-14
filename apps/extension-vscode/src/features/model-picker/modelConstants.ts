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

/**
 * Auto is reachable when the canonical resolver can actually resolve it for
 * this tier, not when some representative model happens to be tier-allowed.
 * The plan gates below mirror `isModelReachableForTier` exactly; only the
 * routing half changed.
 */
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

/**
 * What the session is actually routed through right now. The subscription tier
 * alone cannot answer "can this route run that model": signed out of AGI Cloud
 * the tier resolves to `byok`, which admits the whole catalog even when the
 * only key the CLI holds is one provider's.
 */
export interface ModelRoute {
  trustMode?: string;
  provider?: string;
}

export type ModelLock =
  | { kind: 'sign-in' }
  | { kind: 'upgrade' }
  | { kind: 'provider-key'; providerLabel?: string; routeLabel: string };

export function modelLockHeading(lock: ModelLock): string {
  if (lock.kind === 'sign-in') return 'Sign in to AGI Cloud';
  if (lock.kind === 'upgrade') return 'Upgrade your AGI plan';
  // "Add your <provider> key" rather than "Add a/an …": the article is wrong
  // before half the provider names, and the key really is the user's own. A
  // provider the catalog has no display name for is not given a raw id here.
  return lock.providerLabel === undefined
    ? 'Add another provider key'
    : `Add your ${lock.providerLabel} key`;
}

/**
 * The sentence the picker says when a locked row is chosen. It ends with the
 * heading's own phrase, so the list, the sentence and the button all say the
 * same thing and no article ever precedes a provider name.
 */
export function modelLockReason(modelLabel: string, lock: ModelLock): string {
  const action = modelLockHeading(lock);
  if (lock.kind === 'sign-in') {
    return `${modelLabel} is not available on this session. ${action} to use it.`;
  }
  if (lock.kind === 'upgrade') {
    return `${modelLabel} is not in the plan this session resolved. ${action} to use it.`;
  }
  return `${modelLabel} cannot run on this session's route, which uses ${lock.routeLabel}. ${action} to use it.`;
}

function lockKey(lock: ModelLock): string {
  return lock.kind === 'provider-key' ? `provider-key:${lock.providerLabel ?? ''}` : lock.kind;
}

function planLock(tier: string | undefined): ModelLock {
  return tier === undefined || tier === 'local' || tier === 'byok'
    ? { kind: 'sign-in' }
    : { kind: 'upgrade' };
}

/**
 * `undefined` when the route can run the model today. Otherwise what the user
 * would have to do first, so the picker can say that instead of offering a
 * choice that ends in a failed turn.
 */
export function modelLockForRoute(
  modelId: string,
  modelProvider: string,
  tier: string | undefined,
  route: ModelRoute | undefined,
): ModelLock | undefined {
  if (!isModelReachableForTier(modelId, tier)) return planLock(tier);
  if (route?.trustMode !== 'byok') return undefined;
  if (route.provider === undefined || route.provider === '') return undefined;
  const routeProvider = resolveProviderId(route.provider);
  if (routeProvider === null) return undefined;
  const candidate = resolveProviderId(modelProvider);
  if (candidate === routeProvider) return undefined;
  const providerLabel = candidate === null ? undefined : providerDisplayLabel(modelProvider);
  return {
    kind: 'provider-key',
    ...(providerLabel === undefined ? {} : { providerLabel }),
    routeLabel: providerDisplayLabel(route.provider),
  };
}

export interface GroupedQuickPickItem extends vscode.QuickPickItem {
  modelId?: string;
  disabled?: boolean;
  lock?: ModelLock;
}

export function buildGroupedQuickPickItems(
  tier?: string,
  route?: ModelRoute,
): GroupedQuickPickItem[] {
  const autoLock = isAutoReachableForTier('auto', tier) ? undefined : planLock(tier);

  const usable: GroupedQuickPickItem[] = [];
  const locked = new Map<string, { lock: ModelLock; items: GroupedQuickPickItem[] }>();

  const autoItem: GroupedQuickPickItem = {
    label: '$(sparkle) Auto',
    description: 'Routes each message to the best model for the task and your plan',
    detail: 'Recommended',
    modelId: 'auto',
    ...(autoLock === undefined ? {} : { disabled: true, lock: autoLock }),
  };
  if (autoLock === undefined) {
    usable.push(autoItem, { label: '', kind: vscode.QuickPickItemKind.Separator });
  } else {
    locked.set(lockKey(autoLock), { lock: autoLock, items: [autoItem] });
  }

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
    const usableForProvider: GroupedQuickPickItem[] = [];

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

      const descriptionParts: string[] = [getPickerCapabilityLabel(opt.id, opt.detail)];
      if (metadata?.capabilities.thinking ?? false) descriptionParts.push('Thinking');

      const lock = modelLockForRoute(opt.id, provider, tier, route);
      const codicon =
        lock === undefined ? (providerId ? codiconForProvider(providerId) : '$(robot)') : '$(lock)';
      const item: GroupedQuickPickItem = {
        label: `${codicon} ${opt.label}`,
        description: descriptionParts.join(' · '),
        detail: opt.id,
        modelId: opt.id,
        ...(lock === undefined ? {} : { disabled: true, lock }),
      };

      if (lock === undefined) {
        usableForProvider.push(item);
        continue;
      }
      const bucket = locked.get(lockKey(lock));
      if (bucket === undefined) locked.set(lockKey(lock), { lock, items: [item] });
      else bucket.items.push(item);
    }

    if (usableForProvider.length > 0) {
      usable.push({ label: providerLabel, kind: vscode.QuickPickItemKind.Separator });
      usable.push(...usableForProvider);
    }
  }

  const items = [...usable];
  for (const bucket of locked.values()) {
    items.push({
      label: modelLockHeading(bucket.lock),
      kind: vscode.QuickPickItemKind.Separator,
    });
    items.push(...bucket.items);
  }
  return items;
}

export interface ModelProviderInfo {
  providerId: ProviderId | null;
  providerLabel: string;
  brandColor: string;
}

/**
 * The catalog's display name for a provider id the CLI reports (`deepseek`).
 * An id the catalog does not carry is returned unchanged rather than dressed
 * up as a name the registry never issued.
 */
export function providerDisplayLabel(provider: string): string {
  const providerId = resolveProviderId(provider);
  return providerId === null ? provider : PROVIDER_DISPLAY[providerId].label;
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

/**
 * The capability envelope Auto can guarantee on this surface.
 *
 * Previously a single representative model id from `resolveAutoModeModel`, a
 * parallel routing walk that skipped the canonical resolver's admission checks.
 * The envelope asks `resolveAutoRoute` what it would really select across every
 * task type and reports the intersection, so the context limit below is a floor
 * Auto can honour rather than one route's best case.
 *
 * Computed at the `pro` tier to preserve the previous module-level constant's
 * shape; these tables are not tier-parameterised.
 */
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

/**
 * The one place a model id becomes a name a user reads. Every surface that
 * shows the active model, the composer chip, the status bar and an error
 * headline, resolves through here so a raw catalog id never reaches the UI.
 * A local model has no catalog entry, and its own id is the only name it has.
 */
export function modelDisplayLabel(modelId: string): string {
  const option = MODEL_PICKER_OPTIONS.find((entry) => entry.id === modelId);
  if (option !== undefined) return option.label;
  return getModelMetadataById(modelId)?.name ?? modelId;
}

/**
 * VSCODE-PICKER-TIER-01. Tier-aware view of {@link MODEL_PICKER_OPTIONS} for the
 * sidebar webview `<select>`, which renders from the static array rather than
 * through {@link buildGroupedQuickPickItems}. Without this the webview picker
 * kept listing the whole managed-cloud catalog as selectable while signed out.
 *
 * `reachable: false` rows are rendered disabled (same treatment as non-live
 * `coming_soon` rows) instead of being removed, see isModelReachableForTier for
 * why removal would empty the picker.
 */
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
