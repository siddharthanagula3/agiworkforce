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
import { getNeonChatDb, requireCurrentUserId } from '@/lib/server/neon-chat';

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

const PatchMessageSchema = z.object({
  reaction: z.enum(['thumbsUp', 'thumbsDown']).nullable().optional(),
});

async function handlePatchMessage(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();
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

  const db = getNeonChatDb();
  const [conv] = await db.query<{ id: string }>(
    'select id from web_conversations where id = $1 and user_id = $2 and deleted_at is null limit 1',
    [conversationId, userId],
  );

  if (!conv) {
    throw createError.notFound('Conversation not found');
  }

  // Fetch current metadata so we can merge (preserves existing fields)
  const [row] = await db.query<{ metadata: Record<string, unknown> | null }>(
    'select metadata from web_messages where id = $1 and conversation_id = $2 limit 1',
    [messageId, conversationId],
  );

  if (!row) {
    throw createError.notFound('Message not found');
  }

  const merged = { ...(row.metadata ?? {}), ...patch };

  const count = await db.execute(
    'update web_messages set metadata = $1::jsonb where id = $2 and conversation_id = $3',
    [JSON.stringify(merged), messageId, conversationId],
  );

  if (count < 1) {
    throw createError.internal('Failed to update message');
  }

  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorHandler(handlePatchMessage);
