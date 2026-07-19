import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedMediaImageGenerationRequestSchema,
  type ManagedMediaImageProvider,
} from '@agiworkforce/cloud-contracts';
import { getOptionalEnv, requireEnv } from '@shared/utils/env';
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
  type ModelMetadata,
} from '@agiworkforce/types';
import { parseManagedMediaIdempotencyKey } from '@agiworkforce/utils';
import {
  isMediaStorageConfigured,
  storeMedia,
  bytesFromBase64,
  bytesFromUrl,
} from '@/lib/server/media-storage';
import { insertMediaAsset } from '@/lib/server/media-assets';
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
}

interface ImageGenerationResponse {
  success: boolean;
  images: GeneratedImage[];
  provider: ImageProvider;
  model: string;
  latency_ms: number;
  error?: string;
}

const OPENAI_IMAGE_ESTIMATE_CENTS_BY_QUALITY = {
  medium: 5,
  high: 21,
} as const;

const FALLBACK_IMAGE_ESTIMATE_CENTS_BY_PROVIDER: Record<ImageProvider, number> = {
  openai: OPENAI_IMAGE_ESTIMATE_CENTS_BY_QUALITY.high,
  google: 3,
  stability: 8,
};

function resolveRequestedCatalogModel(
  models: readonly ModelMetadata[],
  requestedModelId?: string,
): ModelMetadata | undefined {
  if (!requestedModelId) return undefined;
  const canonicalModelId = getModelMetadataById(requestedModelId)?.id;
  return canonicalModelId ? models.find((model) => model.id === canonicalModelId) : undefined;
}

