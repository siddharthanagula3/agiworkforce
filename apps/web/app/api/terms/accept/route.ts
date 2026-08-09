/**
 * POST /api/terms/accept — record that the signed-in user accepted /terms.
 *
 * The clickwrap itself is `app/signup/TermsGate.tsx`: the Clerk widget is not
 * mounted until the box is ticked, so no account can be created without the
 * terms on screen. Assent can only be written once the account exists, though,
 * and it has to be written from a path Clerk middleware runs on — `/signup/**`
 * is not in `isClerkSessionRoute` in proxy.ts, so `auth()` is unavailable
 * there. `/signup/complete` therefore hands off to this route, which is under
 * `/api/(.*)` and does have a session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordTermsAcceptance } from '@/lib/server/terms';

const AcceptTermsSchema = z.object({
  surface: z.literal('web-signup'),
});

async function handleAcceptTerms(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  // Shares the per-user `me` bucket: this is a profile write, and it must not
  // fail closed — a limiter that blocks the call loses the record of an
  // acceptance the user has already given.
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await auth();
  if (!userId) {
    throw createError.unauthorized('Sign in to record terms acceptance');
  }

  const parsed = AcceptTermsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid terms acceptance payload', parsed.error.flatten());
  }

  try {
    const acceptance = await recordTermsAcceptance(userId, parsed.data.surface);
    return NextResponse.json({
      version: acceptance.version,
      acceptedAt: acceptance.acceptedAt,
    });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to record terms acceptance');
    throw createError.internal('Failed to record terms acceptance');
  }
}

export const POST = withErrorHandler(handleAcceptTerms);
