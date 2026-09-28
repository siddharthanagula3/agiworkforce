import { getModels, listManagedRoutesForModel } from '@agiworkforce/types';

export interface ScheduledModelRetirement {
  id: string;
  name: string;
  retiresOn: string;
}

export function listScheduledModelRetirements(): ScheduledModelRetirement[] {
  return getModels()
    .filter(
      (model) =>
        model.deprecated !== true &&
        typeof model.deprecation_date === 'string' &&
        listManagedRoutesForModel(model.id).length > 0,
    )
    .map((model) => ({
      id: model.id,
      name: model.name,
      retiresOn: model.deprecation_date as string,
    }))
    .sort(
      (left, right) =>
        left.retiresOn.localeCompare(right.retiresOn) || left.name.localeCompare(right.name),
    );
}
