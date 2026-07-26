import {
  canUseBillingPlanCapability,
  getAutoRoutingProfiles,
  getModelsForTierAndSurface,
  getPlanMaxSandboxes,
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
