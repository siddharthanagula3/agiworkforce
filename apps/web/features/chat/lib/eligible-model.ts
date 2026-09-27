import { getModelMetadataById, getModelRegistryFacts, getSlotForModel } from '@agiworkforce/types';
import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';

const FLAGSHIP_ROUTING_SLOTS: ReadonlySet<string> = new Set([
  'flagship_coding_pro_plus',
  'flagship_general_pro_plus',
]);

export interface EligibleModel {
  id: string;
  name: string;
}

function isFlagshipModel(modelId: string): boolean {
  return FLAGSHIP_ROUTING_SLOTS.has(getSlotForModel(modelId) ?? '');
}

function isRouterModel(modelId: string): boolean {
  return getModelRegistryFacts(modelId)?.isRouter === true;
}

export function pickStandardModel(
  options: readonly EligibleModel[],
  currentModelId: string | undefined,
): EligibleModel | null {
  const standard = options.filter(
    (option) =>
      option.id !== currentModelId && !isFlagshipModel(option.id) && !isRouterModel(option.id),
  );
  const developer = currentModelId ? getModelMetadataById(currentModelId)?.developer : undefined;
  const pick =
    (developer
      ? standard.find((option) => getModelMetadataById(option.id)?.developer === developer)
      : undefined) ?? standard[0];
  return pick ? { id: pick.id, name: pick.name } : null;
}

export function pickFreePoolModel(
  entries: readonly ModelCatalogueEntry[],
  currentModelId: string,
): EligibleModel | null {
  const pick = entries.find(
    (entry) =>
      entry.freePool &&
      entry.id !== currentModelId &&
      entry.admitted &&
      entry.availability === 'live' &&
      !entry.temporarilyUnavailable &&
      entry.requiresEnvironment === null,
  );
  return pick ? { id: pick.id, name: pick.displayName } : null;
}