function resolveGoogleImageModel(requestedModelId?: string) {
  const googleImageModels = getModelsForProvider('google', {
    includeDeprecated: false,
    modelTypes: ['image'],
  });

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

function resolveOpenAIImageModel(requestedModelId?: string) {
  const openaiImageModels = getModelsForProvider('openai', {
    includeDeprecated: false,
    modelTypes: ['image'],
  });

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

function resolveStabilityImageModel(requestedModelId?: string) {
  const stabilityImageModels = getModelsForProvider('managed_cloud', {
    includeDeprecated: false,
    modelTypes: ['image'],
  }).filter((model) => model.imageApi === 'stability');

  const requested = resolveRequestedCatalogModel(stabilityImageModels, requestedModelId);
  return requested ?? stabilityImageModels[0] ?? null;
}

function resolveImageCatalogModel(
  provider: ImageProvider,
  requestedModelId?: string,
): ModelMetadata | null {
  const selected =
    provider === 'openai'
      ? resolveOpenAIImageModel(requestedModelId)
      : provider === 'google'
        ? resolveGoogleImageModel(requestedModelId)
        : resolveStabilityImageModel(requestedModelId);
  if (!selected) return null;
  if (!requestedModelId) return selected;
  return getModelMetadataById(requestedModelId)?.id === selected.id ? selected : null;
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

  if (provider === 'stability') {
    const perImageUsd = resolveStabilityImageModel(requestedModelId)?.imagePerImageCost;
    if (typeof perImageUsd === 'number' && perImageUsd > 0) {
      return Math.ceil(perImageUsd * 100) * imageCount;
    }
  }

  return FALLBACK_IMAGE_ESTIMATE_CENTS_BY_PROVIDER[provider] * imageCount;
}

/**
 * Determine the default provider based on available API keys
 */
function getDefaultProvider(): ImageProvider {
  if (getOptionalEnv('GOOGLE_API_KEY')) {
    return 'google';
  }
  if (getOptionalEnv('OPENAI_API_KEY')) {
    return 'openai';
  }
  if (getOptionalEnv('STABILITY_API_KEY')) {
    return 'stability';
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
    case 'google':
      return requireEnv('GOOGLE_API_KEY');
    case 'stability':
      return requireEnv('STABILITY_API_KEY');
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
      return !!getOptionalEnv('GOOGLE_API_KEY');
    case 'stability':
      return !!getOptionalEnv('STABILITY_API_KEY');
  }
}

/**
 * Generate images using the catalog-selected OpenAI image slot.
 * Endpoint: POST https://api.openai.com/v1/images/generations
 */
async function generateWithOpenAIImage(
  prompt: string,
  size: string,
  quality: string,
  n: number,
  requestedModelId?: string,
): Promise<{ images: GeneratedImage[]; model: string }> {
  const apiKey = getApiKey('openai');
  const catalogModel = resolveOpenAIImageModel(requestedModelId);
  if (!catalogModel) {
    throw new Error('No active OpenAI image model is configured in the catalog');
  }
  const model = catalogModel.apiModelId ?? catalogModel.id;
  const validSizes = ['1024x1024', '1536x1024', '1024x1536', 'auto'];
  const imageSize = validSizes.includes(size) ? size : '1024x1024';
  const imageQuality = quality === 'hd' ? 'high' : 'medium';

  const response = await fetch('https://api.openai.com/v1/images/generations', {
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
    signal: AbortSignal.timeout(55_000),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const errorObj = errorData['error'] as Record<string, unknown> | undefined;
    const errorMessage =
      (errorObj?.['message'] as string) ||
      `OpenAI image API error: ${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
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
  size: string,
  _style: string | undefined,
  n: number,
  negativePrompt?: string,
  requestedModelId?: string,
): Promise<{ images: GeneratedImage[]; model: string }> {
  const apiKey = getApiKey('google');
  const catalogModel = resolveGoogleImageModel(requestedModelId);
  if (!catalogModel) {
    throw new Error('No active Google image model is configured in the catalog');
  }
  const model = catalogModel.apiModelId ?? catalogModel.id;

  // Parse size to aspect ratio - validate exactly 2 positive integer parts
  const sizeParts = size.split('x').map(Number);
  if (sizeParts.length !== 2 || sizeParts.some((n) => !Number.isFinite(n) || n <= 0)) {
    throw new Error(`Invalid size format: "${size}". Expected format: WxH (e.g. 1024x1024)`);
  }
  const width = sizeParts[0] ?? 1024;
  const height = sizeParts[1] ?? 1024;
  let aspectRatio = '1:1';
  if (width > height) {
    aspectRatio = '16:9';
  } else if (height > width) {
    aspectRatio = '9:16';
  }

  // Google has two distinct image APIs with different request/response shapes:
  //   - imageApi 'gemini' → `:generateContent` with responseModalities; bytes in
  //     candidates[].content.parts[].inlineData.
  //   - imageApi 'imagen' → `:predict`; bytes in predictions[].bytesBase64Encoded.
  // Dispatch on the catalog's declarative imageApi field (no id pattern), so a new
  // Google image model only needs its imageApi set in
  // packages/ai/model-registry/catalog/models.curation.json.
  if (catalogModel.imageApi === 'gemini') {
    return generateWithGeminiImage(apiKey, model, prompt, aspectRatio, n);
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
    const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const errorObj = errorData['error'] as Record<string, unknown> | undefined;
    const errorMessage =
      (errorObj?.['message'] as string) ||
      `Imagen API error: ${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
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
 * Generate an image with a Gemini image model (e.g. gemini-3.1-flash-image-preview,
 * gemini-2.5-flash-image) via the `:generateContent` endpoint. Gemini image models
 * return bytes inline (candidates[].content.parts[].inlineData), not via predict.
 * See https://ai.google.dev/gemini-api/docs/image-generation
 */
async function generateWithGeminiImage(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: string,
  n: number,
): Promise<{ images: GeneratedImage[]; model: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio },
        },
      }),
      signal: AbortSignal.timeout(55_000),
    },
  );

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const errorObj = errorData['error'] as Record<string, unknown> | undefined;
    const errorMessage =
      (errorObj?.['message'] as string) ||
      `Gemini image API error: ${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
  };

  const images: GeneratedImage[] = [];
  for (const candidate of data.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const b64 = part.inlineData?.data;
      if (b64) {
        images.push({ b64_json: b64 });
        if (images.length >= Math.min(n, 4)) break;
      }
    }
  }

  if (images.length === 0) {
    throw new Error('Gemini image API returned no image data (response may have been text-only)');
  }

  return { images, model };
}

/**
 * Generate image using Stability AI Stable Image Core (v2beta)
 * Endpoint: POST https://api.stability.ai/v2beta/stable-image/generate/core
 *
 * The v2beta API uses multipart/form-data and returns binary image data.
 *
 * Valid aspect_ratio values: 16:9, 1:1, 21:9, 2:3, 3:2, 4:5, 5:4, 9:16, 9:21
 */
async function generateWithStability(
  prompt: string,
  size: string,
  style: string | undefined,
  n: number,
  negativePrompt?: string,
  requestedModelId?: string,
): Promise<{ images: GeneratedImage[]; model: string }> {
  const apiKey = getApiKey('stability');
  const catalogModel = resolveStabilityImageModel(requestedModelId);
  if (!catalogModel) {
    throw new Error('No active Stability image model is configured in the catalog');
  }

  // Map size to closest supported aspect_ratio
  const sizeParts = size.split('x').map(Number);
  const sWidth = sizeParts[0] ?? 1024;
  const sHeight = sizeParts[1] ?? 1024;
  let aspectRatio = '1:1';
  if (sWidth > sHeight) {
    // landscape
    const ratio = sWidth / sHeight;
    if (ratio >= 1.7) {
      aspectRatio = '16:9';
    } else if (ratio >= 1.4) {
      aspectRatio = '3:2';
    } else if (ratio >= 1.2) {
      aspectRatio = '5:4';
    } else {
      aspectRatio = '4:5';
    }
  } else if (sHeight > sWidth) {
    // portrait
    const ratio = sHeight / sWidth;
    if (ratio >= 1.7) {
      aspectRatio = '9:16';
    } else if (ratio >= 1.4) {
      aspectRatio = '2:3';
    } else if (ratio >= 1.2) {
      aspectRatio = '4:5';
    } else {
      aspectRatio = '5:4';
    }
  }

  // Map style to Stability style preset
  const stylePresetMap: Record<string, string> = {
    cinematic: 'cinematic',
    anime: 'anime',
    'digital-art': 'digital-art',
    photographic: 'photographic',
    natural: 'photographic',
    vivid: 'enhance',
  };
  const stylePreset = style ? stylePresetMap[style] : undefined;

  // The v2beta API uses multipart/form-data and returns binary or base64
  // We request base64 via Accept: application/json
  const images: GeneratedImage[] = [];
  const requestCount = Math.min(n, 4);

  for (let i = 0; i < requestCount; i++) {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('aspect_ratio', aspectRatio);
    formData.append('output_format', 'png');
    if (negativePrompt) {
      formData.append('negative_prompt', negativePrompt);
    }
    if (stylePreset) {
      formData.append('style_preset', stylePreset);
    }

    const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // Accept application/json to get base64-encoded image back
        Accept: 'application/json',
      },
      body: formData,
      signal: AbortSignal.timeout(55_000),
    });

    if (!response.ok) {
      // v2beta returns JSON errors
      const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const errorMessage =
        (errorData['message'] as string) ||
        (errorData['errors'] as string[] | undefined)?.[0] ||
        `Stability API error: ${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const data = (await response.json()) as { image?: string; finish_reason?: string };
    if (data.image) {
      images.push({ b64_json: data.image });
    }
  }

  return {
    images,
    model: catalogModel.apiModelId ?? catalogModel.id,
  };
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
    provider: requestedProvider,
    model: requestedModel,
    size,
    style,
    quality,
    n,
    negative_prompt,
  } = validationResult.data;

  // Determine provider
  let provider: ImageProvider;
  try {
    if (requestedProvider) {
      if (!isProviderAvailable(requestedProvider)) {
        return NextResponse.json(
          {
            error: {
              message: `The ${requestedProvider} provider is not configured. Please try a different provider.`,
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
      provider = requestedProvider;
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

  const estimatedCostCents = estimateImageCostCents(provider, n, quality, catalogModel.id);
  let reservation: ManagedUsageRequestReservation;
  let sourceSurface: 'web' | 'mobile' | 'desktop';
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
    if (scoped.userId !== userId) {
      throw new ManagedUsageRequestError('Managed usage tenant mismatch.', 403, 'tenant_mismatch');
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
        style,
        n,
      },
      'Starting image generation',
    );
    await markManagedUsageProviderStarted(reservation);

    switch (provider) {
      case 'openai':
        result = await generateWithOpenAIImage(prompt, size, quality, n, catalogModel.id);
        break;
      case 'google':
        result = await generateWithImagen(prompt, size, style, n, negative_prompt, catalogModel.id);
        break;
      case 'stability':
        result = await generateWithStability(
          prompt,
          size,
          style,
          n,
          negative_prompt,
          catalogModel.id,
        );
        break;
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

    const errorMessage = error instanceof Error ? error.message : 'Image generation failed';

    // Provide user-friendly messages for common failure patterns
    let friendlyMessage = `Provider ${provider} failed: ${errorMessage}`;
    if (errorMessage.includes('content policy') || errorMessage.includes('safety')) {
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
        'The image generation request timed out. Please try again - image generation can take up to 30 seconds.';
    }

    return NextResponse.json(
      {
        success: false,
        error: friendlyMessage,
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

  // Persist each generated image to durable storage + the user-scoped media_assets
  // catalog, so it survives a refresh and appears in the Library across every cloud
  // surface. Best-effort: a storage/DB failure must NOT fail an already-billed
  // generation, so on error we keep the original inline payload.
  if (isMediaStorageConfigured()) {
    await Promise.all(
      result.images.map(async (img, idx) => {
        try {
          let bytes: Buffer | null = null;
          let contentType = 'image/png';
          if (img.b64_json) {
            bytes = bytesFromBase64(img.b64_json);
          } else if (img.url) {
            const fetched = await bytesFromUrl(img.url);
            bytes = fetched.data;
            contentType = fetched.contentType;
          }
          if (!bytes) return;

          const stored = await storeMedia({ userId, kind: 'image', data: bytes, contentType });
          await insertMediaAsset({
            userId,
            kind: 'image',
            mimeType: contentType,
            byteSize: stored.byteSize,
            storageUrl: stored.url,
            storagePathname: stored.pathname,
            prompt,
            provider,
            model: result.model,
            sourceSurface: 'web',
          });
          // Hand the client the durable URL (slimmer payload, survives refresh).
          result.images[idx] = { url: stored.url };
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), userId, idx },
            'Failed to persist generated image; returning it inline',
          );
        }
      }),
    );
  }

  const response: ImageGenerationResponse = {
    success: true,
    images: result.images,
    provider,
    model: result.model,
    latency_ms: Date.now() - startTime,
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
