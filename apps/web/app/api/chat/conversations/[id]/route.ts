/**
 * Single Conversation API
 *
 * GET /api/chat/conversations/[id] - Get conversation with messages (paginated)
 *   Query params: limit (1-500, default 100), offset (default 0)
 *   Response: { conversation, messages, total, hasMore }
 * PUT /api/chat/conversations/[id] - Update conversation metadata
 * DELETE /api/chat/conversations/[id] - Soft delete conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UpdateConversationSchema } from '@/lib/validations/chat';
import {
  getNeonChatDb,
  requireCurrentUserId,
  type ChatConversationRow,
  type ChatMessageRow,
} from '@/lib/server/neon-chat';

type RouteContext = { params: Promise<{ id: string }> };

async function handleGetConversation(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();
  const { id } = await context.params;

  // Parse and clamp pagination parameters
  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const rawOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500);
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const db = getNeonChatDb();
  const [conversation] = await db.query<ChatConversationRow>(
    `
      select id, title, model, project_id, created_at, updated_at
      from web_conversations
      where id = $1 and user_id = $2 and deleted_at is null
      limit 1
    `,
    [id, userId],
  );

  if (!conversation) {
    throw createError.notFound('Conversation not found');
  }

  try {
    const [messages, countRows] = await Promise.all([
      db.query<ChatMessageRow>(
        `
          select id, role, content, model, provider, input_tokens, output_tokens, cost_cents, created_at, metadata
          from web_messages
          where conversation_id = $1
          order by created_at asc
          limit $2 offset $3
        `,
        [id, limit, offset],
      ),
      db.query<{ total: string }>(
        'select count(*)::text as total from web_messages where conversation_id = $1',
        [id],
      ),
    ]);

    const total = parseInt(countRows[0]?.total ?? '0', 10);
    const hasMore = offset + messages.length < total;

    return NextResponse.json({
      conversation,
      messages,
      total,
      hasMore,
    });
  } catch (error) {
    logger.error({ error, conversationId: id }, 'Failed to fetch messages');
    throw createError.internal('Failed to fetch messages');
  }
}

async function handleUpdateConversation(request: NextRequest, context: RouteContext) {
  // AUDIT-008-006: CSRF protection for state-changing PUT endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();
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
  const hasProjectIdUpdate = Object.prototype.hasOwnProperty.call(body, 'projectId');
  if (hasProjectIdUpdate) updates['projectId'] = body['projectId'];
  const hasPinnedUpdate = Object.prototype.hasOwnProperty.call(body, 'pinned');
  if (hasPinnedUpdate) updates['pinned'] = body['pinned'];

  const [conversation] = await getNeonChatDb().query<ChatConversationRow>(
    `
      update web_conversations
      set
        title = coalesce($3, title),
        model = coalesce($4, model),
        project_id = case when $5::boolean then $6::text else project_id end,
        pinned = case when $7::boolean then $8::boolean else pinned end,
        updated_at = now()
      where id = $1 and user_id = $2 and deleted_at is null
      returning id, title, model, project_id, pinned, created_at, updated_at
    `,
    [
      id,
      userId,
      updates['title'] ?? null,
      updates['model'] ?? null,
      hasProjectIdUpdate,
      updates['projectId'] ?? null,
      hasPinnedUpdate,
      updates['pinned'] ?? false,
    ],
  );

  if (!conversation) {
    throw createError.notFound('Conversation not found');
  }

  return NextResponse.json({ conversation });
}

async function handleDeleteConversation(request: NextRequest, context: RouteContext) {
  // AUDIT-008-006: CSRF protection for state-changing DELETE endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();
  const { id } = await context.params;

  try {
    await getNeonChatDb().execute(
      `
        update web_conversations
        set deleted_at = now(), updated_at = now()
        where id = $1 and user_id = $2 and deleted_at is null
      `,
      [id, userId],
    );
  } catch (error) {
    logger.error({ error, conversationId: id }, 'Failed to delete conversation');
    throw createError.internal('Failed to delete conversation');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetConversation);
export const PUT = withErrorHandler(handleUpdateConversation);
export const DELETE = withErrorHandler(handleDeleteConversation);
