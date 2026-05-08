/**
 * Single Conversation API
 *
 * GET /api/chat/conversations/[id] - Get conversation with messages
 * PUT /api/chat/conversations/[id] - Update conversation (rename)
 * DELETE /api/chat/conversations/[id] - Soft delete conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UpdateConversationSchema } from '@/lib/validations/chat';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

async function handleGetConversation(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);
  const { id } = await context.params;

  // Get conversation
  const { data: conversation, error: convError } = await supabase
    .from('web_conversations')
    .select('id, title, model, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (convError || !conversation) {
    throw createError.notFound('Conversation not found');
  }

  // Get messages
  const { data: messages, error: msgError } = await supabase
    .from('web_messages')
    .select(
      'id, role, content, model, provider, input_tokens, output_tokens, cost_cents, created_at, metadata',
    )
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  if (msgError) {
    logger.error({ error: msgError, conversationId: id }, 'Failed to fetch messages');
    throw createError.internal('Failed to fetch messages');
  }

  return NextResponse.json({
    conversation,
    messages: messages || [],
  });
}

async function handleUpdateConversation(request: NextRequest, context: RouteContext) {
  // AUDIT-008-006: CSRF protection for state-changing PUT endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);
  const { id } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  // AUDIT-008-002: Validate input with Zod schema (title max 500 chars, model enum)
  const validationResult = UpdateConversationSchema.safeParse(rawBody);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }
  const body = validationResult.data;

  const updates: Record<string, unknown> = {};
  if (body['title']) updates['title'] = body['title'];
  if (body['model']) updates['model'] = body['model'];

  const { data, error } = await supabase
    .from('web_conversations')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error || !data) {
    throw createError.notFound('Conversation not found');
  }

  return NextResponse.json({ conversation: data });
}

async function handleDeleteConversation(request: NextRequest, context: RouteContext) {
  // AUDIT-008-006: CSRF protection for state-changing DELETE endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);
  const { id } = await context.params;

  // Soft delete
  const { error } = await supabase
    .from('web_conversations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null);

  if (error) {
    logger.error({ error, conversationId: id }, 'Failed to delete conversation');
    throw createError.internal('Failed to delete conversation');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetConversation);
export const PUT = withErrorHandler(handleUpdateConversation);
export const DELETE = withErrorHandler(handleDeleteConversation);
