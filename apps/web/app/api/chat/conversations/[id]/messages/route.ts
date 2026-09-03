/**
 * Chat Messages API
 *
 * POST /api/chat/conversations/[id]/messages - Send a message and get AI response
 */

import { NextRequest, NextResponse } from 'next/server';
import { ManagedCloudMessageWireSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withIsoTimestamps } from '@/lib/server/iso-timestamps';
import { CreateMessageSchema } from '@/lib/validations/chat';
import { normalizeMessageMetadata, type ChatMessageRow } from '@/lib/server/neon-chat';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import { scheduleConversationTitleGeneration } from './lib/generate-title';
import { scheduleArtifactIndexing } from './lib/index-artifacts';
import {
  assertParentInConversation,
  conversationIsUnbranched,
  INSERT_MESSAGE_SQL,
  isHttpError,
  lockConversationThread,
  resolveParentId,
  setActiveLeaf,
  stampLinearParents,
} from './lib/message-thread';

type RouteContext = { params: Promise<{ id: string }> };

async function handleSendMessage(request: NextRequest, context: RouteContext) {
  const { db, userId } = await getUserScopedDb(request);

  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

  const { id: conversationId } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  // AUDIT-008-004: Validate input with Zod schema (max content length 100k chars)
  const validationResult = CreateMessageSchema.safeParse(rawBody);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }

  const {
    id: clientMessageId,
    content,
    metadata,
    model,
    role,
    skipLlm,
    parentId,
  } = validationResult.data;

  const organizationId = await resolveActiveOrganizationId(db, userId, request);
  const [conversation] = await db.query<{
    id: string;
    model: string | null;
    active_leaf_message_id: string | null;
  }>(
    `
      select id, model, active_leaf_message_id
      from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1
    `,
    [conversationId, userId, organizationId],
  );

  if (!conversation) {
    throw createError.notFound('Conversation not found');
  }

  // All web callers pass skipLlm: true (streaming is handled by /api/llm/v1/chat/completions).
  // The skipLlm=false LLM-inline path was removed as it had zero production callers.
  if (!skipLlm) {
    logger.warn({ conversationId }, 'skipLlm=false is no longer supported; treating as true');
  }

  const activeLeafMessageId = conversation.active_leaf_message_id ?? null;
  const threadScope = { conversationId, userId, organizationId };
  const insertParams = (parent: string | null): unknown[] => [
    clientMessageId ?? null,
    conversationId,
    role,
    content.trim(),
    role === 'assistant' ? (model ?? null) : null,
    JSON.stringify(normalizeMessageMetadata(metadata) ?? {}),
    parent,
  ];

  let message: ChatMessageRow | undefined;
  try {
    // A conversation nobody has branched, written to by a client that names no
    // parent, takes the same single statement it always has. Only a write that
    // is part of a tree pays for the row lock.
    if (parentId === undefined && activeLeafMessageId === null) {
      [message] = await db.query<ChatMessageRow>(INSERT_MESSAGE_SQL, insertParams(null));
    } else {
      message = await db.transaction(async (tx) => {
        const lockedLeafMessageId = await lockConversationThread(tx, threadScope);
        if (parentId !== undefined && parentId !== null) {
          await assertParentInConversation(tx, conversationId, parentId);
        }
        // Before the insert, so the rows that already exist are chained and the
        // new one is left wherever the caller put it. Gated on the tree rather
        // than the leaf: deleting a root the reader was sitting on puts the leaf
        // back to null without undoing a single branch, and converting again
        // there would fold the sibling roots into one line.
        if (lockedLeafMessageId === null && (await conversationIsUnbranched(tx, conversationId))) {
          await stampLinearParents(tx, conversationId);
        }

        const [inserted] = await tx.query<ChatMessageRow>(
          INSERT_MESSAGE_SQL,
          insertParams(resolveParentId(parentId, lockedLeafMessageId)),
        );
        if (!inserted) {
          throw createError.validation('Message id belongs to another conversation');
        }

        await setActiveLeaf(tx, threadScope, inserted.id);
        return inserted;
      });
    }
  } catch (error) {
    if (isHttpError(error)) throw error;
    logger.error({ error }, 'Failed to save message');
    throw createError.internal('Failed to save message');
  }

  // Index any artifacts this assistant message produces, so the gallery can
  // list them without this (or any other) device having opened the
  // conversation. Metadata only — the content stays in the message and is
  // re-derived on demand. Fire-and-forget: the index is a discovery aid, so it
  // must never delay or fail saving the message.
  if (role === 'assistant' && message?.id) {
    scheduleArtifactIndexing({
      db,
      userId,
      conversationId,
      messageId: message.id,
      content: content.trim(),
    });
  }

  // Auto-title conversation from first user message. Two stages: an
  // immediate character truncation (below, synchronous — the row must never
  // sit blank), then a short LLM-generated title that replaces it in the
  // background once ready (agentic-modes-gap-06). Generation is fire-and-forget
  // so a slow or failing provider can never delay or break this response.
  if (role === 'user') {
    const [row] = await db.query<{ count: string }>(
      'select count(*)::text as count from web_messages where conversation_id = $1',
      [conversationId],
    );

    if (Number(row?.count ?? 0) <= 1) {
      // First message - immediate truncated title
      const truncatedTitle = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      await db.execute(
        `update web_conversations
            set title = $1, updated_at = now()
          where id = $2
            and user_id = $3
            and organization_id is not distinct from $4`,
        [truncatedTitle, conversationId, userId, organizationId],
      );

      scheduleConversationTitleGeneration({
        db,
        conversationId,
        userId,
        organizationId,
        content,
        expectedCurrentTitle: truncatedTitle,
      });
    }
  }

  return NextResponse.json({
    // Normalize the RETURNING row's Date timestamps to ISO before validating, or
    // the wire schema throws a ZodError (created_at "expected string, received
    // Date") -> 400 -> the client's "Couldn't save your message" toast.
    message: message
      ? ManagedCloudMessageWireSchema.parse(withIsoTimestamps([message])[0])
      : undefined,
  });
}

export const POST = withCorsRoute(withErrorHandler(handleSendMessage));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
