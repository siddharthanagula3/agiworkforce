import { NextRequest, NextResponse } from 'next/server';
import { ManagedCloudMessageWireSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { CONVERSATION_API_ROUTE_DEADLINE_MS } from '@/lib/deadline-policy';
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
import {
  preconditionFailedResponse,
  readIfMatchVersion,
  versionEtag,
} from '@/lib/http-preconditions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PG_UNDEFINED_COLUMN = '42703';

function isUndefinedColumn(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === PG_UNDEFINED_COLUMN
  );
}

// The cached compaction summary is model-facing text written from this
// conversation, so it goes when the conversation does rather than waiting for a
// restore to hand it back.
const DELETE_CONVERSATION_SQL = `
  update web_conversations
     set deleted_at = now(),
         updated_at = now(),
         compaction_summary = null,
         compaction_summary_through_message_id = null,
         compaction_summary_digest = null
   where id = $1
     and user_id = $2
     and organization_id is not distinct from $3
     and deleted_at is null
  returning id
`;

const PENDING_REVOCATION_SQL = `
  select c.id
    from web_conversations c
   where c.id = $3
     and c.user_id = $1
     and c.organization_id is not distinct from $2
     and c.deleted_at is not null
     and exists (
       select 1
         from public.published_artifacts pa
        where pa.conversation_id = c.id
          and pa.user_id = $1
     )
`;

type RouteContext = { params: Promise<{ id: string }> };

type VersionedConversationRow = ChatConversationRow & { server_version: string };

function withoutVersion({ server_version, ...conversation }: VersionedConversationRow) {
  return { conversation, version: server_version };
}

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

  // The draft columns arrive with 0219. Until it is applied the same read has
  // to work without them, or every conversation stops opening the moment this
  // ships ahead of the migration.
  const conversationSelect = (withDraft: boolean): string => `
      select id, organization_id, title, model, project_id, pinned, starred, archived, is_temporary, active_leaf_message_id,${
        withDraft ? ' draft, draft_updated_at,' : ''
      } created_at, updated_at,
        server_version::text as server_version,
        ${CONVERSATION_WORK_MODE_SELECT}
      from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1
    `;
  let versionedConversation: VersionedConversationRow | undefined;
  try {
    [versionedConversation] = await db.query<VersionedConversationRow>(conversationSelect(true), [
      id,
      userId,
      organizationId,
    ]);
  } catch (error) {
    if (!isUndefinedColumn(error)) throw error;
    [versionedConversation] = await db.query<VersionedConversationRow>(conversationSelect(false), [
      id,
      userId,
      organizationId,
    ]);
  }

  if (!versionedConversation) {
    throw createError.notFound('Conversation not found');
  }
  const { conversation, version } = withoutVersion(versionedConversation);

  try {
    const [messages, countRows] = await Promise.all([
      db.query<ChatMessageRow>(
        `
          select id, parent_id, role, content, model, provider, input_tokens, output_tokens, created_at, metadata
          from web_messages
          where conversation_id = $1
            and deleted_at is null
          order by created_at asc
          limit $2 offset $3
        `,
        [id, limit, offset],
      ),
      db.query<{ total: string }>(
        'select count(*)::text as total from web_messages where conversation_id = $1 and deleted_at is null',
        [id],
      ),
    ]);

    const total = parseInt(countRows[0]?.total ?? '0', 10);
    const hasMore = offset + messages.length < total;

    const response = NextResponse.json({
      conversation,
      messages: withIsoTimestamps(messages).map((message) =>
        ManagedCloudMessageWireSchema.parse(message),
      ),
      total,
      hasMore,
    });
    if (version) response.headers.set('etag', versionEtag(version));
    return response;
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

  const precondition = readIfMatchVersion(request);
  if (precondition.kind === 'malformed') {
    throw createError.validation('If-Match must be a conversation version from its ETag');
  }
  const expectedVersion = precondition.kind === 'version' ? precondition.version : null;

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

  /**
   * A draft is written on its own statement, never as part of the conversation
   * update: it must not move `updated_at` (which orders the sidebar) or
   * `server_version` (which guards real edits), and it arrives on every
   * debounce while someone is typing. A temporary chat refuses it outright,
   * for the reason its transcript is not stored either.
   */
  if (Object.prototype.hasOwnProperty.call(body, 'draft')) {
    const draft = body['draft'];
    let saved: { id: string } | undefined;
    let stored = true;
    try {
      [saved] = await db.query<{ id: string }>(
        `update web_conversations
            set draft = case when is_temporary then null else $3::text end,
                draft_updated_at = case when is_temporary then null else now() end
          where id = $1
            and user_id = $2
            and organization_id is not distinct from $4
            and deleted_at is null
          returning id`,
        [id, userId, draft && draft.length > 0 ? draft : null, organizationId],
      );
    } catch (error) {
      // Until 0219 is applied there is nowhere to put a draft. The composer's
      // own copy is already parked, so the honest answer is that this one was
      // not stored, not a 500 on every keystroke.
      if (!isUndefinedColumn(error)) throw error;
      stored = false;
    }
    if (stored && !saved) throw createError.notFound('Conversation not found');
    if (Object.keys(body).length === 1) return NextResponse.json({ saved: stored });
  }

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
            and message.deleted_at is null
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

  const [updated] = await db.query<VersionedConversationRow>(
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
        and ($19::bigint is null or server_version = $19::bigint)
      returning id, organization_id, title, model, project_id, pinned, starred, archived, is_temporary, active_leaf_message_id, created_at, updated_at,
        server_version::text as server_version
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
      expectedVersion,
    ],
  );

  if (!updated) {
    if (expectedVersion !== null) {
      const [current] = await db.query<VersionedConversationRow>(
        `
          select id, organization_id, title, model, project_id, pinned, starred, archived, is_temporary, active_leaf_message_id, created_at, updated_at,
            server_version::text as server_version
          from web_conversations
          where id = $1
            and user_id = $2
            and organization_id is not distinct from $3
            and deleted_at is null
          limit 1
        `,
        [id, userId, organizationId],
      );
      if (current) {
        const latest = withoutVersion(current);
        return preconditionFailedResponse(
          'This conversation changed since you loaded it. Reload it and apply your change again.',
          latest.conversation,
          latest.version,
        );
      }
    }
    throw createError.notFound('Conversation not found');
  }

  const { conversation, version } = withoutVersion(updated);
  const response = NextResponse.json({ conversation });
  if (version) response.headers.set('etag', versionEtag(version));
  return response;
}

