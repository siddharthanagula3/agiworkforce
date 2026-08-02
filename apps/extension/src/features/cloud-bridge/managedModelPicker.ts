import {
  CAPABILITY_LABEL,
  getModelEffortOptions,
  getModelMetadataById,
  resolveModelEffort,
  type CapabilityTier,
  type Effort,
} from '@agiworkforce/types';
import type { ManagedModelAccess } from './freeTrialClient';

export interface ManagedModelPickerOption {
  value: string;
  label: string;
  provider?: string;
  capability?: CapabilityTier;
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

/**
 * Build the Chrome picker from authenticated server admission intersected with
 * the bundled capability catalog. Unknown server ids remain hidden until this
 * extension version has the metadata required to route them honestly.
 */
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
    });
  }
  return options;
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

/**
 * Resolve the reasoning slider from the same model catalog used by the
 * provider request path. Auto has no honest effort ladder until the router has
 * returned a concrete model, so it stays explicitly unavailable beforehand.
 */
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

/**
 * Resolve the only effort value that may leave the side panel. Auto/Quick has
 * no concrete capability contract before routing, so any latent preference is
 * deliberately omitted until `currentModelKey` is known.
 */
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
