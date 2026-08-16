import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  DATA_RIGHTS_REQUEST_TYPES,
  MAX_REQUEST_DETAILS_LENGTH,
  createDataRightsRequest,
  isDataRightsRequestType,
  readUserDataRightsRequests,
} from '@/lib/server/data-rights-requests';

const CreateRequestSchema = z.object({
  requestType: z.string().refine(isDataRightsRequestType, 'Unknown request type'),
  contactEmail: z.string().email().max(254),
  details: z.string().max(MAX_REQUEST_DETAILS_LENGTH).optional(),
});

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'waitlist');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = CreateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Invalid rights-request payload', parsed.error.flatten());
  }

  let userId: string | null = null;
  try {
    userId = (await auth()).userId ?? null;
  } catch {
    userId = null;
  }

  try {
    const created = await createDataRightsRequest({
      userId,
      contactEmail: parsed.data.contactEmail.trim().toLowerCase(),
      requestType: parsed.data.requestType,
      details: parsed.data.details?.trim() || null,
    });
    return NextResponse.json({
      reference: created.reference,
      requestType: created.requestType,
      status: created.status,
      createdAt: created.createdAt,
    });
  } catch (error) {
    logger.error(
      { error, requestType: parsed.data.requestType },
      'Failed to record rights request',
    );
    throw createError.internal('Your request could not be recorded, so nothing was stored');
  }
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await auth();
  if (!userId) {
    throw createError.unauthorized('Sign in to see the requests recorded against your account');
  }

  const requests = await readUserDataRightsRequests(userId);
  return NextResponse.json({ requests, types: DATA_RIGHTS_REQUEST_TYPES });
}

export const POST = withErrorHandler(handlePost);
export const GET = withErrorHandler(handleGet);
