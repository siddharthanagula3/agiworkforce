import 'server-only';

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedMediaImageGenerationRequestSchema,
  supportsManagedMediaImageEdit,
  type ManagedMediaImageAspectRatio,
  type ManagedMediaImageOperation,
  type ManagedMediaImageProvider,
} from '@agiworkforce/cloud-contracts';
import { getOptionalEnv, requireEnv } from '@shared/utils/env';
import {
  getActiveWorkspaceMediaAssetById,
  isMediaAssetStoreReady,
} from '@/lib/server/media-assets';
import { providerApiUrl } from '@/lib/server/provider-endpoints';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import {
  buildManagedComputeGateResponse,
  buildOrganizationPolicyGateResponse,
  buildSpendLimitGateResponse,
  buildModelPolicyGateResponse,
} from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import {
  matchDenylistedUpload,
  moderateManagedPrompt,
  recordModerationEvent,
  PLATFORM_POLICY_REFUSAL,
} from '@/lib/moderation';
import {
  canUseBillingPlanCapability,
  getModelMetadataById,
  getModelsForProvider,
  isExecutableImageModel,
  type ExecutableImageModel,
  type ModelMetadata,
} from '@agiworkforce/types';
import {
  classifyError,
  parseRetryAfter,
  SPENDING_CAP_PROVIDER_HINT,
} from '@agiworkforce/provider-runtime';
import { markProviderDegraded } from '@/lib/services/provider-availability-service';
import { IMAGE_GENERATION_PROVIDER_DEADLINE_MS } from '@/lib/deadline-policy';
import { parseManagedMediaIdempotencyKey } from '@agiworkforce/utils';
import {
  aiGeneratedHeaders,
  buildAiGeneratedProvenance,
  type AiGeneratedProvenance,
} from '@/lib/compliance/ai-act';
import {
  authenticatedMediaUrl,
  deleteStoredMedia,
  isImageStorageConfigured,
  readStoredMedia,
  storeMedia,
  bytesFromBase64,
  bytesFromUrl,
} from '@/lib/server/media-storage';
import { insertMediaAssetsAtomically } from '@/lib/server/media-assets';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ManagedUsageRequestError,
  createManagedUsageErrorBody,
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  markManagedUsageClientDelivered,
  markManagedUsageProviderStarted,
  parseManagedUsageIdempotencyKey,
  reserveManagedUsageRequest,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';

export const maxDuration = 60;
export const runtime = 'nodejs';

type ImageProvider = ManagedMediaImageProvider;

