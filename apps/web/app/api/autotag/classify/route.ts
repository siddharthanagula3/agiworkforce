import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { classifyConversationText } from '@/lib/services/conversation-classification-service';

async function handleClassify(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  let body: { conversationId?: string };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  const { conversationId } = body;
  if (!conversationId || typeof conversationId !== 'string') {
    throw createError.validation('conversationId is required');
  }

  const convRows = await db.query<{ id: string }>(
    `select id
     from web_conversations
     where id = $1
       and user_id = $2
       and organization_id is not distinct from $3::uuid
       and deleted_at is null`,
    [conversationId, userId, organizationId],
  );
  if (convRows.length === 0) {
    throw createError.notFound('Conversation not found');
  }

  let msgRows: { content: string }[];
  try {
    msgRows = await db.query<{ content: string }>(
      `select content
       from web_messages
       where conversation_id = $1
       order by created_at asc
       limit 5`,
      [conversationId],
    );
  } catch (err) {
    logger.error({ err }, 'Failed to fetch messages for classification');
    throw createError.internal('Failed to classify conversation');
  }

  const combinedText = msgRows.map((m) => m.content).join('\n');
  const tag = classifyConversationText(combinedText);

  try {
    await db.execute(
      `insert into conversation_tags (conversation_id, user_id, tag, confidence, classified_at)
       values ($1, $2, $3, $4, $5)
       on conflict (conversation_id, user_id) do update
         set tag = excluded.tag,
             confidence = excluded.confidence,
             classified_at = excluded.classified_at`,
      [conversationId, userId, tag, 1.0, new Date().toISOString()],
    );
  } catch (err) {
    logger.error({ err }, 'Failed to store conversation tag');
    throw createError.internal('Failed to store tag');
  }

  return NextResponse.json({ tag });
}

export const POST = withErrorHandler(handleClassify);
