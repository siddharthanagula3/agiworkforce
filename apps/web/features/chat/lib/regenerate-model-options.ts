import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { resolveSelectableModelId } from '@shared/stores/model-store';
import { freeQuotaSelection } from './free-quota-selection';

export function regenerateModelOptions(
  models: readonly { id: string; name: string }[],
  isFreePlan: boolean,
): { id: string; name: string }[] {
  return models
    .filter(
      (model) =>
        resolveSelectableModelId(model.id) === model.id &&
        (!isFreePlan ||
          FREE_TRIAL_MODELS.includes(model.id) ||
          freeQuotaSelection(model.id)?.category === 'chat'),
    )
    .map(({ id, name }) => ({ id, name }));
}
