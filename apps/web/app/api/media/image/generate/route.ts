import 'server-only';

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedMediaImageGenerationRequestSchema,
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
import { buildManagedComputeGateResponse } from '@/lib/managed-compute-gate';
import {
  canUseBillingPlanCapability,
  getModelMetadataById,
  getModelsForProvider,
  isExecutableImageModel,
  type ExecutableImageModel,
  type ModelMetadata,
} from '@agiworkforce/types';
import { parseRetryAfter } from '@agiworkforce/provider-runtime';
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

/**
 * Image Generation API
 * Endpoint: POST /api/media/image/generate
 *
 * This provides a unified interface for catalog-selected image generation
 * models across configured providers.
 *
 * Users authenticate with Clerk and must have an active subscription.
 */

// Next.js route configuration - image generation takes 10–30s, so we extend to 60s.
// Without this the serverless function would time out at the default (10s on Vercel).
export const maxDuration = 60;
export const runtime = 'nodejs';

type ImageProvider = ManagedMediaImageProvider;

// Response types
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
  /** Canonical catalog identity used for billing, persistence, and retries. */
  catalog_model?: string;
  latency_ms: number;
  error?: string;
  /** Bounded provider/gateway Retry-After projected for an explicit user retry. */
  retry_after_seconds?: number;
  /**
   * PER-4: true when every returned image is backed by durable storage and
   * addressed by an authenticated `/api/files/{id}` URL. False is permitted
   * only in non-production test harnesses that deliberately disable storage;
   * those `images` carry inline `b64_json` that must never be persisted into a
   * chat message.
   */
  persisted?: boolean;
  /**
   * EU AI Act Article 50(2) marker — one claim per entry of `images`, same
   * order. Present on every successful generation; the response header
   * `x-agi-ai-generated` carries the same fact for consumers that never parse
   * the body.
   */
  provenance?: AiGeneratedProvenance[];
}

const OPENAI_IMAGE_ESTIMATE_CENTS_BY_QUALITY = {
  medium: 5,
  high: 21,
} as const;

const FALLBACK_IMAGE_ESTIMATE_CENTS_BY_PROVIDER: Record<ImageProvider, number> = {
  openai: OPENAI_IMAGE_ESTIMATE_CENTS_BY_QUALITY.high,
  google: 3,
  // Kept only for backward-compatible request parsing. There is no wired
  // Stability image adapter or selectable catalog model.
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

/**
 * Provider-published exact ratios for each wired adapter. This is the server
 * authority: the client picker is only presentation and every request is
 * checked again after catalog resolution but before usage reservation.
 */
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
  // This adapter currently sends the enumerated Images API dimensions only.
  // Fail closed on arbitrary ratios until their exact dimension mapping is
  // verified and represented rather than pretending 3:4 is 2:3.
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

  // Honour the user's explicit model choice when it's a valid Google image model.
  const requested = resolveRequestedCatalogModel(googleImageModels, requestedModelId);
  if (requested) return requested;

  // Default: prefer the Gemini backend (fast, low-cost) via the declarative
  // `imageApi` catalog field, else the first catalog Google image model. No id
  // pattern, no hardcoded id — selection is driven entirely by catalog data.
  return (
    googleImageModels.find((model) => model.imageApi === 'gemini') ?? googleImageModels[0] ?? null
  );
}

