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
  closeCancelledImageGenerationJob,
  getImageGenerationJob,
  isImageJobStoreReady,
  requestImageGenerationCancellation,
} from '@/lib/server/image-generation-jobs';
import { finalizeManagedUsageRequest } from '@/lib/services/managed-usage-request-service';
import {
  imageJobDeliveredImages,
  publicImageJobSnapshot,
  reservationForImageJob,
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
  // only records the intent.
  const claimIsLive =
    requested.claimExpiresAt !== null && Date.parse(requested.claimExpiresAt) > Date.now();
  if (claimIsLive) {
    const images = await imageJobDeliveredImages(scoped.db, requested);
    return NextResponse.json(publicImageJobSnapshot(requested, images), {
      status: 202,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    });
  }

  let billingSettlementStatus: 'succeeded' | 'pending' | 'terminal' | null = null;
  let billingOutcome: 'released' | null = null;
  try {
    const settlement = await finalizeManagedUsageRequest({
      ...reservationForImageJob(scoped.db, requested),
      outcome: 'failed',
      actualCostMicrousd: 0,
      usage: {
        operation: 'image',
        sourceSurface: requested.sourceSurface,
        provider: requested.provider,
        model: requested.model,
        jobId: requested.id,
        reason: 'canceled_by_user',
      },
    });
    billingSettlementStatus = settlement.settlementStatus;
    billingOutcome = settlement.requestStatus === 'released' ? 'released' : null;
  } catch (error) {
    logger.error(
      { event: 'image_cancel_settlement_unrecorded', error, jobId: requested.id },
      'Image cancellation settlement could not be persisted',
    );
  }

  const closed = await closeCancelledImageGenerationJob({
    db: scoped.db,
    jobId: requested.id,
    userId,
    billingOutcome,
    billingSettlementStatus,
  });

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
