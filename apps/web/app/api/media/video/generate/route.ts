import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';

/**
 * Video Generation API
 * Endpoint: POST /api/media/video/generate
 *
 * Proxies video generation requests to Runway (Gen4 Turbo) or Google Veo3.
 * Video generation is async — this endpoint creates a task and returns a task_id
 * for polling via GET /api/media/video/status?task_id=xxx.
 *
 * Requires Pro or Max subscription tier.
 */

// Next.js route configuration — video task creation can take up to 30s
// (the actual generation is async, so we just need time for the task-creation call).
export const maxDuration = 60;
export const runtime = 'nodejs';

// Request validation schema
const VideoGenerationRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  duration_secs: z.number().int().min(2).max(10).optional().default(5),
  resolution: z.enum(['720p', '1080p', '4k']).optional().default('720p'),
  provider: z.enum(['runway', 'google']).optional(),
});

// Provider type
type VideoProvider = 'runway' | 'google';

// Response types
interface VideoGenerationResponse {
  success: boolean;
  task_id: string;
  status: 'queued' | 'processing';
  provider: VideoProvider;
  estimated_duration_secs: number;
}

// Runway task creation response
interface RunwayTaskResponse {
  id: string;
  status?: string;
  createdAt?: string;
  failure?: string;
  failureCode?: string;
}

// Google Veo long-running operation response
interface GoogleVeoResponse {
  name: string;
  metadata?: {
    '@type': string;
    state?: string;
  };
  done?: boolean;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Determine which provider to use
 */
function getVideoProvider(requestedProvider?: VideoProvider): VideoProvider {
  if (requestedProvider === 'runway' && process.env['RUNWAY_API_KEY']) {
    return 'runway';
  }
  if (requestedProvider === 'google' && process.env['GOOGLE_API_KEY']) {
    return 'google';
  }

  // Default: Runway if available, else Google Veo
  if (process.env['RUNWAY_API_KEY']) {
    return 'runway';
  }
  if (process.env['GOOGLE_API_KEY']) {
    return 'google';
  }

  throw createError.serviceUnavailable(
    'No video generation provider configured. Please contact support.',
  );
}

/**
 * Generate video using Runway Gen4 Turbo API (text-to-video)
 *
 * API reference: https://docs.dev.runwayml.com/api/
 * Base URL: https://api.dev.runwayml.com/v1/
 * Endpoint: POST /v1/text_to_video
 * Auth: Authorization: Bearer {RUNWAY_API_KEY}
 * Required header: X-Runway-Version: 2024-11-06
 *
 * Model: gen4_turbo (supports text-to-video without an image)
 * Duration: 2–10 seconds (integer)
 * Task status: GET /v1/tasks/{id}
 */
async function generateWithRunway(
  prompt: string,
  durationSecs: number,
  resolution: string,
): Promise<{ taskId: string; estimatedDuration: number }> {
  const apiKey = process.env['RUNWAY_API_KEY'];
  if (!apiKey) {
    throw createError.serviceUnavailable('Runway API not configured');
  }

  // Map resolution to Runway ratio — Gen4 supports 16:9 and 9:16
  // 4K is not yet available; fall back to 1080p
  const ratio = resolution === '9:16' ? '9:16' : '16:9';
  const clampedDuration = Math.max(2, Math.min(durationSecs, 10));

  const response = await fetch('https://api.dev.runwayml.com/v1/text_to_video', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      model: 'gen4_turbo',
      promptText: prompt,
      duration: clampedDuration,
      ratio,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, error: errorText }, 'Runway API error');

    if (response.status === 401) {
      throw createError.serviceUnavailable('Video generation service authentication failed');
    }
    if (response.status === 429) {
      throw createError.rateLimit('Video generation rate limit reached. Please try again later.');
    }
    if (response.status === 402) {
      throw createError.serviceUnavailable('Video generation quota exceeded');
    }

    throw createError.internal('Failed to start video generation');
  }

  const result = (await response.json()) as RunwayTaskResponse;

  if (!result.id) {
    logger.error({ result }, 'Runway API returned no task ID');
    throw createError.internal('Failed to start video generation: no task ID returned');
  }

  // Estimated wait: ~60s base + 10s per second of video
  const estimatedDuration = 60 + clampedDuration * 10;

  return {
    taskId: `runway_${result.id}`,
    estimatedDuration,
  };
}

/**
 * Generate video using Google Veo via Gemini API (async long-running operation)
 *
 * API reference: https://ai.google.dev/gemini-api/docs/video
 * Base URL: https://generativelanguage.googleapis.com/v1beta
 * Endpoint: POST /models/{model}:predictLongRunning
 * Auth: x-goog-api-key header
 *
 * Current model (as of 2025-10): veo-3.1-generate-preview
 *   - Previous model veo-2.0-generate-001 is outdated
 * Duration: "4", "6", or "8" (string seconds — Veo does not accept arbitrary integers)
 * Polling: GET /v1beta/{operation_name} until done === true
 */
