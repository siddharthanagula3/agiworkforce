import {
  CAPABILITY_LABEL,
  CHAT_MODEL_TYPES,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  canAccessManualModelSelection,
  canUseBillingPlanCapability,
  canAccessModelForSubscriptionTier,
  clampEffortToEntitlement,
  getBillingPlanPricing,
  getModelEffortOptions,
  getModelMetadataById,
  getModelReasoning,
  getModelRegistryFacts,
  getPickerModelsForRuntimeProfile,
  resolveModelEffort,
  splitEffortsByEntitlement,
  type CapabilityTier,
  type Effort,
  type ModelQuality,
  type ModelSpeed,
} from '@agiworkforce/types';
import {
  buildModelPickerShortList,
  resolvePlanLockLabel,
} from '@agiworkforce/unified-chat/model-picker';
import type { ManagedModelAccess } from './freeTrialClient';
import { CHROME_MANAGED_RUNTIME_PROFILE } from './managedChatRouting';

export interface ManagedModelPickerOption {
  value: string;
  label: string;
  provider?: string;
  capability?: CapabilityTier;
  description?: string;
  quality?: ModelQuality;
  speed?: ModelSpeed;
  family?: string | null;
  lockLabel?: string;
}

export interface ManagedModelPickerView {
  current: ManagedModelPickerOption | null;
  recommended: ManagedModelPickerOption[];
  more: ManagedModelPickerOption[];
}

export interface ManagedEffortControlState {
  status: 'awaiting-route' | 'unavailable' | 'ready';
  modelId?: string;
  options: readonly Effort[];
  gated: readonly Effort[];
  unlockPlanLabel?: string;
  effort?: Effort;
  description: string;
}

const AUTO_OPTION: ManagedModelPickerOption = {
  value: 'auto',
  label: 'Best (auto)',
};

function capabilityForQuality(qualityTier: string): CapabilityTier | undefined {
  switch (qualityTier) {
    case 'fast':
      return 'fastest';
    case 'balanced':
      return 'balanced';
    case 'best':
      return 'most-capable';
    default:
      return undefined;
  }
}

function pickerOption(modelId: string, lockLabel?: string): ManagedModelPickerOption | null {
  const metadata = getModelMetadataById(modelId);
  if (!metadata || metadata.status === 'deprecated') return null;
  return {
    value: metadata.id,
    label: metadata.name,
    provider: metadata.provider,
    capability: capabilityForQuality(metadata.qualityTier),
    ...(metadata.bestFor[0] ? { description: metadata.bestFor[0] } : {}),
    quality: metadata.quality,
    speed: metadata.speed,
    family: getModelRegistryFacts(metadata.id)?.family ?? null,
    ...(lockLabel ? { lockLabel } : {}),
  };
}

export function getManagedModelPickerOptions(
  access: ManagedModelAccess | null,
): ManagedModelPickerOption[] {
  if (!access) return [{ ...AUTO_OPTION }];

  const options: ManagedModelPickerOption[] = [{ ...AUTO_OPTION }];
  for (const modelId of access.modelIds) {
    const option = pickerOption(modelId);
    if (option) options.push(option);
  }
  return options;
}

function keepFamiliesTogether(
  options: readonly ManagedModelPickerOption[],
): ManagedModelPickerOption[] {
  const members = new Map<string, ManagedModelPickerOption[]>();
  for (const option of options) {
    const key = option.family ?? option.value;
    const family = members.get(key);
    if (family) family.push(option);
    else members.set(key, [option]);
  }
  return [...members.values()].flat();
}

export function buildManagedModelPickerView(
  access: ManagedModelAccess,
  selectedModel: string,
): ManagedModelPickerView {
  const admitted = getManagedModelPickerOptions(access).filter((option) => option.value !== 'auto');
  const admittedIds = new Set(admitted.map((option) => option.value));
  const locked = getPickerModelsForRuntimeProfile(CHROME_MANAGED_RUNTIME_PROFILE, {
    modelTypes: [...CHAT_MODEL_TYPES],
  }).flatMap((model) => {
    if (
      admittedIds.has(model.id) ||
      canAccessModelForSubscriptionTier(model.id, access.subscriptionTier)
    ) {
      return [];
    }
    const lockLabel = resolvePlanLockLabel(model.id);
    const option = lockLabel ? pickerOption(model.id, lockLabel) : null;
    return option ? [option] : [];
  });
  const options = [...admitted, ...locked];
  const byId = new Map(options.map((option) => [option.value, option]));
  const shortList = buildModelPickerShortList({
    models: options.map((option) => ({
      id: option.value,
      displayName: option.label,
      providerKey: option.provider ?? '',
    })),
    planTier: access.subscriptionTier,
    favouriteModelIds: [],
    conversationModelId: null,
    selectedModelId: selectedModel,
    admitsModel: (modelId) => admittedIds.has(modelId),
    autoGuidance: '',
    autoContinuityGuidance: () => '',
  });
  const recommended = shortList.recommended.flatMap((row) => byId.get(row.id) ?? []);
  const current = shortList.current ? (byId.get(shortList.current.id) ?? null) : null;
  const shown = new Set(
    [...recommended, ...(current ? [current] : [])].map((option) => option.value),
  );
  return {
    current,
    recommended,
    more: keepFamiliesTogether(options.filter((option) => !shown.has(option.value))),
  };
}

