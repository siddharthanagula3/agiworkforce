import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { redactSecrets } from '@/lib/support/handoff/transcript';
import { getRequestIdentity } from '@/lib/server/identity';
import { isPrivateObjectStorageConfigured, putPrivateObject } from '@/lib/server/object-storage';
import { secureFilenameSegment } from '@/lib/secure-random';

const MAX_LOGS_CHARS = 20_000;
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const MAX_SCREENSHOT_DATA_URL_CHARS = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 64;
const SCREENSHOT_DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/u;
const SCREENSHOT_KEY_PREFIX = 'feedback';

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
      source: z.enum(['desktop', 'web']).optional(),
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
    })
    .superRefine((metadata, context) => {
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

  const safeSubject = redactSecrets(subject);
  const safeMessage = redactSecrets(message);
  const safeLogs = typeof logs === 'string' ? redactSecrets(logs).slice(0, MAX_LOGS_CHARS) : null;

  const { subject: userId } = await getRequestIdentity();
  const screenshotKey = screenshot
    ? await storeScreenshot(screenshot.data_url, userId ?? null)
    : null;

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
          ...(metadata.run_id ? { run_id: metadata.run_id } : {}),
          ...(metadata.rating ? { rating: metadata.rating } : {}),
          ...(metadata.finish_reason ? { finish_reason: metadata.finish_reason } : {}),
          ...(claimedUserId ? { claimed_user_id: claimedUserId } : {}),
          ...(safeLogs ? { logs: safeLogs } : {}),
          ...(screenshotKey ? { screenshot_key: screenshotKey } : {}),
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
