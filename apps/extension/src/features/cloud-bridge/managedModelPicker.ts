import { CAPABILITY_LABEL, getModelMetadataById, type CapabilityTier } from '@agiworkforce/types';
import type { ManagedModelAccess } from './freeTrialClient';

export interface ManagedModelPickerOption {
  value: string;
  label: string;
  provider?: string;
  capability?: CapabilityTier;
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

export function isFreeManagedTier(tier: string): boolean {
  return ['free', 'hobby'].includes(tier.trim().toLowerCase());
}

export function formatManagedTierLabel(tier: string): string {
  const normalized = tier.trim().toLowerCase();
  if (!normalized) return 'Account';
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)} plan`;
}

export function getManagedCapabilityLabel(option: ManagedModelPickerOption): string | undefined {
  return option.capability ? CAPABILITY_LABEL[option.capability] : undefined;
}
