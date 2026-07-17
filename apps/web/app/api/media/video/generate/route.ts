import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedMediaVideoGenerationRequestSchema,
  type ManagedMediaVideoProvider,
  type ManagedMediaVideoResolution,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import {
  getModelMetadataById,
  getProviderDefaultModel,
  getRoutingSlotModel,
  isModelLive,
  type ModelMetadata,
} from '@agiworkforce/types';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { CreditService } from '@/lib/services/credit-service';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { buildManagedComputeGateResponse } from '@/lib/managed-compute-gate';
import { storeVideoTask } from '@/lib/video-task-store';
import { randomUUID } from 'crypto';

/**
 * Video Generation API
 * Endpoint: POST /api/media/video/generate
 *
 * Proxies video generation requests to Runway (Gen4 Turbo) or Google Veo3.
 * Video generation is async - this endpoint creates a task and returns a task_id
 * for polling via GET /api/media/video/status?task_id=xxx.
 *
 * Requires Pro or Max subscription tier.
 */

// Next.js route configuration - video task creation can take up to 30s
// (the actual generation is async, so we just need time for the task-creation call).
export const maxDuration = 60;
export const runtime = 'nodejs';

// Provider type
type VideoProvider = ManagedMediaVideoProvider;
type VideoResolution = ManagedMediaVideoResolution;

// Response types
interface VideoGenerationResponse {
  success: boolean;
  task_id: string;
  status: 'queued' | 'processing';
  provider: VideoProvider;
  model: string;
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

  // Default to the provider assigned to the canonical video slot, then fall
  // back to the other configured adapter. Provider preference is product
  // policy and must not be duplicated in this route.
  const slotProvider = getModelMetadataById(getRoutingSlotModel('video_generation'))?.provider;
  if (slotProvider === 'google' && process.env['GOOGLE_API_KEY']) return 'google';
  if (slotProvider === 'runway' && process.env['RUNWAY_API_KEY']) return 'runway';
  if (process.env['GOOGLE_API_KEY']) return 'google';
  if (process.env['RUNWAY_API_KEY']) return 'runway';

  throw createError.serviceUnavailable(
    'No video generation provider configured. Please contact support.',
  );
}

function resolveVideoModel(
  requestedProvider?: VideoProvider,
  requestedModelId?: string,
): { provider: VideoProvider; model: ModelMetadata } {
  if (requestedModelId) {
    const requestedModel = getModelMetadataById(requestedModelId);
    if (!requestedModel || requestedModel.modelType !== 'video' || !isModelLive(requestedModel)) {
      throw createError.validation(`Unknown or unavailable video model: ${requestedModelId}`);
    }
    if (requestedModel.provider !== 'google' && requestedModel.provider !== 'runway') {
      throw createError.validation(`Video model ${requestedModelId} has no executable provider`);
    }
    if (requestedProvider && requestedProvider !== requestedModel.provider) {
      throw createError.validation(
        `Video model ${requestedModel.id} belongs to ${requestedModel.provider}, not ${requestedProvider}`,
      );
    }

    const provider = getVideoProvider(requestedModel.provider);
    return { provider, model: requestedModel };
  }

  const provider = getVideoProvider(requestedProvider);
  const slotModelId = getRoutingSlotModel('video_generation');
  const slotModel = getModelMetadataById(slotModelId);
  const defaultModelId =
    slotModel?.provider === provider ? slotModelId : getProviderDefaultModel(provider);
  const model = defaultModelId ? getModelMetadataById(defaultModelId) : null;
  if (!model || model.modelType !== 'video' || model.provider !== provider || !isModelLive(model)) {
    throw createError.serviceUnavailable(`No live ${provider} video model is configured`);
  }
  return { provider, model };
}

function normalizeBillableDuration(
  provider: VideoProvider,
  requestedDuration: number,
  resolution: VideoResolution,
): number {
  if (provider === 'runway') return Math.max(2, Math.min(requestedDuration, 10));
  if (resolution === '1080p' || resolution === '4k') return 8;
  if (requestedDuration <= 4) return 4;
  if (requestedDuration <= 6) return 6;
  return 8;
}

