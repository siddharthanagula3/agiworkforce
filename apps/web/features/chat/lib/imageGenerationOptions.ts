import type { ManagedMediaImageAspectRatio } from '@agiworkforce/cloud-contracts';
import { getModels, isModelLive } from '@agiworkforce/types';

export type ImageAspectRatio = 'auto' | ManagedMediaImageAspectRatio;

export interface ImageAspectOption {
  id: ImageAspectRatio;
  label: string;
}

export interface ImageModelOption {
  id: string;
  label: string;
  provider: 'google' | 'openai';
  imageApi: 'gemini' | 'imagen' | 'openai';
}

const IMAGE_API_TO_PROVIDER: Record<string, ImageModelOption['provider']> = {
  gemini: 'google',
  imagen: 'google',
  openai: 'openai',
};

/**
 * Executable image models only. A catalog entry is not picker-ready merely
 * because its modelType is `image`: it must declare image generation, have a
 * wired adapter, be live, and not carry either deprecation marker.
 */
export const IMAGE_MODELS: ImageModelOption[] = getModels({
  modelTypes: ['image'],
  requireCapabilities: { imageGen: true },
})
  .filter(
    (model) =>
      model.capabilities.imageGen === true &&
      model.deprecated !== true &&
      model.status !== 'deprecated' &&
      isModelLive(model),
  )
  .map((model) => {
    const provider = model.imageApi ? IMAGE_API_TO_PROVIDER[model.imageApi] : undefined;
    return model.imageApi && provider
      ? { id: model.id, label: model.name, provider, imageApi: model.imageApi }
      : null;
  })
  .filter((model): model is ImageModelOption => model !== null);

export const IMAGE_MODEL_DEFAULT = IMAGE_MODELS[0]?.id ?? '';

const IMAGE_ASPECT_OPTIONS: ReadonlyArray<ImageAspectOption> = [
  { id: 'auto', label: 'Auto' },
  { id: '1:1', label: 'Square 1:1' },
  { id: '2:3', label: 'Portrait 2:3' },
  { id: '3:4', label: 'Portrait 3:4' },
  { id: '4:5', label: 'Portrait 4:5' },
  { id: '9:16', label: 'Story 9:16' },
  { id: '9:21', label: 'Tall 9:21' },
  { id: '3:2', label: 'Landscape 3:2' },
  { id: '4:3', label: 'Landscape 4:3' },
  { id: '5:4', label: 'Landscape 5:4' },
  { id: '16:9', label: 'Widescreen 16:9' },
  { id: '21:9', label: 'Ultrawide 21:9' },
];

/**
 * Curated picker subsets of the exact ratios each provider adapter can send.
 * The route performs the authoritative model-adapter validation again before
 * billing because client choices are untrusted.
 */
const IMAGE_PICKER_RATIOS_BY_API: Record<
  ImageModelOption['imageApi'],
  ReadonlySet<ImageAspectRatio>
> = {
  gemini: new Set([
    'auto',
    '1:1',
    '2:3',
    '3:2',
    '3:4',
    '4:3',
    '4:5',
    '5:4',
    '9:16',
    '16:9',
    '21:9',
  ]),
  imagen: new Set(['auto', '1:1', '3:4', '4:3', '9:16', '16:9']),
  openai: new Set(['auto', '1:1', '2:3', '3:2']),
};

function resolveImageModel(modelId?: string): ImageModelOption | undefined {
  if (!modelId) return undefined;
  return IMAGE_MODELS.find((model) => model.id === modelId);
}

export function getImageAspectOptionsForModel(modelId?: string): ImageAspectOption[] {
  const imageApi = resolveImageModel(modelId)?.imageApi;
  if (!imageApi) return IMAGE_ASPECT_OPTIONS.filter((option) => option.id === 'auto');
  const supported = IMAGE_PICKER_RATIOS_BY_API[imageApi];
  return IMAGE_ASPECT_OPTIONS.filter((option) => supported.has(option.id));
}

export function isImageAspectRatioSupported(
  modelId: string | undefined,
  aspectRatio: ImageAspectRatio,
): boolean {
  return getImageAspectOptionsForModel(modelId).some((option) => option.id === aspectRatio);
}

/**
 * Persisted chat messages can predate the model-specific ratio contract. Never
 * replay one of those legacy pairs verbatim: use the provider's explicit
 * `auto` path when the selected model cannot execute the stored ratio.
 */
export function normalizeImageAspectRatioForModel(
  modelId: string | undefined,
  aspectRatio: ImageAspectRatio,
): ImageAspectRatio {
  return isImageAspectRatioSupported(modelId, aspectRatio) ? aspectRatio : 'auto';
}

export interface ResolvedImageGenerationRequestOptions {
  aspectRatio?: ManagedMediaImageAspectRatio;
  provider?: ImageModelOption['provider'];
  model?: string;
}

/**
 * Convert persisted card metadata back into an executable request. Missing or
 * retired model ids are not evidence for a provider, so they deliberately
 * fall back to the server's configured default with Auto shape.
 */
export function resolveImageGenerationRequestOptions(
  aspectRatio: ImageAspectRatio,
  modelId?: string,
): ResolvedImageGenerationRequestOptions {
  const model = resolveImageModel(modelId);
  if (!model) return {};
  const normalizedAspect = normalizeImageAspectRatioForModel(model.id, aspectRatio);
  return {
    ...(normalizedAspect === 'auto' ? {} : { aspectRatio: normalizedAspect }),
    provider: model.provider,
    model: model.id,
  };
}
