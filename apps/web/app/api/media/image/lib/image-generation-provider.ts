import 'server-only';

import { createHash } from 'node:crypto';
import {
  type ManagedMediaImageAspectRatio,
  type ManagedMediaImageOperation,
  type ManagedMediaImageProvider,
} from '@agiworkforce/cloud-contracts';
import { getOptionalEnv, requireEnv } from '@shared/utils/env';
import {
  customerChargeMicrousd,
  getModelMetadataById,
  getModelsForProvider,
  getProviderDefaultModelId,
  isExecutableImageModel,
  type ExecutableImageModel,
  type ModelMetadata,
  type RateCardFeature,
} from '@agiworkforce/types';
import {
  parseRetryAfter,
  type ClassifiedError,
  type ErrorCategory,
} from '@agiworkforce/provider-runtime';
import { providerApiUrl } from '@/lib/server/provider-endpoints';
import { getActiveWorkspaceMediaAssetById } from '@/lib/server/media-assets';
import { readStoredMedia } from '@/lib/server/media-storage';
import { IMAGE_GENERATION_PROVIDER_DEADLINE_MS } from '@/lib/deadline-policy';

export type ImageProvider = ManagedMediaImageProvider;

export interface GeneratedImage {
  url?: string;
  b64_json?: string;
  contentType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface ImageEditContext {
  operation: ManagedMediaImageOperation;
  sourceBytes: Uint8Array;
  maskBytes?: Uint8Array;
  transparentBackground: boolean;
}

/**
 * The rate card publishes microUSD, which is the unit the ledger settles in
 * since 0182. centsFromMicrousdCeil is kept only for the surfaces that report
 * a whole-cent figure.
 */
function rateCardMicrousd(feature: RateCardFeature): number {
  return customerChargeMicrousd(feature);
}

const MICROUSD_PER_USD = 1_000_000;

const OPENAI_IMAGE_ESTIMATE_MICROUSD_BY_QUALITY = {
  medium: rateCardMicrousd('image_generation_openai_medium'),
  high: rateCardMicrousd('image_generation_openai_high'),
} as const;

const FALLBACK_IMAGE_ESTIMATE_MICROUSD_BY_PROVIDER: Record<ImageProvider, number> = {
  openai: OPENAI_IMAGE_ESTIMATE_MICROUSD_BY_QUALITY.high,
  google: rateCardMicrousd('image_generation_google'),
  stability: 0,
};

type ImageApi = NonNullable<ModelMetadata['imageApi']>;

const MAX_IMAGE_RETRY_AFTER_SECONDS = 5 * 60;

export class ImageProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ImageProviderHttpError';
  }
}

function boundedImageRetryAfterSeconds(response: Response): number | undefined {
  if (response.status !== 429) return undefined;
  const retryAfterSeconds = parseRetryAfter(response.headers);
  if (retryAfterSeconds === undefined) return undefined;
  return Math.min(retryAfterSeconds, MAX_IMAGE_RETRY_AFTER_SECONDS);
}

async function throwImageProviderHttpError(response: Response, fallback: string): Promise<never> {
  const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const errorObj = errorData['error'] as Record<string, unknown> | undefined;
  const message = (errorObj?.['message'] as string) || fallback;
  throw new ImageProviderHttpError(
    message,
    response.status,
    boundedImageRetryAfterSeconds(response),
  );
}

const IMAGE_FAILURE_COPY_BY_CATEGORY: Partial<
  Record<ErrorCategory, (providerLabel: string) => string>
> = {
  api_timeout: () =>
    'The image provider did not respond before the request deadline. Please try again.',
  connection: (providerLabel) =>
    `${providerLabel} could not be reached for image generation. Please try again in a moment.`,
  rate_limit: () =>
    'The image generation service is temporarily busy. Please try again in a few moments.',
  safety: () =>
    'Your prompt was flagged by our content safety filters. Please try a different prompt.',
  content_blocked: () =>
    'Your prompt was flagged by our content safety filters. Please try a different prompt.',
  billing_exhausted: () =>
    'There was a billing issue with the image generation service. Please contact support.',
  auth: (providerLabel) =>
    `${providerLabel} rejected this deployment's image generation credentials. Choose a different image model.`,
  invalid_input: (providerLabel) =>
    `${providerLabel} rejected this image request. Adjust the prompt, size or reference image and try again.`,
  media_too_large: (providerLabel) =>
    `${providerLabel} rejected the reference image as too large. Use a smaller image and try again.`,
  invalid_model: () => 'The requested image model is not available for this provider.',
  empty_response: (providerLabel) => `${providerLabel} returned no image. Please try again.`,
  server_error: (providerLabel) =>
    `${providerLabel} image generation failed on the provider side. Try again, or choose a different image model.`,
};

