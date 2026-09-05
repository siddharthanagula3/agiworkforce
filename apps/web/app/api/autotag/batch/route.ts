import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';

async function handleBatchGetTags(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  let body: { conversationIds?: string[] };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  const { conversationIds } = body;
  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    throw createError.validation('conversationIds must be a non-empty array');
  }

  if (conversationIds.length > 100) {
    throw createError.validation('Maximum 100 conversation IDs per request');
  }

  if (!conversationIds.every((id) => typeof id === 'string' && id.length > 0)) {
    throw createError.validation('All conversationIds must be non-empty strings');
  }

  let rows: { conversation_id: string; tag: string }[];
  try {
    rows = await db.query<{ conversation_id: string; tag: string }>(
      `select ct.conversation_id::text as conversation_id, ct.tag
         from conversation_tags ct
         join public.web_conversations c
           on c.id = ct.conversation_id
          and c.user_id = $1
          and c.organization_id is not distinct from $3::uuid
          and c.deleted_at is null
        where ct.user_id = $1
          and ct.conversation_id::text = any($2::text[])`,
      [userId, conversationIds, organizationId],
    );
  } catch (err) {
    logger.error({ err, userId }, 'Failed to fetch batch tags');
    throw createError.internal('Failed to fetch tags');
  }

  const tags: Record<string, string> = {};
  for (const id of conversationIds) {
    tags[id] = 'general';
  }
  for (const row of rows) {
    tags[row.conversation_id] = row.tag;
  }

  return NextResponse.json({ tags });
}

export const POST = withErrorHandler(handleBatchGetTags);
