/**
 * Chat Conversations API
 *
 * GET /api/chat/conversations - List user's conversations
 * POST /api/chat/conversations - Create a new conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreateConversationSchema } from '@/lib/validations/chat';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';

async function handleGetConversations(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client so RLS enforces ownership.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);

  const { data, error } = await supabase
    .from('web_conversations')
    .select('id, title, model, created_at, updated_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to fetch conversations');
    throw createError.internal('Failed to fetch conversations');
  }

  return NextResponse.json({ conversations: data || [] });
}

async function handleCreateConversation(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client so RLS enforces ownership.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);

  // AUDIT-008-003: Validate input with Zod schema
  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    // Empty body is fine - defaults will be applied by schema
  }

  const validationResult = CreateConversationSchema.safeParse(rawBody);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }
  const body = validationResult.data;

  const { data, error } = await supabase
    .from('web_conversations')
    .insert({
      user_id: user.id,
      title: body.title,
      model: body.model,
    })
    .select()
    .single();

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to create conversation');
    throw createError.internal('Failed to create conversation');
  }

  return NextResponse.json({ conversation: data }, { status: 201 });
}

export const GET = withErrorHandler(handleGetConversations);
export const POST = withErrorHandler(handleCreateConversation);
