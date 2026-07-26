/**
 * Desktop App Feedback API
 *
 * POST /api/feedback — accepts feedback submitted from the desktop app's
 * feedback dialog (`apps/desktop/src-tauri/src/sys/commands/feedback.rs`,
 * `submit_feedback`) and the web chat composer footer.
 *
 * STB-5: the Rust command has always POSTed to `{api_base}/api/feedback`, but
 * no such route existed. Every desktop feedback submission 404'd and the
 * user's report was lost. `/api/support` could not serve this traffic — it
 * requires a hard-authenticated Clerk session plus `name`/`email`, neither of
 * which the desktop payload carries — so this route mirrors
 * `/api/mobile/feedback` instead: same `public.feedback` table, same soft-auth
 * posture, different payload shape.
 *
 * user_id is intentionally optional: the desktop feedback dialog is reachable
 * from Local mode, where the user may have no Cloud account at all. The
 * table's user_id column is nullable for this reason.
 *
 * The `user_id` field in the request body is CLIENT-SUPPLIED and therefore
 * untrusted — it is recorded in metadata as `claimed_user_id`, never written
 * to the attributing `user_id` column. Only a server-verified Clerk session
 * attributes feedback to an account.
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

/** Cap the attached diagnostic log so one submission can't bloat the table. */
const MAX_LOGS_CHARS = 20_000;

const FeedbackSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10_000),
  /** Client-claimed identity. Untrusted — see module doc. */
  user_id: z.string().trim().max(200).nullish(),
  metadata: z.object({
    source: z.enum(['desktop', 'web']).optional(),
    platform: z.string().trim().max(100),
    version: z.string().trim().max(100),
    user_agent: z.string().trim().max(500),
    page_path: z.string().trim().max(2_000).optional(),
    conversation_id: z.string().trim().max(200).optional(),
  }),
  /** WARN/ERROR log lines, already filtered and truncated on the desktop side. */
  logs: z.string().max(MAX_LOGS_CHARS).nullish(),
});

async function handleSubmitFeedback(request: NextRequest) {
  // Bearer-authenticated requests are bypassed inside requireCsrfToken;
  // cookie-auth callers still need a valid token.
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'mobile-feedback');
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => null);
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.badRequest('Invalid feedback payload', parsed.error.flatten());
  }
  const { subject, message, user_id: claimedUserId, metadata, logs } = parsed.data;

  // Soft auth — attribute the feedback when signed in, accept it anonymously
  // otherwise (Local-only users have no Cloud account to require here).
  const { userId } = await auth();

  const db = getNeonDb();
  try {
    await db.query(
      `insert into public.feedback (user_id, subject, message, metadata)
       values ($1, $2, $3, $4::jsonb)`,
      [
        userId ?? null,
        subject,
        message,
        JSON.stringify({
          source: metadata.source ?? 'desktop',
          platform: metadata.platform,
          version: metadata.version,
          user_agent: metadata.user_agent,
          ...(metadata.page_path ? { page_path: metadata.page_path } : {}),
          ...(metadata.conversation_id ? { conversation_id: metadata.conversation_id } : {}),
          ...(claimedUserId ? { claimed_user_id: claimedUserId } : {}),
          ...(logs ? { logs } : {}),
        }),
      ],
    );
  } catch (error) {
    logger.error(
      { error, userId, subject, source: metadata.source ?? 'desktop' },
      'Failed to store feedback',
    );
    throw createError.internal('Failed to submit feedback');
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handleSubmitFeedback);
