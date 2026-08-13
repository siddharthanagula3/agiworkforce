/**
 * Per-message operations
 *
 * PATCH /api/chat/conversations/[id]/messages/[messageId]
 *   Merges a patch into message.metadata. Currently used for user reactions
 *   (thumbsUp | thumbsDown | null) but intentionally generic so other metadata
 *   fields can be patched in future without a schema change.
 *
 * DELETE /api/chat/conversations/[id]/messages/[messageId]
 *   Permanently deletes a single message. Verifies ownership of both the
 *   conversation and the message before deletion.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getNeonChatDb, requireCurrentUserId } from '@/lib/server/neon-chat';
import { failUnboundVideoGenerationTranscript } from '@/lib/server/video-generation-transcript';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

const PatchMessageSchema = z.union([
  z.object({ reaction: z.enum(['thumbsUp', 'thumbsDown']).nullable() }).strict(),
  z
    .object({
      videoStartFailure: z.object({ publicError: z.string().trim().min(1).max(500) }).strict(),
    })
    .strict(),
]);

async function handlePatchMessage(request: NextRequest, context: RouteContext) {
  const userId = await requireCurrentUserId(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

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
  const organizationId = await resolveActiveOrganizationId(db, userId, request);
  const [conv] = await db.query<{ id: string }>(
    `select id
       from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1`,
    [conversationId, userId, organizationId],
  );

  if (!conv) {
    throw createError.notFound('Conversation not found');
  }

  if ('videoStartFailure' in patch) {
    const projection = await failUnboundVideoGenerationTranscript({
      db,
      userId,
      conversationId,
      assistantMessageId: messageId,
      publicError: patch.videoStartFailure.publicError,
    });
    if (projection.disposition === 'not_found') {
      throw createError.notFound('Video placeholder not found');
    }
    return NextResponse.json({
      ok: true,
      applied: projection.disposition === 'updated',
      message: projection.message,
    });
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

async function handleDeleteMessage(request: NextRequest, context: RouteContext) {
  const userId = await requireCurrentUserId(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

  const { id: conversationId, messageId } = await context.params;

  const db = getNeonChatDb();
  const organizationId = await resolveActiveOrganizationId(db, userId, request);

  // Verify conversation ownership first (mirrors PATCH pattern)
  const [conv] = await db.query<{ id: string }>(
    `select id
       from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1`,
    [conversationId, userId, organizationId],
  );

  if (!conv) {
    throw createError.notFound('Conversation not found');
  }

  // Verify the message exists in this conversation
  const [msg] = await db.query<{ id: string }>(
    'select id from web_messages where id = $1 and conversation_id = $2 limit 1',
    [messageId, conversationId],
  );

  if (!msg) {
    throw createError.notFound('Message not found');
  }

  await db.execute('delete from web_messages where id = $1 and conversation_id = $2', [
    messageId,
    conversationId,
  ]);

  return NextResponse.json({ success: true });
}

export const PATCH = withCorsRoute(withErrorHandler(handlePatchMessage));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteMessage));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
