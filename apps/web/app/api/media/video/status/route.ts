import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { microusdFromLedgerCents } from '@/lib/services/credit-service';
import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
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
  if (!DURABLE_JOB_ID_PATTERN.test(taskId)) {
    throw createError.validation('Invalid task_id: expected a video job id');
  }

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
        estimatedCostMicrousd: microusdFromLedgerCents(job.estimatedCostCents),
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

export const GET = withErrorHandler(handleVideoStatus);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
