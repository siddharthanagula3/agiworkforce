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

/**
 * POST /api/privacy/requests — record a data-principal rights request.
 * GET  /api/privacy/requests — the signed-in user's own requests.
 *
 * Open to visitors without an account, deliberately. A Data Principal's rights
 * under the DPDP Act do not depend on holding an account with the fiduciary,
 * and the people most likely to need the erasure and grievance routes are
 * exactly those whose address sits on a list they never signed up to an account
 * for. When a Clerk session exists it is attached, which is what lets the same
 * person see their own request history on the GET.
 *
 * WHAT THIS ROUTE PROMISES: the request is stored and a reference is returned.
 * It emails nobody. An email provider is wired in this repository — see
 * `lib/support/handoff/resend-client.ts` — but nothing connects it to this
 * queue. The page says so in those words. Do not add copy here or on the page
 * that implies a notification was sent until something sends one.
 */

const CreateRequestSchema = z.object({
  requestType: z.string().refine(isDataRightsRequestType, 'Unknown request type'),
  contactEmail: z.string().email().max(254),
  details: z.string().max(MAX_REQUEST_DETAILS_LENGTH).optional(),
});

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  // `requireCsrfToken` is typed to the web `Response`; every route in this app
  // narrows it the same way rather than widening its own return type.
  if (csrfResponse) return csrfResponse as NextResponse;

  // The same dedicated 'waitlist' limit the other public PII intake uses:
  // 5/hour per IP, fail-closed. A rights-request form is a plaintext-email
  // intake open to anonymous callers and warrants the tight limit.
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
    // auth() throws outside Clerk middleware context. An anonymous request is a
    // valid request, so this is not an error path.
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
    // Never return a reference for a request that was not stored: the reference
    // is the requester's only evidence, and a fake one is worse than an error.
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