function resolveOpenAIImageModel(requestedModelId?: string): ExecutableImageModel | null {
  const openaiImageModels = getModelsForProvider('openai', {
    includeDeprecated: false,
    modelTypes: ['image'],
  }).filter(isExecutableImageModel);

  // Honour the user's explicit model choice when it's a valid OpenAI image model.
  const requested = resolveRequestedCatalogModel(openaiImageModels, requestedModelId);
  if (requested) return requested;

  // Default: prefer the model tagged for the OpenAI Images API via the
  // declarative `imageApi` catalog field, else the first catalog OpenAI image
  // model. No id pattern, no hardcoded id — selection is driven entirely by
  // catalog data (previously this fell through to the shared `image_generation`
  // routing slot, which is Google-only, sending a Gemini model id to OpenAI).
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

/**
 * Translate the catalog's image adapter metadata to this route's provider
 * vocabulary. Only adapters implemented by this route are admitted; merely
 * adding a future catalog record cannot reactivate a removed provider path.
 */
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

/**
 * Google credential names, in priority order.
 *
 * This route previously read `GOOGLE_API_KEY` alone, while the rest of the
 * stack resolves Google through the chain in
 * `lib/services/provider-adapter-service.ts` (`PROVIDER_API_KEY_ENV_KEYS.google`).
 * A deployment that sets only `GEMINI_API_KEY` — which is the common case, and
 * this one — therefore had working Gemini CHAT but a silently unavailable
 * Gemini IMAGE path: `getDefaultProvider` skipped Google and fell through to
 * another provider, so the catalog's image-generation routing-slot model never
 * actually served a request.
 *
 * Keep this list in sync with `PROVIDER_API_KEY_ENV_KEYS.google`.
 */
const GOOGLE_API_KEY_ENV_KEYS = ['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'] as const;

function getGoogleApiKey(): string | undefined {
  for (const key of GOOGLE_API_KEY_ENV_KEYS) {
    const value = getOptionalEnv(key);
    if (value) return value;
  }
  return undefined;
}

/**
 * Determine the default provider based on available API keys
 */
function getDefaultProvider(): ImageProvider {
  if (getGoogleApiKey()) {
    return 'google';
  }
  if (getOptionalEnv('OPENAI_API_KEY')) {
    return 'openai';
  }
  throw new Error('No image generation API keys configured');
}

/**
 * Get API key for provider
 */
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

/**
 * Check if provider is available
 */
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

/**
 * Generate images using the catalog-selected OpenAI image slot.
 * Endpoint: POST {OPENAI_BASE_URL or the vendor default}/images/generations
 */

/**
 * Resolve a `source_image` / `mask_image` reference to raw bytes.
 *
 * OWNER + ACTIVE-WORKSPACE scoped on purpose: an `asset_id` is re-read under
 * the caller's current tenant boundary, so a caller cannot pass somebody
 * else's or another workspace's asset id and have the server read that image
 * on their behalf. Inline `b64_json` bytes are the caller's own upload and need
 * no lookup.
 *
 * There is deliberately no URL branch — accepting one would turn this endpoint
 * into a server-side fetcher for attacker-supplied hosts.
 */
async function resolveImageRefBytes(
  ref: { asset_id: string } | { b64_json: string },
  userId: string,
): Promise<Uint8Array> {
  if ('b64_json' in ref) {
    const base64 = ref.b64_json.includes(',') ? ref.b64_json.split(',').pop()! : ref.b64_json;
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }

  const asset = await getActiveWorkspaceMediaAssetById(userId, ref.asset_id);
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

  // An edit sends the ORIGINAL PIXELS to the provider's edits endpoint. The
  // previous behavior — a fresh text-to-image call built from a modified
  // prompt — could not preserve anything about the source image, which is why
  // "edit" never actually edited.
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
      signal: AbortSignal.timeout(55_000),
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
    signal: AbortSignal.timeout(55_000),
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

/**
 * Generate images using the catalog-selected Google image model.
 * Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predict
 */
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

  // Google has two distinct image APIs with different request/response shapes:
  //   - imageApi 'gemini' → the Interactions API; bytes in output_image.data.
  //   - imageApi 'imagen' → `:predict`; bytes in predictions[].bytesBase64Encoded.
  // Dispatch on the catalog's declarative imageApi field (no id pattern), so a new
  // Google image model only needs its imageApi set in
  // packages/ai/model-registry/catalog/models.curation.json.
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
      signal: AbortSignal.timeout(55_000),
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

/**
 * Generate an image with a Gemini image model through Google's current
 * Interactions API. The raw REST response carries image blocks inside
 * `steps[].content[]`; `output_image` is an SDK convenience field and is not
 * guaranteed on REST responses. Accept both representations, but only accept
 * inline bytes with the MIME type promised by the canonical model catalog.
 * See https://ai.google.dev/gemini-api/docs/image-generation
 */
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
        // Google's current v1beta image guide omits the optional delivery
        // field, and a live request proved this model rejects an explicit
        // `inline` value. Omission still returns inline bytes; the response
        // parser below fails closed if a provider ever returns only a URI.
        aspect_ratio: aspectRatio,
        image_size: '1K',
      },
    }),
    signal: AbortSignal.timeout(55_000),
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

    // Node's Buffer decoder silently discards malformed base64 characters.
    // Require canonical RFC 4648 bytes and verify the declared image magic
    // before storage/billing so arbitrary provider text can never become an
    // authenticated image asset.
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
      // Entropy-coded bytes follow the SOS segment and finish at the final EOI.
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

