/**
 * Autotag Batch API
 *
 * POST /api/autotag/batch - Get tags for multiple conversations
 *
 * Looks up existing tags from conversation_tags table.
 * Returns 'general' for any conversation without a stored tag.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';

async function handleBatchGetTags(request: NextRequest) {
  // AUDIT-008-006: Enforce CSRF protection for cookie-auth POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);

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

  // Cap at 100 to prevent abuse
  if (conversationIds.length > 100) {
    throw createError.validation('Maximum 100 conversation IDs per request');
  }

  // Validate all IDs are strings
  if (!conversationIds.every((id) => typeof id === 'string' && id.length > 0)) {
    throw createError.validation('All conversationIds must be non-empty strings');
  }

  // Fetch existing tags for this user's conversations
  const { data, error } = await supabase
    .from('conversation_tags')
    .select('conversation_id, tag')
    .eq('user_id', user.id)
    .in('conversation_id', conversationIds);

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to fetch batch tags');
    throw createError.internal('Failed to fetch tags');
  }

  // Build result map, defaulting to 'general' for untagged conversations
  const tags: Record<string, string> = {};
  for (const id of conversationIds) {
    tags[id] = 'general';
  }
  for (const row of data ?? []) {
    tags[row.conversation_id] = row.tag;
  }

  return NextResponse.json({ tags });
}

export const POST = withErrorHandler(handleBatchGetTags);
