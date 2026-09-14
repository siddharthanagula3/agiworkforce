import {
  CAPABILITY_LABEL,
  getModelEffortOptions,
  getModelMetadataById,
  resolveModelEffort,
  type CapabilityTier,
  type Effort,
  type ModelQuality,
} from '@agiworkforce/types';
import type { ManagedModelAccess } from './freeTrialClient';

export interface ManagedModelPickerOption {
  value: string;
  label: string;
  provider?: string;
  capability?: CapabilityTier;
  description?: string;
  quality?: ModelQuality;
}

export interface ManagedEffortControlState {
  status: 'awaiting-route' | 'unavailable' | 'ready';
  modelId?: string;
  options: readonly Effort[];
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

export function getManagedModelPickerOptions(
  access: ManagedModelAccess | null,
): ManagedModelPickerOption[] {
  if (!access) return [{ ...AUTO_OPTION }];

  const options: ManagedModelPickerOption[] = [{ ...AUTO_OPTION }];
  for (const modelId of access.modelIds) {
    const metadata = getModelMetadataById(modelId);
    if (!metadata || metadata.status === 'deprecated') continue;
    options.push({
      value: metadata.id,
      label: metadata.name,
      provider: metadata.provider,
      capability: capabilityForQuality(metadata.qualityTier),
      ...(metadata.bestFor[0] ? { description: metadata.bestFor[0] } : {}),
      quality: metadata.quality,
    });
  }
  return options;
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

export function getManagedEffortControlState(
  selection: string,
  currentModelKey: string | undefined,
  requestedEffort: string | undefined,
): ManagedEffortControlState {
  const autoSelected = selection === 'auto' || selection.startsWith('auto-');
  const modelId = autoSelected ? currentModelKey : selection;
  if (!modelId) {
    return {
      status: 'awaiting-route',
      options: [],
      description: 'Auto chooses reasoning effort after routing to a model.',
    };
  }

  const options = getModelEffortOptions(modelId);
  const modelLabel = getManagedModelBadgeLabel(modelId);
  if (options.length === 0) {
    return {
      status: 'unavailable',
      modelId,
      options,
      description: `${modelLabel} does not expose a reasoning-effort control.`,
    };
  }

  return {
    status: 'ready',
    modelId,
    options,
    effort: resolveModelEffort(modelId, requestedEffort),
    description: `Applies to ${modelLabel}.`,
  };
}

export function getManagedOutboundEffort(
  selection: string,
  currentModelKey: string | undefined,
  requestedEffort: string | undefined,
): Effort | undefined {
  const autoSelected = selection === 'auto' || selection.startsWith('auto-');
  const modelId = autoSelected ? currentModelKey : selection;
  return modelId ? resolveModelEffort(modelId, requestedEffort) : undefined;
}

export function isFreeManagedTier(tier: string): boolean {
  return tier.trim().toLowerCase() === 'free';
}

export function formatManagedTierLabel(tier: string): string {
  const normalized = tier.trim().toLowerCase();
  if (!normalized) return 'Account';
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)} plan`;
}

export function getManagedCapabilityLabel(option: ManagedModelPickerOption): string | undefined {
  return option.capability ? CAPABILITY_LABEL[option.capability] : undefined;
}
