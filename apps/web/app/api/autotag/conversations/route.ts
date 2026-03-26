/**
 * Autotag Conversations API
 *
 * GET /api/autotag/conversations?tag=coding - Get conversation IDs by tag
 *
 * Returns all conversation IDs for the authenticated user that match
 * the specified tag from the conversation_tags table.
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/api-auth';

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

  const user = await getAuthenticatedUser(request);

  // Parse and validate the tag query parameter
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get('tag');

  if (!tag) {
    throw createError.validation('tag query parameter is required');
  }

  if (!VALID_TAGS.includes(tag as (typeof VALID_TAGS)[number])) {
    throw createError.validation(`Invalid tag. Must be one of: ${VALID_TAGS.join(', ')}`);
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('conversation_tags')
    .select('conversation_id')
    .eq('user_id', user.id)
    .eq('tag', tag)
    .order('classified_at', { ascending: false })
    .limit(200);

  if (error) {
    logger.error({ error, userId: user.id, tag }, 'Failed to fetch conversations by tag');
    throw createError.internal('Failed to fetch conversations');
  }

  const conversationIds = (data ?? []).map((row) => row.conversation_id);

  return NextResponse.json({ conversationIds });
}

export const GET = withErrorHandler(handleGetConversationsByTag);
