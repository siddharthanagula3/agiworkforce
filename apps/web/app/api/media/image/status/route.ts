import 'server-only';

import { NextRequest, NextResponse, after } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { getImageGenerationJob, isImageJobStoreReady } from '@/lib/server/image-generation-jobs';
import { markManagedUsageClientDelivered } from '@/lib/services/managed-usage-request-service';
import {
  imageJobDeliveredImages,
  isImageJobAttemptDue,
  publicImageJobSnapshot,
  reservationForImageJob,
  runImageGenerationJobAttempt,
} from '../lib/image-job-executor';
import {
  aiGeneratedHeaders,
  buildAiGeneratedProvenance,
  type AiGeneratedProvenance,
} from '@/lib/compliance/ai-act';

/**
 * Durable image job status.
 * Endpoint: GET /api/media/image/status?job_id=xxx
 *
 * Poll this after submitting with `"async": true`, or after the submitting
 * request was interrupted. A job whose previous attempt was abandoned is
 * re-driven here: the response is returned first and the attempt runs after it,
 * so a status poll never waits on a provider call.
 */

export const maxDuration = 60;
export const runtime = 'nodejs';

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handleImageStatus(request: NextRequest): Promise<NextResponse> {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;

  const rateLimitResponse = await withRateLimit(request, 'image-generation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  const jobId = new URL(request.url).searchParams.get('job_id');
  if (!jobId) throw createError.validation('Missing required parameter: job_id');
  if (!JOB_ID_PATTERN.test(jobId)) throw createError.validation('Invalid job_id');

  const scoped = await getUserScopedDb(request);
  if (scoped.userId !== userId) {
    throw createError.forbidden('You do not have permission to check this job');
  }
  if (!(await isImageJobStoreReady(scoped.db))) {
    throw createError.serviceUnavailable(
      'Durable image jobs are not available on this deployment.',
    );
  }

  const job = await getImageGenerationJob(scoped.db, jobId, userId);
  if (!job) {
    logger.warn({ jobId, requestingUser: userId }, 'Durable image job ownership denied');
    throw createError.forbidden('You do not have permission to check this job');
  }

  if (isImageJobAttemptDue(job, Date.now())) {
    after(async () => {
      try {
        await runImageGenerationJobAttempt({ db: scoped.db, job });
      } catch (error) {
        logger.error({ error, jobId: job.id }, 'Image job re-drive failed after a status poll');
      }
    });
  }

  const images = await imageJobDeliveredImages(scoped.db, job);
  const snapshot = publicImageJobSnapshot(job, images);

  let provenance: AiGeneratedProvenance[] | undefined;
  if (job.status === 'completed' && images.length > 0) {
    provenance = images.map(() =>
      buildAiGeneratedProvenance({ kind: 'image', provider: job.provider, model: job.model }),
    );
    snapshot.provenance = provenance;
    try {
      await markManagedUsageClientDelivered(reservationForImageJob(scoped.db, job));
    } catch (error) {
      logger.warn({ error, jobId: job.id }, 'Image delivery marker could not be persisted');
    }
  }

  return NextResponse.json(snapshot, {
    headers: {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
      ...(provenance?.[0] ? aiGeneratedHeaders(provenance[0]) : {}),
    },
  });
}

export const GET = withErrorHandler(handleImageStatus);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