export function describeImageFailure(
  classified: ClassifiedError | undefined,
  providerLabel: string,
): string {
  const copy = classified ? IMAGE_FAILURE_COPY_BY_CATEGORY[classified.category] : undefined;
  return copy
    ? copy(providerLabel)
    : `${providerLabel} could not generate the image. Try again, or choose a different image model.`;
}

/**
 * Whether another attempt on the same reservation can plausibly succeed. A
 * refused prompt, a rejected credential or a model the provider will not serve
 * fails the same way every time, so those settle immediately instead of
 * spending the job's remaining attempts.
 */
const NON_RETRYABLE_IMAGE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  'safety',
  'content_blocked',
  'invalid_input',
  'invalid_model',
  'media_too_large',
  'auth',
  'billing_exhausted',
  'quota_exhausted',
]);

export function isRetryableImageFailure(classified: ClassifiedError | undefined): boolean {
  if (!classified) return true;
  return !NON_RETRYABLE_IMAGE_CATEGORIES.has(classified.category);
}

/**
 * What the provider said, for the failures the classifier does not categorise.
 * A 400 carrying "violates content policy" is a refusal, and both the words the
 * user reads and whether another attempt is worth taking follow from that, not
 * from the HTTP status it arrived under.
 */
export function describeImageFailureFromProviderMessage(
  errorMessage: string,
): { message: string; retryable: boolean } | null {
  if (errorMessage.includes('content policy') || errorMessage.includes('safety')) {
    return {
      message:
        'Your prompt was flagged by our content safety filters. Please try a different prompt.',
      retryable: false,
    };
  }
  if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
    return {
      message:
        'The image generation service is temporarily busy. Please try again in a few moments.',
      retryable: true,
    };
  }
  if (errorMessage.includes('billing') || errorMessage.includes('payment')) {
    return {
      message:
        'There was a billing issue with the image generation service. Please contact support.',
      retryable: false,
    };
  }
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('TimeoutError')
  ) {
    return {
      message: 'The image provider did not respond before the request deadline. Please try again.',
      retryable: true,
    };
  }
  return null;
}

export const IMAGE_ASPECT_RATIOS_BY_API: Record<
  ImageApi,
  ReadonlySet<ManagedMediaImageAspectRatio>
> = {
  gemini: new Set([
    '1:1',
    '1:4',
    '1:8',
    '2:3',
    '3:2',
    '3:4',
    '4:1',
    '4:3',
    '4:5',
    '5:4',
    '8:1',
    '9:16',
    '16:9',
    '21:9',
  ]),
  imagen: new Set(['1:1', '3:4', '4:3', '9:16', '16:9']),
  openai: new Set(['1:1', '2:3', '3:2']),
  stability: new Set(['1:1', '2:3', '3:2', '4:5', '5:4', '9:16', '16:9', '21:9', '9:21']),
};

function legacyAspectRatioForSize(size: string, imageApi: ImageApi): ManagedMediaImageAspectRatio {
  const [width = 1024, height = 1024] = size.split('x').map(Number);
  if (width === height) return '1:1';

  if (imageApi === 'openai') return width > height ? '3:2' : '2:3';
  if (imageApi === 'gemini' || imageApi === 'imagen') return width > height ? '16:9' : '9:16';

  const ratio = Math.max(width, height) / Math.min(width, height);
  if (width > height) {
    if (ratio >= 1.7) return '16:9';
    if (ratio >= 1.4) return '3:2';
    return '5:4';
  }
  if (ratio >= 1.7) return '9:16';
  if (ratio >= 1.4) return '2:3';
  return '4:5';
}

