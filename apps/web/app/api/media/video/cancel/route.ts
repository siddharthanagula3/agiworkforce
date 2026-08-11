import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getCorsHeaders, getSecurityHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  getVideoGenerationJob,
  requestVideoGenerationCancellation,
  type VideoGenerationJob,
} from '@/lib/server/video-generation-jobs';
import {
  publicVideoJobStatus,
  reconcileVideoGenerationJob,
} from '@/lib/services/video-job-reconciliation-service';

export const maxDuration = 60;
export const runtime = 'nodejs';

const CancelVideoSchema = z
  .object({
    task_id: z.string().uuid(),
  })
  .strict();

function cancellationState(
  job: VideoGenerationJob,
):
  | 'not_applicable'
  | 'unsupported'
  | 'requested'
  | 'provider_request_acknowledged'
  | 'unconfirmed' {
  if (!job.cancelRequestedAt) return 'not_applicable';
  if (job.provider !== 'runway') return 'unsupported';
  if (job.providerCancelAcknowledgedAt) return 'provider_request_acknowledged';
  return job.providerCancelAttemptedAt || job.cancelAttempts >= 5 ? 'unconfirmed' : 'requested';
}

function responseForCancellation(request: NextRequest, job: VideoGenerationJob, status: number) {
  const publicStatus = publicVideoJobStatus(job);
  return NextResponse.json(
    {
      success: true,
      task_id: job.id,
      status: publicStatus.status,
      cancel_requested: Boolean(job.cancelRequestedAt),
      provider_cancellation: cancellationState(job),
      message:
        job.provider !== 'runway' && job.cancelRequestedAt
          ? 'Cancellation was recorded, but this provider exposes no verified cancellation operation. AGI will keep reconciling the task and bill only a deliverable result.'
          : job.providerCancelAcknowledgedAt
            ? 'Runway acknowledged the task-management request. AGI will verify the terminal provider state before settling the billing reservation.'
            : job.cancelRequestedAt
              ? 'Cancellation was recorded. The video reconciler will attempt it once and verify the provider state without unsafe DELETE retries.'
              : 'This video job is already terminal and cannot be cancelled.',
    },
    {
      status,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    },
  );
}

async function handleCancelVideo(request: NextRequest): Promise<NextResponse> {
  const preflight = handleCorsPreflightRequest(request);
  if (preflight) return preflight;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const rateLimit = await withRateLimit(request, 'video-status');
  if (rateLimit) return rateLimit;

  const { userId } = await getClerkAuthUser(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }
  const parsed = CancelVideoSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('A valid durable video task_id is required.');

  const scoped = await getUserScopedDb(request);
  if (scoped.userId !== userId) throw createError.forbidden('Video job tenant mismatch.');
  const snapshot = await getVideoGenerationJob(scoped.db, parsed.data.task_id, userId);
  if (!snapshot) throw createError.notFound('Video generation task not found.');
  if (
    snapshot.status === 'completed' ||
    snapshot.status === 'failed' ||
    snapshot.status === 'outcome_unknown'
  ) {
    return responseForCancellation(request, snapshot, 200);
  }

  const requested = await requestVideoGenerationCancellation({
    db: scoped.db,
    jobId: snapshot.id,
    userId,
  });
  if (!requested) {
    const current = await getVideoGenerationJob(scoped.db, snapshot.id, userId);
    if (!current) throw createError.notFound('Video generation task not found.');
    return responseForCancellation(request, current, 200);
  }

  // Runway documents DELETE /v1/tasks/{id}; use the shared DB-claimed
  // reconciler so status requests and Workflow cannot race the cancellation call.
  // Other providers are deliberately only recorded because their verified
  // video surfaces have no cancellation method.
  if (requested.provider === 'runway') {
    try {
      const reconciled = await reconcileVideoGenerationJob(scoped.db, requested);
      return responseForCancellation(request, reconciled, 202);
    } catch (error) {
      logger.warn({ error, jobId: requested.id }, 'Immediate video cancellation attempt deferred');
    }
  }
  return responseForCancellation(request, requested, 202);
}

export const POST = withErrorHandler(handleCancelVideo);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
