import type {
  ManagedMediaImageAspectRatio,
  ManagedMediaImageOperation,
} from '@agiworkforce/cloud-contracts';
import { getModelMetadataById, getModels, isModelLive } from '@agiworkforce/types';

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

export function getImageModelLabel(modelId?: string | null): string | null {
  const id = modelId?.trim();
  if (!id) return null;
  return resolveImageModel(id)?.label ?? getModelMetadataById(id)?.name ?? null;
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
  /**
   * Set when the turn edits an image the composer already holds. Carried with
   * the rest of the request so a recovery replay reproduces the same edit and
   * not a fresh generation from the same prompt.
   */
  operation?: ManagedMediaImageOperation;
  sourceImageBase64?: string;
  maskImageBase64?: string;
  transparentBackground?: boolean;
}

export interface ImageEditRequest {
  operation: ManagedMediaImageOperation;
  sourceImageBase64: string;
  maskImageBase64?: string;
  transparentBackground?: boolean;
}

export function resolveImageGenerationRequestOptions(
  aspectRatio: ImageAspectRatio,
  modelId?: string,
  edit?: ImageEditRequest,
): ResolvedImageGenerationRequestOptions {
  const model = resolveImageModel(modelId);
  if (!model) return {};
  const normalizedAspect = normalizeImageAspectRatioForModel(model.id, aspectRatio);
  return {
    ...(normalizedAspect === 'auto' ? {} : { aspectRatio: normalizedAspect }),
    provider: model.provider,
    model: model.id,
    ...(edit
      ? {
          operation: edit.operation,
          sourceImageBase64: edit.sourceImageBase64,
          ...(edit.maskImageBase64 ? { maskImageBase64: edit.maskImageBase64 } : {}),
          ...(edit.transparentBackground ? { transparentBackground: true } : {}),
        }
      : {}),
  };
}

/**
 * An attached image as the inline bytes the managed media route takes.
 *
 * `FileReader` rather than `File.arrayBuffer()` plus `btoa`: the reader is the
 * one path every browser and jsdom implement, and it hands back base64 already
 * encoded, so a multi-megapixel PNG never becomes a megabyte-long argument list.
 */
export function readImageFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'));
    reader.onload = () => {
      const result = reader.result;
      const base64 = typeof result === 'string' ? result.slice(result.indexOf(',') + 1) : '';
      if (!base64) {
        reject(new Error('The image could not be read.'));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}
