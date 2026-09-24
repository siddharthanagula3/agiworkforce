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
import type { ChatMessageRow } from '@/lib/server/neon-chat';
import { CreateMessageSchema } from '@/lib/validations/chat';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { buildPage, clampPageSize, decodeKeysetCursor, keysetSql } from '@/lib/identity/pagination';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { persistConversationMessage } from './lib/persist-message';

type RouteContext = { params: Promise<{ id: string }> };

const MESSAGE_SORT_COLUMN = 'page_sort_key';
const MESSAGE_SORT_KEY_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

async function assertConversationReadable(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  scope: { conversationId: string; userId: string; organizationId: string | null },
): Promise<void> {
  const [conversation] = await db.query<{ id: string }>(
    `select id
       from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1`,
    [scope.conversationId, scope.userId, scope.organizationId],
  );
  if (!conversation) throw createError.notFound('Conversation not found');
}

/**
 * Keyset rather than offset: a conversation is written to while it is read, and
 * an offset window shifts under every new turn.
 */
async function handleListMessages(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id: conversationId } = await context.params;
  await assertConversationReadable(db, { conversationId, userId, organizationId });

  const url = new URL(request.url);
  const limit = clampPageSize(Number.parseInt(url.searchParams.get('limit') ?? '', 10));
  const cursor = decodeKeysetCursor(url.searchParams.get('cursor'));
  const keyset = keysetSql({
    sortColumn: MESSAGE_SORT_COLUMN,
    idColumn: 'id',
    direction: 'asc',
    ...(cursor ? { cursor } : {}),
    firstParamIndex: 3,
  });

  try {
    const rows = await db.query<ChatMessageRow & { page_sort_key: string }>(
      `
        select * from (
          select id, parent_id, role, content, model, provider, input_tokens, output_tokens, created_at, metadata,
            to_char(created_at at time zone 'utc', ${MESSAGE_SORT_KEY_FORMAT}) as ${MESSAGE_SORT_COLUMN}
          from web_messages
          where conversation_id = $1
            and deleted_at is null
        ) messages
        ${keyset.where ? `where ${keyset.where}` : ''}
        ${keyset.orderBy}
        limit $2
      `,
      [conversationId, limit + 1, ...keyset.params],
    );

    const page = buildPage(rows, limit, (row) => ({ sortValue: row.page_sort_key, id: row.id }));
    const messages = page.items.map(({ page_sort_key: _sortKey, ...row }) => row);

    return NextResponse.json({
      messages: withIsoTimestamps(messages).map((message) =>
        ManagedCloudMessageWireSchema.parse(message),
      ),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    logger.error({ error, conversationId }, 'Failed to page conversation messages');
    throw createError.internal('Failed to fetch messages');
  }
}

async function handleSendMessage(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

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

  // All web callers pass skipLlm: true (streaming is handled by /api/llm/v1/chat/completions).
  // The skipLlm=false LLM-inline path was removed as it had zero production callers.
  if (!skipLlm) {
    logger.warn({ conversationId }, 'skipLlm=false is no longer supported; treating as true');
  }

  const message = await persistConversationMessage({
    db,
    scope: { conversationId, userId, organizationId },
    message: {
      ...(clientMessageId ? { id: clientMessageId } : {}),
      content,
      metadata,
      model,
      role,
      ...(parentId !== undefined ? { parentId } : {}),
    },
  });

  return NextResponse.json({
    // Normalize the RETURNING row's Date timestamps to ISO before validating, or
    // the wire schema throws a ZodError (created_at "expected string, received
    // Date") -> 400 -> the client's "Couldn't save your message" toast.
    message: ManagedCloudMessageWireSchema.parse(withIsoTimestamps([message])[0]),
  });
}

export const GET = withCorsRoute(withErrorHandler(handleListMessages));
export const POST = withCorsRoute(withErrorHandler(handleSendMessage));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