export function resolveProviderImageAspectRatio(
  model: ExecutableImageModel,
  explicitAspectRatio: ManagedMediaImageAspectRatio | undefined,
  legacySize: string,
): ManagedMediaImageAspectRatio | null {
  if (!explicitAspectRatio) return legacyAspectRatioForSize(legacySize, model.imageApi);
  return IMAGE_ASPECT_RATIOS_BY_API[model.imageApi].has(explicitAspectRatio)
    ? explicitAspectRatio
    : null;
}

function openAIImageSizeForAspectRatio(aspectRatio: ManagedMediaImageAspectRatio): string {
  if (aspectRatio === '2:3') return '1024x1536';
  if (aspectRatio === '3:2') return '1536x1024';
  return '1024x1024';
}

function resolveRequestedCatalogModel<T extends ModelMetadata>(
  models: readonly T[],
  requestedModelId?: string,
): T | undefined {
  if (!requestedModelId) return undefined;
  const canonicalModelId = getModelMetadataById(requestedModelId)?.id;
  return canonicalModelId ? models.find((model) => model.id === canonicalModelId) : undefined;
}

const GOOGLE_PROVIDER_ID = 'google';
const OPENAI_PROVIDER_ID = 'openai';
const IMAGE_OUTPUT_CAPABILITY = 'imageOutput';

function resolveDeclaredProviderDefault(
  models: ExecutableImageModel[],
  provider: string,
): ExecutableImageModel | null {
  const declared = getProviderDefaultModelId(provider, IMAGE_OUTPUT_CAPABILITY);
  const declaredModel = declared ? models.find((model) => model.id === declared) : undefined;
  if (declaredModel) return declaredModel;
  return models.length === 1 ? (models[0] ?? null) : null;
}

export function resolveGoogleImageModel(requestedModelId?: string): ExecutableImageModel | null {
  const googleImageModels = getModelsForProvider('google', {
    includeDeprecated: false,
    modelTypes: ['image'],
  }).filter(isExecutableImageModel);

  const requested = resolveRequestedCatalogModel(googleImageModels, requestedModelId);
  if (requested) return requested;

  return resolveDeclaredProviderDefault(googleImageModels, GOOGLE_PROVIDER_ID);
}

function resolveOpenAIImageModel(requestedModelId?: string): ExecutableImageModel | null {
  const openaiImageModels = getModelsForProvider('openai', {
    includeDeprecated: false,
    modelTypes: ['image'],
  }).filter(isExecutableImageModel);

  const requested = resolveRequestedCatalogModel(openaiImageModels, requestedModelId);
  if (requested) return requested;

  return resolveDeclaredProviderDefault(openaiImageModels, OPENAI_PROVIDER_ID);
}

export function resolveImageCatalogModel(
  provider: ImageProvider,
  requestedModelId?: string,
): ExecutableImageModel | null {
  const selected =
    provider === 'openai'
      ? resolveOpenAIImageModel(requestedModelId)
      : provider === 'google'
        ? resolveGoogleImageModel(requestedModelId)
        : null;
  if (!selected) return null;
  if (!requestedModelId) return selected;
  return getModelMetadataById(requestedModelId)?.id === selected.id ? selected : null;
}

export function resolveImageProviderFromCatalogModel(modelId: string): ImageProvider | null {
  const model = getModelMetadataById(modelId);
  if (!isExecutableImageModel(model)) return null;

  switch (model.imageApi) {
    case 'gemini':
    case 'imagen':
      return 'google';
    case 'openai':
      return 'openai';
    default:
      return null;
  }
}

/** The published per-image price, charged exactly rather than rounded up. */
export function estimateImageCostMicrousd(
  provider: ImageProvider,
  imageCount: number,
  quality: string | undefined,
  requestedModelId?: string,
): number {
  if (provider === 'openai') {
    const qualityKey = quality === 'hd' ? 'high' : 'medium';
    return OPENAI_IMAGE_ESTIMATE_MICROUSD_BY_QUALITY[qualityKey] * imageCount;
  }

  if (provider === 'google') {
    const perImageUsd = resolveGoogleImageModel(requestedModelId)?.imagePerImageCost;
    if (typeof perImageUsd === 'number' && perImageUsd > 0) {
      return Math.ceil(perImageUsd * MICROUSD_PER_USD) * imageCount;
    }
  }

  return FALLBACK_IMAGE_ESTIMATE_MICROUSD_BY_PROVIDER[provider] * imageCount;
}

