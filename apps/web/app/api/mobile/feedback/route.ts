/**
 * Mobile App Feedback API
 *
 * POST /api/mobile/feedback — accepts bug reports / feature requests / general
 * feedback from the mobile app's Settings → Support → "Report App Issue" screen
 * (apps/mobile/src/features/feedback/index.tsx).
 *
 * Was previously calling this exact path with no backend route behind it — every
 * submission 404'd and the user's feedback was silently lost (surfaced to them
 * as "Submission Failed", but never reached anyone). Writes into the existing
 * (until now unused) `public.feedback` table from db/neon/0016_misc.sql.
 *
 * user_id is intentionally optional: feedback is reachable from both Local and
 * Cloud mode, and a Local-only user with no Cloud account must still be able to
 * submit feedback — the table's user_id column is nullable for this reason.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';

const FeedbackSchema = z.object({
  type: z.enum(['bug', 'feature', 'general']),
  message: z.string().trim().min(1).max(2000),
});

async function handleSubmitFeedback(request: NextRequest) {
  // Bearer-authenticated requests (the mobile app) are bypassed inside
  // requireCsrfToken; cookie-auth callers still need a valid token.
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'mobile-feedback');
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => null);
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.badRequest('Invalid feedback payload', parsed.error.flatten());
  }
  const { type, message } = parsed.data;

  // Soft auth — attribute the feedback when signed in, accept it anonymously
  // otherwise (Local-only users have no Cloud account to require here).
  const { userId } = await auth();

  const db = getNeonDb();
  try {
    await db.query(
      `insert into public.feedback (user_id, subject, message, metadata)
       values ($1, $2, $3, $4::jsonb)`,
      [userId ?? null, type, message, JSON.stringify({ type, source: 'mobile' })],
    );
  } catch (error) {
    logger.error({ error, userId, type }, 'Failed to store mobile feedback');
    throw createError.internal('Failed to submit feedback');
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handleSubmitFeedback);
