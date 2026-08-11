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
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CURRENT_TERMS_VERSION, recordTermsAcceptance } from '@/lib/server/terms';

const AcceptTermsSchema = z.object({
  surface: z.enum(['web-signup', 'web-login']),
  version: z.string().min(1).max(32),
});

async function handleAcceptTerms(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const { userId } = await auth();
  if (!userId) {
    throw createError.unauthorized('Sign in to record terms acceptance');
  }

  const parsed = AcceptTermsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid terms acceptance payload', parsed.error.flatten());
  }
  if (parsed.data.version !== CURRENT_TERMS_VERSION) {
    return NextResponse.json(
      {
        error: {
          code: 'TERMS_VERSION_OUTDATED',
          message: 'The Terms of Service changed after this page loaded.',
        },
        currentVersion: CURRENT_TERMS_VERSION,
      },
      { status: 409 },
    );
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
