import 'server-only';

import { getModelMetadataById, isFlagshipModel } from '@agiworkforce/types';
import { buildCatalogueEntries } from '@/lib/server/model-catalogue';

export type PlanLimitAlternativeKind = 'standard' | 'free_pool';

export async function resolvePlanLimitAlternativeModel(input: {
  planTier: string;
  refusedModelId: string;
  kind: PlanLimitAlternativeKind;
}): Promise<string | null> {
  const entries = await buildCatalogueEntries(input.planTier);
  if (!entries.some((entry) => entry.id === input.refusedModelId)) return null;
  const eligible = entries.filter(
    (entry) =>
      entry.id !== input.refusedModelId &&
      entry.admitted &&
      entry.availability === 'live' &&
      !entry.temporarilyUnavailable &&
      entry.requiresEnvironment === null &&
      !entry.isRouter &&
      (input.kind === 'standard' ? !isFlagshipModel(entry.id) : entry.freePool),
  );
  const developer = getModelMetadataById(input.refusedModelId)?.developer;
  return (eligible.find((entry) => entry.developer === developer) ?? eligible[0])?.id ?? null;
}