function getVideoCostCents(
  model: ModelMetadata,
  resolution: VideoResolution,
  durationSecs: number,
): number {
  const resolutionPrices = model.videoPerSecondCostByResolution;
  const pricePerSecond = resolutionPrices ? resolutionPrices[resolution] : model.videoPerSecondCost;
  if (pricePerSecond === undefined) {
    if (resolutionPrices) {
      throw createError.validation(`${model.name} does not support ${resolution} output`);
    }
    throw createError.serviceUnavailable(`Pricing is not configured for ${model.name}`);
  }
  // Normalize binary floating-point noise before rounding up to whole cents
  // (for example, 0.40 * 6 * 100 must reserve 240, not 241).
  return Math.ceil(Number((pricePerSecond * durationSecs * 100).toFixed(8)));
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
  model: ModelMetadata,
): Promise<{ taskId: string; estimatedDuration: number }> {
  const apiKey = process.env['RUNWAY_API_KEY'];
  if (!apiKey) {
    throw createError.serviceUnavailable('Runway API not configured');
  }

  // Map resolution to Runway ratio - Gen4 supports 16:9 and 9:16
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
      model: model.apiModelId ?? model.id,
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
 * Model selection is resolved from the shared catalog's video-generation slot.
 * Duration: "4", "6", or "8" (string seconds - Veo does not accept arbitrary integers)
 * Polling: GET /v1beta/{operation_name} until done === true
 */
async function generateWithGoogleVeo(
  prompt: string,
  durationSecs: 4 | 6 | 8,
  resolution: VideoResolution,
  model: ModelMetadata,
): Promise<{ taskId: string; estimatedDuration: number }> {
  const apiKey = process.env['GOOGLE_API_KEY'];
  if (!apiKey) {
    throw createError.serviceUnavailable('Google Veo API not configured');
  }

  const providerModelId = model.apiModelId ?? model.id;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${providerModelId}:predictLongRunning`;

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
        durationSeconds: String(durationSecs),
        resolution,
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

  // Operation name format: "operations/{id}" - extract the ID portion for storage
  const operationId = result.name.split('/').pop() || result.name;

  // Estimated wait: ~90s base + 15s per second of video
  const estimatedDuration = 90 + durationSecs * 15;

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

  // Authentication
  const { userId } = await getClerkAuthUser(request);

  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    {
      provider: 'managed-media',
      model: 'video-generation',
      feature: 'media_video_generation',
    },
    {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  );
  if (managedGateResponse) return managedGateResponse;

  // Get subscription and check tier
  const subscription = await SubscriptionService.getSubscription(userId);

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

  const validationResult = ManagedMediaVideoGenerationRequestSchema.safeParse(body);
  if (!validationResult.success) {
    const errorMessage = validationResult.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw createError.validation(`Invalid request: ${errorMessage}`);
  }

  const {
    prompt,
    duration_secs,
    resolution,
    provider: requestedProvider,
    model: requestedModelId,
  } = validationResult.data;

  const { provider, model } = resolveVideoModel(requestedProvider, requestedModelId);
  const billableDurationSecs = normalizeBillableDuration(provider, duration_secs, resolution);

  // Cost pre-check: verify the user has enough credits before starting the task
  const estimatedCostCents = getVideoCostCents(model, resolution, billableDurationSecs);
  const hasCredits = await CreditService.checkAvailable(userId, estimatedCostCents);
  if (!hasCredits) {
    const balance = await CreditService.getBalance(userId);
    logger.warn(
      { userId: userId, provider, estimatedCostCents, balance },
      'Insufficient credits for video generation',
    );
    throw createError.forbidden(
      `Insufficient credits for video generation. You need at least ${estimatedCostCents} credits. Please upgrade your plan or add credits.`,
    );
  }

  // Reserve credits before invoking the provider to prevent race conditions
  const requestId = randomUUID();
  const reservationKey = CreditService.generateIdempotencyKey(userId, 'reservation', requestId);
  const reserveResult = await CreditService.deductCredits(
    userId,
    estimatedCostCents,
    `Credit reservation: video generation (${provider})`,
    { provider, model: model.id, type: 'reservation', requestId },
    reservationKey,
  );

  if (!reserveResult.success) {
    logger.warn(
      { userId: userId, estimatedCostCents, reserveResult },
      'Failed to reserve video generation credits',
    );
    throw createError.forbidden(
      `Insufficient credits for video generation (${reserveResult.code ?? 'credit_error'}).`,
    );
  }

  logger.info(
    {
      userId: userId,
      provider,
      model: model.id,
      durationSecs: billableDurationSecs,
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
      const result = await generateWithRunway(prompt, billableDurationSecs, resolution, model);
      taskId = result.taskId;
      estimatedDuration = result.estimatedDuration;
    } else {
      const result = await generateWithGoogleVeo(
        prompt,
        billableDurationSecs as 4 | 6 | 8,
        resolution,
        model,
      );
      taskId = result.taskId;
      estimatedDuration = result.estimatedDuration;
    }
  } catch (error) {
    // Refund the reserved credits since the task was never created
    const refundKey = CreditService.generateIdempotencyKey(userId, 'refund', requestId);
    try {
      await CreditService.settleCreditsDurably({
        userId,
        amountCents: -estimatedCostCents,
        description: `Refund: video generation failed (${provider})`,
        metadata: {
          provider,
          model: model.id,
          type: 'refund',
          reason: 'task_creation_failure',
          requestId,
        },
        idempotencyKey: refundKey,
      });
    } catch (settlementError) {
      logger.error(
        {
          event: 'video_refund_settlement_unrecorded',
          error: settlementError,
          userId,
          provider,
          requestId,
        },
        'Video generation refund could not be persisted',
      );
    }
    logger.warn(
      { userId: userId, provider, requestId },
      'Video task creation failed - credits refunded',
    );

    // Re-throw AppError instances (from createError.*)
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    logger.error({ error, provider }, 'Video generation task creation failed');
    throw createError.internal('Failed to start video generation. Please try again.');
  }

  // Store task_id → user_id mapping in-process memory with TTL for ownership verification.
  // This allows the status endpoint to verify the requesting user owns the task.
  // In a distributed/serverless deployment, replace with Redis or Neon persistence.
  storeVideoTask(taskId, userId);

  logger.info(
    { userId: userId, provider, taskId, estimatedCostCents, requestId },
    'Video generation credits reserved',
  );

  const response: VideoGenerationResponse = {
    success: true,
    task_id: taskId,
    status: 'queued',
    provider,
    model: model.id,
    estimated_duration_secs: estimatedDuration,
  };

  logger.info(
    {
      userId: userId,
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
