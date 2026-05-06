/**
 * Memory Search API
 *
 * GET /api/memory/search?q=search+terms - Search user memories by content
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';

async function handleSearchMemories(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-bound client: no .eq('user_id') filter needed — DB enforces it.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);

  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();

  if (!query || query.length === 0) {
    throw createError.validation('Search query is required');
  }

  if (query.length > 500) {
    throw createError.validation('Search query must be 500 characters or less');
  }

  // Escape LIKE wildcards to prevent wildcard injection
  const escapedQuery = query.replace(/[%_\\]/g, '\\$&');

  // Simple ILIKE text search - can be upgraded to vector similarity later
  const { data, error } = await supabase
    .from('user_memories')
    .select('id, content, category, source, created_at, updated_at')
    .eq('is_deleted', false)
    .ilike('content', `%${escapedQuery}%`)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to search memories');
    throw createError.internal('Failed to search memories');
  }

  return NextResponse.json({
    memories: (data || []).map((m) => ({
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
