import {
  canAccessModelForSubscriptionTier,
  getModelMetadataById,
  getSelectableModels,
  type ModelMetadata,
} from '@agiworkforce/types';
import { harnessModelProvider } from '../templates';

const QUALITY_PREFERENCE: readonly ModelMetadata['qualityTier'][] = ['balanced', 'best', 'fast'];

function preference(model: ModelMetadata): number {
  const index = QUALITY_PREFERENCE.indexOf(model.qualityTier);
  return index === -1 ? QUALITY_PREFERENCE.length : index;
}

/**
 * The provider model a coding agent's CLI is told to use: the one the person
 * picked when it belongs to the agent's provider and their plan includes it,
 * otherwise that provider's live model the plan includes, balanced before best.
 * Null leaves the CLI on its own default, which the provider proxy still checks.
 */
export function resolveHarnessModel(
  runtimeId: string,
  requestedModel: string,
  planTier: string,
): string | null {
  const provider = harnessModelProvider(runtimeId);
  if (!provider) return null;
  const allowed = (model: ModelMetadata) =>
    model.provider === provider && canAccessModelForSubscriptionTier(model.id, planTier);
  const requested = getModelMetadataById(requestedModel);
  const chosen =
    requested && allowed(requested)
      ? requested
      : getSelectableModels()
          .filter(allowed)
          .sort((a, b) => preference(a) - preference(b))[0];
  return chosen ? (chosen.apiModelId ?? chosen.id) : null;
}
