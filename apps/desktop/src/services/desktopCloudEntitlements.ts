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

/**
 * Projects the public discovery response through the same subscription and
 * Desktop runtime policy that the managed server enforces.
 *
 * `/api/models` is intentionally a public metadata catalog, not an entitlement
 * endpoint. It can therefore prove that a catalog row exists, but it must never
 * be rendered directly as "available" for the signed-in account. Auto is a
 * routing profile rather than a provider model, so it is added from the
 * canonical routing contract instead of expected in public discovery.
 */
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

  // Auto is executable only when discovery proves that at least one of its
  // tier- and surface-admitted backing models is live. An empty discovery
  // response must not become a synthetic "Auto is available" claim.
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

/**
 * Managed code execution needs both the deployment cut-over and at least one
 * plan-authorized sandbox. This prevents Free from seeing a control that the
 * sandbox admission boundary will always refuse.
 */
export function canUseDesktopCloudCodeExecution(
  plan: PlanTier | null | undefined,
  deploymentEnabled: boolean,
): boolean {
  return deploymentEnabled && getPlanMaxSandboxes(plan) > 0;
}
