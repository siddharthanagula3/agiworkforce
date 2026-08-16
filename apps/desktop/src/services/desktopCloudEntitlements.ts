import {
  canUseBillingPlanCapability,
  getAutoRoutingProfiles,
  getModelsForTierAndSurface,
  getModelMetadataById,
  getPlanMaxSandboxes,
  getTierPolicy,
} from '@agiworkforce/types';

import type { PlanTier } from '../lib/cloudAccountTypes';

export interface DiscoveredDesktopCloudModel {
  id: string;
  name: string;
  provider: string;
}

const DESKTOP_CHAT_MODEL_TYPES = ['chat', 'code', 'reasoning', 'multimodal', 'search'] as const;

export function resolveDesktopCloudPickerModels(
  discovered: readonly DiscoveredDesktopCloudModel[],
  plan: PlanTier | null | undefined,
): DiscoveredDesktopCloudModel[] {
  if (!plan || !canUseBillingPlanCapability(plan, 'managed_chat')) return [];

  const discoveredById = new Map(discovered.map((model) => [model.id, model]));
  const admitted = getModelsForTierAndSurface(plan, 'desktop/cloud-chat', {
    modelTypes: [...DESKTOP_CHAT_MODEL_TYPES],
  }).flatMap((model) => {
    const live = discoveredById.get(model.id);
    return live ? [live] : [];
  });

  if (admitted.length === 0) return [];

  const auto = getAutoRoutingProfiles()[0];
  if (!auto) return admitted;

  return [
    {
      id: auto.id,
      name: auto.label,
      provider: 'managed_cloud',
    },
    ...admitted.filter((model) => model.id !== auto.id),
  ];
}

export function canUseDesktopCloudAgiWork(plan: PlanTier | null | undefined): boolean {
  return canUseBillingPlanCapability(plan, 'agi_work');
}

export function canUseDesktopCloudImageGeneration(plan: PlanTier | null | undefined): boolean {
  return canUseBillingPlanCapability(plan, 'image_generation');
}

export function canUseDesktopCloudResearch(
  plan: PlanTier | null | undefined,
  selectedModelId: string | null | undefined,
): boolean {
  if (getTierPolicy(plan).allowDeepResearch !== true || !selectedModelId) return false;
  if (getAutoRoutingProfiles().some((profile) => profile.id === selectedModelId)) return true;
  const metadata = getModelMetadataById(selectedModelId);
  return metadata?.capabilities.research === true && metadata.capabilities.search === true;
}

export function canUseDesktopCloudCodeExecution(
  plan: PlanTier | null | undefined,
  deploymentEnabled: boolean,
): boolean {
  return deploymentEnabled && getPlanMaxSandboxes(plan) > 0;
}