async function handleDeleteConversation(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await context.params;

  let deletedConversation: { id: string } | undefined;
  let revokedCount = 0;
  try {
    const outcome = await db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(DELETE_CONVERSATION_SQL, [
        id,
        userId,
        organizationId,
      ]);
      const pending = await tx.query<{ id: string }>(PENDING_REVOCATION_SQL, [
        userId,
        organizationId,
        id,
      ]);
      const revoked = pending.length
        ? await unpublishArtifactsForConversations(tx, {
            userId,
            conversationIds: pending.map(({ id: pendingId }) => pendingId),
          })
        : [];
      return { row, revoked };
    });
    deletedConversation = outcome.row;
    revokedCount = outcome.revoked.length;
  } catch (error) {
    logger.error({ error, conversationId: id }, 'Failed to delete conversation');
    throw createError.internal('Failed to delete conversation');
  }

  if (!deletedConversation && revokedCount === 0) {
    throw createError.notFound('Conversation not found');
  }

  if (revokedCount > 0) {
    logger.info(
      { conversationId: id, revoked: revokedCount },
      'Revoked published artifacts for deleted conversation',
    );
  }

  // TTL (session-store.ts) is the safety net if this ever throws.
  try {
    await killE2BSession(managedCloudE2BSessionScope(userId, id));
  } catch (error) {
    logger.warn({ error, conversationId: id }, '[e2b] failed to release sandbox on delete');
  }

  return NextResponse.json({ success: true });
}

const GATEWAY_POLICY = {
  deadlineMs: CONVERSATION_API_ROUTE_DEADLINE_MS,
  circuit: 'chat.conversation',
} as const;

export const GET = withCorsRoute(withErrorHandler(handleGetConversation, GATEWAY_POLICY));
export const PUT = withCorsRoute(withErrorHandler(handleUpdateConversation, GATEWAY_POLICY));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteConversation, GATEWAY_POLICY));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
