import {
  getHarnessMediaInput,
  getModelMetadataById,
  getRegistryRoute,
  listManagedRoutesForModel,
} from '@agiworkforce/types';

export function managedModelImageLimit(modelId: string): number | null {
  const override = getModelMetadataById(modelId)?.imageInput?.maxImagesPerRequest;
  if (override !== undefined) return override;
  const limits = listManagedRoutesForModel(modelId).flatMap((route) => {
    const harnessId = getRegistryRoute(route.routeId)?.harnessId;
    const limit =
      harnessId === undefined ? undefined : getHarnessMediaInput(harnessId).maxImagesPerRequest;
    return limit === undefined ? [] : [limit];
  });
  return limits.length > 0 ? Math.min(...limits) : null;
}

export function imageLimitMessage(modelId: string, limit: number): string {
  const name = getModelMetadataById(modelId)?.name ?? modelId;
  return limit === 1
    ? `${name} accepts one image in a message. Remove the others and send again.`
    : `${name} accepts up to ${limit} images in a message. Remove some and send again.`;
}