async function generateWithGoogleVeo(
  prompt: string,
  durationSecs: number,
  resolution: string,
): Promise<{ taskId: string; estimatedDuration: number }> {
  const apiKey = process.env['GOOGLE_API_KEY'];
  if (!apiKey) {
    throw createError.serviceUnavailable('Google Veo API not configured');
  }

  // Veo 3.1 supports 4, 6, or 8 seconds; clamp to nearest valid value
  type VeoDuration = 4 | 6 | 8;
  let veoDuration: VeoDuration;
  if (durationSecs <= 4) {
    veoDuration = 4;
  } else if (durationSecs <= 6) {
    veoDuration = 6;
  } else {
    veoDuration = 8;
  }

  // Map resolution; Veo supports 720p, 1080p, 4k
  let veoResolution: string;
  if (resolution === '4k') {
    veoResolution = '4k';
  } else if (resolution === '1080p') {
    veoResolution = '1080p';
  } else {
    veoResolution = '720p';
  }

  const model = 'veo-3.1-generate-preview';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      instances: [
        {
          prompt,
        },
      ],
      parameters: {
        aspectRatio: '16:9',
        durationSeconds: String(veoDuration),
        resolution: veoResolution,
        numberOfVideos: 1,
        enhancePrompt: true,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, error: errorText }, 'Google Veo API error');

    if (response.status === 401 || response.status === 403) {
      throw createError.serviceUnavailable('Video generation service authentication failed');
    }
    if (response.status === 429) {
      throw createError.rateLimit('Video generation rate limit reached. Please try again later.');
    }
    if (response.status === 400) {
      try {
        const errorJson = JSON.parse(errorText) as { error?: { message?: string } };
        if (errorJson.error?.message?.includes('safety')) {
          throw createError.validation(
            'Your prompt was flagged by content safety filters. Please revise and try again.',
          );
        }
      } catch (parseErr) {
        // Re-throw only if it is an AppError from createError
        if (parseErr && typeof parseErr === 'object' && 'statusCode' in parseErr) {
          throw parseErr;
        }
      }
      throw createError.validation('Invalid video generation request');
    }

    throw createError.internal('Failed to start video generation');
  }

  const result = (await response.json()) as GoogleVeoResponse;

  if (!result.name) {
    logger.error({ result }, 'Google Veo API returned no operation name');
    throw createError.internal('Failed to start video generation: no operation name returned');
  }

  // Operation name format: "operations/{id}" — extract the ID portion for storage
  const operationId = result.name.split('/').pop() || result.name;

  // Estimated wait: ~90s base + 15s per second of video
  const estimatedDuration = 90 + veoDuration * 15;

  return {
    taskId: `google_${operationId}`,
    estimatedDuration,
  };
}

/**
 * Main handler for video generation
 */
async function handleVideoGeneration(request: NextRequest): Promise<NextResponse> {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Rate limiting: Video generation is expensive; use strict limits
  const rateLimitResponse = await withRateLimit(request, 'video-generation');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Authentication via Bearer token
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createError.unauthorized('Missing or invalid authorization header');
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
    logger.warn({ error: authError }, 'Video generation auth failed');
    throw createError.unauthorized('Invalid authentication token');
  }

  // Get subscription and check tier
  const subscription = await SubscriptionService.getSubscription(user.id);

  if (!subscription) {
    throw createError.forbidden(
      'No active subscription found. Please subscribe to use video generation.',
    );
  }

  const activeStatuses = new Set(['active', 'trialing']);
  if (!activeStatuses.has(subscription.status)) {
    throw createError.forbidden(
      `Subscription is ${subscription.status}. Please update your payment method.`,
    );
  }

  // Video generation requires Pro or Max tier
  const allowedTiers = new Set(['pro', 'max', 'enterprise', 'team']);
  const userTier = subscription.plan_tier?.toLowerCase() || 'free';
  if (!allowedTiers.has(userTier)) {
    throw createError.forbidden(
      'Video generation is available on Pro, Max, and Enterprise plans. Upgrade your plan to unlock AI-powered video creation.',
    );
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const validationResult = VideoGenerationRequestSchema.safeParse(body);
  if (!validationResult.success) {
    const errorMessage = validationResult.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw createError.validation(`Invalid request: ${errorMessage}`);
  }

  const { prompt, duration_secs, resolution, provider: requestedProvider } = validationResult.data;

  // Determine provider
  const provider = getVideoProvider(requestedProvider);

  logger.info(
    {
      userId: user.id,
      provider,
      durationSecs: duration_secs,
      resolution,
      promptLength: prompt.length,
    },
    'Starting video generation task',
  );

  // Create video generation task based on provider
  let taskId: string;
  let estimatedDuration: number;

  try {
    if (provider === 'runway') {
      const result = await generateWithRunway(prompt, duration_secs, resolution);
      taskId = result.taskId;
      estimatedDuration = result.estimatedDuration;
    } else {
      const result = await generateWithGoogleVeo(prompt, duration_secs, resolution);
      taskId = result.taskId;
      estimatedDuration = result.estimatedDuration;
    }
  } catch (error) {
    // Re-throw AppError instances (from createError.*)
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    logger.error({ error, provider }, 'Video generation task creation failed');
    throw createError.internal('Failed to start video generation. Please try again.');
  }

  // TODO: [H33] Store { task_id, user_id } mapping in Redis/Supabase for ownership verification
  // so that GET /api/media/video/status can verify the requesting user owns this task.

  const response: VideoGenerationResponse = {
    success: true,
    task_id: taskId,
    status: 'queued',
    provider,
    estimated_duration_secs: estimatedDuration,
  };

  logger.info(
    {
      userId: user.id,
      taskId,
      provider,
      estimatedDuration,
    },
    'Video generation task created',
  );

  return NextResponse.json(response, {
    headers: {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  });
}

export const POST = withErrorHandler(handleVideoGeneration);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
