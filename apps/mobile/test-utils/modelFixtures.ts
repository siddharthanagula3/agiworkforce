import {
  getModelsForTierAndSurface,
  getAutoRoutingProfiles,
  getRoutingSlotModel,
  modelsCatalog,
  type ModelMetadata,
  type OnDeviceModel,
  type PickerModelView,
} from '@agiworkforce/types';
import { getShippableModels } from '@agiworkforce/local-llm';

export const SYNTHETIC_CLOUD_MODEL_ID = 'fixture-cloud-model';
export const SYNTHETIC_IMAGE_MODEL_ID = 'fixture-image-output-model';
export const SYNTHETIC_LOCAL_MODEL_ID = 'fixture-local-model';

export function requireAutoMode() {
  const mode = getAutoRoutingProfiles()[0];
  if (!mode) throw new Error('Canonical catalog has no selectable Auto routing profile');
  return mode;
}

export function requireCatalogModel(
  predicate: (model: ModelMetadata) => boolean,
  description: string,
): ModelMetadata {
  const model = Object.values(modelsCatalog.models).find(predicate);
  if (!model) throw new Error(`Canonical catalog has no ${description}`);
  return model;
}

export function requireMobileCloudModel(
  predicate: (model: PickerModelView) => boolean = () => true,
  description = 'Mobile Cloud model matching the test predicate',
): PickerModelView {
  const model = getModelsForTierAndSurface('max', 'mobile/cloud-chat', {
    modelTypes: ['chat', 'reasoning', 'multimodal', 'search', 'code'],
  }).find(predicate);
  if (!model) throw new Error(`Canonical catalog has no ${description}`);
  return model;
}

export function requireLocalModel(
  predicate: (model: OnDeviceModel) => boolean = () => true,
  description = 'shippable local model matching the test predicate',
): OnDeviceModel {
  const model = getShippableModels().find(predicate);
  if (!model) throw new Error(`Local catalog has no ${description}`);
  return model;
}

export function requireMediaSlotModel(kind: 'image' | 'video'): ModelMetadata {
  const modelId = getRoutingSlotModel(`${kind}_generation`);
  if (!modelId) throw new Error(`Canonical routing policy has no ${kind} generation model`);
  const model = modelsCatalog.models[modelId];
  if (!model || model.modelType !== kind) {
    throw new Error(`Canonical ${kind} routing slot does not resolve to a ${kind} model`);
  }
  return model;
}
