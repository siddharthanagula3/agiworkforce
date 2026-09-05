import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { getRequestIdentity } from '@/lib/server/identity';

const FeedbackSchema = z.object({
  type: z.enum(['bug', 'feature', 'general']),
  message: z.string().trim().min(1).max(2000),
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
  const { type, message } = parsed.data;

  const { subject: userId } = await getRequestIdentity();

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
