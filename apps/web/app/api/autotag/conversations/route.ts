/**
 * Autotag Conversations API
 *
 * GET /api/autotag/conversations?tag=coding - Get conversation IDs by tag
 *
 * Returns all conversation IDs for the authenticated user that match
 * the specified tag from the conversation_tags table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  // Parse and validate the tag query parameter
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
      `select conversation_id
     from conversation_tags
     where user_id = $1 and tag = $2
     order by classified_at desc
     limit 200`,
      [userId, tag],
    )
    .catch((err: unknown) => {
      logger.error({ err, userId, tag }, 'Failed to fetch conversations by tag');
      throw createError.internal('Failed to fetch conversations');
    });

  const conversationIds = rows.map((row) => row.conversation_id);

  return NextResponse.json({ conversationIds });
}

export const GET = withErrorHandler(handleGetConversationsByTag);
