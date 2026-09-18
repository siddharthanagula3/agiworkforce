import 'server-only';

import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { ManagedMediaImageRefSchema } from '@agiworkforce/cloud-contracts';
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
  isImageGenerationJobRetryable,
  isImageJobStoreReady,
  requeueImageGenerationJob,
} from '@/lib/server/image-generation-jobs';
import { markManagedUsageClientDelivered } from '@/lib/services/managed-usage-request-service';
import { resolveImageRefBytes } from '../lib/image-generation-provider';
import {
  imageJobDeliveredImages,
  publicImageJobSnapshot,
  reservationForImageJob,
  runImageGenerationJobAttempt,
  type ImageJobInlineEdit,
} from '../lib/image-job-executor';

// A retry runs on the reservation the first attempt already charged; a job out of
// attempts is refused rather than re-charged.

export const maxDuration = 60;
export const runtime = 'nodejs';

const ImageRetryRequestSchema = z
  .object({
    job_id: z.string().uuid(),
    source_image: ManagedMediaImageRefSchema.optional(),
    mask_image: ManagedMediaImageRefSchema.optional(),
  })
  .strict();

async function handleImageRetry(request: NextRequest): Promise<NextResponse> {
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
  const parsed = ImageRetryRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation(
      `Invalid request: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  const scoped = await getUserScopedDb(request);
  if (scoped.userId !== userId) {
    throw createError.forbidden('You do not have permission to retry this job');
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
      'Durable image job retry ownership denied',
    );
    throw createError.forbidden('You do not have permission to retry this job');
  }
  if (!isImageGenerationJobRetryable(existing)) {
    return NextResponse.json(
      {
        error: {
          message:
            existing.attempts >= existing.maxAttempts
              ? 'This image has used every retry included with the original request. Start a new generation.'
              : 'This image job cannot be retried in its current state.',
          type: 'invalid_request_error',
          code: 'image_job_not_retryable',
        },
      },
      { status: 409, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
    );
  }

  let inlineEdit: ImageJobInlineEdit | undefined;
  if (parsed.data.source_image) {
    try {
      const sourceBytes = await resolveImageRefBytes(parsed.data.source_image, userId, scoped.db);
      const maskBytes = parsed.data.mask_image
        ? await resolveImageRefBytes(parsed.data.mask_image, userId, scoped.db)
        : undefined;
      inlineEdit = { sourceBytes, ...(maskBytes ? { maskBytes } : {}) };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), jobId: existing.id },
        'Image retry source could not be resolved',
      );
      throw createError.validation(
        'The source image for this retry could not be read. Upload the image again.',
      );
    }
  }

  const requeued = await requeueImageGenerationJob({
    db: scoped.db,
    jobId: existing.id,
    userId,
  });
  if (!requeued) {
    throw createError.conflict('This image job is already running.');
  }

  const outcome = await runImageGenerationJobAttempt({
    db: scoped.db,
    job: requeued,
    inlineEdit,
  });

  const images = await imageJobDeliveredImages(scoped.db, outcome.job);
  if (outcome.job.status === 'completed') {
    try {
      await markManagedUsageClientDelivered(reservationForImageJob(scoped.db, outcome.job));
    } catch (error) {
      logger.warn({ error, jobId: outcome.job.id }, 'Image delivery marker could not be persisted');
    }
  }

  return NextResponse.json(
    publicImageJobSnapshot(outcome.job, images.length > 0 ? images : outcome.images),
    {
      status: outcome.job.status === 'completed' ? 200 : 422,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    },
  );
}

export const POST = withErrorHandler(handleImageRetry);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
