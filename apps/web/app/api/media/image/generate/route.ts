import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireEnv, getOptionalEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';

/**
 * Image Generation API
 * Endpoint: POST /api/media/image/generate
 *
 * This provides a unified interface for image generation using multiple providers:
 * - Google Imagen 3 (default if GOOGLE_API_KEY is set)
 * - OpenAI DALL-E 3
 * - Stability AI Stable Diffusion XL
 *
 * Users authenticate with their Supabase JWT and must have an active subscription.
 */

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
  error?: string;
}

// Cost estimates in cents (rough estimates based on public pricing)
const COST_ESTIMATES: Record<ImageProvider, Record<string, number>> = {
  openai: {
    'dall-e-3': 4, // $0.04 per image (1024x1024 standard)
    'dall-e-3-hd': 8, // $0.08 per image (1024x1024 HD)
  },
  google: {
    'imagen-3.0-generate-001': 3, // $0.03 per image (estimated)
  },
  stability: {
    'stable-diffusion-xl-1024-v1-0': 2, // $0.02 per image (estimated)
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

  // DALL-E 3 only supports n=1, need to make multiple requests for more
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
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData.error?.message || `DALL-E API error: ${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (data.data && data.data.length > 0) {
      images.push({ url: data.data[0].url });
    }
  }

  return {
    images,
    model: quality === 'hd' ? 'dall-e-3-hd' : 'dall-e-3',
  };
}

/**
 * Generate image using Google Imagen 3
 */
async function generateWithImagen(
  prompt: string,
  size: string,
  _style: string | undefined,
  n: number,
  negativePrompt?: string,
): Promise<{ images: GeneratedImage[]; model: string }> {
  const apiKey = getApiKey('google');

  // Parse size to aspect ratio
  const [width, height] = size.split('x').map(Number);
  let aspectRatio = '1:1';
  if (width > height) {
    aspectRatio = '16:9';
  } else if (height > width) {
    aspectRatio = '9:16';
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict`,
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
          // personGeneration: 'allow_adult', // Uncomment if needed
        },
      }),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      errorData.error?.message || `Imagen API error: ${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();

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
    model: 'imagen-3.0-generate-001',
  };
}

/**
 * Generate image using Stability AI Stable Diffusion XL
 */
async function generateWithStability(
  prompt: string,
  size: string,
  style: string | undefined,
  n: number,
  negativePrompt?: string,
): Promise<{ images: GeneratedImage[]; model: string }> {
  const apiKey = getApiKey('stability');

  // Parse size
  const [width, height] = size.split('x').map(Number);

  // Stability supports various sizes, default to 1024x1024 if not supported
  const supportedDimensions = [512, 768, 1024, 1536];
  const sdWidth = supportedDimensions.includes(width) ? width : 1024;
  const sdHeight = supportedDimensions.includes(height) ? height : 1024;

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

  const response = await fetch(
    'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        text_prompts: [
          {
            text: prompt,
            weight: 1,
          },
          ...(negativePrompt
            ? [
                {
                  text: negativePrompt,
                  weight: -1,
                },
              ]
            : []),
        ],
        cfg_scale: 7,
        width: sdWidth,
        height: sdHeight,
        samples: Math.min(n, 4),
        steps: 30,
        ...(stylePreset && { style_preset: stylePreset }),
      }),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      errorData.message || `Stability API error: ${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();

  const images: GeneratedImage[] = [];
  if (data.artifacts) {
    for (const artifact of data.artifacts) {
      if (artifact.base64) {
        images.push({ b64_json: artifact.base64 });
      }
    }
  }

  return {
    images,
    model: 'stable-diffusion-xl-1024-v1-0',
  };
}

/**
 * Main handler for image generation
 */
async function handleImageGeneration(request: NextRequest): Promise<NextResponse> {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Rate limiting - use image-generation config (10 req/min, fail-closed)
  const rateLimitResponse = await withRateLimit(request, 'image-generation');
  if (rateLimitResponse) return rateLimitResponse;

  // Authentication
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
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

  const token = authHeader.substring(7);

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
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id,
        provider,
      },
      'Image generation failed',
    );

    // Return user-friendly error messages
    const errorMessage = error instanceof Error ? error.message : 'Image generation failed';

    // Check for common error patterns and provide friendly messages
    let friendlyMessage = errorMessage;
    if (errorMessage.includes('content policy') || errorMessage.includes('safety')) {
      friendlyMessage =
        'Your prompt was flagged by our content safety filters. Please try a different prompt.';
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
      friendlyMessage =
        'The image generation service is temporarily busy. Please try again in a few moments.';
    } else if (errorMessage.includes('billing') || errorMessage.includes('payment')) {
      friendlyMessage =
        'There was a billing issue with the image generation service. Please contact support.';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      friendlyMessage = 'The image generation request timed out. Please try again.';
    }

    return NextResponse.json(
      {
        success: false,
        error: friendlyMessage,
        images: [],
        provider,
        model: 'unknown',
        cost_estimate: 0,
      } satisfies ImageGenerationResponse,
      {
        status: 500,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  // Calculate cost estimate
  const providerCosts = COST_ESTIMATES[provider];
  const baseCost = providerCosts[result.model] || 3; // Default 3 cents
  const costEstimate = baseCost * result.images.length;

  const response: ImageGenerationResponse = {
    success: true,
    images: result.images,
    provider,
    model: result.model,
    cost_estimate: costEstimate,
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
