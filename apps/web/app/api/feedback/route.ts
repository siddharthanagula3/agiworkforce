import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { redactTranscriptText } from '@/lib/support/handoff/transcript';
import { getOptionalAuthUser } from '@/lib/api-auth';
import { isPrivateObjectStorageConfigured, putPrivateObject } from '@/lib/server/object-storage';
import { secureFilenameSegment } from '@/lib/secure-random';
import {
  RESPONSE_RATING_COMMENT_MAX_CHARS,
  RESPONSE_RATING_REASONS,
} from './response-rating-contract';

const MAX_LOGS_CHARS = 20_000;
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const MAX_SCREENSHOT_DATA_URL_CHARS = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 64;
const SCREENSHOT_DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/u;
const SCREENSHOT_KEY_PREFIX = 'feedback';

const INSERT_FEEDBACK_SQL = `insert into public.feedback (user_id, subject, message, metadata)
       values ($1, $2, $3, $4::jsonb)`;

const RECORD_RATING_SQL = `insert into public.feedback (id, user_id, subject, message, metadata)
       values ($5::uuid, $1, $2, $3, $4::jsonb)
       on conflict (id) do nothing`;

const RECORD_RATING_DETAILS_SQL = `insert into public.feedback (id, user_id, subject, message, metadata)
       values ($5::uuid, $1, $2, $3, $4::jsonb)
       on conflict (id) do update
          set subject = excluded.subject,
              message = excluded.message,
              metadata = excluded.metadata
        where public.feedback.user_id = excluded.user_id
          and public.feedback.metadata->>'feedback_context' = 'response_rating'
          and public.feedback.metadata->>'message_id' = excluded.metadata->>'message_id'`;

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
      feedback_id: z.string().uuid().optional(),
      reason: z.enum(RESPONSE_RATING_REASONS).optional(),
      comment: z.string().trim().min(1).max(RESPONSE_RATING_COMMENT_MAX_CHARS).optional(),
    })
    .superRefine((metadata, context) => {
      if (metadata.feedback_context !== 'response_rating') {
        for (const field of ['feedback_id', 'reason', 'comment'] as const) {
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

async function handleSubmitFeedback(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'mobile-feedback');
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => null);
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.badRequest('Invalid feedback payload', parsed.error.flatten());
  }
  const { subject, message, user_id: claimedUserId, metadata, logs, screenshot } = parsed.data;

  const safeSubject = redactTranscriptText(subject);
  const safeMessage = redactTranscriptText(message);
  const safeLogs =
    typeof logs === 'string' ? redactTranscriptText(logs).slice(0, MAX_LOGS_CHARS) : null;

  const userId = (await getOptionalAuthUser(request))?.userId ?? null;
  const screenshotKey = screenshot
    ? await storeScreenshot(screenshot.data_url, userId ?? null)
    : null;

  const ratingDetails = Boolean(metadata.reason || metadata.comment);
  const params = [
    userId ?? null,
    safeSubject,
    metadata.comment ? redactTranscriptText(metadata.comment) : safeMessage,
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
      ...(safeLogs ? { logs: safeLogs } : {}),
      ...(screenshotKey ? { screenshot_key: screenshotKey } : {}),
    }),
  ];

  const db = getNeonDb();
  let stored = true;
  try {
    if (!metadata.feedback_id) {
      await db.query(INSERT_FEEDBACK_SQL, params);
    } else if (!ratingDetails) {
      await db.query(RECORD_RATING_SQL, [...params, metadata.feedback_id]);
    } else {
      stored = (await db.execute(RECORD_RATING_DETAILS_SQL, [...params, metadata.feedback_id])) > 0;
    }
  } catch (error) {
    logger.error(
      {
        error,
        userId,
        feedbackContext: metadata.feedback_context ?? null,
        source: metadata.source ?? 'desktop',
      },
      'Failed to store feedback',
    );
    throw createError.internal('Failed to submit feedback');
  }
  if (!stored) {
    throw createError.conflict('This rating could not be updated.');
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handleSubmitFeedback);
