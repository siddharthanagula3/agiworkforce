import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';

const ContentReportSchema = z.object({
  reportId: z.string().trim().min(1).max(128),
  messageId: z.string().trim().min(1).max(200),
  conversationId: z.string().trim().min(1).max(200),
  category: z.enum(['harmful', 'inaccurate', 'offensive', 'misinformation', 'privacy', 'other']),
  contentExcerpt: z.string().max(500).default(''),
  userNote: z.string().max(2000).default(''),
});

async function handleSubmitContentReport(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'mobile-content-report');
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => null);
  const parsed = ContentReportSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.badRequest('Invalid content report payload', parsed.error.flatten());
  }
  const { reportId, messageId, conversationId, category, contentExcerpt, userNote } = parsed.data;

  const { userId } = await auth();

  const db = getNeonDb();
  try {
    await db.query(
      `insert into public.content_reports
         (user_id, client_report_id, message_id, conversation_id, category, content_excerpt, user_note, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       on conflict (client_report_id) do nothing`,
      [
        userId ?? null,
        reportId,
        messageId,
        conversationId,
        category,
        contentExcerpt,
        userNote,
        JSON.stringify({ source: 'mobile', category }),
      ],
    );
  } catch (error) {
    logger.error({ error, userId, category }, 'Failed to store mobile content report');
    throw createError.internal('Failed to submit content report');
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handleSubmitContentReport);
