
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { UserMemoryRow } from '@/lib/server/neon-types';

async function handleSearchMemories(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();

  if (!query || query.length === 0) {
    throw createError.validation('Search query is required');
  }

  if (query.length > 500) {
    throw createError.validation('Search query must be 500 characters or less');
  }

  const escapedQuery = query.replace(/[%_\\]/g, '\\$&');

  let data: UserMemoryRow[];
  try {
    data = await db.query<UserMemoryRow>(
      `select id, content, category, source, created_at, updated_at
       from user_memories
       where user_id = $1 and is_deleted = false and content ilike $2
       order by updated_at desc
       limit 20`,
      [userId, `%${escapedQuery}%`],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to search memories');
    throw createError.internal('Failed to search memories');
  }

  return NextResponse.json({
    memories: data.map((m) => ({
      id: m.id,
      content: m.content,
      category: m.category,
      source: m.source,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })),
    query,
  });
}

export const GET = withErrorHandler(handleSearchMemories);
