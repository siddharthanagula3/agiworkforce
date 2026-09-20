import 'server-only';

import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  getImageGenerationJob,
  isImageJobStoreReady,
  requestImageGenerationCancellation,
} from '@/lib/server/image-generation-jobs';
import {
  imageJobDeliveredImages,
  isImageJobCancellationPending,
  publicImageJobSnapshot,
  reconcileCancelledImageGenerationJob,
} from '../lib/image-job-executor';

/**
 * Cancel a durable image job.
 * Endpoint: POST /api/media/image/cancel  { "job_id": "..." }
 *
 * Cancellation stops the job from taking another attempt and releases the
 * reservation it was holding. An attempt already inside a provider call keeps
 * its claim: those images are already paid for, so the executor finishes and
 * delivers them rather than leaving the account charged for nothing.
 */

export const maxDuration = 30;
export const runtime = 'nodejs';

const ImageCancelRequestSchema = z.object({ job_id: z.string().uuid() }).strict();

async function handleImageCancel(request: NextRequest): Promise<NextResponse> {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'image-generation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }
  const parsed = ImageCancelRequestSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request: job_id must be a job id');

  const scoped = await getUserScopedDb(request);
  if (scoped.userId !== userId) {
    throw createError.forbidden('You do not have permission to cancel this job');
  }
  if (!(await isImageJobStoreReady(scoped.db))) {
    throw createError.serviceUnavailable(
      'Durable image jobs are not available on this deployment.',
    );
  }

  const existing = await getImageGenerationJob(scoped.db, parsed.data.job_id, userId);
  if (!existing) {
    logger.warn(
      { jobId: parsed.data.job_id, requestingUser: userId },
      'Durable image job cancel ownership denied',
    );
    throw createError.forbidden('You do not have permission to cancel this job');
  }

  const requested = await requestImageGenerationCancellation({
    db: scoped.db,
    jobId: existing.id,
    userId,
  });
  if (!requested) {
    const images = await imageJobDeliveredImages(scoped.db, existing);
    return NextResponse.json(publicImageJobSnapshot(existing, images), {
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    });
  }

  // Setting cancel_requested_at already stops any further attempt from being
  // claimed. An attempt still holding a live claim is inside a provider call it
  // has paid for, so the reservation stays with that attempt and this request
  // only records the intent; the status poll and the queued drive finish the
  // job if that attempt never comes back.
  if (!isImageJobCancellationPending(requested, Date.now())) {
    const images = await imageJobDeliveredImages(scoped.db, requested);
    return NextResponse.json(publicImageJobSnapshot(requested, images), {
      status: 202,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    });
  }

  const closed = await reconcileCancelledImageGenerationJob({ db: scoped.db, job: requested });
  const job = closed ?? requested;
  const images = await imageJobDeliveredImages(scoped.db, job);
  return NextResponse.json(publicImageJobSnapshot(job, images), {
    headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
  });
}

export const POST = withErrorHandler(handleImageCancel);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