const GOOGLE_API_KEY_ENV_KEYS = ['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'] as const;

function getGoogleApiKey(): string | undefined {
  for (const key of GOOGLE_API_KEY_ENV_KEYS) {
    const value = getOptionalEnv(key);
    if (value) return value;
  }
  return undefined;
}

export function getDefaultProvider(): ImageProvider {
  if (getGoogleApiKey()) {
    return 'google';
  }
  if (getOptionalEnv('OPENAI_API_KEY')) {
    return 'openai';
  }
  throw new Error('No image generation API keys configured');
}

function getApiKey(provider: ImageProvider): string {
  switch (provider) {
    case 'openai':
      return requireEnv('OPENAI_API_KEY');
    case 'google': {
      const key = getGoogleApiKey();
      if (!key) {
        throw new Error(
          `Missing Google credential. Set one of: ${GOOGLE_API_KEY_ENV_KEYS.join(', ')}.`,
        );
      }
      return key;
    }
    case 'stability':
      throw new Error('The Stability image adapter is not supported');
  }
}

export function isProviderAvailable(provider: ImageProvider): boolean {
  switch (provider) {
    case 'openai':
      return !!getOptionalEnv('OPENAI_API_KEY');
    case 'google':
      return !!getGoogleApiKey();
    case 'stability':
      return false;
  }
}

export async function resolveImageRefBytes(
  ref: { asset_id: string } | { b64_json: string },
  userId: string,
  db?: Parameters<typeof getActiveWorkspaceMediaAssetById>[2],
): Promise<Uint8Array> {
  if ('b64_json' in ref) {
    const base64 = ref.b64_json.includes(',') ? ref.b64_json.split(',').pop()! : ref.b64_json;
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }

  // Only an asset_id ref reaches the database, so the caller opens a scoped
  // connection only for that branch and inline bytes cost none.
  if (!db) throw new Error('Source image could not be read');
  const asset = await getActiveWorkspaceMediaAssetById(userId, ref.asset_id, db);
  if (
    !asset ||
    asset.deletedAt ||
    asset.kind !== 'image' ||
    !asset.mimeType.toLowerCase().startsWith('image/')
  ) {
    throw new Error('Source image not found');
  }

  if (!asset.storagePathname) {
    throw new Error('Source image could not be read');
  }
  const object = await readStoredMedia(asset.storagePathname);
  if (!object) throw new Error('Source image could not be read');
  return new Uint8Array(object.data);
}

