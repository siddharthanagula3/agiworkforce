import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ManagedMediaVideoGenerationRequestSchema,
  type ManagedMediaVideoAspectRatio,
  type ManagedMediaVideoProvider,
  type ManagedMediaVideoResolution,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { moderateManagedPrompt } from '@/lib/moderation';
import { getClerkAuthUser } from '@/lib/api-auth';
import {
  getModelMetadataById,
  getModels,
  getProviderDefaultModel,
  getRoutingSlotModel,
  isExecutableVideoModel,
  isModelLive,
  canUseBillingPlanCapability,
  calculateCatalogVideoCostCents,
  resolveVideoGenerationOutputSize,
  type ModelMetadata,
} from '@agiworkforce/types';
import { parseManagedMediaIdempotencyKey } from '@agiworkforce/utils';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { buildManagedComputeGateResponse } from '@/lib/managed-compute-gate';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isVideoStorageConfigured } from '@/lib/server/media-storage';
import { providerApiUrl } from '@/lib/server/provider-endpoints';
import { isVideoProviderReleaseEnabled } from '@/lib/server/video-provider-release-policy';
import {
  acquireVideoGenerationAdmission,
  beginVideoProviderSubmission,
  createVideoGenerationJob,
  failVideoGenerationBeforeProviderStart,
  getVideoGenerationJobByIdempotencyKey,
  recordVideoProviderTask,
  releaseVideoGenerationAdmission,
  type VideoGenerationJob,
} from '@/lib/server/video-generation-jobs';
import { isVideoJobStoreReady } from '@/lib/server/video-job-store-readiness';
import { syncVideoGenerationTranscript } from '@/lib/server/video-generation-transcript';
import {
  failClaimedVideoGenerationJob,
  markClaimedVideoGenerationOutcomeUnknown,
  publicVideoJobStatus,
} from '@/lib/services/video-job-reconciliation-service';
import { normalizeGoogleVideoOperationName } from '@/lib/services/video-provider-output-service';
import {
  ManagedUsageRequestError,
  createManagedUsageErrorBody,
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  parseManagedUsageIdempotencyKey,
  reserveManagedUsageRequest,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';
import {
  startVideoGenerationWorkflowExecution,
  startVideoGenerationWorkflowOwner,
  startVideoProviderTaskAttachmentRecovery,
} from '@/lib/workflows/start-video-generation-workflow';
import {
  deliverPendingVideoIncidentAlert,
  deliverVideoSettlementIncidentByReservation,
} from '@/lib/services/video-incident-alert-service';
import {
  OpenRouterVideoSubmissionError,
  OpenRouterVideoSubmissionOutcomeUnknownError,
  submitOpenRouterVideo,
} from '@/lib/services/openrouter-video-provider-service';

/**
 * Video Generation API
 * Endpoint: POST /api/media/video/generate
 *
 * Proxies video generation requests to a live catalog-backed provider.
 * Video generation is async - this endpoint creates a task and returns a task_id
 * for polling via GET /api/media/video/status?task_id=xxx.
 *
 * Requires Max 15x or an Enterprise subscription.
 */

// Next.js route configuration - video task creation can take up to 30s
// (the actual generation is async, so we just need time for the task-creation call).
export const maxDuration = 60;
export const runtime = 'nodejs';

// Provider type
type VideoProvider = ManagedMediaVideoProvider;
type VideoResolution = ManagedMediaVideoResolution;
type VideoAspectRatio = ManagedMediaVideoAspectRatio;

// Response types
interface VideoGenerationResponse {
  success: boolean;
  task_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  provider: VideoProvider;
  model: string;
  estimated_duration_secs: number;
  video_url?: string;
  error?: string;
}

/**
 * Web chat adds an owner-scoped transcript binding to the shared managed-media
 * request. The pair is optional so Mobile/Desktop and the standalone media
 * surface retain their existing contract; supplying only one id fails closed.
 */
const VideoGenerationRouteRequestSchema = ManagedMediaVideoGenerationRequestSchema.extend({
  conversation_id: z.string().uuid().optional(),
  assistant_message_id: z.string().uuid().optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.conversation_id) !== Boolean(value.assistant_message_id)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: value.conversation_id ? ['assistant_message_id'] : ['conversation_id'],
      message: 'conversation_id and assistant_message_id must be supplied together',
    });
  }
});

class VideoProviderSubmissionOutcomeUnknownError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VideoProviderSubmissionOutcomeUnknownError';
  }
}

class VideoProviderTaskAttachmentUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VideoProviderTaskAttachmentUnavailableError';
  }
}

async function fetchProviderSubmission(
  provider: 'Google Veo' | 'Runway',
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    throw new VideoProviderSubmissionOutcomeUnknownError(
      `${provider} may have accepted the request before the connection failed.`,
      { cause },
    );
  }
}

function providerSubmissionWasAmbiguous(response: Response): boolean {
  return response.status === 408 || response.status >= 500;
}

async function parseAcceptedProviderJson<T>(
  provider: 'Google Veo' | 'Runway',
  response: Response,
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new VideoProviderSubmissionOutcomeUnknownError(
      `${provider} accepted the request but returned an unreadable task identity.`,
      { cause },
    );
  }
}

