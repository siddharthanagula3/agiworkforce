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
import { ManagedCloudMessageWireSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UpdateConversationSchema } from '@/lib/validations/chat';
import { killE2BSession } from '@/lib/e2b/runtime';
import { managedCloudE2BSessionScope } from '@/lib/e2b/session-store';
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
      select id, title, model, project_id, pinned, starred, archived, is_temporary, created_at, updated_at
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
          select id, role, content, model, provider, input_tokens, output_tokens, created_at, metadata
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
      messages: messages.map((message) => ManagedCloudMessageWireSchema.parse(message)),
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
  const hasStarredUpdate = Object.prototype.hasOwnProperty.call(body, 'starred');
  if (hasStarredUpdate) updates['starred'] = body['starred'];
  const hasArchivedUpdate = Object.prototype.hasOwnProperty.call(body, 'archived');
  if (hasArchivedUpdate) updates['archived'] = body['archived'];

  // Moving a conversation into a project must verify the destination project is
  // owned by this user and live — otherwise the client could tag the thread to a
  // foreign, deleted, or non-existent project UUID, leaving a dangling reference
  // that scopes nothing. (Clearing the project — projectId null — is always
  // allowed.) Mirrors the ownership check the create route already enforces.
  const targetProjectId = updates['projectId'];
  if (hasProjectIdUpdate && typeof targetProjectId === 'string' && targetProjectId.length > 0) {
    let ownedProject: { id: string } | undefined;
    try {
      [ownedProject] = await getNeonChatDb().query<{ id: string }>(
        `select id
           from user_projects
          where id = $1 and user_id = $2 and is_archived = false
          limit 1`,
        [targetProjectId, userId],
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to validate conversation project');
      throw createError.internal('Failed to validate project');
    }
    if (!ownedProject) {
      throw createError.notFound('Project not found');
    }
  }

  const [conversation] = await getNeonChatDb().query<ChatConversationRow>(
    `
      update web_conversations
      set
        title = coalesce($3, title),
        model = coalesce($4, model),
        project_id = case when $5::boolean then $6::text else project_id end,
        pinned = case when $7::boolean then $8::boolean else pinned end,
        starred = case when $9::boolean then $10::boolean else starred end,
        archived = case when $11::boolean then $12::boolean else archived end,
        updated_at = now()
      where id = $1 and user_id = $2 and deleted_at is null
      returning id, title, model, project_id, pinned, starred, archived, is_temporary, created_at, updated_at
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
      hasStarredUpdate,
      updates['starred'] ?? false,
      hasArchivedUpdate,
      updates['archived'] ?? false,
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

  // Release any paused E2B sandbox bound to this conversation. Best-effort: the
  // conversation is already soft-deleted regardless of this outcome, and Redis's own
  // TTL (session-store.ts) is the safety net if this ever throws.
  try {
    await killE2BSession(managedCloudE2BSessionScope(userId, id));
  } catch (error) {
    logger.warn({ error, conversationId: id }, '[e2b] failed to release sandbox on delete');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetConversation);
export const PUT = withErrorHandler(handleUpdateConversation);
export const DELETE = withErrorHandler(handleDeleteConversation);
