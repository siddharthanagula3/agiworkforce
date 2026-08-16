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

export const maxDuration = 120;
export const runtime = 'nodejs';

interface VideoStatusResponse {
  success: boolean;
  task_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'timeout';
  video_url?: string;
  thumbnail_url?: string;
  progress?: number;
  error?: string;
  provenance?: AiGeneratedProvenance;
}

const DURABLE_JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: {
          uri?: string;
          bytesBase64Encoded?: string;
        };
      }>;
    };
    generatedSamples?: Array<{
      video?: {
        uri?: string;
        bytesBase64Encoded?: string;
      };
    }>;
    videos?: Array<{
      video?: {
        uri?: string;
        bytesBase64Encoded?: string;
      };
    }>;
  };
}

function parseTaskId(taskId: string): { provider: 'runway' | 'google'; originalId: string } {
  if (taskId.startsWith('runway_')) {
    const originalId = taskId.substring(7);
    if (!/^[a-zA-Z0-9_-]+$/.test(originalId)) {
      throw createError.validation('Invalid task_id: contains disallowed characters');
    }
    return { provider: 'runway', originalId };
  }
  if (taskId.startsWith('google_')) {
    const originalId = taskId.substring(7);
    if (!/^[a-zA-Z0-9_-]+$/.test(originalId)) {
      throw createError.validation('Invalid task_id: contains disallowed characters');
    }
    return { provider: 'google', originalId };
  }
  throw createError.validation('Invalid task_id format. Expected "runway_..." or "google_..."');
}

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

async function getGoogleVeoStatus(operationId: string): Promise<VideoStatusResponse> {
  const apiKey =
    process.env['GOOGLE_API_KEY'] ??
    process.env['GOOGLE_AI_API_KEY'] ??
    process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    throw createError.serviceUnavailable('Google Veo API not configured');
  }

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

async function handleVideoStatus(request: NextRequest): Promise<NextResponse> {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  const rateLimitResponse = await withRateLimit(request, 'video-status');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { userId } = await getClerkAuthUser(request);

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

  const { provider, originalId } = parseTaskId(taskId);

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

  let statusResponse: VideoStatusResponse;

  try {
    if (provider === 'runway') {
      statusResponse = await getRunwayStatus(originalId);
    } else {
      statusResponse = await getGoogleVeoStatus(originalId);
    }
  } catch (error) {
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