async function generateWithOpenAIImage(
  prompt: string,
  aspectRatio: ManagedMediaImageAspectRatio,
  quality: string,
  n: number,
  requestedModelId?: string,
  edit?: ImageEditContext,
): Promise<{ images: GeneratedImage[]; model: string }> {
  const apiKey = getApiKey('openai');
  const catalogModel = resolveOpenAIImageModel(requestedModelId);
  if (!catalogModel) {
    throw new Error('No active OpenAI image model is configured in the catalog');
  }
  const model = catalogModel.apiModelId ?? catalogModel.id;
  const imageSize = openAIImageSizeForAspectRatio(aspectRatio);
  const imageQuality = quality === 'hd' ? 'high' : 'medium';

  if (edit) {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', imageSize);
    form.append('n', String(Math.min(n, 4)));
    if (edit.transparentBackground) form.append('background', 'transparent');
    form.append(
      'image',
      new Blob([edit.sourceBytes as BlobPart], { type: 'image/png' }),
      'source.png',
    );
    if (edit.maskBytes) {
      form.append(
        'mask',
        new Blob([edit.maskBytes as BlobPart], { type: 'image/png' }),
        'mask.png',
      );
    }

    const editResponse = await fetch(providerApiUrl('openai', 'images/edits'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(IMAGE_GENERATION_PROVIDER_DEADLINE_MS),
    });

    if (!editResponse.ok) {
      await throwImageProviderHttpError(
        editResponse,
        `OpenAI image edit API error: ${editResponse.status} ${editResponse.statusText}`,
      );
    }

    const editData = (await editResponse.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    return {
      images: (editData.data ?? [])
        .map((item) => ({ b64_json: item.b64_json, url: item.url }))
        .filter((item) => item.b64_json || item.url),
      model: `${model}-${edit.operation}`,
    };
  }

  const response = await fetch(providerApiUrl('openai', 'images/generations'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size: imageSize,
      quality: imageQuality,
      n: Math.min(n, 4),
    }),
    signal: AbortSignal.timeout(IMAGE_GENERATION_PROVIDER_DEADLINE_MS),
  });

  if (!response.ok) {
    await throwImageProviderHttpError(
      response,
      `OpenAI image API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const images = (data.data ?? [])
    .map((item) => ({ b64_json: item.b64_json, url: item.url }))
    .filter((item) => item.b64_json || item.url);

  return {
    images,
    model: `${model}-${imageQuality}`,
  };
}

async function generateWithImagen(
  prompt: string,
  aspectRatio: ManagedMediaImageAspectRatio,
  _style: string | undefined,
  n: number,
  catalogModel: ExecutableImageModel,
  negativePrompt?: string,
): Promise<{ images: GeneratedImage[]; model: string }> {
  const apiKey = getApiKey('google');
  const model = catalogModel.apiModelId ?? catalogModel.id;

  if (catalogModel.imageApi === 'gemini') {
    const outputMimeType = catalogModel.imageOutputMimeType;
    if (!outputMimeType) {
      throw new Error('The selected Gemini image model has no catalog output MIME contract');
    }
    return generateWithGeminiImage(apiKey, model, prompt, aspectRatio, n, outputMimeType);
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        instances: [
          {
            prompt,
            ...(negativePrompt && { negativePrompt }),
          },
        ],
        parameters: {
          sampleCount: Math.min(n, 4),
          aspectRatio,
        },
      }),
      signal: AbortSignal.timeout(IMAGE_GENERATION_PROVIDER_DEADLINE_MS),
    },
  );

  if (!response.ok) {
    await throwImageProviderHttpError(
      response,
      `Imagen API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { predictions?: Array<{ bytesBase64Encoded?: string }> };

  const images: GeneratedImage[] = [];
  if (data.predictions) {
    for (const prediction of data.predictions) {
      if (prediction.bytesBase64Encoded) {
        images.push({ b64_json: prediction.bytesBase64Encoded });
      }
    }
  }

  return {
    images,
    model,
  };
}

async function generateWithGeminiImage(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: string,
  _n: number,
  outputMimeType: NonNullable<ModelMetadata['imageOutputMimeType']>,
): Promise<{ images: GeneratedImage[]; model: string }> {
  const response = await fetch(providerApiUrl('google', 'interactions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      response_format: {
        type: 'image',
        mime_type: outputMimeType,
        aspect_ratio: aspectRatio,
        image_size: '1K',
      },
    }),
    signal: AbortSignal.timeout(IMAGE_GENERATION_PROVIDER_DEADLINE_MS),
  });

  if (!response.ok) {
    await throwImageProviderHttpError(
      response,
      `Gemini image API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    output_image?: unknown;
    steps?: unknown;
  };

  const candidates: unknown[] = [data.output_image];
  if (Array.isArray(data.steps)) {
    for (const step of data.steps) {
      if (
        step &&
        typeof step === 'object' &&
        (step as { type?: unknown }).type === 'model_output' &&
        Array.isArray((step as { content?: unknown }).content)
      ) {
        candidates.push(...((step as { content: unknown[] }).content ?? []));
      }
    }
  }

  const imagesByDigest = new Map<string, GeneratedImage>();
  let sawUriImage = false;
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const image = candidate as {
      type?: unknown;
      mime_type?: unknown;
      data?: unknown;
      uri?: unknown;
    };
    const isImageBlock = image.type === undefined || image.type === 'image';
    if (!isImageBlock) continue;
    if (image.mime_type !== outputMimeType) {
      throw new Error('Gemini image API returned an image outside the catalog MIME contract');
    }
    if (typeof image.uri === 'string' && image.uri.length > 0) sawUriImage = true;
    if (typeof image.data !== 'string' || image.data.length === 0) continue;

    if (
      image.data.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data)
    ) {
      throw new Error('Gemini image API returned malformed base64 image data');
    }
    const bytes = Buffer.from(image.data, 'base64');
    const canonicalBase64 = bytes.toString('base64');
    if (canonicalBase64 !== image.data || !hasValidGeneratedImageStructure(bytes, outputMimeType)) {
      throw new Error(
        'Gemini image API returned bytes that do not match the catalog MIME contract',
      );
    }

    const digest = createHash('sha256').update(bytes).digest('hex');
    imagesByDigest.set(digest, { b64_json: image.data, contentType: outputMimeType });
  }

  if (imagesByDigest.size === 0) {
    if (sawUriImage) {
      throw new Error(
        'Gemini image API returned a URI without inline image bytes; URI delivery is not supported',
      );
    }
    throw new Error('Gemini image API returned no image data (response may have been text-only)');
  }
  if (imagesByDigest.size !== 1) {
    throw new Error('Gemini image API returned more than the single requested image');
  }

  return { images: [...imagesByDigest.values()], model };
}

const MAX_INLINE_GENERATED_IMAGE_BYTES = 25 * 1024 * 1024;

function hasValidJpegStructure(bytes: Buffer): boolean {
  if (
    bytes.length < 12 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  ) {
    return false;
  }

  let offset = 2;
  let sawFrame = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0x00 || marker === 0xd8 || marker === 0xd9) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return false;

    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      if (segmentLength < 8) return false;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (width === 0 || height === 0) return false;
      sawFrame = true;
    }

    if (marker === 0xda) {
      return sawFrame && offset + segmentLength < bytes.length - 2;
    }
    offset += segmentLength;
  }
  return false;
}

function hasValidPngStructure(bytes: Buffer): boolean {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) return false;

  let offset = 8;
  let sawHeader = false;
  let sawImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) return false;
      if (bytes.readUInt32BE(offset + 8) === 0 || bytes.readUInt32BE(offset + 12) === 0)
        return false;
      sawHeader = true;
    }
    if (type === 'IDAT' && length > 0) sawImageData = true;
    if (type === 'IEND') return length === 0 && end === bytes.length && sawHeader && sawImageData;
    offset = end;
  }
  return false;
}

function hasValidWebpStructure(bytes: Buffer): boolean {
  if (
    bytes.length < 20 ||
    bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    bytes.subarray(8, 12).toString('ascii') !== 'WEBP' ||
    bytes.readUInt32LE(4) !== bytes.length - 8
  ) {
    return false;
  }
  const chunkType = bytes.subarray(12, 16).toString('ascii');
  const chunkLength = bytes.readUInt32LE(16);
  const paddedLength = chunkLength + (chunkLength % 2);
  return (
    ['VP8 ', 'VP8L', 'VP8X'].includes(chunkType) &&
    chunkLength > 0 &&
    20 + paddedLength <= bytes.length
  );
}

function hasValidGeneratedImageStructure(
  bytes: Buffer,
  mimeType: NonNullable<ModelMetadata['imageOutputMimeType']>,
): boolean {
  if (bytes.length === 0 || bytes.length > MAX_INLINE_GENERATED_IMAGE_BYTES) return false;
  if (mimeType === 'image/jpeg') return hasValidJpegStructure(bytes);
  if (mimeType === 'image/png') return hasValidPngStructure(bytes);
  return hasValidWebpStructure(bytes);
}

export function sha256HexFromBase64(b64: string): string {
  const payload = b64.includes(',') ? (b64.split(',').pop() ?? '') : b64;
  return createHash('sha256').update(Buffer.from(payload, 'base64')).digest('hex');
}

export function sha256HexFromBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function generateImages(input: {
  provider: ImageProvider;
  prompt: string;
  aspectRatio: ManagedMediaImageAspectRatio;
  quality: string;
  style?: string | undefined;
  negativePrompt?: string | undefined;
  n: number;
  catalogModel: ExecutableImageModel;
  edit?: ImageEditContext | undefined;
}): Promise<{ images: GeneratedImage[]; model: string }> {
  switch (input.provider) {
    case 'openai':
      return generateWithOpenAIImage(
        input.prompt,
        input.aspectRatio,
        input.quality,
        input.n,
        input.catalogModel.id,
        input.edit,
      );
    case 'google':
      return generateWithImagen(
        input.prompt,
        input.aspectRatio,
        input.style,
        input.n,
        input.catalogModel,
        input.negativePrompt,
      );
    case 'stability':
      throw new Error('The Stability image adapter is not supported');
  }
}