interface GeneratedImage {
  url?: string;
  b64_json?: string;
  contentType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

interface ImageGenerationResponse {
  success: boolean;
  images: GeneratedImage[];
  provider: ImageProvider;
  model: string;
  catalog_model?: string;
  latency_ms: number;
  error?: string;
  retry_after_seconds?: number;
  persisted?: boolean;
  provenance?: AiGeneratedProvenance[];
}

const OPENAI_IMAGE_ESTIMATE_CENTS_BY_QUALITY = {
  medium: 5,
  high: 21,
} as const;

const FALLBACK_IMAGE_ESTIMATE_CENTS_BY_PROVIDER: Record<ImageProvider, number> = {
  openai: OPENAI_IMAGE_ESTIMATE_CENTS_BY_QUALITY.high,
  google: 3,
  stability: 0,
};

type ImageApi = NonNullable<ModelMetadata['imageApi']>;

const MAX_IMAGE_RETRY_AFTER_SECONDS = 5 * 60;

class ImageProviderHttpError extends Error {
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

const IMAGE_ASPECT_RATIOS_BY_API: Record<ImageApi, ReadonlySet<ManagedMediaImageAspectRatio>> = {
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

function resolveProviderImageAspectRatio(
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

function resolveGoogleImageModel(requestedModelId?: string): ExecutableImageModel | null {
  const googleImageModels = getModelsForProvider('google', {
    includeDeprecated: false,
    modelTypes: ['image'],
  }).filter(isExecutableImageModel);

  const requested = resolveRequestedCatalogModel(googleImageModels, requestedModelId);
  if (requested) return requested;

  return (
    googleImageModels.find((model) => model.imageApi === 'gemini') ?? googleImageModels[0] ?? null
  );
}

function resolveOpenAIImageModel(requestedModelId?: string): ExecutableImageModel | null {
  const openaiImageModels = getModelsForProvider('openai', {
    includeDeprecated: false,
    modelTypes: ['image'],
  }).filter(isExecutableImageModel);

  const requested = resolveRequestedCatalogModel(openaiImageModels, requestedModelId);
  if (requested) return requested;

  return (
    openaiImageModels.find((model) => model.imageApi === 'openai') ?? openaiImageModels[0] ?? null
  );
}

function resolveImageCatalogModel(
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

function resolveImageProviderFromCatalogModel(modelId: string): ImageProvider | null {
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

function managedUsageErrorResponse(
  request: NextRequest,
  error: ManagedUsageRequestError,
): NextResponse {
  return NextResponse.json(
    createManagedUsageErrorBody(
      error,
      error.status === 402 || error.status === 429 ? 'insufficient_quota' : 'invalid_request_error',
    ),
    {
      status: error.status,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    },
  );
}

function estimateImageCostCents(
  provider: ImageProvider,
  imageCount: number,
  quality: string | undefined,
  requestedModelId?: string,
): number {
  if (provider === 'openai') {
    const qualityKey = quality === 'hd' ? 'high' : 'medium';
    return OPENAI_IMAGE_ESTIMATE_CENTS_BY_QUALITY[qualityKey] * imageCount;
  }

  if (provider === 'google') {
    const perImageUsd = resolveGoogleImageModel(requestedModelId)?.imagePerImageCost;
    if (typeof perImageUsd === 'number' && perImageUsd > 0) {
      return Math.ceil(perImageUsd * 100) * imageCount;
    }
  }

  return FALLBACK_IMAGE_ESTIMATE_CENTS_BY_PROVIDER[provider] * imageCount;
}

const GOOGLE_API_KEY_ENV_KEYS = ['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'] as const;

function getGoogleApiKey(): string | undefined {
  for (const key of GOOGLE_API_KEY_ENV_KEYS) {
    const value = getOptionalEnv(key);
    if (value) return value;
  }
  return undefined;
}

function getDefaultProvider(): ImageProvider {
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

function isProviderAvailable(provider: ImageProvider): boolean {
  switch (provider) {
    case 'openai':
      return !!getOptionalEnv('OPENAI_API_KEY');
    case 'google':
      return !!getGoogleApiKey();
    case 'stability':
      return false;
  }
}

async function resolveImageRefBytes(
  ref: { asset_id: string } | { b64_json: string },
  userId: string,
  db?: Parameters<typeof getActiveWorkspaceMediaAssetById>[2],
): Promise<Uint8Array> {
  if ('b64_json' in ref) {
    const base64 = ref.b64_json.includes(',') ? ref.b64_json.split(',').pop()! : ref.b64_json;
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }

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
  edit?: {
    operation: ManagedMediaImageOperation;
    sourceBytes: Uint8Array;
    maskBytes?: Uint8Array;
    transparentBackground: boolean;
  },
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
      ...(edit === undefined ? {} : {}),
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

function sha256HexFromBase64(b64: string): string {
  const payload = b64.includes(',') ? (b64.split(',').pop() ?? '') : b64;
  return createHash('sha256').update(Buffer.from(payload, 'base64')).digest('hex');
}

async function handleImageGeneration(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  const rateLimitResponse = await withRateLimit(request, 'image-generation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  // Resolved exactly once: the workspace admitted at the start of the turn is
  // the workspace the row is written to, so a switch mid-request cannot move it.
  let scopedDbPromise: ReturnType<typeof getUserScopedDb> | undefined;
  const callerScope = () => (scopedDbPromise ??= getUserScopedDb(request));

  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    {
      provider: 'managed-media',
      model: 'image-generation',
      feature: 'media_image_generation',
    },
    {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  );
  if (managedGateResponse) return managedGateResponse;

  const policyGateResponse = await buildOrganizationPolicyGateResponse(
    userId,
    request,
    {
      provider: 'managed-media',
      model: 'image-generation',
      feature: 'media_image_generation',
      surface: resolveCloudChatSurface(request),
    },
    {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  );
  if (policyGateResponse) return policyGateResponse;

  // The workspace budget, checked before any credit is reserved so a turn
  // that a spend cap will refuse never spends anything first.
  const spendGateResponse = await buildSpendLimitGateResponse(userId, request);
  if (spendGateResponse) return spendGateResponse;

  const subscription = await SubscriptionService.getSubscription((await callerScope()).db, userId);

  if (!subscription) {
    return NextResponse.json(
      {
        error: {
          message: 'No active subscription found. Please subscribe to use image generation.',
          type: 'invalid_request_error',
          code: 'subscription_required',
        },
      },
      {
        status: 403,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes(subscription.status)) {
    return NextResponse.json(
      {
        error: {
          message: `Your subscription is ${subscription.status}. Please update your payment method.`,
          type: 'invalid_request_error',
          code: 'subscription_inactive',
        },
      },
      {
        status: 403,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const userTier = subscription.plan_tier?.toLowerCase() || 'free';
  if (!canUseBillingPlanCapability(userTier, 'image_generation')) {
    return NextResponse.json(
      {
        error: {
          message:
            'Image generation is available on Pro, Max, Team, and Enterprise plans. Upgrade your plan to unlock AI-powered image creation.',
          type: 'invalid_request_error',
          code: 'plan_upgrade_required',
          current_plan: userTier,
          required_plans: ['pro', 'max', 'max_15x', 'team', 'enterprise'],
        },
      },
      {
        status: 403,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid JSON in request body',
          type: 'invalid_request_error',
        },
      },
      {
        status: 400,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const validationResult = ManagedMediaImageGenerationRequestSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      {
        error: {
          message: validationResult.error.message,
          type: 'invalid_request_error',
          param: validationResult.error.issues[0]?.path.join('.'),
        },
      },
      {
        status: 400,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const {
    prompt,
    conversation_id: conversationId,
    provider: requestedProvider,
    model: requestedModel,
    aspect_ratio: requestedAspectRatio,
    size,
    style,
    quality,
    n,
    negative_prompt,
    operation,
    source_image,
    mask_image,
    transparent_background,
  } = validationResult.data;

  // Always-on platform safety floor, ahead of model resolution, billing
  // reservation, and provider egress: a refused prompt must never be charged
  // for and must never leave this process. Covers every operation the handler
  // serves, generate and the edit paths (inpaint/outpaint/variation), which
  // all reach a provider through this same prompt.
  // NOTE: the helper's surface label has no 'managed-image' member yet, so
  // these events are reported under the default surface.
  const moderation = moderateManagedPrompt({
    userId,
    segments: negative_prompt ? [prompt, negative_prompt] : [prompt],
  });
  if (!moderation.allowed) {
    return NextResponse.json(
      {
        error: {
          message: moderation.refusal,
          type: 'invalid_request_error',
          code: 'content_policy_violation',
        },
      },
      {
        status: 422,
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  }

  const catalogProvider = requestedModel
    ? resolveImageProviderFromCatalogModel(requestedModel)
    : null;
  if (requestedModel && !catalogProvider) {
    return NextResponse.json(
      {
        error: {
          message: 'The requested model is not a supported image generation model.',
          type: 'invalid_request_error',
          code: 'model_unavailable',
        },
      },
      {
        status: 400,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  if (requestedProvider && catalogProvider && requestedProvider !== catalogProvider) {
    return NextResponse.json(
      {
        error: {
          message: `The requested image model is not served by the ${requestedProvider} provider.`,
          type: 'invalid_request_error',
          code: 'provider_model_mismatch',
        },
      },
      {
        status: 400,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  let provider: ImageProvider;
  try {
    const selectedProvider = requestedProvider ?? catalogProvider;
    if (selectedProvider) {
      if (!isProviderAvailable(selectedProvider)) {
        return NextResponse.json(
          {
            error: {
              message: `The ${selectedProvider} provider is not configured. Please try a different provider.`,
              type: 'invalid_request_error',
              code: 'provider_unavailable',
            },
          },
          {
            status: 400,
            headers: {
              ...getCorsHeaders(request),
              ...getSecurityHeaders(),
            },
          },
        );
      }
      provider = selectedProvider;
    } else {
      provider = getDefaultProvider();
    }
  } catch {
    return NextResponse.json(
      {
        error: {
          message: 'No image generation providers are configured. Please contact support.',
          type: 'server_error',
          code: 'no_providers',
        },
      },
      {
        status: 500,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const catalogModel = resolveImageCatalogModel(provider, requestedModel);

  // The workspace model policy, checked on the RESOLVED catalog model rather
  // than on what was requested, a provider default must not be a way past a
  // rule the administrator wrote.
  if (catalogModel) {
    const modelPolicyResponse = await buildModelPolicyGateResponse(
      userId,
      request,
      { provider: String(catalogModel.provider), modelId: catalogModel.id },
      { ...getCorsHeaders(request), ...getSecurityHeaders() },
    );
    if (modelPolicyResponse) return modelPolicyResponse;
  }

  if (!catalogModel) {
    return NextResponse.json(
      {
        error: {
          message: 'The requested image model is not available for this provider.',
          type: 'invalid_request_error',
          code: 'model_unavailable',
        },
      },
      {
        status: 400,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  if (catalogModel.imageApi === 'gemini' && n !== 1) {
    return NextResponse.json(
      {
        error: {
          message: 'The requested Google image model supports one image per request.',
          type: 'invalid_request_error',
          code: 'unsupported_image_count',
          param: 'n',
          max_images: 1,
        },
      },
      {
        status: 400,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  if (catalogModel.imageApi === 'gemini' && !catalogModel.imageOutputMimeType) {
    logger.error(
      { provider, model: catalogModel.id },
      'Gemini image model is missing its catalog output MIME contract',
    );
    return NextResponse.json(
      {
        error: {
          message: 'The requested image model is not fully configured for this deployment.',
          type: 'server_error',
          code: 'image_model_contract_unavailable',
        },
      },
      {
        status: 503,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const providerAspectRatio = resolveProviderImageAspectRatio(
    catalogModel,
    requestedAspectRatio,
    size,
  );
  if (!providerAspectRatio) {
    return NextResponse.json(
      {
        error: {
          message: `Aspect ratio ${requestedAspectRatio} is not supported by the requested image model.`,
          type: 'invalid_request_error',
          code: 'unsupported_aspect_ratio',
          param: 'aspect_ratio',
          supported_aspect_ratios: [...IMAGE_ASPECT_RATIOS_BY_API[catalogModel.imageApi]],
        },
      },
      {
        status: 400,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const storageConfigured = isImageStorageConfigured();
  let mediaCatalogConfigured = false;
  try {
    mediaCatalogConfigured = await isMediaAssetStoreReady();
  } catch (error) {
    logger.error(
      { error, userId, provider, model: catalogModel.id },
      'Image generation unavailable because media catalog readiness could not be verified',
    );
  }
  if (!mediaCatalogConfigured) {
    return NextResponse.json(
      {
        error: {
          message:
            'Image generation is temporarily unavailable because generated images cannot be cataloged. Please try again later.',
          type: 'server_error',
          code: 'media_catalog_unavailable',
        },
      },
      {
        status: 503,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }
  if (process.env.NODE_ENV === 'production' && !storageConfigured) {
    logger.error(
      { userId, provider, model: catalogModel.id },
      'Image generation unavailable because durable media storage is not configured',
    );
    return NextResponse.json(
      {
        error: {
          message:
            'Image generation is temporarily unavailable because generated images cannot be saved. Please try again later.',
          type: 'server_error',
          code: 'media_storage_unavailable',
        },
      },
      {
        status: 503,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  // The other half of the safety floor: client-supplied image bytes. A benign
  // prompt must not be a way to push prohibited imagery through the edit
  // endpoints, so both refs are resolved and hash-checked here, ahead of the
  // billing reservation and every provider call, and a refused upload is
  // therefore never charged for and never leaves this process.
  let editContext:
    | {
        operation: ManagedMediaImageOperation;
        sourceBytes: Uint8Array;
        maskBytes?: Uint8Array;
        transparentBackground: boolean;
      }
    | undefined;
  if (operation !== 'generate' && source_image) {
    let sourceBytes: Uint8Array;
    let maskBytes: Uint8Array | undefined;
    try {
      const referencesStoredAsset =
        'asset_id' in source_image || (mask_image && 'asset_id' in mask_image);
      const editRefDb = referencesStoredAsset ? (await callerScope()).db : undefined;
      sourceBytes = await resolveImageRefBytes(source_image, userId, editRefDb);
      maskBytes = mask_image
        ? await resolveImageRefBytes(mask_image, userId, editRefDb)
        : undefined;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
          provider,
          operation,
        },
        'Image edit source could not be resolved',
      );
      return NextResponse.json(
        {
          success: false,
          error:
            'The source image for this edit could not be read. Upload the image again and retry.',
          images: [],
          provider,
          model: 'unknown',
          latency_ms: Date.now() - startTime,
        } satisfies ImageGenerationResponse,
        {
          status: 422,
          headers: {
            ...getCorsHeaders(request),
            ...getSecurityHeaders(),
          },
        },
      );
    }

    const suppliedUploads: ReadonlyArray<readonly [string, Uint8Array]> = maskBytes
      ? [
          ['source_image', sourceBytes],
          ['mask_image', maskBytes],
        ]
      : [['source_image', sourceBytes]];
    for (const [param, bytes] of suppliedUploads) {
      const hashMatch = matchDenylistedUpload(bytes);
      if (!hashMatch.matched) continue;
      recordModerationEvent({
        surface: 'upload',
        action: 'block',
        categories: ['known_illegal_media'],
        ruleIds: [`managed-image.${param}.hash-denylist`],
        userId,
        contentSha256: hashMatch.sha256,
        ...(hashMatch.listLabel ? { listLabel: hashMatch.listLabel } : {}),
      });
      return NextResponse.json(
        {
          error: {
            message: PLATFORM_POLICY_REFUSAL,
            type: 'invalid_request_error',
            code: 'content_policy_violation',
          },
        },
        {
          status: 422,
          headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
        },
      );
    }

    editContext = {
      operation,
      sourceBytes,
      ...(maskBytes ? { maskBytes } : {}),
      transparentBackground: transparent_background,
    };
  }

  const estimatedCostCents = estimateImageCostCents(provider, n, quality, catalogModel.id);
  let reservation: ManagedUsageRequestReservation;
  let sourceSurface: 'web' | 'mobile' | 'desktop';
  let organizationId: string | null;
  let scopedDb: Awaited<ReturnType<typeof getUserScopedDb>>['db'] | undefined;
  try {
    const idempotencyKey = parseManagedUsageIdempotencyKey(request.headers.get('Idempotency-Key'));
    const mediaIdentity = parseManagedMediaIdempotencyKey(idempotencyKey);
    if (!mediaIdentity || mediaIdentity.operation !== 'image') {
      throw new ManagedUsageRequestError(
        'Idempotency-Key must identify one Managed Cloud image operation.',
        400,
        'invalid_media_idempotency_key',
      );
    }
    sourceSurface = mediaIdentity.surface;
    const scoped = await callerScope();
    organizationId = scoped.organizationId;
    scopedDb = scoped.db;
    if (scoped.userId !== userId) {
      throw new ManagedUsageRequestError('Managed usage tenant mismatch.', 403, 'tenant_mismatch');
    }
    if (conversationId) {
      const [ownedConversation] = await scoped.db.query<{ id: string }>(
        `select id
           from public.web_conversations
          where id = $1 and user_id = $2
          limit 1`,
        [conversationId, userId],
      );
      if (!ownedConversation) {
        throw new ManagedUsageRequestError(
          'The conversation was not found for this account.',
          404,
          'conversation_not_found',
        );
      }
    }
    reservation = await reserveManagedUsageRequest({
      db: scoped.db,
      userId,
      idempotencyKey,
      requestHash: fingerprintManagedUsageRequest(validationResult.data),
      provider,
      model: catalogModel.id,
      estimatedCostCents,
      planTier: subscription.plan_tier,
      isFlagship: false,
    });
  } catch (error) {
    const managedError =
      error instanceof ManagedUsageRequestError
        ? error
        : new ManagedUsageRequestError(
            'Managed usage billing is temporarily unavailable.',
            503,
            'billing_unavailable',
          );
    return managedUsageErrorResponse(request, managedError);
  }

  let result: { images: GeneratedImage[]; model: string };
  try {
    logger.info(
      {
        userId: userId,
        provider,
        prompt: prompt.substring(0, 100),
        size,
        aspectRatio: providerAspectRatio,
        style,
        n,
      },
      'Starting image generation',
    );
    await markManagedUsageProviderStarted(reservation);

    if (editContext && !supportsManagedMediaImageEdit(provider)) {
      throw new Error(
        `Image ${operation} is not supported by the ${provider} provider yet. Use the OpenAI image model for edits.`,
      );
    }

    switch (provider) {
      case 'openai':
        result = await generateWithOpenAIImage(
          prompt,
          providerAspectRatio,
          quality,
          n,
          catalogModel.id,
          editContext,
        );
        break;
      case 'google':
        result = await generateWithImagen(
          prompt,
          providerAspectRatio,
          style,
          n,
          catalogModel,
          negative_prompt,
        );
        break;
      case 'stability':
        throw new Error('The Stability image adapter is not supported');
    }

    if (result.images.length === 0) {
      throw new Error(`${provider} image provider returned no usable image output`);
    }

    logger.info(
      {
        userId: userId,
        provider,
        model: result.model,
        imageCount: result.images.length,
      },
      'Image generation completed',
    );
  } catch (error) {
    try {
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'failed',
        actualCostCents: 0,
        usage: {
          operation: 'image',
          sourceSurface,
          provider,
          model: catalogModel.id,
          reason: 'provider_failed',
        },
      });
    } catch (settlementError) {
      logger.error(
        {
          event: 'image_refund_settlement_unrecorded',
          error: settlementError,
          userId,
          provider,
          idempotencyKey: reservation.idempotencyKey,
        },
        'Image generation failure settlement could not be persisted',
      );
    }

    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        userId: userId,
        provider,
      },
      'Image generation failed',
    );

    const providerHttpError = error instanceof ImageProviderHttpError ? error : null;
    const errorMessage = error instanceof Error ? error.message : 'Image generation failed';
    const classified = error instanceof Error ? classifyError(error) : undefined;
    const providerLabel = provider === 'google' ? 'Google' : provider;

    let friendlyMessage = `Provider ${provider} failed: ${errorMessage}`;
    let suppressRetryAfter = false;
    if (classified?.category === 'quota_exhausted') {
      markProviderDegraded(provider, classified.category);
      suppressRetryAfter = true;
      friendlyMessage =
        classified.providerHint === SPENDING_CAP_PROVIDER_HINT
          ? `${providerLabel}'s spending cap for this project is exceeded, so image generation is unavailable right now. Choose a different image model.`
          : `${providerLabel} has exhausted its image generation quota for now. Choose a different image model, or try again later.`;
    } else if (
      classified?.category === 'server_overload' ||
      classified?.category === 'capacity_off_switch'
    ) {
      markProviderDegraded(provider, classified.category);
      friendlyMessage = `${providerLabel} image generation is overloaded right now. Try again in a moment, or choose a different image model.`;
    } else if (providerHttpError?.status === 429) {
      friendlyMessage =
        'The image generation service is temporarily busy. Use Try again after the wait shown below.';
    } else if (errorMessage.includes('content policy') || errorMessage.includes('safety')) {
      friendlyMessage =
        'Your prompt was flagged by our content safety filters. Please try a different prompt.';
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
      friendlyMessage =
        'The image generation service is temporarily busy. Please try again in a few moments.';
    } else if (errorMessage.includes('billing') || errorMessage.includes('payment')) {
      friendlyMessage =
        'There was a billing issue with the image generation service. Please contact support.';
    } else if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('TimeoutError')
    ) {
      friendlyMessage =
        'The image provider did not respond before the request deadline. Please try again.';
    }

    const retryAfterSeconds = suppressRetryAfter ? undefined : providerHttpError?.retryAfterSeconds;

    return NextResponse.json(
      {
        success: false,
        error: friendlyMessage,
        images: [],
        provider,
        model: 'unknown',
        latency_ms: Date.now() - startTime,
        ...(retryAfterSeconds !== undefined ? { retry_after_seconds: retryAfterSeconds } : {}),
      } satisfies ImageGenerationResponse,
      {
        status: providerHttpError?.status === 429 ? 429 : 422,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
          ...(retryAfterSeconds !== undefined ? { 'Retry-After': String(retryAfterSeconds) } : {}),
        },
      },
    );
  }

  const generatedAt = new Date().toISOString();
  const provenance: AiGeneratedProvenance[] = result.images.map((img) => {
    const hash = img.b64_json ? sha256HexFromBase64(img.b64_json) : undefined;
    return buildAiGeneratedProvenance({
      kind: 'image',
      provider,
      model: catalogModel.id,
      generatedAt,
      ...(hash ? { contentHashSha256: hash } : {}),
    });
  });

  const persistenceFailures: string[] = [];

  if (storageConfigured) {
    type StagedImage = {
      idx: number;
      pathname: string;
      byteSize: number;
      contentType: string;
    };
    const stagedOutcomes = await Promise.all(
      result.images.map(
        async (img, idx): Promise<{ staged?: StagedImage; idx: number; error?: string }> => {
          let storedPathname: string | null = null;
          try {
            let bytes: Buffer | null = null;
            let contentType: string = img.contentType ?? 'image/png';
            if (img.b64_json) {
              bytes = bytesFromBase64(img.b64_json);
            } else if (img.url) {
              const fetched = await bytesFromUrl(img.url);
              bytes = fetched.data;
              contentType = fetched.contentType;
            }
            if (!bytes) {
              return { idx, error: 'provider returned neither image bytes nor a URL' };
            }

            const existingClaim = provenance[idx];
            if (existingClaim && !existingClaim.content_hash_sha256) {
              provenance[idx] = buildAiGeneratedProvenance({
                kind: 'image',
                provider,
                model: catalogModel.id,
                generatedAt,
                contentHashSha256: createHash('sha256').update(bytes).digest('hex'),
              });
            }

            const stored = await storeMedia({ userId, kind: 'image', data: bytes, contentType });
            storedPathname = stored.pathname;
            return {
              idx,
              staged: {
                idx,
                pathname: stored.pathname,
                byteSize: stored.byteSize,
                contentType,
              },
            };
          } catch (err) {
            if (storedPathname) {
              await deleteStoredMedia(storedPathname).catch(() => undefined);
            }
            return { idx, error: err instanceof Error ? err.message : String(err) };
          }
        },
      ),
    );

    const stagedImages: StagedImage[] = [];
    for (const outcome of stagedOutcomes) {
      if (outcome.staged) {
        stagedImages.push(outcome.staged);
      } else {
        persistenceFailures.push(`image ${outcome.idx}: ${outcome.error ?? 'unknown error'}`);
      }
    }

    if (persistenceFailures.length === 0) {
      try {
        const assetIds = await insertMediaAssetsAtomically(
          stagedImages.map((staged) => ({
            userId,
            organizationId,
            kind: 'image',
            mimeType: staged.contentType,
            byteSize: staged.byteSize,
            storageUrl: staged.pathname,
            storagePathname: staged.pathname,
            prompt,
            provider,
            model: catalogModel.id,
            sourceSurface,
            conversationId,
            metadata: { aiAct: provenance[staged.idx] },
          })),
          scopedDb,
        );
        if (!assetIds || assetIds.length !== stagedImages.length) {
          persistenceFailures.push('media catalog is unavailable for the generated image batch');
        } else {
          stagedImages.forEach((staged, position) => {
            result.images[staged.idx] = { url: authenticatedMediaUrl(assetIds[position]!) };
          });
        }
      } catch (error) {
        persistenceFailures.push(
          error instanceof Error ? error.message : 'generated image catalog transaction failed',
        );
      }
    }

    if (persistenceFailures.length > 0) {
      const cleanupResults = await Promise.allSettled(
        stagedImages.map((staged) => deleteStoredMedia(staged.pathname)),
      );
      cleanupResults.forEach((cleanup, index) => {
        if (cleanup.status === 'rejected') {
          logger.error(
            {
              err: cleanup.reason,
              userId,
              pathname: stagedImages[index]?.pathname,
              event: 'generated_image_batch_object_cleanup_failed',
            },
            'Generated image batch object cleanup failed after catalog rollback',
          );
        }
      });
    }
  }

  if (persistenceFailures.length > 0) {
    logger.error(
      { userId, provider, model: result.model, failures: persistenceFailures },
      'Generated image persistence failed; refunding the reservation',
    );
    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'failed',
      actualCostCents: 0,
      usage: {
        operation: 'image',
        sourceSurface,
        provider,
        model: catalogModel.id,
        outputCount: 0,
        failure: 'image_persistence_failed',
      },
    });

    return NextResponse.json(
      {
        success: false,
        error:
          'The image was generated but could not be saved to your library, so it was not charged. Please try again; if this keeps happening, contact support.',
        images: [],
        provider,
        model: result.model,
        latency_ms: Date.now() - startTime,
        persisted: false,
      } satisfies ImageGenerationResponse,
      {
        status: 502,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const costEstimate = estimateImageCostCents(
    provider,
    result.images.length,
    quality,
    catalogModel.id,
  );
  await finalizeManagedUsageRequest({
    ...reservation,
    outcome: 'completed',
    actualCostCents: costEstimate,
    usage: {
      operation: 'image',
      sourceSurface,
      provider,
      model: catalogModel.id,
      outputCount: result.images.length,
    },
  });

  logger.info(
    { userId: userId, provider, model: result.model, costEstimate, estimatedCostCents },
    'Image generation credits deducted',
  );

  const response: ImageGenerationResponse = {
    success: true,
    images: result.images.map(({ url, b64_json }) => ({
      ...(url ? { url } : {}),
      ...(b64_json ? { b64_json } : {}),
    })),
    provider,
    model: result.model,
    catalog_model: catalogModel.id,
    latency_ms: Date.now() - startTime,
    persisted: storageConfigured,
    provenance,
  };

  try {
    await markManagedUsageClientDelivered(reservation);
  } catch (error) {
    logger.warn(
      { error, userId, idempotencyKey: reservation.idempotencyKey },
      'Image delivery marker could not be persisted',
    );
  }

  return NextResponse.json(response, {
    headers: {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
      ...aiGeneratedHeaders(),
    },
  });
}

export const POST = withErrorHandler(handleImageGeneration);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