const PRIMARY_CAPABILITY_ORDER: readonly CapabilityTier[] = ['most-capable', 'balanced', 'fastest'];

const QUALITY_RANK: Record<ModelQuality, number> = { excellent: 3, good: 2, fair: 1 };

function qualityRank(option: ManagedModelPickerOption): number {
  return option.quality ? QUALITY_RANK[option.quality] : 0;
}

export function partitionManagedModelOptions(options: readonly ManagedModelPickerOption[]): {
  primary: ManagedModelPickerOption[];
  more: ManagedModelPickerOption[];
} {
  const primary: ManagedModelPickerOption[] = [];
  for (const tier of PRIMARY_CAPABILITY_ORDER) {
    const best = options
      .filter((option) => option.capability === tier)
      .sort((left, right) => qualityRank(right) - qualityRank(left))[0];
    if (best) primary.push(best);
  }
  const promoted = new Set(primary.map((option) => option.value));
  return {
    primary,
    more: options.filter((option) => option.value !== 'auto' && !promoted.has(option.value)),
  };
}

export function reconcileManagedModelSelection(
  selection: string,
  access: ManagedModelAccess | null,
): string {
  if (selection === 'auto') return selection;
  if (!access) return 'auto';
  if (selection.startsWith('auto-')) {
    return access.allowedAutoModes.includes(selection) ? selection : 'auto';
  }
  return access.modelIds.includes(selection) && getModelMetadataById(selection)
    ? selection
    : 'auto';
}

export function getManagedModelBadgeLabel(modelId: string): string {
  if (modelId === 'auto') return AUTO_OPTION.label;
  return getModelMetadataById(modelId)?.name ?? modelId;
}

export function agiWorkUnlockPlanLabel(): string | undefined {
  const tier = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.find((candidate) =>
    canUseBillingPlanCapability(candidate, 'agi_work'),
  );
  return tier ? getBillingPlanPricing(tier).label : undefined;
}

function manualModelSelectionPlanLabel(): string | undefined {
  const tier = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.find((candidate) =>
    canAccessManualModelSelection(candidate),
  );
  return tier ? getBillingPlanPricing(tier).label : undefined;
}

export function getManagedEffortControlState(
  selection: string,
  currentModelKey: string | undefined,
  requestedEffort: string | undefined,
  planTier: string | undefined,
): ManagedEffortControlState {
  const autoSelected = selection === 'auto' || selection.startsWith('auto-');
  const modelId = autoSelected ? currentModelKey : selection;
  if (!modelId) {
    return {
      status: 'awaiting-route',
      options: [],
      gated: [],
      description: 'Auto chooses reasoning effort after routing to a model.',
    };
  }

  const supported = getModelEffortOptions(modelId);
  const modelLabel = getManagedModelBadgeLabel(modelId);
  if (supported.length === 0) {
    return {
      status: 'unavailable',
      modelId,
      options: supported,
      gated: [],
      description: `${modelLabel} does not expose a reasoning-effort control.`,
    };
  }

  const entitlement = splitEffortsByEntitlement(getModelReasoning(modelId), planTier);
  const gated = supported.filter((effort) => entitlement.gated.includes(effort));
  const unlockPlanLabel = gated.length > 0 ? manualModelSelectionPlanLabel() : undefined;
  return {
    status: 'ready',
    modelId,
    options: supported.filter((effort) => !gated.includes(effort)),
    gated,
    ...(unlockPlanLabel ? { unlockPlanLabel } : {}),
    effort: clampEffortToEntitlement(
      modelId,
      resolveModelEffort(modelId, requestedEffort),
      planTier,
    ),
    description: `Applies to ${modelLabel}.`,
  };
}

export function getManagedOutboundEffort(
  selection: string,
  currentModelKey: string | undefined,
  requestedEffort: string | undefined,
  planTier: string | undefined,
): Effort | undefined {
  const autoSelected = selection === 'auto' || selection.startsWith('auto-');
  const modelId = autoSelected ? currentModelKey : selection;
  return modelId
    ? clampEffortToEntitlement(modelId, resolveModelEffort(modelId, requestedEffort), planTier)
    : undefined;
}

export function isFreeManagedTier(tier: string): boolean {
  return tier.trim().toLowerCase() === 'free';
}

export function formatManagedTierLabel(tier: string): string {
  if (!tier.trim()) return 'Account';
  return `${getBillingPlanPricing(tier.trim()).label} plan`;
}

export function getManagedCapabilityLabel(option: ManagedModelPickerOption): string | undefined {
  return option.capability ? CAPABILITY_LABEL[option.capability] : undefined;
}
