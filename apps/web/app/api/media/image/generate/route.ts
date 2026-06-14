import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOptionalEnv, requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { CreditService } from '@/lib/services/credit-service';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { buildManagedComputeGateResponse } from '@/lib/managed-compute-gate';
import { randomUUID } from 'crypto';
import {
  getModelMetadataById,
  getModelsForProvider,
  getRoutingSlotModel,
} from '@agiworkforce/types';
import {
  isMediaStorageConfigured,
  storeMedia,
  bytesFromBase64,
  bytesFromUrl,
} from '@/lib/server/media-storage';
import { insertMediaAsset } from '@/lib/server/media-assets';

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

// Supported providers
type ImageProvider = 'google' | 'openai' | 'stability';

// Request schema
const ImageGenerationRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  provider: z.enum(['google', 'openai', 'stability']).optional(),
  size: z
    .enum([
      // Common sizes
      '1024x1024',
      '1792x1024',
      '1024x1792',
      // GPT Image sizes
      '512x512',
      '256x256',
      // Stability/Imagen additional sizes
      '768x768',
      '1536x1536',
    ])
    .optional()
    .default('1024x1024'),
  style: z
    .enum(['natural', 'vivid', 'cinematic', 'anime', 'digital-art', 'photographic'])
    .optional(),
  n: z.number().int().min(1).max(4).optional().default(1),
  // Provider-specific options
  quality: z.enum(['standard', 'hd']).optional().default('standard'),
  negative_prompt: z.string().max(2000).optional(),
});

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
  cost_estimate: number;
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

function resolveGoogleImageModel() {
  const googleImageModels = getModelsForProvider('google', {
    includeDeprecated: false,
    modelTypes: ['image'],
  });

  return (
    googleImageModels.find((model) => model.qualityTier === 'balanced') ??
    googleImageModels[0] ??
    null
  );
}

function estimateImageCostCents(
  provider: ImageProvider,
  imageCount: number,
  quality: string | undefined,
): number {
  if (provider === 'openai') {
    const qualityKey = quality === 'hd' ? 'high' : 'medium';
    return OPENAI_IMAGE_ESTIMATE_CENTS_BY_QUALITY[qualityKey] * imageCount;
  }

  if (provider === 'google') {
    const perImageUsd = resolveGoogleImageModel()?.imagePerImageCost;
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
): Promise<{ images: GeneratedImage[]; model: string }> {
  const apiKey = getApiKey('openai');
  const catalogModelId = getRoutingSlotModel('image_generation');
  const model = getModelMetadataById(catalogModelId)?.apiModelId ?? catalogModelId;
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
): Promise<{ images: GeneratedImage[]; model: string }> {
  const apiKey = getApiKey('google');
  const catalogModel = resolveGoogleImageModel();
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
 * Generate image using Stability AI Stable Image Core (v2beta)
 * Endpoint: POST https://api.stability.ai/v2beta/stable-image/generate/core
 *
 * The old v1 SDXL endpoint (stable-diffusion-xl-1024-v1-0) is deprecated.
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
): Promise<{ images: GeneratedImage[]; model: string }> {
  const apiKey = getApiKey('stability');

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
    model: 'stable-image-core',
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

  // Image generation requires Pro or higher tier
  const allowedTiers = new Set(['pro', 'max', 'enterprise', 'team']);
  const userTier = subscription.plan_tier?.toLowerCase() || 'free';
  if (!allowedTiers.has(userTier)) {
    return NextResponse.json(
      {
        error: {
          message:
            'Image generation is available on Pro, Max, and Enterprise plans. Upgrade your plan to unlock AI-powered image creation.',
          type: 'invalid_request_error',
          code: 'plan_upgrade_required',
          current_plan: userTier,
          required_plans: ['pro', 'max', 'enterprise'],
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
  const validationResult = ImageGenerationRequestSchema.safeParse(body);
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

  // Pre-calculate conservative cost estimate for credit pre-check.
  // We use the per-image cost for the chosen provider * requested image count.
  // The model isn't determined until after generation, so we use the most expensive
  // model for the provider as the upper bound estimate.
  const estimatedCostCents = estimateImageCostCents(provider, n, quality);

  // Check credits BEFORE invoking the provider (402 if insufficient)
  const hasCredits = await CreditService.checkAvailable(userId, estimatedCostCents);
  if (!hasCredits) {
    const balance = await CreditService.getBalance(userId);
    logger.warn(
      { userId: userId, estimatedCostCents, balance },
      'Insufficient credits for image generation',
    );
    return NextResponse.json(
      {
        error: {
          message:
            'Insufficient credits for image generation. Please upgrade your plan or add credits.',
          type: 'insufficient_quota',
          code: 'insufficient_credits',
          credits_required: estimatedCostCents,
          credits_remaining: balance?.credits_remaining_cents ?? 0,
        },
      },
      {
        status: 402,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  // Reserve credits before generation to prevent race conditions
  const requestId = randomUUID();
  const reservationKey = CreditService.generateIdempotencyKey(userId, 'reservation', requestId);
  const reserveResult = await CreditService.deductCredits(
    userId,
    estimatedCostCents,
    `Credit reservation: image generation (${provider})`,
    { provider, type: 'reservation', requestId, imageCount: n },
    reservationKey,
  );

  if (!reserveResult.success) {
    logger.warn(
      { userId: userId, estimatedCostCents, reserveResult },
      'Failed to reserve image credits',
    );
    return NextResponse.json(
      {
        error: {
          message: 'Insufficient credits for image generation.',
          type: 'insufficient_quota',
          code: reserveResult.code ?? 'insufficient_credits',
        },
      },
      {
        status: 402,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
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

    switch (provider) {
      case 'openai':
        result = await generateWithOpenAIImage(prompt, size, quality, n);
        break;
      case 'google':
        result = await generateWithImagen(prompt, size, style, n, negative_prompt);
        break;
      case 'stability':
        result = await generateWithStability(prompt, size, style, n, negative_prompt);
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
    // Refund the reserved credits on generation failure
    const refundKey = CreditService.generateIdempotencyKey(userId, 'refund', requestId);
    await CreditService.deductCredits(
      userId,
      -estimatedCostCents,
      `Refund: image generation failed (${provider})`,
      { provider, type: 'refund', reason: 'generation_failure', requestId },
      refundKey,
    );

    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        userId: userId,
        provider,
      },
      'Image generation failed - credits refunded',
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
        cost_estimate: 0,
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

  // Calculate actual cost and reconcile with the reservation
  const costEstimate = estimateImageCostCents(provider, result.images.length, quality);
  const costDifference = costEstimate - estimatedCostCents;

  if (costDifference !== 0) {
    // Adjust credits: positive diff = additional charge, negative = refund
    const reconciliationKey = CreditService.generateIdempotencyKey(
      userId,
      'reconciliation',
      requestId,
    );
    await CreditService.deductCredits(
      userId,
      costDifference,
      costDifference > 0
        ? `Additional charge: image generation (${provider}/${result.model})`
        : `Credit adjustment: image generation (${provider}/${result.model})`,
      {
        provider,
        model: result.model,
        type: 'reconciliation',
        estimatedCostCents,
        actualCostCents: costEstimate,
        requestId,
      },
      reconciliationKey,
    );
  }

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
    cost_estimate: costEstimate,
    latency_ms: Date.now() - startTime,
  };

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
