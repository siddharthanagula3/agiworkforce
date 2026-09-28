import {
  evaluateModelEnvironment,
  type EnvironmentAvailability,
  type ModelEnvironment,
} from '@agiworkforce/types';
import { getAllowedAutoModesForTier, isModelAllowedForTier } from '@shared/config/llm';
import { freeQuotaSelection } from '@features/chat/lib/free-quota-selection';
import type { AIModel } from '@shared/stores/model-store';

export type ModelLockKind = 'tier' | 'env' | 'coming_soon';

export interface ModelLock {
  locked: boolean;
  kind: ModelLockKind;
  reason?: string;
}

const COMING_SOON_REASON = 'Coming soon, not yet available';

export function environmentAvailability(_environment: ModelEnvironment): EnvironmentAvailability {
  return { configured: false };
}

function isModelSelectableForTier(model: AIModel, tier: string | null): boolean {
  if (tier === null) return true;
  if (model.providerKey === 'managed_cloud') {
    return getAllowedAutoModesForTier(tier).includes(model.id);
  }
  return isModelAllowedForTier(model.id, tier);
}

export function modelLock(model: AIModel, tier: string | null): ModelLock {
  if (freeQuotaSelection(model.id)) return { locked: false, kind: 'tier' };
  if (model.availability && model.availability !== 'live') {
    return { locked: true, kind: 'coming_soon', reason: COMING_SOON_REASON };
  }
  if (!isModelSelectableForTier(model, tier)) return { locked: true, kind: 'tier' };
  const environment = evaluateModelEnvironment(
    model.requiresEnvironment,
    model.requiresEnvironment ? environmentAvailability(model.requiresEnvironment) : undefined,
  );
  if (!environment.selectable) return { locked: true, kind: 'env', reason: environment.reason };
  return { locked: false, kind: 'tier' };
}
