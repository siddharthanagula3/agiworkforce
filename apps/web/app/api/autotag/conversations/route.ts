import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';

const VALID_TAGS = [
  'coding',
  'research',
  'writing',
  'brainstorm',
  'analysis',
  'debug',
  'creative',
  'general',
] as const;

async function handleGetConversationsByTag(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const { searchParams } = new URL(request.url);
  const tag = searchParams.get('tag');

  if (!tag) {
    throw createError.validation('tag query parameter is required');
  }

  if (!VALID_TAGS.includes(tag as (typeof VALID_TAGS)[number])) {
    throw createError.validation(`Invalid tag. Must be one of: ${VALID_TAGS.join(', ')}`);
  }

  const rows = await db
    .query<{ conversation_id: string }>(
      `select ct.conversation_id::text as conversation_id
         from conversation_tags ct
         join public.web_conversations c
           on c.id = ct.conversation_id
          and c.user_id = $1
          and c.organization_id is not distinct from $3::uuid
          and c.deleted_at is null
        where ct.user_id = $1 and ct.tag = $2
        order by ct.classified_at desc
        limit 200`,
      [userId, tag, organizationId],
    )
    .catch((err: unknown) => {
      logger.error({ err, userId, tag }, 'Failed to fetch conversations by tag');
      throw createError.internal('Failed to fetch conversations');
    });

  const conversationIds = rows.map((row) => row.conversation_id);

  return NextResponse.json({ conversationIds });
}

export const GET = withErrorHandler(handleGetConversationsByTag);
