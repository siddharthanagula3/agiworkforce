import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireEnv, getOptionalEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { CreditService } from '@/lib/services/credit-service';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { randomUUID } from 'crypto';

/**
 * Image Generation API
 * Endpoint: POST /api/media/image/generate
 *
 * This provides a unified interface for image generation using multiple providers:
 * - Google Imagen 4 (default if GOOGLE_API_KEY is set)
 * - OpenAI DALL-E 3
 * - Stability AI Stable Image Core (v2beta)
 *
 * Users authenticate with their Supabase JWT and must have an active subscription.
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
      // DALL-E sizes
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

// Cost estimates in cents (rough estimates based on public pricing)
const COST_ESTIMATES: Record<ImageProvider, Record<string, number>> = {
  openai: {
    'dall-e-3': 4, // $0.04 per image (1024x1024 standard)
    'dall-e-3-hd': 8, // $0.08 per image (1024x1024 HD)
  },
  google: {
    // Imagen 4 pricing (estimated, similar to Imagen 3)
    'imagen-4.0-generate-001': 3, // $0.03 per image (estimated)
    'imagen-4.0-fast-generate-001': 2, // $0.02 per image (estimated, fast variant)
  },
  stability: {
    // Stable Image Core: 3 credits = ~$0.03
    'stable-image-core': 3,
    // Stable Image Ultra: 8 credits = ~$0.08
    'stable-image-ultra': 8,
  },
};

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
 * Generate image using OpenAI DALL-E 3
 * Endpoint: POST https://api.openai.com/v1/images/generations
 * DALL-E 3 only supports n=1 per call; we loop for multiple images.
 */
async function generateWithDallE(
  prompt: string,
  size: string,
  style: string | undefined,
  quality: string,
  n: number,
): Promise<{ images: GeneratedImage[]; model: string }> {
  const apiKey = getApiKey('openai');

  // DALL-E 3 only supports 1024x1024, 1792x1024, or 1024x1792
  const validSizes = ['1024x1024', '1792x1024', '1024x1792'];
  const dalleSize = validSizes.includes(size) ? size : '1024x1024';

  // DALL-E 3 only supports n=1 per request; loop for more images
  const images: GeneratedImage[] = [];
  const requestCount = Math.min(n, 4);

  for (let i = 0; i < requestCount; i++) {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        size: dalleSize,
        quality,
        style: style === 'vivid' ? 'vivid' : 'natural',
        n: 1,
        response_format: 'url',
      }),
      // Node.js fetch signal for per-request timeout (55s to stay inside maxDuration)
      signal: AbortSignal.timeout(55_000),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const errorObj = errorData['error'] as Record<string, unknown> | undefined;
      const errorMessage =
        (errorObj?.['message'] as string) ||
        `DALL-E API error: ${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const data = (await response.json()) as { data?: Array<{ url?: string }> };
    if (data.data && data.data.length > 0) {
      images.push({ url: data.data[0]?.url });
    }
  }

  return {
    images,
    model: quality === 'hd' ? 'dall-e-3-hd' : 'dall-e-3',
  };
}

/**
 * Generate image using Google Imagen 4
 * Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predict
 *
 * Imagen 3 (imagen-3.0-generate-001) was shut down; now using Imagen 4.
 * Model: imagen-4.0-generate-001 (GA, released 2025)
 */
async function generateWithImagen(
  prompt: string,
  size: string,
  _style: string | undefined,
  n: number,
  negativePrompt?: string,
): Promise<{ images: GeneratedImage[]; model: string }> {
  const apiKey = getApiKey('google');
  const model = 'imagen-4.0-generate-001';

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

  // Authentication - validate Bearer token format to reject malformed/injected values
  const authHeader = request.headers.get('authorization');
  const bearerMatch = authHeader?.match(/^Bearer\s+([\w\-.~+/]+=*)$/i);
  if (!bearerMatch) {
    return NextResponse.json(
      {
        error: {
          message: 'Missing or invalid authorization header',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
      {
        status: 401,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const token = bearerMatch[1];

  // Verify user with Supabase
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, flowType: 'pkce' },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid authentication token',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
      {
        status: 401,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  // Check subscription
  const subscription = await SubscriptionService.getSubscription(user.id);

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
  const providerCostMap = COST_ESTIMATES[provider];
  const maxProviderCost = Math.max(...Object.values(providerCostMap));
  const estimatedCostCents = maxProviderCost * n;

  // Check credits BEFORE invoking the provider (402 if insufficient)
  const hasCredits = await CreditService.checkAvailable(user.id, estimatedCostCents);
  if (!hasCredits) {
    const balance = await CreditService.getBalance(user.id);
    logger.warn(
      { userId: user.id, estimatedCostCents, balance },
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
  const reservationKey = CreditService.generateIdempotencyKey(user.id, 'reservation', requestId);
  const reserveResult = await CreditService.deductCredits(
    user.id,
    estimatedCostCents,
    `Credit reservation: image generation (${provider})`,
    { provider, type: 'reservation', requestId, imageCount: n },
    reservationKey,
  );

  if (!reserveResult.success) {
    logger.warn(
      { userId: user.id, estimatedCostCents, reserveResult },
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
        userId: user.id,
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
        result = await generateWithDallE(prompt, size, style, quality, n);
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
        userId: user.id,
        provider,
        model: result.model,
        imageCount: result.images.length,
      },
      'Image generation completed',
    );
  } catch (error) {
    // Refund the reserved credits on generation failure
    const refundKey = CreditService.generateIdempotencyKey(user.id, 'refund', requestId);
    await CreditService.deductCredits(
      user.id,
      -estimatedCostCents,
      `Refund: image generation failed (${provider})`,
      { provider, type: 'refund', reason: 'generation_failure', requestId },
      refundKey,
    );

    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id,
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
  const actualBaseCost = providerCostMap[result.model] ?? 3;
  const costEstimate = actualBaseCost * result.images.length;
  const costDifference = costEstimate - estimatedCostCents;

  if (costDifference !== 0) {
    // Adjust credits: positive diff = additional charge, negative = refund
    const reconciliationKey = CreditService.generateIdempotencyKey(
      user.id,
      'reconciliation',
      requestId,
    );
    await CreditService.deductCredits(
      user.id,
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
    { userId: user.id, provider, model: result.model, costEstimate, estimatedCostCents },
    'Image generation credits deducted',
  );

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
