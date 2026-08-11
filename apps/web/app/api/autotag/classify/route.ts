/**
 * Autotag Classify API
 *
 * POST /api/autotag/classify - Classify a conversation by its content
 *
 * Reads the first 5 messages from a conversation, runs a keyword-based
 * classifier, stores the result in conversation_tags, and returns the tag.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { classifyConversationText } from '@/lib/services/conversation-classification-service';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

async function handleClassify(request: NextRequest) {
  // AUDIT-008-006: Enforce CSRF protection for DB-writing endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);

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

  // Verify conversation ownership
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

  // Get first 5 messages for classification
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

  // Combine all message content for classification
  const combinedText = msgRows.map((m) => m.content).join('\n');
  const tag = classifyConversationText(combinedText);

  // Upsert the tag (insert or update if already exists)
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
