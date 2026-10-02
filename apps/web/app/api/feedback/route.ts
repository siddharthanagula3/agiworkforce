import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { redactTranscriptText } from '@/lib/support/handoff/transcript';
import { getOptionalAuthUser } from '@/lib/api-auth';
import { isPrivateObjectStorageConfigured, putPrivateObject } from '@/lib/server/object-storage';
import { secureFilenameSegment } from '@/lib/secure-random';
import {
  RESPONSE_RATING_COMMENT_MAX_CHARS,
  RESPONSE_RATING_MESSAGE_MAX_CHARS,
  RESPONSE_RATING_REASONS,
} from './response-rating-contract';

const MAX_LOGS_CHARS = 20_000;
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const MAX_SCREENSHOT_DATA_URL_CHARS = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 64;
const SCREENSHOT_DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/u;
const SCREENSHOT_KEY_PREFIX = 'feedback';

const INSERT_FEEDBACK_SQL = `insert into public.feedback (user_id, subject, message, metadata)
       values ($1, $2, $3, $4::jsonb)`;

const LOCK_RESPONSE_RATING_SQL = 'select pg_advisory_xact_lock(hashtextextended($1, 0))';

const DELETE_RESPONSE_RATING_SQL = `delete from public.feedback
        where user_id = $1
          and metadata->>'feedback_context' = 'response_rating'
          and metadata->>'message_id' = $2`;

async function storeScreenshot(dataUrl: string, userId: string | null): Promise<string | null> {
  const match = SCREENSHOT_DATA_URL.exec(dataUrl);
  if (!match) throw createError.badRequest('Screenshot must be a PNG, JPEG or WebP data URL');
  const [, format, base64] = match as unknown as [string, string, string];
  const data = Buffer.from(base64, 'base64');
  if (data.byteLength === 0 || data.byteLength > MAX_SCREENSHOT_BYTES) {
    throw createError.badRequest('Screenshot must be under 4 MiB');
  }
  if (!isPrivateObjectStorageConfigured()) {
    logger.warn('feedback screenshot dropped: private object storage is not configured');
    return null;
  }
  const extension = format === 'jpeg' ? 'jpg' : format;
  const key = `${SCREENSHOT_KEY_PREFIX}/${userId ?? 'anonymous'}/${Date.now()}_${secureFilenameSegment()}.${extension}`;
  await putPrivateObject({
    key,
    data,
    contentType: `image/${format}`,
    contentLength: data.byteLength,
  });
  return key;
}

const ResponseRatingTarget = z.object({
  message_id: z.string().trim().min(1).max(200),
});

const FeedbackSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10_000),
  user_id: z.string().trim().max(200).nullish(),
  metadata: z
    .object({
      source: z.enum(['desktop', 'web', 'vscode', 'cli']).optional(),
      platform: z.string().trim().max(100),
      version: z.string().trim().max(100),
      user_agent: z.string().trim().max(500),
      page_path: z.string().trim().max(2_000).optional(),
      conversation_id: z.string().trim().max(200).optional(),
      feedback_context: z.enum(['safety_refusal', 'response_rating', 'task_feedback']).optional(),
      message_id: z.string().trim().max(200).optional(),
      run_id: z.string().trim().max(200).optional(),
      finish_reason: z.enum(['refusal', 'content_filter']).optional(),
      rating: z.enum(['up', 'down']).optional(),
      reason: z.enum(RESPONSE_RATING_REASONS).optional(),
      comment: z.string().trim().min(1).max(RESPONSE_RATING_COMMENT_MAX_CHARS).optional(),
    })
    .superRefine((metadata, context) => {
      if (metadata.feedback_context !== 'response_rating') {
        for (const field of ['reason', 'comment'] as const) {
          if (metadata[field] !== undefined) {
            context.addIssue({
              code: 'custom',
              path: [field],
              message: `${field} belongs to a response rating`,
            });
          }
        }
      }
      // A rating with no message_id is an unattributable vote: it counts
      // towards a total nobody can trace back to an answer, which is worse
      // than not collecting it.
      if (metadata.feedback_context === 'response_rating') {
        if (!metadata.rating) {
          context.addIssue({
            code: 'custom',
            path: ['rating'],
            message: 'rating is required for a response rating',
          });
        }
        if (!metadata.message_id) {
          context.addIssue({
            code: 'custom',
            path: ['message_id'],
            message: 'message_id is required for a response rating',
          });
        }
        if ((metadata.reason || metadata.comment) && metadata.rating !== 'down') {
          context.addIssue({
            code: 'custom',
            path: ['rating'],
            message: 'a reason or comment comes with a thumbs-down rating',
          });
        }
        return;
      }
      // An AGI Work report that cannot name its run is untriageable: the whole
      // point of the control is that the task, not the message, is the subject.
      if (metadata.feedback_context === 'task_feedback') {
        if (!metadata.run_id) {
          context.addIssue({
            code: 'custom',
            path: ['run_id'],
            message: 'run_id is required for task feedback',
          });
        }
        return;
      }
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
  logs: z.string().max(MAX_LOGS_CHARS).nullish(),
  screenshot: z.object({ data_url: z.string().max(MAX_SCREENSHOT_DATA_URL_CHARS) }).nullish(),
});

