import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH,
  MANAGED_CLOUD_CHAT_MAX_STORED_MESSAGE_LENGTH,
} from '@agiworkforce/cloud-contracts';
import { TERMINAL_AGENT_TASK_STATES } from '@agiworkforce/types';
import { applyAssistantFenceEdit } from '@agiworkforce/unified-chat/assistant-fence-edits';
import { EXPLICIT_ARTIFACT_DERIVATION_POLICY } from '@agiworkforce/artifacts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { failUnboundVideoGenerationTranscript } from '@/lib/server/video-generation-transcript';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { scheduleArtifactIndexing } from '../lib/index-artifacts';
import { SAVE_ASSISTANT_CONTENT_EDIT_SQL } from '@/lib/server/assistant-content-edits';
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
  z
    .object({
      fenceEdit: z
        .object({
          index: z.number().int().nonnegative(),
          language: z.string().min(1).max(100),
          source: z.string().max(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH),
          content: z.string().min(1).max(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH),
        })
        .strict(),
    })
    .strict(),
  z.object({ reaction: z.enum(['thumbsUp', 'thumbsDown']).nullable() }).strict(),
  z
    .object({
      videoStartFailure: z.object({ publicError: z.string().trim().min(1).max(500) }).strict(),
    })
    .strict(),
]);

async function handlePatchMessage(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

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

  if ('fenceEdit' in patch) {
    const [message] = await db.query<{
      role: string;
      content: string;
      metadata: Record<string, unknown> | null;
      busy: boolean;
    }>(
      `select role, content, metadata,
              exists (
                select 1 from cloud_agent_runs
                where conversation_id = $2 and state != all($3::text[])
              ) as busy
         from web_messages
        where id = $1 and conversation_id = $2 and deleted_at is null
        limit 1`,
      [messageId, conversationId, [...TERMINAL_AGENT_TASK_STATES]],
    );
    if (!message) throw createError.notFound('Message not found');
    if (message.role !== 'assistant') {
      throw createError.validation('Only assistant writing blocks can be edited here.');
    }
    if (message.busy)
      throw createError.conflict('Wait for this response to finish before editing.');
    const content = applyAssistantFenceEdit(message.content, patch.fenceEdit);
    if (content === null) {
      throw createError.conflict('This block changed. Reopen the chat before saving your edit.');
    }
    if (content.length > MANAGED_CLOUD_CHAT_MAX_STORED_MESSAGE_LENGTH) {
      throw createError.validation('The edited message is too long.');
    }
    const [saved] = await db.query<{ content: string; edit_revision: string }>(
      SAVE_ASSISTANT_CONTENT_EDIT_SQL,
      [content, messageId, conversationId, message.content, crypto.randomUUID()],
    );
    if (!saved) {
      throw createError.conflict('This block changed while saving. Reopen the chat and try again.');
    }
    scheduleArtifactIndexing({
      db,
      userId,
      conversationId,
      messageId,
      content: saved.content,
      ...(message.metadata?.['artifactDerivation'] === EXPLICIT_ARTIFACT_DERIVATION_POLICY
        ? { artifactDerivation: EXPLICIT_ARTIFACT_DERIVATION_POLICY }
        : {}),
    });
    return NextResponse.json({
      ok: true,
      content: saved.content,
      editRevision: saved.edit_revision,
    });
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
    'select metadata from web_messages where id = $1 and conversation_id = $2 and deleted_at is null limit 1',
    [messageId, conversationId],
  );

  if (!row) {
    throw createError.notFound('Message not found');
  }

  const count = await db.execute(
    `update web_messages
        set metadata = coalesce(metadata, '{}'::jsonb) || $1::jsonb
      where id = $2 and conversation_id = $3 and deleted_at is null`,
    [JSON.stringify(patch), messageId, conversationId],
  );

  if (count < 1) {
    throw createError.notFound('Message not found');
  }

  return NextResponse.json({ ok: true });
}

async function handleDeleteMessage(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

  const { id: conversationId, messageId } = await context.params;

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
      'select id, parent_id from web_messages where id = $1 and conversation_id = $2 and deleted_at is null limit 1',
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
      await deleteMessages(tx, conversationId, doomed, threadScope);
      return leafId;
    }

    await spliceMessageChildren(tx, conversationId, messageId, target.parent_id);
    let leafId = readerLeafId;
    if (readerLeafId === messageId) {
      leafId = target.parent_id;
      await setActiveLeaf(tx, threadScope, leafId);
    }
    await deleteMessages(tx, conversationId, [messageId], threadScope);
    return leafId;
  });

  return NextResponse.json({ success: true, activeLeafMessageId });
}

export const PATCH = withCorsRoute(withErrorHandler(handlePatchMessage));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteMessage));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
