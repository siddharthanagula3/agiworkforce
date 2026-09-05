import { NextRequest, NextResponse } from 'next/server';
import { ManagedCloudMessageWireSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withIsoTimestamps } from '@/lib/server/iso-timestamps';
import { UpdateConversationSchema } from '@/lib/validations/chat';
import { killE2BSession } from '@/lib/e2b/runtime';
import { unpublishArtifactsForConversations } from '@/lib/services/published-artifact-service';
import { managedCloudE2BSessionScope } from '@/lib/e2b/session-store';
import {
  CONVERSATION_WORK_MODE_SELECT,
  type ChatConversationRow,
  type ChatMessageRow,
} from '@/lib/server/neon-chat';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

async function handleGetConversation(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id } = await context.params;

  if (!UUID_RE.test(id)) {
    throw createError.notFound('Conversation not found');
  }

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const rawOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500);
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const [conversation] = await db.query<ChatConversationRow>(
    `
      select id, organization_id, title, model, project_id, pinned, starred, archived, is_temporary, active_leaf_message_id, created_at, updated_at,
        ${CONVERSATION_WORK_MODE_SELECT}
      from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1
    `,
    [id, userId, organizationId],
  );

  if (!conversation) {
    throw createError.notFound('Conversation not found');
  }

  try {
    const [messages, countRows] = await Promise.all([
      db.query<ChatMessageRow>(
        `
          select id, parent_id, role, content, model, provider, input_tokens, output_tokens, created_at, metadata
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
      messages: withIsoTimestamps(messages).map((message) =>
        ManagedCloudMessageWireSchema.parse(message),
      ),
      total,
      hasMore,
    });
  } catch (error) {
    logger.error({ error, conversationId: id }, 'Failed to fetch messages');
    throw createError.internal('Failed to fetch messages');
  }
}

async function handleUpdateConversation(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

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
  const hasIsTemporaryUpdate = Object.prototype.hasOwnProperty.call(body, 'isTemporary');
  if (hasIsTemporaryUpdate) updates['isTemporary'] = body['isTemporary'];
  const hasActiveLeafUpdate = Object.prototype.hasOwnProperty.call(body, 'activeLeafMessageId');
  if (hasActiveLeafUpdate) updates['activeLeafMessageId'] = body['activeLeafMessageId'];

  const targetProjectId = updates['projectId'];
  if (hasProjectIdUpdate && typeof targetProjectId === 'string' && targetProjectId.length > 0) {
    let ownedProject: { id: string } | undefined;
    try {
      [ownedProject] = await db.query<{ id: string }>(
        `select id
           from user_projects
          where id = $1 and user_id = $2 and is_archived = false and deleted_at is null
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

  // Joined rather than looked up by id alone: an unscoped existence check on a
  // conversation the caller does not own answers "is this message id in that
  // thread" for someone else's thread.
  //
  // A null names no message, so there is nothing to look up: it is the reset to
  // linear, and running the check on it would answer "Message not found" for the
  // one request that is allowed to leave the conversation without a leaf.
  if (hasActiveLeafUpdate && updates['activeLeafMessageId'] !== null) {
    let leafMessage: { id: string } | undefined;
    try {
      [leafMessage] = await db.query<{ id: string }>(
        `select message.id
           from web_messages message
           join web_conversations conversation on conversation.id = message.conversation_id
          where message.id = $1
            and message.conversation_id = $2
            and conversation.user_id = $3
            and conversation.organization_id is not distinct from $4
            and conversation.deleted_at is null
          limit 1`,
        [updates['activeLeafMessageId'], id, userId, organizationId],
      );
    } catch (error) {
      logger.error({ error, conversationId: id }, 'Failed to validate conversation active leaf');
      throw createError.internal('Failed to validate active leaf');
    }
    if (!leafMessage) {
      throw createError.notFound('Message not found');
    }
  }

  const [conversation] = await db.query<ChatConversationRow>(
    `
      update web_conversations
      set
        title = coalesce($3, title),
        model = coalesce($4, model),
        project_id = case when $5::boolean then $6::text else project_id end,
        pinned = case when $7::boolean then $8::boolean else pinned end,
        starred = case when $9::boolean then $10::boolean else starred end,
        archived = case when $11::boolean then $12::boolean else archived end,
        is_temporary = case when $13::boolean then $14::boolean else is_temporary end,
        active_leaf_message_id = case when $16::boolean then $17::uuid else active_leaf_message_id end,
        updated_at = case when $18::boolean then updated_at else now() end
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $15
        and deleted_at is null
      returning id, organization_id, title, model, project_id, pinned, starred, archived, is_temporary, active_leaf_message_id, created_at, updated_at
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
      hasIsTemporaryUpdate,
      updates['isTemporary'] ?? false,
      organizationId,
      hasActiveLeafUpdate,
      updates['activeLeafMessageId'] ?? null,
      // Paging between variants is a choice about what to read, not a change to
      // the conversation. Bumping the timestamp for it would reorder the
      // sidebar every time someone looked at the other answer.
      hasActiveLeafUpdate && Object.keys(updates).length === 1,
    ],
  );

  if (!conversation) {
    throw createError.notFound('Conversation not found');
  }

  return NextResponse.json({ conversation });
}

async function handleDeleteConversation(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await context.params;

  let deletedConversation: { id: string } | undefined;
  try {
    [deletedConversation] = await db.query<{ id: string }>(
      `
        update web_conversations
        set deleted_at = now(), updated_at = now()
        where id = $1
          and user_id = $2
          and organization_id is not distinct from $3
          and deleted_at is null
        returning id
      `,
      [id, userId, organizationId],
    );
  } catch (error) {
    logger.error({ error, conversationId: id }, 'Failed to delete conversation');
    throw createError.internal('Failed to delete conversation');
  }

  if (!deletedConversation) {
    throw createError.notFound('Conversation not found');
  }

  // A published artifact outlives the chat it came from unless it is revoked
  // here: the FK cascade in 0095 never fires because this delete is a soft
  // delete, so the public token would keep serving the content indefinitely.
  try {
    const revoked = await unpublishArtifactsForConversations(db, {
      userId,
      conversationIds: [id],
    });
    if (revoked.length > 0) {
      logger.info(
        { conversationId: id, revoked: revoked.length },
        'Revoked published artifacts for deleted conversation',
      );
    }
  } catch (error) {
    logger.error(
      { error, conversationId: id },
      'Failed to revoke published artifacts for deleted conversation',
    );
    throw createError.internal('Failed to delete conversation');
  }

  // TTL (session-store.ts) is the safety net if this ever throws.
  try {
    await killE2BSession(managedCloudE2BSessionScope(userId, id));
  } catch (error) {
    logger.warn({ error, conversationId: id }, '[e2b] failed to release sandbox on delete');
  }

  return NextResponse.json({ success: true });
}

export const GET = withCorsRoute(withErrorHandler(handleGetConversation));
export const PUT = withCorsRoute(withErrorHandler(handleUpdateConversation));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteConversation));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
