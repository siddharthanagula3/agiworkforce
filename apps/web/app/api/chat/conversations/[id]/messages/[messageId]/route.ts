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
import {
  collectSubtree,
  deleteMessages,
  lockConversationThread,
  resolveSurvivingLeaf,
  setActiveLeaf,
  spliceMessageChildren,
  wantsSubtreeDelete,
} from '../lib/message-thread';

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

  const removeSubtree = wantsSubtreeDelete(new URL(request.url));

  // One transaction for both modes, because every branch of this route has to
  // hand the children somewhere and move the reader off a row that is about to
  // stop existing. `parent_id` is NO ACTION, so a delete that skipped either
  // step would fail on the foreign key rather than orphan a turn quietly.
  const threadScope = { conversationId, userId, organizationId };

  // The leaf this transaction settled on is returned rather than left for the
  // caller to re-derive: a client holding one page of a long conversation cannot
  // see the sibling the walk below lands on, so a locally computed answer would
  // disagree with the durable one until the next full load.
  const activeLeafMessageId = await db.transaction(async (tx) => {
    const readerLeafId = await lockConversationThread(tx, threadScope);

    const [target] = await tx.query<{ id: string; parent_id: string | null }>(
      'select id, parent_id from web_messages where id = $1 and conversation_id = $2 limit 1',
      [messageId, conversationId],
    );

    if (!target) {
      throw createError.notFound('Message not found');
    }

    if (removeSubtree) {
      const doomed = await collectSubtree(tx, conversationId, messageId);
      let leafId = readerLeafId;
      if (readerLeafId !== null && doomed.includes(readerLeafId)) {
        leafId = await resolveSurvivingLeaf(tx, conversationId, messageId, target.parent_id);
        await setActiveLeaf(tx, threadScope, leafId);
      }
      await deleteMessages(tx, conversationId, doomed);
      return leafId;
    }

    await spliceMessageChildren(tx, conversationId, messageId, target.parent_id);
    let leafId = readerLeafId;
    if (readerLeafId === messageId) {
      leafId = target.parent_id;
      await setActiveLeaf(tx, threadScope, leafId);
    }
    await deleteMessages(tx, conversationId, [messageId]);
    return leafId;
  });

  return NextResponse.json({ success: true, activeLeafMessageId });
}

export const PATCH = withCorsRoute(withErrorHandler(handlePatchMessage));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteMessage));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
