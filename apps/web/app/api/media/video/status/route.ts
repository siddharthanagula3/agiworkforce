import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { getVideoTask } from '@/lib/video-task-store';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { getVideoGenerationJob } from '@/lib/server/video-generation-jobs';
import {
  publicVideoJobStatus,
  reconcileVideoGenerationJob,
} from '@/lib/services/video-job-reconciliation-service';
import { markManagedUsageClientDelivered } from '@/lib/services/managed-usage-request-service';
import { deliverPendingVideoIncidentAlert } from '@/lib/services/video-incident-alert-service';
import {
  aiGeneratedHeaders,
  buildAiGeneratedProvenance,
  type AiGeneratedProvenance,
} from '@/lib/compliance/ai-act';

/**
 * Video Generation Status API
 * Endpoint: GET /api/media/video/status?task_id=xxx
 *
 * Polls the status of a video generation task from Runway or Google Veo.
 * The frontend should poll this endpoint every 3–5 seconds until status
 * is "completed" or "failed". Maximum poll window: 5 minutes.
 */

// Each status check is a single outbound HTTP call and should complete quickly.
export const maxDuration = 120;
export const runtime = 'nodejs';

// Response types
interface VideoStatusResponse {
  success: boolean;
  task_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'timeout';
  video_url?: string;
  thumbnail_url?: string;
  progress?: number;
  error?: string;
  /**
   * EU AI Act Article 50(2) marker. Emitted with the finished video — this is
   * the only response that carries the artefact, so it is the only place the
   * mark can be attached server-side. The `x-agi-ai-generated` header carries
   * the same fact for consumers that never parse the body.
   */
  provenance?: AiGeneratedProvenance;
}

const DURABLE_JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Runway task status response
// Ref: GET https://api.dev.runwayml.com/v1/tasks/{id}
interface RunwayTaskStatusResponse {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'CANCELLED';
  progress?: number;
  output?: string[];
  failure?: string;
  failureCode?: string;
  createdAt?: string;
  estimatedTimeToComplete?: number;
}

// Google long-running operation status response
// Ref: GET https://generativelanguage.googleapis.com/v1beta/{operation_name}
interface GoogleOperationResponse {
  name: string;
  metadata?: {
    '@type': string;
    state?: 'STATE_UNSPECIFIED' | 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
    progress?: number;
  };
  done?: boolean;
  error?: {
    code: number;
    message: string;
  };
  response?: {
    '@type': string;
    /**
     * What the live API actually returns. Verified against
     * the catalog-selected live Google video model on 2026-08-06: a completed
     * operation nests the samples one level deeper than the flat
     * `generatedSamples` this route used to read, so the URL was never found
     * and the client polled until its five-minute timeout on a video that had
     * already been generated (and billed).
     */
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: {
          uri?: string;
          bytesBase64Encoded?: string;
        };
      }>;
    };
    // Flat shape kept as a fallback for other Veo revisions.
    generatedSamples?: Array<{
      video?: {
        uri?: string;
        bytesBase64Encoded?: string;
      };
    }>;
    // Alternative format seen in some API versions
    videos?: Array<{
      video?: {
        uri?: string;
        bytesBase64Encoded?: string;
      };
    }>;
  };
}

/**
 * Extract provider and original task ID from our composite task ID.
 * Format: "{provider}_{originalId}" e.g. "runway_abc123" or "google_xyz789"
 */
function parseTaskId(taskId: string): { provider: 'runway' | 'google'; originalId: string } {
  if (taskId.startsWith('runway_')) {
    const originalId = taskId.substring(7);
    // Runway task IDs are UUIDs or alphanumeric strings
    if (!/^[a-zA-Z0-9_-]+$/.test(originalId)) {
      throw createError.validation('Invalid task_id: contains disallowed characters');
    }
    return { provider: 'runway', originalId };
  }
  if (taskId.startsWith('google_')) {
    const originalId = taskId.substring(7);
    // Google operation IDs are numeric or alphanumeric
    if (!/^[a-zA-Z0-9_-]+$/.test(originalId)) {
      throw createError.validation('Invalid task_id: contains disallowed characters');
    }
    return { provider: 'google', originalId };
  }
  throw createError.validation('Invalid task_id format. Expected "runway_..." or "google_..."');
}

