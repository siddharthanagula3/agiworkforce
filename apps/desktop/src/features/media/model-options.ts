import {
  getModelMetadataById,
  getModelsForProvider,
  getRoutingSlotModel,
  isModelLive,
  type ModelMetadata,
} from '@agiworkforce/types';

import type { ImageProviderId, VideoProviderId } from '../../types/media';

export interface MediaImageProviderOption {
  id: ImageProviderId;
  label: string;
  description: string;
  /** Canonical catalog model id. Provider API ids are resolved server-side. */
  model: string;
  badge?: string;
}

function releaseTimestamp(model: ModelMetadata): number {
  const timestamp = model.released ? Date.parse(model.released) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function newestModel(
  models: readonly ModelMetadata[],
  predicate: (model: ModelMetadata) => boolean,
): ModelMetadata | undefined {
  return models
    .filter(predicate)
    .slice()
    .sort((left, right) => releaseTimestamp(right) - releaseTimestamp(left))[0];
}

function liveImageModels(provider: string): ModelMetadata[] {
  return getModelsForProvider(provider, {
    includeDeprecated: false,
    modelTypes: ['image'],
  }).filter(isModelLive);
}

function toOption(
  id: ImageProviderId,
  providerLabel: string,
  model: ModelMetadata | undefined,
  badge?: string,
): MediaImageProviderOption | null {
  if (!model) return null;

  return {
    id,
    label: `${model.name} (${providerLabel})`,
    description: model.bestFor.length > 0 ? model.bestFor.join(' · ') : model.name,
    model: model.id,
    ...(badge ? { badge } : {}),
  };
}

const googleImageModels = liveImageModels('google').filter(
  (model) => model.imageApi === 'imagen',
);
const openAIImageModels = liveImageModels('openai');
const managedImageModels = liveImageModels('managed_cloud');

const imageProviderOptions = [
  toOption(
    'google_imagen',
    'Google',
    newestModel(
      googleImageModels,
      (model) => model.qualityTier === 'balanced' || model.qualityTier === 'best',
    ),
    'Recommended',
  ),
  toOption(
    'google_imagen_lite',
    'Google',
    newestModel(
      googleImageModels,
      (model) => model.qualityTier === 'fast' || model.speed === 'fast',
    ),
    'Fast',
  ),
  toOption(
    'dalle',
    'OpenAI',
    newestModel(openAIImageModels, (model) => model.imageApi === 'openai'),
  ),
  toOption(
    'stable_diffusion',
    'Managed Cloud',
    newestModel(managedImageModels, (model) => model.imageApi === 'stability'),
  ),
].filter((option): option is MediaImageProviderOption => option !== null);

if (imageProviderOptions.length === 0) {
  throw new Error('The model catalog has no live image model configured for Desktop Media Lab');
}

export const IMAGE_PROVIDER_OPTIONS: readonly MediaImageProviderOption[] = imageProviderOptions;
export const DEFAULT_IMAGE_PROVIDER_ID: ImageProviderId = IMAGE_PROVIDER_OPTIONS[0]!.id;

const videoSlotModelId = getRoutingSlotModel('video_generation');
const videoSlotModel = getModelMetadataById(videoSlotModelId);

if (!videoSlotModel || videoSlotModel.modelType !== 'video' || !isModelLive(videoSlotModel)) {
  throw new Error(
    `The video_generation routing slot does not reference a live video model: ${videoSlotModelId}`,
  );
}

export const VIDEO_MODEL_ID = videoSlotModel.id;
export const VIDEO_DISPLAY_NAME = videoSlotModel.name;

if (videoSlotModel.provider !== 'google') {
  throw new Error(
    `Desktop Media Lab does not have a video adapter for provider: ${videoSlotModel.provider}`,
  );
}

export const VIDEO_PROVIDER_ID: VideoProviderId = videoSlotModel.provider;