/**
 * SHA-256 of the artefact bytes, for the Article 50(2) claim. Hashing the
 * base64 rather than decoding it first would bind the claim to a transport
 * encoding, not to the image.
 */
function sha256HexFromBase64(b64: string): string {
  const payload = b64.includes(',') ? (b64.split(',').pop() ?? '') : b64;
  return createHash('sha256').update(Buffer.from(payload, 'base64')).digest('hex');
}

/**
 * Main handler for image generation
 */
async function handleImageGeneration(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // AUDIT-008-006: Enforce CSRF protection for state-changing endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  // Rate limiting - use image-generation config (10 req/min, fail-closed)
  const rateLimitResponse = await withRateLimit(request, 'image-generation');
  if (rateLimitResponse) return rateLimitResponse;

  // Authentication
  const { userId } = await getClerkAuthUser(request);

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

  // Check subscription
  const subscription = await SubscriptionService.getSubscription(userId);

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

  // Parse request body
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

  // Validate request
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

  // Mobile sends a catalog model without duplicating provider state. Resolve
  // that model's actual media adapter before considering the deployment
  // default, and reject an explicit provider that contradicts the catalog.
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

  // Determine provider
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

  // Google's Interactions image endpoint returns one output_image per
  // interaction. Do not pretend that its provider supports the shared n=2..4
  // contract: reject before reserving credits or starting provider work.
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

  // A production generation is only successful when its bytes can survive a
  // reload behind the authenticated media route. Fail before reserving usage
  // or contacting the provider when that durable delivery path is absent.
  // Local development remains usable through media-storage's owner-scoped
  // filesystem fallback, which makes this check return true without R2.
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

  const estimatedCostCents = estimateImageCostCents(provider, n, quality, catalogModel.id);
  let reservation: ManagedUsageRequestReservation;
  let sourceSurface: 'web' | 'mobile' | 'desktop';
  let organizationId: string | null;
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
    const scoped = await getUserScopedDb(request);
    organizationId = scoped.organizationId;
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

  // Generate images
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

    // Resolve edit inputs before dispatch so a bad reference fails BEFORE the
    // provider is called and before any provider-side cost is incurred.
    let editContext:
      | {
          operation: ManagedMediaImageOperation;
          sourceBytes: Uint8Array;
          maskBytes?: Uint8Array;
          transparentBackground: boolean;
        }
      | undefined;
    if (operation !== 'generate' && source_image) {
      const sourceBytes = await resolveImageRefBytes(source_image, userId);
      const maskBytes = mask_image ? await resolveImageRefBytes(mask_image, userId) : undefined;
      editContext = {
        operation,
        sourceBytes,
        ...(maskBytes ? { maskBytes } : {}),
        transparentBackground: transparent_background,
      };
    }

    if (editContext && provider !== 'openai') {
      // Only the OpenAI adapter has a real edits endpoint wired. Refuse rather
      // than silently falling back to text-to-image, which is exactly the
      // behavior that made "edit" a lie in the first place.
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

    // Provide user-friendly messages for common failure patterns
    let friendlyMessage = `Provider ${provider} failed: ${errorMessage}`;
    if (providerHttpError?.status === 429) {
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

    return NextResponse.json(
      {
        success: false,
        error: friendlyMessage,
        images: [],
        provider,
        model: 'unknown',
        latency_ms: Date.now() - startTime,
        ...(providerHttpError?.retryAfterSeconds !== undefined
          ? { retry_after_seconds: providerHttpError.retryAfterSeconds }
          : {}),
      } satisfies ImageGenerationResponse,
      {
        status: providerHttpError?.status === 429 ? 429 : 422,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
          ...(providerHttpError?.retryAfterSeconds !== undefined
            ? { 'Retry-After': String(providerHttpError.retryAfterSeconds) }
            : {}),
        },
      },
    );
  }

  // EU AI Act Article 50(2): mark the artefacts as artificially generated
  // BEFORE the persistence branch, because that branch replaces the inline
  // bytes with a URL, after which nothing downstream can hash them. One claim
  // per image, index-aligned with `result.images`.
  //
  // A provider that returns `url` instead of `b64_json` has no bytes here yet;
  // that claim starts with an empty hash and is REPLACED inside the persistence
  // branch once the bytes are fetched (see `hashClaim` below), so the only
  // claims that ship unhashed are ones whose bytes never reach this process.
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

  // -------------------------------------------------------------------------
  // PER-4 / PER-6 / PER-26 — persist BEFORE settling the charge.
  //
  // This block used to run AFTER `finalizeManagedUsageRequest({outcome:
  // 'completed'})` and swallowed every failure into a `logger.warn` while still
  // returning `success: true`. Three failures were invisible:
  //   1. an R2 object written with no `media_assets` row — an orphan that never
  //      reaches the Library and can never be deleted, yet stays fetchable;
  //   2. `insertMediaAsset` returning null (table not migrated) — same orphan;
  //   3. the base64 fallthrough — the route handed back `b64_json`, the client
  //      turned it into a 1.4-4 MB `data:image/png;base64,...` URL, that string
  //      went into `metadata.imageUrl`, the write blew the body cap and the
  //      message was never saved: the reported "Couldn't save this response".
  //
  // Now: persistence is mandatory whenever storage is configured. Every
  // object is staged first, then ALL media rows commit in one transaction. A
  // partial storage or catalog failure removes every staged object before the
  // reservation is refunded, so the Library can never expose an uncharged
  // sibling from a failed multi-image request.
  // -------------------------------------------------------------------------
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

            // The url-returning provider shape only materialises its bytes
            // here, so this is the first point the Article 50(2) claim can be
            // bound to the artefact. Replace the placeholder rather than ship a
            // claim whose content hash is empty.
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
        // PER-26: store object KEYS, not permanent public URLs. The
        // authenticated `/api/files/{id}` route enforces ownership and
        // deletion. `insertMediaAssetsAtomically` makes the whole requested
        // batch visible together or not at all.
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
            // The Article 50(2) claim travels with each asset row so it
            // survives chat reload, Library access, and authenticated download.
            metadata: { aiAct: provenance[staged.idx] },
          })),
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
    // Nothing was charged: the reservation is finalized as failed (which
    // settles at 0 cents) rather than completed.
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

  // Settle the exact number of billable images returned by the provider.
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
    // A non-production test harness may deliberately disable every storage
    // backend. Its inline base64 response CANNOT be persisted into chat. Local
    // development itself uses the owner-scoped filesystem backend above.
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
      // Several images share one response, so the claims stay in the body and
      // the header carries only the detectable-as-synthetic fact.
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