/**
 * Get video status from Runway API
 * Endpoint: GET https://api.dev.runwayml.com/v1/tasks/{id}
 * Auth: Authorization: Bearer {RUNWAY_API_KEY}
 * Required header: X-Runway-Version: 2024-11-06
 */
async function getRunwayStatus(taskId: string): Promise<VideoStatusResponse> {
  const apiKey = process.env['RUNWAY_API_KEY'];
  if (!apiKey) {
    throw createError.serviceUnavailable('Runway API not configured');
  }

  const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Runway-Version': '2024-11-06',
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw createError.notFound('Video generation task not found');
    }
    if (response.status === 401) {
      throw createError.serviceUnavailable('Video service authentication failed');
    }

    const errorText = await response.text();
    logger.error({ status: response.status, error: errorText }, 'Runway status API error');
    throw createError.internal('Failed to get video generation status');
  }

  const result = (await response.json()) as RunwayTaskStatusResponse;

  // Map Runway statuses to our unified status vocabulary
  let status: VideoStatusResponse['status'];
  switch (result.status) {
    case 'PENDING':
      status = 'queued';
      break;
    case 'RUNNING':
      status = 'processing';
      break;
    case 'SUCCEEDED':
      status = 'completed';
      break;
    case 'FAILED':
    case 'CANCELED':
    case 'CANCELLED':
      status = 'failed';
      break;
    default:
      status = 'processing';
  }

  const statusResponse: VideoStatusResponse = {
    success: true,
    task_id: `runway_${taskId}`,
    status,
    progress: result.progress,
  };

  if (status === 'completed') {
    statusResponse.status = 'failed';
    statusResponse.error =
      'This legacy video task completed without durable delivery. Contact support for a credit review.';
  }

  if (status === 'failed' && result.failure) {
    statusResponse.error = result.failure;
  }

  return statusResponse;
}

/**
 * Get video status from Google Veo via long-running operation polling
 * Endpoint: GET https://generativelanguage.googleapis.com/v1beta/operations/{id}
 * Auth: x-goog-api-key header
 *
 * The operation name returned by /predictLongRunning is "operations/{id}".
 * We store only the numeric/alphanumeric ID portion and reconstruct the path here.
 */
async function getGoogleVeoStatus(operationId: string): Promise<VideoStatusResponse> {
  // Same three-key chain the generate route uses. Reading only GOOGLE_API_KEY
  // here meant a deployment set up with GEMINI_API_KEY could START a Veo job
  // but never poll it — the video generated and billed, and the client saw a
  // service-unavailable on every status call.
  const apiKey =
    process.env['GOOGLE_API_KEY'] ??
    process.env['GOOGLE_AI_API_KEY'] ??
    process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    throw createError.serviceUnavailable('Google Veo API not configured');
  }

  // Full operation name: "operations/{operationId}"
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/operations/${operationId}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw createError.notFound('Video generation task not found');
    }
    if (response.status === 401 || response.status === 403) {
      throw createError.serviceUnavailable('Video service authentication failed');
    }

    const errorText = await response.text();
    logger.error({ status: response.status, error: errorText }, 'Google Veo status API error');
    throw createError.internal('Failed to get video generation status');
  }

  const result = (await response.json()) as GoogleOperationResponse;

  // Determine our unified status from the operation response
  let status: VideoStatusResponse['status'];
  if (result.error) {
    status = 'failed';
  } else if (result.done) {
    status = 'completed';
  } else if (result.metadata?.state) {
    switch (result.metadata.state) {
      case 'PENDING':
        status = 'queued';
        break;
      case 'RUNNING':
        status = 'processing';
        break;
      case 'SUCCEEDED':
        status = 'completed';
        break;
      case 'FAILED':
      case 'CANCELLED':
        status = 'failed';
        break;
      default:
        status = 'processing';
    }
  } else {
    status = 'processing';
  }

  const statusResponse: VideoStatusResponse = {
    success: true,
    task_id: `google_${operationId}`,
    status,
    progress: result.metadata?.progress,
  };

  if (status === 'completed') {
    statusResponse.status = 'failed';
    statusResponse.error =
      'This legacy video task completed without durable delivery. Contact support for a credit review.';
  }

  if (status === 'failed' && result.error) {
    statusResponse.error = result.error.message || 'Video generation failed';
  }

  return statusResponse;
}

/**
 * Main handler for video status polling
 */