const FeedbackPayloadSchema = FeedbackSchema.superRefine((feedback, context) => {
  if (feedback.metadata.feedback_context !== 'response_rating') return;
  if (feedback.message.length > RESPONSE_RATING_MESSAGE_MAX_CHARS) {
    context.addIssue({
      code: 'custom',
      path: ['message'],
      message: `a response rating's message is at most ${RESPONSE_RATING_MESSAGE_MAX_CHARS} characters`,
    });
  }
  for (const field of ['logs', 'screenshot'] as const) {
    if (feedback[field] != null) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} cannot be sent with a response rating`,
      });
    }
  }
});

type Feedback = z.infer<typeof FeedbackPayloadSchema>;

interface FeedbackAttachments {
  logs: string | null;
  screenshotKey: string | null;
}

const NO_ATTACHMENTS: FeedbackAttachments = { logs: null, screenshotKey: null };

function feedbackRow(
  userId: string | null,
  { subject, message, user_id: claimedUserId, metadata }: Feedback,
  { logs, screenshotKey }: FeedbackAttachments,
): unknown[] {
  return [
    userId,
    redactTranscriptText(subject),
    redactTranscriptText(metadata.comment ?? message),
    JSON.stringify({
      source: metadata.source ?? 'desktop',
      platform: metadata.platform,
      version: metadata.version,
      user_agent: metadata.user_agent,
      ...(metadata.page_path ? { page_path: metadata.page_path } : {}),
      ...(metadata.conversation_id ? { conversation_id: metadata.conversation_id } : {}),
      ...(metadata.feedback_context ? { feedback_context: metadata.feedback_context } : {}),
      ...(metadata.message_id ? { message_id: metadata.message_id } : {}),
      ...(metadata.run_id ? { run_id: metadata.run_id } : {}),
      ...(metadata.rating ? { rating: metadata.rating } : {}),
      ...(metadata.reason ? { reason: metadata.reason } : {}),
      ...(metadata.finish_reason ? { finish_reason: metadata.finish_reason } : {}),
      ...(claimedUserId ? { claimed_user_id: claimedUserId } : {}),
      ...(logs ? { logs } : {}),
      ...(screenshotKey ? { screenshot_key: screenshotKey } : {}),
    }),
  ];
}

async function replaceResponseRating(
  userId: string,
  messageId: string,
  replacement: unknown[] | null,
): Promise<void> {
  const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
  await db.transaction(async (tx) => {
    await tx.execute(LOCK_RESPONSE_RATING_SQL, [`agi:response-rating:${userId}:${messageId}`]);
    await tx.execute(DELETE_RESPONSE_RATING_SQL, [userId, messageId]);
    if (replacement) await tx.execute(INSERT_FEEDBACK_SQL, replacement);
  });
}

async function submitResponseRating(request: NextRequest, feedback: Feedback) {
  const userId = (await getOptionalAuthUser(request))?.userId;
  if (!userId) throw createError.unauthorized('Sign in to rate a response');
  const { message_id: messageId } = ResponseRatingTarget.parse(feedback.metadata);

  try {
    await replaceResponseRating(userId, messageId, feedbackRow(userId, feedback, NO_ATTACHMENTS));
  } catch (error) {
    logger.error(
      {
        error,
        userId,
        feedbackContext: 'response_rating',
        source: feedback.metadata.source ?? 'desktop',
      },
      'Failed to store feedback',
    );
    throw createError.internal('Failed to submit feedback');
  }

  return NextResponse.json({ success: true });
}

async function submitReport(request: NextRequest, feedback: Feedback) {
  const reportLimitResponse = await withRateLimit(request, 'mobile-feedback');
  if (reportLimitResponse) return reportLimitResponse;

  const logs =
    typeof feedback.logs === 'string'
      ? redactTranscriptText(feedback.logs).slice(0, MAX_LOGS_CHARS)
      : null;

  const userId = (await getOptionalAuthUser(request))?.userId ?? null;
  const screenshotKey = feedback.screenshot
    ? await storeScreenshot(feedback.screenshot.data_url, userId)
    : null;

  const ownerDb = getNeonDb();
  const db = userId
    ? createClaimedUserScopedDb(ownerDb, { userId, organizationId: null })
    : ownerDb;
  try {
    await db.query(INSERT_FEEDBACK_SQL, feedbackRow(userId, feedback, { logs, screenshotKey }));
  } catch (error) {
    logger.error(
      {
        error,
        userId,
        feedbackContext: feedback.metadata.feedback_context ?? null,
        source: feedback.metadata.source ?? 'desktop',
      },
      'Failed to store feedback',
    );
    throw createError.internal('Failed to submit feedback');
  }

  return NextResponse.json({ success: true });
}

async function handleSubmitFeedback(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'feedback');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = FeedbackPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid feedback payload', parsed.error.flatten());
  }

  return parsed.data.metadata.feedback_context === 'response_rating'
    ? submitResponseRating(request, parsed.data)
    : submitReport(request, parsed.data);
}

async function handleRemoveResponseRating(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'feedback');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = (await getOptionalAuthUser(request))?.userId;
  if (!userId) throw createError.unauthorized('Sign in to remove a rating');

  const target = ResponseRatingTarget.safeParse({
    message_id: new URL(request.url).searchParams.get('message_id'),
  });
  if (!target.success) {
    throw createError.badRequest('Invalid rating to remove', target.error.flatten());
  }

  try {
    await replaceResponseRating(userId, target.data.message_id, null);
  } catch (error) {
    logger.error({ error, userId }, 'Failed to remove response rating');
    throw createError.internal('Failed to remove rating');
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handleSubmitFeedback);
export const DELETE = withErrorHandler(handleRemoveResponseRating);
