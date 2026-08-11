import type { OnDeviceModel } from '@agiworkforce/types';

import { getLocalModelCatalog } from '../catalog.js';

export function requireCatalogModel(
  predicate: (model: OnDeviceModel) => boolean,
  description: string,
): OnDeviceModel {
  const model = getLocalModelCatalog().find(predicate);
  if (!model) throw new Error(`Canonical on-device catalog is missing ${description}`);
  return model;
}

export function requireGgufVisionModel(): OnDeviceModel {
  return requireCatalogModel(
    (model) =>
      model.format === 'gguf' &&
      model.capabilities.visionIn &&
      Boolean(model.mmprojUrl && model.mmprojChecksum && model.mmprojSizeBytes),
    'a GGUF vision model with a verified projector',
  );
}

export function requireExecutorchVisionModel(): OnDeviceModel {
  return requireCatalogModel(
    (model) =>
      model.supportedRuntimes.includes('executorch') &&
      model.capabilities.visionIn &&
      model.executorchPreset?.capabilities?.includes('vision') === true,
    'an ExecuTorch vision model with catalog-owned runtime metadata',
  );
}