async function handleVideoStatus(request: NextRequest): Promise<NextResponse> {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Rate limiting: Allow frequent polling (status checks are cheap)
  const rateLimitResponse = await withRateLimit(request, 'video-status');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Authentication
  const { userId } = await getClerkAuthUser(request);

  // Get task_id from query params
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('task_id');

  if (!taskId) {
    throw createError.validation('Missing required parameter: task_id');
  }

  if (DURABLE_JOB_ID_PATTERN.test(taskId)) {
    const scoped = await getUserScopedDb(request);
    if (scoped.userId !== userId) {
      throw createError.forbidden('You do not have permission to check this task');
    }
    const snapshot = await getVideoGenerationJob(scoped.db, taskId, userId);
    if (!snapshot) {
      logger.warn({ taskId, requestingUser: userId }, 'Durable video job ownership denied');
      throw createError.forbidden('You do not have permission to check this task');
    }

    const job = await reconcileVideoGenerationJob(scoped.db, snapshot);
    if (job.incidentAlertStatus === 'pending') {
      await deliverPendingVideoIncidentAlert(scoped.db, job).catch((error) => {
        logger.error(
          { error, jobId: job.id },
          'Video billing incident alert remains pending after status request',
        );
      });
    }
    const statusResponse: VideoStatusResponse = publicVideoJobStatus(job);
    const provenance =
      job.status === 'completed' && job.assetId
        ? buildAiGeneratedProvenance({
            kind: 'video',
            provider: job.provider,
            model: job.model,
          })
        : undefined;
    if (provenance) {
      statusResponse.provenance = provenance;
      try {
        await markManagedUsageClientDelivered({
          db: scoped.db,
          userId: job.userId,
          idempotencyKey: job.idempotencyKey,
          requestHash: job.requestHash,
          leaseToken: job.billingLeaseToken,
          estimatedCostCents: job.estimatedCostCents,
        });
      } catch (error) {
        logger.warn({ error, jobId: job.id }, 'Video delivery marker could not be persisted');
      }
    }

    return NextResponse.json(statusResponse, {
      headers: {
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
        ...(provenance ? aiGeneratedHeaders(provenance) : {}),
      },
    });
  }

  // Parse task ID to determine provider and get the original provider-side ID
  const { provider, originalId } = parseTaskId(taskId);

  // Verify task ownership: the requesting user must be the one who created this task.
  // Ownership is durable (Redis, with a same-instance fallback), so a poll that
  // lands on a different instance than the one that created the task still
  // resolves. Missing ownership fails closed rather than allowing a
  // provider-side task to be polled by guessable ID.
  const task = await getVideoTask(taskId);
  if (!task || task.userId !== userId) {
    logger.warn(
      { taskId, requestingUser: userId, taskOwner: task?.userId },
      'Video task ownership missing or mismatched - rejecting status request',
    );
    throw createError.forbidden('You do not have permission to check this task');
  }

  logger.info(
    {
      userId: userId,
      taskId,
      provider,
    },
    'Checking video generation status',
  );

  // Fetch status from the appropriate provider
  let statusResponse: VideoStatusResponse;

  try {
    if (provider === 'runway') {
      statusResponse = await getRunwayStatus(originalId);
    } else {
      statusResponse = await getGoogleVeoStatus(originalId);
    }
  } catch (error) {
    // Re-throw AppError instances (from createError.*)
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    logger.error({ error, provider, taskId }, 'Failed to get video status');
    throw createError.internal('Failed to get video generation status');
  }

  logger.info(
    {
      userId: userId,
      taskId,
      status: statusResponse.status,
      hasVideoUrl: !!statusResponse.video_url,
    },
    'Video status retrieved',
  );

  // Article 50(2): the finished video is synthetic content, so the response
  // that hands it over must mark it. `task.model` is absent only for tasks
  // created before the store recorded it; those fall back to the provider's
  // own name so the artefact is still marked rather than silently unmarked.
  const provenance =
    statusResponse.status === 'completed' && statusResponse.video_url
      ? buildAiGeneratedProvenance({
          kind: 'video',
          provider,
          model: task.model ?? provider,
        })
      : undefined;
  if (provenance) statusResponse.provenance = provenance;

  return NextResponse.json(statusResponse, {
    headers: {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
      ...(provenance ? aiGeneratedHeaders(provenance) : {}),
    },
  });
}

export const GET = withErrorHandler(handleVideoStatus);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
