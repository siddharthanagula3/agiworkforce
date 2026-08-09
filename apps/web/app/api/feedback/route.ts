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
 *
 * REDACTION IS SERVER-SIDE. The desktop client filters its own log lines
 * (`redact_log_record` in apps/desktop/src-tauri/src/sys/support_bundle.rs),
 * but this is a public HTTP route: the web composer posts to it
 * too, older desktop builds keep posting to it, and any client can post to it
 * directly. So the same `redactSecrets` the support handoff uses runs here
 * BEFORE the insert, on the free-text fields and the attached log blob. A
 * pasted API key never lands in `public.feedback`.
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
import { redactSecrets } from '@/lib/support/handoff/transcript';

/** Cap the attached diagnostic log so one submission can't bloat the table. */
const MAX_LOGS_CHARS = 20_000;

const FeedbackSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10_000),
  /** Client-claimed identity. Untrusted — see module doc. */
  user_id: z.string().trim().max(200).nullish(),
  metadata: z
    .object({
      source: z.enum(['desktop', 'web']).optional(),
      platform: z.string().trim().max(100),
      version: z.string().trim().max(100),
      user_agent: z.string().trim().max(500),
      page_path: z.string().trim().max(2_000).optional(),
      conversation_id: z.string().trim().max(200).optional(),
      feedback_context: z.enum(['safety_refusal']).optional(),
      message_id: z.string().trim().max(200).optional(),
      finish_reason: z.enum(['refusal', 'content_filter']).optional(),
    })
    .superRefine((metadata, context) => {
      if (metadata.feedback_context !== 'safety_refusal') return;
      if (!metadata.message_id) {
        context.addIssue({
          code: 'custom',
          path: ['message_id'],
          message: 'message_id is required for a safety refusal report',
        });
      }
      if (!metadata.finish_reason) {
        context.addIssue({
          code: 'custom',
          path: ['finish_reason'],
          message: 'finish_reason is required for a safety refusal report',
        });
      }
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

  // See module doc: redaction runs on the server, before the insert, because
  // client-side filtering cannot be relied on for a public route.
  const safeSubject = redactSecrets(subject);
  const safeMessage = redactSecrets(message);
  // A replacement marker can be longer than the secret it replaced, so re-apply
  // the cap after redaction rather than trusting the pre-redaction length.
  const safeLogs = typeof logs === 'string' ? redactSecrets(logs).slice(0, MAX_LOGS_CHARS) : null;

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
        safeSubject,
        safeMessage,
        JSON.stringify({
          source: metadata.source ?? 'desktop',
          platform: metadata.platform,
          version: metadata.version,
          user_agent: metadata.user_agent,
          ...(metadata.page_path ? { page_path: metadata.page_path } : {}),
          ...(metadata.conversation_id ? { conversation_id: metadata.conversation_id } : {}),
          ...(metadata.feedback_context ? { feedback_context: metadata.feedback_context } : {}),
          ...(metadata.message_id ? { message_id: metadata.message_id } : {}),
          ...(metadata.finish_reason ? { finish_reason: metadata.finish_reason } : {}),
          ...(claimedUserId ? { claimed_user_id: claimedUserId } : {}),
          ...(safeLogs ? { logs: safeLogs } : {}),
        }),
      ],
    );
  } catch (error) {
    logger.error(
      { error, userId, subject: safeSubject, source: metadata.source ?? 'desktop' },
      'Failed to store feedback',
    );
    throw createError.internal('Failed to submit feedback');
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handleSubmitFeedback);
