/**
 * Per-message operations
 *
 * PATCH /api/chat/conversations/[id]/messages/[messageId]
 *   Merges a patch into message.metadata. Currently used for user reactions
 *   (thumbsUp | thumbsDown | null) but intentionally generic so other metadata
 *   fields can be patched in future without a schema change.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

const PatchMessageSchema = z.object({
  reaction: z.enum(['thumbsUp', 'thumbsDown']).nullable().optional(),
});

async function handlePatchMessage(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { user, userDb: client } = await getAuthenticatedUserWithClient(request);
  const { id: conversationId, messageId } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const result = PatchMessageSchema.safeParse(rawBody);
  if (!result.success) {
    throw createError.validation('Invalid request body', result.error);
  }
  const patch = result.data;

  // Verify conversation ownership (web_messages has no user_id column)
  const { data: conv, error: convError } = await client
    .from('web_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single();

  if (convError || !conv) {
    throw createError.notFound('Conversation not found');
  }

  // Fetch current metadata so we can merge (preserves existing fields)
  const { data: row, error: fetchError } = await client
    .from('web_messages')
    .select('metadata')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .single();

  if (fetchError || !row) {
    throw createError.notFound('Message not found');
  }

  const merged = { ...(row.metadata ?? {}), ...patch };

  const { error: updateError } = await client
    .from('web_messages')
    .update({ metadata: merged })
    .eq('id', messageId)
    .eq('conversation_id', conversationId);

  if (updateError) {
    throw createError.internal('Failed to update message');
  }

  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorHandler(handlePatchMessage);