function replayResponse(request: NextRequest, job: VideoGenerationJob): NextResponse {
  const status = publicVideoJobStatus(job);
  const response: VideoGenerationResponse = {
    ...status,
    provider: job.provider,
    model: job.model,
    estimated_duration_secs: job.estimatedDurationSecs,
  };
  return NextResponse.json(response, {
    headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
  });
}

async function findMatchingReplay(input: {
  db: ManagedUsageRequestReservation['db'];
  userId: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<VideoGenerationJob | null> {
  const existing = await getVideoGenerationJobByIdempotencyKey(
    input.db,
    input.userId,
    input.idempotencyKey,
  );
  if (!existing) return null;
  if (existing.requestHash !== input.requestHash) {
    throw new ManagedUsageRequestError(
      'This idempotency key was already used for a different video request body.',
      409,
      'idempotency_conflict',
    );
  }
  return existing;
}

async function recoverConcurrentReplay(input: {
  db: ManagedUsageRequestReservation['db'];
  userId: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<VideoGenerationJob | null> {
  for (const delayMs of [0, 25, 50, 100, 200]) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const existing = await findMatchingReplay(input);
    if (existing) return existing;
  }
  return null;
}

async function recoverKnownProviderTaskAttachment(input: {
  db: ManagedUsageRequestReservation['db'];
  job: VideoGenerationJob;
  userId: string;
  claimToken: string;
  providerTaskId: string;
}): Promise<VideoGenerationJob | null> {
  for (const delayMs of [0, 25, 100, 250]) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      return await recordVideoProviderTask({
        db: input.db,
        jobId: input.job.id,
        userId: input.userId,
        claimToken: input.claimToken,
        providerTaskId: input.providerTaskId,
      });
    } catch {
      const current = await getVideoGenerationJobByIdempotencyKey(
        input.db,
        input.userId,
        input.job.idempotencyKey,
      ).catch(() => null);
      if (current?.providerTaskId === input.providerTaskId) return current;
      if (current?.providerTaskId && current.providerTaskId !== input.providerTaskId) {
        throw new VideoProviderTaskAttachmentUnavailableError(
          'The durable video job is attached to a different provider task.',
        );
      }
    }
  }
  return null;
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

/**
 * Google credential names, in priority order.
 *
 * This route read `GOOGLE_API_KEY` alone while the rest of the stack resolves
 * Google through `PROVIDER_API_KEY_ENV_KEYS.google` in
 * `lib/services/provider-adapter-service.ts`. On a deployment that sets only
 * `GEMINI_API_KEY` the Google branch below could never be taken. Keep in sync
 * with that map so catalog selection cannot silently cross providers.
 */
const GOOGLE_API_KEY_ENV_KEYS = ['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'] as const;

function getGoogleApiKey(): string | undefined {
  for (const key of GOOGLE_API_KEY_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * Determine which provider to use
 */
function requireVideoProviderConfigured(provider: VideoProvider): void {
  const configured =
    provider === 'google'
      ? Boolean(getGoogleApiKey())
      : provider === 'openrouter'
        ? Boolean(process.env['OPENROUTER_API_KEY']?.trim())
        : Boolean(process.env['RUNWAY_API_KEY']?.trim());
  if (!configured) {
    const label =
      provider === 'google' ? 'Google Veo' : provider === 'openrouter' ? 'OpenRouter' : 'Runway';
    throw createError.serviceUnavailable(`${label} is not configured. Please contact support.`);
  }
}

function wireVideoProvider(model: ModelMetadata): VideoProvider | null {
  if (model.provider === 'open_router') return 'openrouter';
  if (model.provider === 'google' || model.provider === 'runway') return model.provider;
  return null;
}

function resolveVideoModel(
  requestedProvider?: VideoProvider,
  requestedModelId?: string,
): { provider: VideoProvider; model: ModelMetadata } {
  if (requestedModelId) {
    const requestedModel = getModelMetadataById(requestedModelId);
    if (!isExecutableVideoModel(requestedModel)) {
      throw createError.validation(`Unknown or unavailable video model: ${requestedModelId}`);
    }
    const provider = wireVideoProvider(requestedModel);
    if (!provider) {
      throw createError.validation(`Video model ${requestedModelId} has no executable provider`);
    }
    if (requestedProvider && requestedProvider !== provider) {
      throw createError.validation(
        `Video model ${requestedModel.id} belongs to ${provider}, not ${requestedProvider}`,
      );
    }

    requireVideoProviderConfigured(provider);
    return { provider, model: requestedModel };
  }

  const slotModelId = getRoutingSlotModel('video_generation');
  const slotModel = getModelMetadataById(slotModelId);
  let provider: VideoProvider;
  if (requestedProvider) {
    provider = requestedProvider;
  } else if (slotModel && wireVideoProvider(slotModel)) {
    provider = wireVideoProvider(slotModel)!;
  } else {
    throw createError.serviceUnavailable('No executable video model is configured');
  }
  requireVideoProviderConfigured(provider);

  const slotProvider = slotModel ? wireVideoProvider(slotModel) : null;
  const defaultModelId =
    slotProvider === provider
      ? slotModelId
      : provider === 'openrouter'
        ? getModels({ modelTypes: ['video'], requireCapabilities: { videoGen: true } }).find(
            (candidate) =>
              candidate.provider === 'open_router' && isExecutableVideoModel(candidate),
          )?.id
        : getProviderDefaultModel(provider);
  const model = defaultModelId ? getModelMetadataById(defaultModelId) : null;
  if (
    !model ||
    !isExecutableVideoModel(model) ||
    wireVideoProvider(model) !== provider ||
    !isModelLive(model)
  ) {
    throw createError.serviceUnavailable(`No live ${provider} video model is configured`);
  }
  return { provider, model };
}

function estimateVideoDuration(provider: VideoProvider, durationSecs: number): number {
  return provider === 'google' ? 90 + durationSecs * 15 : 60 + durationSecs * 10;
}

function validateProviderVideoRequest(
  provider: VideoProvider,
  model: ModelMetadata,
  resolution: VideoResolution,
  aspectRatio: VideoAspectRatio,
  durationSecs: number,
  generateAudio: boolean,
): void {
  if (model.videoGeneration) {
    if (!model.videoGeneration.durationSecs.includes(durationSecs)) {
      throw createError.validation(`${model.name} does not support ${durationSecs}-second output.`);
    }
    const outputSize = resolveVideoGenerationOutputSize(model, resolution, aspectRatio);
    if (!outputSize) {
      throw createError.validation(
        `${model.name} does not support ${resolution} output at ${aspectRatio}.`,
      );
    }
    // A size may permit fewer durations than the model overall — Veo allows
    // 4/6/8s at 720p but only 8s at 1080p and 4k.
    if (outputSize.durationSecs && !outputSize.durationSecs.includes(durationSecs)) {
      throw createError.validation(
        `${model.name} ${resolution} output requires duration_secs to be ${outputSize.durationSecs.join(' or ')}.`,
      );
    }
    if (generateAudio && !model.videoGeneration.supportsAudio) {
      throw createError.validation(`${model.name} does not support generated audio.`);
    }
    return;
  }

  if (provider !== 'google') return;

  if (aspectRatio !== '16:9') {
    throw createError.validation('This Google Veo route currently supports 16:9 output only.');
  }
  if (!generateAudio) {
    throw createError.validation('This Google Veo route generates audio with every video.');
  }

  if (durationSecs !== 4 && durationSecs !== 6 && durationSecs !== 8) {
    throw createError.validation('Google Veo duration_secs must be exactly 4, 6, or 8.');
  }
  if ((resolution === '1080p' || resolution === '4k') && durationSecs !== 8) {
    throw createError.validation(`Google Veo ${resolution} output requires duration_secs to be 8.`);
  }
}

function getVideoCostCents(
  model: ModelMetadata,
  resolution: VideoResolution,
  aspectRatio: VideoAspectRatio,
  durationSecs: number,
  generateAudio: boolean,
): number {
  if (model.videoGeneration?.pricing) {
    const calculated = calculateCatalogVideoCostCents({
      model,
      resolution,
      aspectRatio,
      durationSecs,
      generateAudio,
    });
    if (calculated == null) {
      throw createError.serviceUnavailable(`Pricing is not configured for ${model.name}`);
    }
    return calculated;
  }
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
 * Generate video using the current catalog-backed Runway text-to-video model.
 *
 * API reference: https://docs.dev.runwayml.com/api/
 * Base URL: https://api.dev.runwayml.com/v1/
 * Endpoint: POST /v1/text_to_video
 * Auth: Authorization: Bearer {RUNWAY_API_KEY}
 * Required header: X-Runway-Version: 2024-11-06
 *
 * Duration: 2–10 seconds (integer)
 * Task status: GET /v1/tasks/{id}
 */
async function generateWithRunway(
  prompt: string,
  durationSecs: number,
  model: ModelMetadata,
): Promise<{ taskId: string }> {
  const apiKey = process.env['RUNWAY_API_KEY']?.trim();
  if (!apiKey) {
    throw createError.serviceUnavailable('Runway API not configured');
  }

  if (prompt.length > 1_000) {
    throw createError.validation('Runway video prompts must be 1,000 characters or fewer.');
  }

  const response = await fetchProviderSubmission(
    'Runway',
    'https://api.dev.runwayml.com/v1/text_to_video',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify({
        model: model.apiModelId ?? model.id,
        promptText: prompt,
        duration: durationSecs,
        // Landscape, unconditionally. The wire contract
        // (ManagedMediaVideoGenerationRequestSchema) carries a RESOLUTION —
        // '720p' | '1080p' | '4k' — and no aspect-ratio field at all, so no
        // caller can request portrait. This read `resolution === '9:16' ? '9:16'
        // : '16:9'`, comparing a resolution against an aspect ratio: the portrait
        // arm was unreachable, and the comment above it claimed a 4K-to-1080p
        // fallback that the request body never expressed. Give Runway a portrait
        // option only together with a real aspect-ratio field on the contract and
        // a control that produces it.
        ratio: '1280:720',
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    if (providerSubmissionWasAmbiguous(response)) {
      throw new VideoProviderSubmissionOutcomeUnknownError(
        `Runway returned ${response.status} after the generation request was sent.`,
      );
    }
    const errorText = await response.text().catch(() => '');
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

  const result = await parseAcceptedProviderJson<RunwayTaskResponse>('Runway', response);

  if (!result.id || !/^[A-Za-z0-9_-]{1,512}$/.test(result.id)) {
    logger.error({ result }, 'Runway API returned no task ID');
    throw new VideoProviderSubmissionOutcomeUnknownError(
      'Runway accepted the generation but returned no usable task identity.',
    );
  }

  return {
    taskId: result.id,
  };
}

/**
 * Generate video using Google Veo via Gemini API (async long-running operation)
 *
 * API reference: https://ai.google.dev/gemini-api/docs/video
 * Base URL: canonical validated GOOGLE_BASE_URL (vendor default is v1beta)
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
): Promise<{ taskId: string }> {
  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    throw createError.serviceUnavailable(
      `Google Veo API not configured. Set one of: ${GOOGLE_API_KEY_ENV_KEYS.join(', ')}.`,
    );
  }

  const providerModelId = model.apiModelId ?? model.id;
  const endpoint = providerApiUrl(
    'google',
    `models/${encodeURIComponent(providerModelId)}:predictLongRunning`,
  );

  const response = await fetchProviderSubmission('Google Veo', endpoint, {
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
        // NUMBER, not a string. This was `String(durationSecs)`, and the live
        // API rejects that outright:
        //   400 INVALID_ARGUMENT — "The value type for `durationSeconds` needs
        //   to be a number. Please adjust your request accordingly."
        // Verified against the catalog-selected live Google video model on
        // 2026-08-06: the string form 400s, while the numeric form returns an
        // operation name. Every Google video generation failed before this.
        durationSeconds: durationSecs,
        resolution,
        // This catalog-selected REST endpoint returns one video. It rejects
        // the SDK-only `numberOfVideos` option and the
        // former preview-only `enhancePrompt` option, so the request carries
        // only the documented provider-native output tuple.
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    if (providerSubmissionWasAmbiguous(response)) {
      throw new VideoProviderSubmissionOutcomeUnknownError(
        `Google Veo returned ${response.status} after the generation request was sent.`,
      );
    }
    const errorText = await response.text().catch(() => '');
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
        const providerMessage = errorJson.error?.message?.replace(/\s+/g, ' ').trim();
        if (providerMessage?.toLowerCase().includes('safety')) {
          throw createError.validation(
            'Your prompt was flagged by content safety filters. Please revise and try again.',
          );
        }
        if (providerMessage) {
          const safeProviderMessage = providerMessage
            .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted credential]')
            .slice(0, 360);
          throw createError.validation(`Google rejected the video request: ${safeProviderMessage}`);
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

  const result = await parseAcceptedProviderJson<GoogleVeoResponse>('Google Veo', response);

  if (!result.name || !normalizeGoogleVideoOperationName(result.name, false)) {
    logger.error({ result }, 'Google Veo API returned no operation name');
    throw new VideoProviderSubmissionOutcomeUnknownError(
      'Google Veo accepted the generation but returned no usable operation identity.',
    );
  }

  return {
    // Keep the exact provider operation name. The reconciler accepts only the
    // documented `operations/<opaque-id>` shape and never interpolates an
    // arbitrary path.
    taskId: result.name,
  };
}

async function generateWithOpenRouter(
  prompt: string,
  durationSecs: number,
  resolution: VideoResolution,
  aspectRatio: VideoAspectRatio,
  generateAudio: boolean,
  model: ModelMetadata,
): Promise<{ taskId: string }> {
  const output = resolveVideoGenerationOutputSize(model, resolution, aspectRatio);
  const providerModelId = model.apiModelId;
  if (!output || !model.videoGeneration?.durationSecs.includes(durationSecs)) {
    throw createError.validation('The selected catalog video tuple is unavailable.');
  }
  if (!providerModelId) {
    throw createError.serviceUnavailable('The selected video model has no provider mapping.');
  }
  try {
    return await submitOpenRouterVideo({
      providerModelId,
      prompt,
      durationSecs,
      width: output.width,
      height: output.height,
      generateAudio,
    });
  } catch (error) {
    if (error instanceof OpenRouterVideoSubmissionOutcomeUnknownError) throw error;
    if (!(error instanceof OpenRouterVideoSubmissionError)) throw error;
    switch (error.kind) {
      case 'rate_limit':
        throw createError.rateLimit('Video generation rate limit reached. Please try again later.');
      case 'invalid_request':
        throw createError.validation('Invalid video generation request');
      case 'authentication':
      case 'quota':
      case 'unavailable':
        throw createError.serviceUnavailable('Video generation service is temporarily unavailable');
    }
  }
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

  // AUDIT-FIX BUG-21: enforce CSRF on this state-changing, credit-spending
  // endpoint. getClerkAuthUser accepts a browser __session cookie, so without
  // this a cross-origin POST rode the victim's ambient session and burned their
  // managed-compute balance. The sibling /api/media/image/generate route has
  // always had this check — the omission here was an inconsistency, not a design
  // decision. requireCsrfToken bypasses only on a cryptographically verified
  // Bearer, so programmatic API callers are unaffected.
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

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
    return NextResponse.json(
      {
        error: {
          message: 'No active subscription found. Please subscribe to use video generation.',
          type: 'invalid_request_error',
          code: 'subscription_required',
          required_plans: ['max_15x', 'enterprise'],
        },
      },
      {
        status: 403,
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  }

  const activeStatuses = new Set(['active', 'trialing']);
  if (!activeStatuses.has(subscription.status)) {
    return NextResponse.json(
      {
        error: {
          message: `Your subscription is ${subscription.status}. Please update your payment method.`,
          type: 'invalid_request_error',
          code: 'subscription_inactive',
          current_plan: subscription.plan_tier?.toLowerCase() || 'free',
          required_plans: ['max_15x', 'enterprise'],
        },
      },
      {
        status: 403,
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  }

  const userTier = subscription.plan_tier?.toLowerCase() || 'free';
  if (!canUseBillingPlanCapability(userTier, 'video_generation')) {
    /**
     * Returned as an explicit body rather than `createError.forbidden`, which
     * emits `ErrorCode.FORBIDDEN`. The client's paywall detection
     * (`lib/hooks/useMediaGeneration.ts` PAYWALL_ERROR_CODES / _TYPES) matches
     * on `plan_upgrade_required`, so a bare FORBIDDEN fell through to the
     * generic error path and a Basic/Pro user asking for a video saw "Forbidden"
     * instead of the upgrade prompt. The sibling image route has always
     * returned this shape; video was the inconsistency.
     */
    return NextResponse.json(
      {
        error: {
          message:
            'Video generation is available on Max 15x and Enterprise plans. Upgrade your plan and I can create that video for you.',
          type: 'invalid_request_error',
          code: 'plan_upgrade_required',
          current_plan: userTier,
          required_plans: ['max_15x', 'enterprise'],
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

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const validationResult = VideoGenerationRouteRequestSchema.safeParse(body);
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
    aspect_ratio: requestedAspectRatio,
    generate_audio: requestedGenerateAudio,
    provider: requestedProvider,
    model: requestedModelId,
    conversation_id: conversationId,
    assistant_message_id: assistantMessageId,
  } = validationResult.data;

  const requestHash = fingerprintManagedUsageRequest(validationResult.data);
  let idempotencyKey: string;
  let sourceSurface: 'web' | 'mobile' | 'desktop';
  let organizationId: string | null;
  let scopedDb: ManagedUsageRequestReservation['db'];
  try {
    idempotencyKey = parseManagedUsageIdempotencyKey(request.headers.get('Idempotency-Key'));
    const mediaIdentity = parseManagedMediaIdempotencyKey(idempotencyKey);
    if (!mediaIdentity || mediaIdentity.operation !== 'video') {
      throw new ManagedUsageRequestError(
        'Idempotency-Key must identify one Managed Cloud video operation.',
        400,
        'invalid_media_idempotency_key',
      );
    }
    sourceSurface = mediaIdentity.surface;
    const scoped = await getUserScopedDb(request);
    if (scoped.userId !== userId) {
      throw new ManagedUsageRequestError('Managed usage tenant mismatch.', 403, 'tenant_mismatch');
    }
    scopedDb = scoped.db;
    organizationId = scoped.organizationId ?? null;

    if (conversationId && assistantMessageId) {
      if (sourceSurface !== 'web') {
        throw new ManagedUsageRequestError(
          'Video chat transcript binding is only valid for the Web surface.',
          400,
          'invalid_video_transcript_surface',
        );
      }
      const transcriptRows = await scopedDb.query<{ id: string }>(
        `select message.id
           from public.web_messages message
           join public.web_conversations conversation
             on conversation.id = message.conversation_id
          where conversation.id = $1
            and conversation.user_id = $2
            and conversation.deleted_at is null
            and message.id = $3
            and message.role = 'assistant'
          limit 1`,
        [conversationId, userId, assistantMessageId],
      );
      if (!transcriptRows[0]) {
        throw new ManagedUsageRequestError(
          'The video chat placeholder is unavailable.',
          403,
          'video_transcript_owner_mismatch',
        );
      }
    }

    // A retry with the same body recovers the original durable job before
    // provider configuration, reservation, or egress. Changed bodies fail
    // closed under the same key.
    const existing = await findMatchingReplay({
      db: scopedDb,
      userId,
      idempotencyKey,
      requestHash,
    });
    if (existing) return replayResponse(request, existing);
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

  // Always-on platform safety floor before admission, billing reservation, or
  // provider egress. Provider moderation remains defense in depth; it cannot
  // be the first control because Runway charges safety-moderated generations
  // and repeated violations can jeopardize the managed provider account.
  const moderation = moderateManagedPrompt({
    userId,
    segments: [prompt],
    surface: 'managed-video',
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

  const { provider, model } = resolveVideoModel(requestedProvider, requestedModelId);
  if (!isVideoProviderReleaseEnabled(provider)) {
    throw createError.serviceUnavailable(
      'This video provider is not available while its managed billing controls are being finalized.',
    );
  }
  const aspectRatio = requestedAspectRatio ?? '16:9';
  const generateAudio =
    requestedGenerateAudio ?? model.videoGeneration?.supportsAudio ?? provider === 'google';
  if (provider === 'runway' && prompt.length > 1_000) {
    throw createError.validation('Runway video prompts must be 1,000 characters or fewer.');
  }
  validateProviderVideoRequest(
    provider,
    model,
    resolution,
    aspectRatio,
    duration_secs,
    generateAudio,
  );
  const billableDurationSecs = duration_secs;
  const estimatedDuration = estimateVideoDuration(provider, billableDurationSecs);

  // A provider task without durable AGI storage can never produce a usable
  // result. Fail before reserving credits or making provider egress.
  const estimatedCostCents = getVideoCostCents(
    model,
    resolution,
    aspectRatio,
    billableDurationSecs,
    generateAudio,
  );
  if (!isVideoStorageConfigured()) {
    throw createError.serviceUnavailable(
      'Video storage is temporarily unavailable. Please try again later.',
    );
  }
  if (!(await isVideoJobStoreReady(scopedDb))) {
    throw createError.serviceUnavailable(
      'Durable video processing is temporarily unavailable. Please try again later.',
    );
  }
  const admissionToken = randomUUID();
  try {
    const admitted = await acquireVideoGenerationAdmission({
      db: scopedDb,
      userId,
      admissionToken,
      admissionSeconds: 300,
    });
    if (!admitted) {
      return managedUsageErrorResponse(
        request,
        new ManagedUsageRequestError(
          'Video generation cannot start while account data is being erased or another video request is entering its durable billing boundary. Retry shortly.',
          409,
          'video_generation_admission_busy',
        ),
      );
    }
  } catch (error) {
    logger.error({ error, userId }, 'Video generation admission could not be acquired');
    throw createError.serviceUnavailable(
      'Durable video processing is temporarily unavailable. Please try again later.',
    );
  }

  let reservation: ManagedUsageRequestReservation;
  try {
    reservation = await reserveManagedUsageRequest({
      db: scopedDb,
      userId,
      idempotencyKey,
      requestHash,
      provider,
      model: model.id,
      estimatedCostCents,
      planTier: subscription.plan_tier,
      isFlagship: false,
      // The durable Workflow renews this lease on every claim. Start with the
      // maximum supported window so a cold scheduler cannot race the generic stale-
      // request recovery immediately after task submission.
      leaseSeconds: 3600,
    });
  } catch (error) {
    await releaseVideoGenerationAdmission({
      db: scopedDb,
      userId,
      admissionToken,
    }).catch((releaseError) => {
      logger.error({ error: releaseError, userId }, 'Video generation admission release failed');
    });
    if (
      error instanceof ManagedUsageRequestError &&
      (error.code === 'idempotency_in_progress' || error.code === 'idempotency_replay')
    ) {
      try {
        const existing = await recoverConcurrentReplay({
          db: scopedDb,
          userId,
          idempotencyKey,
          requestHash,
        });
        if (existing) return replayResponse(request, existing);
      } catch (replayError) {
        const managedError =
          replayError instanceof ManagedUsageRequestError
            ? replayError
            : new ManagedUsageRequestError(
                'Managed usage billing is temporarily unavailable.',
                503,
                'billing_unavailable',
              );
        return managedUsageErrorResponse(request, managedError);
      }
    }
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

  const settlePreJobFailure = async (reason: string): Promise<void> => {
    try {
      const settlement = await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'failed',
        actualCostCents: 0,
        usage: {
          operation: 'video',
          sourceSurface,
          provider,
          model: model.id,
          reason,
        },
      });
      if (settlement.settlementStatus === 'terminal') {
        await deliverVideoSettlementIncidentByReservation({
          db: scopedDb,
          userId,
          idempotencyKey: reservation.idempotencyKey,
        }).catch((alertError) => {
          logger.error(
            { error: alertError, userId, idempotencyKey: reservation.idempotencyKey },
            'Pre-job video settlement alert remains pending in the durable settlement row',
          );
        });
      }
    } catch (settlementError) {
      logger.error(
        { error: settlementError, userId, idempotencyKey: reservation.idempotencyKey },
        'Pre-job video settlement could not be recorded',
      );
    }
  };

  const jobId = randomUUID();
  let workflowOwner: Awaited<ReturnType<typeof startVideoGenerationWorkflowOwner>>;
  try {
    workflowOwner = await startVideoGenerationWorkflowOwner({ jobId });
  } catch (error) {
    await releaseVideoGenerationAdmission({ db: scopedDb, userId, admissionToken }).catch(
      (releaseError) => {
        logger.error({ error: releaseError, userId }, 'Video generation admission release failed');
      },
    );
    await settlePreJobFailure('durable_workflow_owner_start_failed');
    logger.error({ error, userId, jobId }, 'Durable video workflow owner could not start');
    throw createError.serviceUnavailable(
      'Durable video processing is temporarily unavailable. The provider was not contacted.',
    );
  }

  let job: VideoGenerationJob;
  try {
    job = await createVideoGenerationJob({
      db: scopedDb,
      id: jobId,
      userId,
      organizationId,
      conversationId,
      assistantMessageId,
      idempotencyKey: reservation.idempotencyKey,
      requestHash,
      billingLeaseToken: reservation.leaseToken,
      provider,
      model: model.id,
      prompt,
      durationSecs: billableDurationSecs,
      resolution,
      aspectRatio,
      generateAudio,
      sourceSurface,
      estimatedCostCents,
      estimatedDurationSecs: estimatedDuration,
      admissionToken,
      workflowRunId: workflowOwner.workflowRunId,
    });
  } catch (error) {
    await releaseVideoGenerationAdmission({
      db: scopedDb,
      userId,
      admissionToken,
    }).catch((releaseError) => {
      logger.error({ error: releaseError, userId }, 'Video generation admission release failed');
    });
    // The INSERT may have committed even if its response was lost. Recover the
    // stable row before releasing the reservation or creating another job.
    let recovered: VideoGenerationJob | null = null;
    let recoveryError: unknown;
    try {
      recovered = await findMatchingReplay({
        db: scopedDb,
        userId,
        idempotencyKey,
        requestHash,
      });
    } catch (readError) {
      recoveryError = readError;
    }
    if (recovered) {
      if (recovered.status !== 'submitting') return replayResponse(request, recovered);
      job = recovered;
    } else if (recoveryError) {
      // The Workflow was durably started before INSERT and already owns this
      // exact opaque job id. Do not cancel it or release billing while the DB
      // commit outcome is ambiguous; a same-key retry recovers the row, and a
      // truly missing row ages out through managed-usage stale recovery.
      logger.error(
        { error, recoveryError, userId, jobId },
        'Video job INSERT outcome is ambiguous; durable Workflow retained',
      );
      throw createError.serviceUnavailable(
        'Video job persistence is being recovered. Retry this exact request with the same Idempotency-Key.',
      );
    } else {
      await workflowOwner.cancel().catch(() => undefined);
      await settlePreJobFailure('durable_job_persistence_failed');
      logger.error({ error, userId }, 'Durable video job could not be persisted');
      throw createError.serviceUnavailable(
        'Video generation is temporarily unavailable. Please try again later.',
      );
    }
  }

  if (!job.workflowRunId) {
    try {
      const workflow = await startVideoGenerationWorkflowExecution({
        db: scopedDb,
        jobId: job.id,
        userId,
      });
      job = { ...job, workflowRunId: workflow.workflowRunId };
    } catch (error) {
      let billingOutcome: 'released' | 'outcome_unknown' | null = null;
      let billingSettlementStatus: 'succeeded' | 'pending' | 'terminal' | null = null;
      try {
        const settlement = await finalizeManagedUsageRequest({
          ...reservation,
          outcome: 'failed',
          actualCostCents: 0,
          usage: {
            operation: 'video',
            sourceSurface,
            provider,
            model: model.id,
            jobId: job.id,
            reason: 'durable_workflow_start_failed',
          },
        });
        billingOutcome = settlement.requestStatus === 'released' ? 'released' : 'outcome_unknown';
        billingSettlementStatus = settlement.settlementStatus;
      } catch (settlementError) {
        logger.error(
          { error: settlementError, userId, jobId: job.id },
          'Video workflow-start billing settlement is pending recovery',
        );
      }
      const failedJob = await failVideoGenerationBeforeProviderStart({
        db: scopedDb,
        jobId: job.id,
        userId,
        publicError:
          'Durable video processing could not start. The provider was not contacted; contact support if the reservation remains visible.',
        billingOutcome,
        billingSettlementStatus,
      }).catch((persistenceError) => {
        logger.error(
          { error: persistenceError, userId, jobId: job.id },
          'Video workflow-start failure could not be recorded',
        );
        return null;
      });
      if (failedJob) {
        await syncVideoGenerationTranscript(scopedDb, failedJob).catch((projectionError) => {
          logger.warn(
            { error: projectionError, jobId: failedJob.id },
            'Video workflow-start transcript projection remains pending',
          );
        });
      }
      if (failedJob?.incidentAlertStatus === 'pending') {
        await deliverPendingVideoIncidentAlert(scopedDb, failedJob).catch((alertError) => {
          logger.error(
            { error: alertError, userId, jobId: job.id },
            'Video workflow-start settlement alert remains pending',
          );
        });
      }
      logger.error({ error, userId, jobId: job.id }, 'Durable video workflow could not start');
      throw createError.serviceUnavailable(
        'Durable video processing is temporarily unavailable. The provider was not contacted.',
      );
    }
  }

  logger.info(
    {
      userId: userId,
      provider,
      model: model.id,
      durationSecs: billableDurationSecs,
      resolution,
      aspectRatio,
      generateAudio,
      promptLength: prompt.length,
    },
    'Starting video generation task',
  );

  // Create video generation task based on provider
  let providerTaskId: string | undefined;
  const submissionClaimToken = randomUUID();

  try {
    const begun = await beginVideoProviderSubmission({
      db: scopedDb,
      jobId: job.id,
      userId,
      claimToken: submissionClaimToken,
      claimSeconds: 120,
    });
    if (!begun) return replayResponse(request, job);
    job = begun;
  } catch (error) {
    // No provider egress happens unless the atomic billing/job boundary returns
    // successfully. A concurrent retry may own the claim; both callers recover
    // the same opaque job rather than starting a second provider task.
    logger.warn({ error, jobId: job.id }, 'Video provider submission claim was not acquired');
    const current = await findMatchingReplay({
      db: scopedDb,
      userId,
      idempotencyKey,
      requestHash,
    }).catch(() => null);
    return replayResponse(request, current ?? job);
  }

  try {
    if (provider === 'runway') {
      // No `resolution` argument: the current Runway body carries none. Catalog
      // pricing already rejected unsupported output values before provider work.
      const result = await generateWithRunway(prompt, billableDurationSecs, model);
      providerTaskId = result.taskId;
    } else if (provider === 'google') {
      const result = await generateWithGoogleVeo(
        prompt,
        billableDurationSecs as 4 | 6 | 8,
        resolution,
        model,
      );
      providerTaskId = result.taskId;
    } else {
      const result = await generateWithOpenRouter(
        prompt,
        billableDurationSecs,
        resolution,
        aspectRatio,
        generateAudio,
        model,
      );
      providerTaskId = result.taskId;
    }
    try {
      job = await recordVideoProviderTask({
        db: scopedDb,
        jobId: job.id,
        userId,
        claimToken: submissionClaimToken,
        providerTaskId,
      });
    } catch (cause) {
      const recovered = await recoverKnownProviderTaskAttachment({
        db: scopedDb,
        job,
        userId,
        claimToken: submissionClaimToken,
        providerTaskId,
      });
      if (!recovered) {
        try {
          await startVideoProviderTaskAttachmentRecovery({
            jobId: job.id,
            providerTaskId,
          });
          logger.error(
            { cause, jobId: job.id, providerTaskId },
            'Accepted video provider task moved to durable attachment recovery',
          );
          return replayResponse(request, job);
        } catch (workflowError) {
          throw new VideoProviderTaskAttachmentUnavailableError(
            'The accepted provider task could not be copied into durable recovery.',
            { cause: workflowError },
          );
        }
      }
      job = recovered;
    }
  } catch (error) {
    if (error instanceof VideoProviderTaskAttachmentUnavailableError) {
      // Both direct DB attachment and the separate durable recovery start
      // failed. Record the known provider identity as outcome_unknown while
      // the submission claim is still held; do not claim that a later worker
      // can recover an id that was never persisted anywhere durable.
      logger.error(
        { error, jobId: job.id, providerTaskId },
        'Accepted video provider task could not enter durable recovery',
      );
      try {
        await markClaimedVideoGenerationOutcomeUnknown(
          scopedDb,
          job,
          submissionClaimToken,
          providerTaskId,
        );
      } catch (settlementError) {
        logger.error(
          { error: settlementError, jobId: job.id, providerTaskId },
          'Known provider task outcome_unknown state could not be persisted',
        );
      }
      throw createError.serviceUnavailable(
        'The provider accepted this video, but AGI could not establish durable recovery. The incident was recorded; reuse the same request key to inspect it.',
      );
    }
    const isAppError = Boolean(error && typeof error === 'object' && 'statusCode' in error);
    const definitePublicError =
      isAppError && error instanceof Error && error.message.trim()
        ? error.message.trim().slice(0, 500)
        : 'The video provider rejected this generation request.';
    const ambiguous =
      error instanceof VideoProviderSubmissionOutcomeUnknownError ||
      error instanceof OpenRouterVideoSubmissionOutcomeUnknownError ||
      !isAppError;
    try {
      if (ambiguous) {
        await markClaimedVideoGenerationOutcomeUnknown(
          scopedDb,
          job,
          submissionClaimToken,
          providerTaskId,
        );
      } else {
        await failClaimedVideoGenerationJob(
          scopedDb,
          job,
          submissionClaimToken,
          definitePublicError,
        );
      }
    } catch (settlementError) {
      logger.error(
        {
          event: ambiguous
            ? 'video_outcome_unknown_unrecorded'
            : 'video_refund_settlement_unrecorded',
          error: settlementError,
          userId,
          provider,
          idempotencyKey: reservation.idempotencyKey,
        },
        'Video generation failure settlement could not be persisted',
      );
    }
    logger.warn({ userId: userId, provider }, 'Video task creation failed');

    // Re-throw AppError instances (from createError.*)
    if (!ambiguous && error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    logger.error({ error, provider }, 'Video generation task creation failed');
    throw createError.serviceUnavailable(
      'The provider may have accepted this video, but AGI could not verify its task identity. Reuse the same request key to inspect the durable result.',
    );
  }

  logger.info(
    { userId: userId, provider, jobId: job.id, estimatedCostCents },
    'Video generation task durably queued',
  );

  const response: VideoGenerationResponse = {
    success: true,
    task_id: job.id,
    status: 'queued',
    provider,
    model: model.id,
    estimated_duration_secs: estimatedDuration,
  };

  logger.info(
    {
      userId: userId,
      taskId: job.id,
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
