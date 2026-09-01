import { NextRequest, NextResponse } from 'next/server';
import {
  ChatSyncPullResponseSchema,
  ChatSyncPushRequestSchema,
  ChatSyncPushResponseSchema,
  ServerVersionSchema,
  type ArtifactWireDelta,
  type ConversationSyncPushItem,
  type ConversationWireDelta,
  type MessageSyncPushItem,
  type MessageWireDelta,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { scheduleArtifactIndexing } from '@/app/api/chat/conversations/[id]/messages/lib/index-artifacts';
import {
  lockConversationThread,
  setActiveLeaf,
  type ThreadScope,
} from '@/app/api/chat/conversations/[id]/messages/lib/message-thread';

const MAX_CONVERSATIONS_PULL = 500;
const MAX_MESSAGES_PULL = 1000;
const MAX_ARTIFACTS_PULL = 500;

type ConversationDelta = ConversationWireDelta;
type MessageDelta = MessageWireDelta;
type ArtifactDelta = ArtifactWireDelta;

async function assertProjectsBelongToActiveWorkspace(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  userId: string,
  organizationId: string | null,
  conversations: ConversationSyncPushItem[],
): Promise<void> {
  const projectIds = [
    ...new Set(
      conversations.flatMap((conversation) =>
        typeof conversation.projectId === 'string' && conversation.projectId.length > 0
          ? [conversation.projectId]
          : [],
      ),
    ),
  ];
  if (projectIds.length === 0) return;

  const owned = await db.query<{ id: string }>(
    `select id::text as id
       from public.user_projects
      where user_id = $1
        and organization_id is not distinct from $2::uuid
        and id::text = any($3::text[])`,
    [userId, organizationId, projectIds],
  );
  const ownedIds = new Set(owned.map((row) => row.id));
  if (projectIds.some((projectId) => !ownedIds.has(projectId))) {
    throw createError.validation('projectId is not owned in the active workspace');
  }
}

async function handlePull(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get('since') ?? '0';
  const parsedSince = ServerVersionSchema.safeParse(sinceRaw);
  if (!parsedSince.success) {
    throw createError.validation('Invalid chat sync cursor', parsedSince.error);
  }
  const since = parsedSince.data;

  try {
    const [conversations, messages, artifacts] = await Promise.all([
      db.query<ConversationDelta>(
        `
        select id, title, model, project_id, pinned,
               created_at, updated_at, deleted_at, server_version
        from web_conversations
        where user_id = $1 and server_version > $2
        order by server_version asc
        limit ${MAX_CONVERSATIONS_PULL}
      `,
        [userId, since],
      ),
      db.query<MessageDelta>(
        `
        select m.id, m.conversation_id, m.role, m.content, m.model, m.provider,
               m.input_tokens, m.output_tokens, m.metadata,
               m.created_at, m.updated_at, m.deleted_at, m.server_version
        from web_messages m
        join web_conversations c on c.id = m.conversation_id
        where c.user_id = $1 and m.server_version > $2
        order by m.server_version asc
        limit ${MAX_MESSAGES_PULL}
      `,
        [userId, since],
      ),
      db.query<ArtifactDelta>(
        `
        select id, conversation_id, message_id, title, artifact_type, language, content,
               current_version, pinned, tags, created_at, updated_at, deleted_at, server_version
        from web_artifacts
        where user_id = $1 and server_version > $2
        order by server_version asc
        limit ${MAX_ARTIFACTS_PULL}
      `,
        [userId, since],
      ),
    ]);

    const convSaturated = conversations.length >= MAX_CONVERSATIONS_PULL;
    const msgSaturated = messages.length >= MAX_MESSAGES_PULL;
    const artSaturated = artifacts.length >= MAX_ARTIFACTS_PULL;
    const hasMore = convSaturated || msgSaturated || artSaturated;
    const cursor = computePullCursor(
      since,
      conversations,
      messages,
      convSaturated,
      msgSaturated,
      artifacts,
      artSaturated,
    );

    return NextResponse.json(
      ChatSyncPullResponseSchema.parse({
        conversations: withIsoTimestamps(conversations),
        messages: withIsoTimestamps(messages),
        artifacts: withIsoTimestamps(artifacts),
        cursor,
        hasMore,
      }),
    );
  } catch (error) {
    logger.error({ error, userId }, 'Cloud sync pull failed');
    throw createError.internal('Failed to pull sync changes');
  }
}

type BatchRow<T> = {
  kind: 'applied' | 'conflict';
  id: string;
  server_version: string | null;
  current: T | null;
};

const PUSH_MESSAGES_SQL = `
          with input as materialized (
            select (item ->> 'id')::uuid as id,
                   (item ->> 'conversationId')::uuid as conversation_id,
                   item ->> 'role' as role, item ->> 'content' as content,
                   item ->> 'model' as model, item ->> 'provider' as provider,
                   item ? 'model' as has_model, item ? 'provider' as has_provider,
                   coalesce((item ->> 'inputTokens')::integer, 0) as input_tokens,
                   item ? 'inputTokens' as has_input_tokens,
                   coalesce((item ->> 'outputTokens')::integer, 0) as output_tokens,
                   item ? 'outputTokens' as has_output_tokens,
                   coalesce(item -> 'metadata', '{}'::jsonb) as metadata,
                   item ? 'metadata' as has_metadata,
                   (item ->> 'baseVersion')::bigint as base_version,
                   coalesce((item ->> 'isDeleted')::boolean, false) as should_delete
              from jsonb_array_elements($2::jsonb) as source(item)
          ), thread as (
            select (item ->> 'id')::uuid as id,
                   (item ->> 'parentId')::uuid as parent_id
              from jsonb_array_elements($3::jsonb) as source(item)
          ), updated as (
            update web_messages as existing
               set content = incoming.content,
                   model = case when incoming.has_model then incoming.model else existing.model end,
                   provider = case when incoming.has_provider then incoming.provider else existing.provider end,
                   input_tokens = case when incoming.has_input_tokens then incoming.input_tokens else existing.input_tokens end,
                   output_tokens = case when incoming.has_output_tokens then incoming.output_tokens else existing.output_tokens end,
                   metadata = case when incoming.has_metadata then incoming.metadata else existing.metadata end,
                   updated_at = now()
              from input as incoming, web_conversations as parent
             where not incoming.should_delete
               and incoming.base_version > 0
               and existing.id = incoming.id
               and existing.conversation_id = incoming.conversation_id
               and existing.role = incoming.role
               and existing.deleted_at is null
               and existing.server_version = incoming.base_version
               and parent.id = existing.conversation_id and parent.user_id = $1
               and (
                 existing.content is distinct from incoming.content
                 or (incoming.has_model and existing.model is distinct from incoming.model)
                 or (incoming.has_provider and existing.provider is distinct from incoming.provider)
                 or (incoming.has_input_tokens and existing.input_tokens is distinct from incoming.input_tokens)
                 or (incoming.has_output_tokens and existing.output_tokens is distinct from incoming.output_tokens)
                 or (incoming.has_metadata and coalesce(existing.metadata, '{}'::jsonb) is distinct from incoming.metadata)
               )
            returning existing.id, existing.server_version
          ), inserted as (
            insert into web_messages
              (id, conversation_id, role, content, model, provider, input_tokens,
               output_tokens, metadata, created_at, updated_at, deleted_at, parent_id)
            select incoming.id, incoming.conversation_id, incoming.role, incoming.content,
                   incoming.model, incoming.provider, incoming.input_tokens,
                   incoming.output_tokens, incoming.metadata,
                   now(), now(), case when incoming.should_delete then now() else null end,
                   thread.parent_id
              from input as incoming
              left join thread on thread.id = incoming.id
             where incoming.base_version = 0
               and exists (
               select 1 from web_conversations parent
                where parent.id = incoming.conversation_id and parent.user_id = $1
                  and parent.deleted_at is null
             )
            on conflict (id) do nothing
            returning id, server_version
          ), tombstoned as (
            update web_messages as existing
               set deleted_at = now(), updated_at = now()
              from input as incoming, web_conversations as parent
             where incoming.should_delete
               and incoming.base_version > 0
               and existing.id = incoming.id
               and existing.conversation_id = incoming.conversation_id
               and existing.deleted_at is null
               and existing.server_version = incoming.base_version
               and parent.id = existing.conversation_id and parent.user_id = $1
            returning existing.id, existing.server_version
          ), idempotent as (
            select existing.id, existing.server_version
              from input as incoming
              join web_messages as existing on existing.id = incoming.id
              join web_conversations as parent
                on parent.id = existing.conversation_id and parent.user_id = $1
             where existing.conversation_id = incoming.conversation_id
               and (
                 (incoming.should_delete and existing.deleted_at is not null)
                 or (
                   not incoming.should_delete and existing.deleted_at is null
                   and existing.role = incoming.role and existing.content = incoming.content
                   and (not incoming.has_model or existing.model is not distinct from incoming.model)
                   and (not incoming.has_provider or existing.provider is not distinct from incoming.provider)
                   and (not incoming.has_input_tokens or existing.input_tokens = incoming.input_tokens)
                   and (not incoming.has_output_tokens or existing.output_tokens = incoming.output_tokens)
                   and (not incoming.has_metadata or coalesce(existing.metadata, '{}'::jsonb) = incoming.metadata)
                 )
               )
          ), applied_rows as materialized (
            select id, server_version from updated
            union all select id, server_version from inserted
            union all select id, server_version from tombstoned
            union all select id, server_version from idempotent
          ), conflict_rows as (
            select incoming.id,
                   case when current.id is null or owner.id is null then null else jsonb_build_object(
                     'id', current.id::text, 'conversation_id', current.conversation_id::text,
                     'role', current.role, 'content', current.content, 'model', current.model,
                     'provider', current.provider, 'input_tokens', current.input_tokens,
                     'output_tokens', current.output_tokens,
                     'metadata', current.metadata, 'created_at', current.created_at,
                     'updated_at', current.updated_at, 'deleted_at', current.deleted_at,
                     'server_version', current.server_version::text
                   ) end as current
              from input as incoming
              left join web_messages as current on current.id = incoming.id
             left join web_conversations as owner
                on owner.id = current.conversation_id and owner.user_id = $1
             where not exists (select 1 from applied_rows where applied_rows.id = incoming.id)
          )
          select 'applied'::text as kind, id::text, server_version::text, null::jsonb as current
            from applied_rows
          union all
          select 'conflict'::text, id::text, null::text, current from conflict_rows
        `;

type ThreadParent = { id: string; parentId: string | null };

/**
 * Applies one push batch of messages, giving the new rows of any conversation
 * that has been branched a place in its tree.
 *
 * A conversation with no active leaf is still linear, and stays that way: the
 * batch runs exactly as it always has, with an empty thread table leaving every
 * parent null. Only a branched conversation pays for the row lock, and it pays
 * once for the whole batch rather than once per message.
 *
 * The scope carried into the lock is the conversation's own workspace, not the
 * request's. A push writes any row its owner owns — the insert below asks only
 * for `user_id` — so scoping the thread by the active workspace instead would
 * leave a device syncing a conversation from another one writing rows with no
 * parent, which is the defect this exists to close.
 */
async function pushMessages(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  userId: string,
  messages: MessageSyncPushItem[],
): Promise<Array<BatchRow<MessageDelta>>> {
  const leafRows = await db.query<{
    id: string;
    organization_id: string | null;
    active_leaf_message_id: string | null;
  }>(
    `select id::text as id,
            organization_id::text as organization_id,
            active_leaf_message_id::text as active_leaf_message_id
       from web_conversations
      where id = any($1::uuid[])
        and user_id = $2
        and deleted_at is null`,
    [[...new Set(messages.map((item) => item.conversationId))], userId],
  );

  // Locked in a stable order so two pushes carrying the same pair of
  // conversations queue behind each other rather than deadlock. Compared by
  // code unit, not collation: the guarantee holds only while every writer
  // agrees on the order, and localeCompare would hand a server with different
  // locale data its own idea of where a hyphen sorts.
  const threadScopes: ThreadScope[] = leafRows
    .flatMap((row) =>
      row.active_leaf_message_id
        ? [{ conversationId: row.id, userId, organizationId: row.organization_id ?? null }]
        : [],
    )
    .sort((left, right) => {
      if (left.conversationId === right.conversationId) return 0;
      return left.conversationId < right.conversationId ? -1 : 1;
    });

  if (threadScopes.length === 0) {
    return db.query<BatchRow<MessageDelta>>(PUSH_MESSAGES_SQL, [
      userId,
      JSON.stringify(messages),
      JSON.stringify([]),
    ]);
  }

  return db.transaction(async (tx) => {
    const threadParents: ThreadParent[] = [];
    const advanceTo = new Map<ThreadScope, string>();

    for (const scope of threadScopes) {
      let leafMessageId: string | null = await lockConversationThread(tx, scope);
      // The branch this push read was undone before it owned the lock, so the
      // conversation is linear again and its rows go in the way they always did.
      if (leafMessageId === null) continue;

      // Only the rows this batch creates take a parent. An edit or a tombstone
      // carries a base version, which means the row it names already has a
      // lineage, and re-deciding it here would move a turn the reader has kept.
      for (const item of messages) {
        if (item.conversationId !== scope.conversationId) continue;
        if (Number(item.baseVersion) !== 0) continue;
        threadParents.push({ id: item.id, parentId: leafMessageId });
        leafMessageId = item.id;
        advanceTo.set(scope, item.id);
      }
    }

    const rows = await tx.query<BatchRow<MessageDelta>>(PUSH_MESSAGES_SQL, [
      userId,
      JSON.stringify(messages),
      JSON.stringify(threadParents),
    ]);

    // Only a row this batch actually wrote into this conversation may become
    // its leaf. An id already taken elsewhere is skipped by the insert's
    // on-conflict and reported as a conflict, and pointing the visible path at
    // it would land the reader on a message that is not in the thread.
    const appliedIds = new Set(rows.flatMap((row) => (row.kind === 'applied' ? [row.id] : [])));
    for (const [scope, leafMessageId] of advanceTo) {
      if (!appliedIds.has(leafMessageId)) continue;
      await setActiveLeaf(tx, scope, leafMessageId);
    }
    return rows;
  });
}

async function handlePush(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }
  if (isLegacyMutablePush(rawBody)) {
    return syncProtocolUpgradeRequired();
  }
  if (isLegacyNoopPush(rawBody)) {
    return NextResponse.json({
      protocolVersion: 2,
      applied: { conversations: [], messages: [], artifacts: [] },
      conflicts: { conversations: [], messages: [], artifacts: [] },
      cursor: '0',
    });
  }
  const parsed = ChatSyncPushRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid sync payload', parsed.error);
  }
  const { conversations = [], messages = [], artifacts = [] } = parsed.data;

  await assertProjectsBelongToActiveWorkspace(db, userId, organizationId, conversations);

  const applied = {
    conversations: [] as Array<{ id: string; server_version: string }>,
    messages: [] as Array<{ id: string; server_version: string }>,
    artifacts: [] as Array<{ id: string; server_version: string }>,
  };
  const conflicts = {
    conversations: [] as Array<{ id: string; current: ConversationDelta | null }>,
    messages: [] as Array<{ id: string; current: MessageDelta | null }>,
    artifacts: [] as Array<{ id: string; current: ArtifactDelta | null }>,
  };

  try {
    if (conversations.length > 0) {
      const rows = await db.query<BatchRow<ConversationDelta>>(
        `
          with input as materialized (
            select (item ->> 'id')::uuid as id,
                   item ->> 'title' as title,
                   item ->> 'model' as model,
                   item ? 'model' as has_model,
                   item ->> 'projectId' as project_id,
                   item ? 'projectId' as has_project_id,
                   coalesce((item ->> 'pinned')::boolean, false) as pinned,
                   item ? 'pinned' as has_pinned,
                   (item ->> 'baseVersion')::bigint as base_version,
                   coalesce((item ->> 'isDeleted')::boolean, false) as should_delete
              from jsonb_array_elements($2::jsonb) as source(item)
          ), updated as (
            update web_conversations as existing
               set title = incoming.title,
                   model = case when incoming.has_model then incoming.model else existing.model end,
                   project_id = case when incoming.has_project_id then incoming.project_id else existing.project_id end,
                   pinned = case when incoming.has_pinned then incoming.pinned else existing.pinned end,
                   updated_at = now(),
                   deleted_at = case when incoming.should_delete then now() else null end
              from input as incoming
             where existing.id = incoming.id
               and existing.user_id = $1
               and existing.server_version = incoming.base_version
               and (existing.deleted_at is null or incoming.should_delete)
               and (
                 not incoming.has_project_id
                 or incoming.project_id is null
                 or exists (
                   select 1 from public.user_projects as project
                    where project.id::text = incoming.project_id
                      and project.user_id = $1
                      and project.organization_id is not distinct from $3::uuid
                 )
               )
            returning existing.id, existing.server_version
          ), inserted as (
            insert into web_conversations
              (id, user_id, title, model, project_id, pinned, created_at, updated_at, deleted_at)
            select incoming.id, $1, incoming.title, incoming.model, incoming.project_id,
                   incoming.pinned, now(), now(),
                   case when incoming.should_delete then now() else null end
              from input as incoming
             where incoming.base_version = 0
               and (
                 not incoming.has_project_id
                 or incoming.project_id is null
                 or exists (
                   select 1 from public.user_projects as project
                    where project.id::text = incoming.project_id
                      and project.user_id = $1
                      and project.organization_id is not distinct from $3::uuid
                 )
               )
            on conflict (id) do nothing
            returning id, server_version
          ), applied_rows as materialized (
            select id, server_version from updated
            union all select id, server_version from inserted
          ), conflict_rows as (
            select incoming.id,
                   case when current.id is null then null else jsonb_build_object(
                     'id', current.id::text, 'title', current.title, 'model', current.model,
                     'project_id', current.project_id, 'pinned', current.pinned,
                     'created_at', current.created_at, 'updated_at', current.updated_at,
                     'deleted_at', current.deleted_at,
                     'server_version', current.server_version::text
                   ) end as current
              from input as incoming
              left join web_conversations as current
                on current.id = incoming.id and current.user_id = $1
             where not exists (select 1 from applied_rows where applied_rows.id = incoming.id)
          )
          select 'applied'::text as kind, id::text, server_version::text, null::jsonb as current
            from applied_rows
          union all
          select 'conflict'::text, id::text, null::text, current from conflict_rows
        `,
        [userId, JSON.stringify(conversations), organizationId],
      );
      collectBatchRows(rows, applied.conversations, conflicts.conversations);
    }

    if (messages.length > 0) {
      const rows = await pushMessages(db, userId, messages);
      collectBatchRows(rows, applied.messages, conflicts.messages);

      // Device sync (desktop/mobile) is another real path that writes
      // assistant-authored web_messages rows — index the same way the live
      // chat turn does, so the web gallery can discover artifacts from
      // conversations synced in from another surface. Fire-and-forget: a
      // discovery aid, never allowed to fail or slow the sync response.
      const pushedById = new Map(messages.map((item) => [item.id, item]));
      for (const row of applied.messages) {
        const pushed = pushedById.get(row.id);
        if (pushed?.role === 'assistant' && !pushed.isDeleted) {
          scheduleArtifactIndexing({
            db,
            userId,
            conversationId: pushed.conversationId,
            messageId: pushed.id,
            content: pushed.content,
          });
        }
      }
    }

    if (artifacts.length > 0) {
      const rows = await db.query<BatchRow<ArtifactDelta>>(
        `
          with input as materialized (
            select (item ->> 'id')::uuid as id,
                   (item ->> 'conversationId')::uuid as conversation_id,
                   nullif(item ->> 'messageId', '')::uuid as message_id,
                   item ->> 'title' as title, item ->> 'artifactType' as artifact_type,
                   item ->> 'language' as language, item ->> 'content' as content,
                   coalesce((item ->> 'currentVersion')::integer, 1) as current_version,
                   coalesce((item ->> 'pinned')::boolean, false) as pinned,
                   coalesce(array(select jsonb_array_elements_text(item -> 'tags')), '{}') as tags,
                   (item ->> 'baseVersion')::bigint as base_version,
                   coalesce((item ->> 'isDeleted')::boolean, false) as should_delete
              from jsonb_array_elements($2::jsonb) as source(item)
          ), valid_input as materialized (
            select incoming.*
              from input as incoming
             where incoming.message_id is null or exists (
               select 1
                 from web_messages as source_message
                 join web_conversations as source_parent
                   on source_parent.id = source_message.conversation_id
                where source_message.id = incoming.message_id
                  and source_message.conversation_id = incoming.conversation_id
                  and source_parent.user_id = $1
                  and source_parent.deleted_at is null
                  and source_message.deleted_at is null
             )
          ), updated as (
            update web_artifacts as existing
               set title = incoming.title, artifact_type = incoming.artifact_type,
                   language = incoming.language, content = incoming.content,
                   current_version = incoming.current_version, pinned = incoming.pinned,
                   tags = incoming.tags,
                   message_id = coalesce(incoming.message_id, existing.message_id),
                   updated_at = now(),
                   deleted_at = case when incoming.should_delete then now() else null end
              from valid_input as incoming, web_conversations as parent
             where existing.id = incoming.id and existing.user_id = $1
               and existing.server_version = incoming.base_version
               and existing.conversation_id = incoming.conversation_id
               and (existing.deleted_at is null or incoming.should_delete)
               and parent.id = incoming.conversation_id and parent.user_id = $1
            returning existing.id, existing.server_version
          ), inserted as (
            insert into web_artifacts
              (id, user_id, conversation_id, message_id, title, artifact_type, language,
               content, current_version, pinned, tags, created_at, updated_at, deleted_at)
            select incoming.id, $1, incoming.conversation_id, incoming.message_id,
                   incoming.title, incoming.artifact_type, incoming.language, incoming.content,
                   incoming.current_version, incoming.pinned, incoming.tags, now(), now(),
                   case when incoming.should_delete then now() else null end
              from valid_input as incoming
             where incoming.base_version = 0 and exists (
               select 1 from web_conversations parent
                where parent.id = incoming.conversation_id and parent.user_id = $1
                  and parent.deleted_at is null
             )
            on conflict (id) do nothing
            returning id, server_version
          ), applied_rows as materialized (
            select id, server_version from updated union all select id, server_version from inserted
          ), conflict_rows as (
            select incoming.id,
                   case when current.id is null then null else jsonb_build_object(
                     'id', current.id::text, 'conversation_id', current.conversation_id::text,
                     'message_id', current.message_id::text, 'title', current.title,
                     'artifact_type', current.artifact_type, 'language', current.language,
                     'content', current.content, 'current_version', current.current_version,
                     'pinned', current.pinned, 'tags', current.tags,
                     'created_at', current.created_at, 'updated_at', current.updated_at,
                     'deleted_at', current.deleted_at,
                     'server_version', current.server_version::text
                   ) end as current
              from input as incoming
              left join web_artifacts as current on current.id = incoming.id and current.user_id = $1
             where not exists (select 1 from applied_rows where applied_rows.id = incoming.id)
          )
          select 'applied'::text as kind, id::text, server_version::text, null::jsonb as current
            from applied_rows
          union all
          select 'conflict'::text, id::text, null::text, current from conflict_rows
        `,
        [userId, JSON.stringify(artifacts)],
      );
      collectBatchRows(rows, applied.artifacts, conflicts.artifacts);
    }

    const conflictRows = [
      ...conflicts.conversations.flatMap((c) => (c.current ? [c.current] : [])),
      ...conflicts.messages.flatMap((c) => (c.current ? [c.current] : [])),
      ...conflicts.artifacts.flatMap((c) => (c.current ? [c.current] : [])),
    ];
    const cursor = maxServerVersion(
      '0',
      applied.conversations,
      applied.messages,
      applied.artifacts,
      conflictRows,
    );
    return NextResponse.json(
      ChatSyncPushResponseSchema.parse({ protocolVersion: 2, applied, conflicts, cursor }),
    );
  } catch (error) {
    logger.error({ error, userId }, 'Cloud sync push failed');
    throw createError.internal('Failed to push sync changes');
  }
}

function collectBatchRows<T>(
  rows: Array<BatchRow<T>>,
  applied: Array<{ id: string; server_version: string }>,
  conflicts: Array<{ id: string; current: T | null }>,
): void {
  for (const row of rows) {
    if (row.kind === 'applied' && row.server_version !== null) {
      applied.push({ id: row.id, server_version: row.server_version });
    } else if (row.kind === 'conflict') {
      conflicts.push({ id: row.id, current: row.current });
    } else {
      throw new Error('Chat sync database returned an invalid batch result');
    }
  }
}

function isLegacyMutablePush(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (body['protocolVersion'] === 2) return false;
  return ['conversations', 'messages', 'artifacts'].some(
    (key) => Array.isArray(body[key]) && body[key].length > 0,
  );
}

function isLegacyNoopPush(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if ('protocolVersion' in body) return false;
  return ['conversations', 'messages', 'artifacts'].every(
    (key) => body[key] === undefined || (Array.isArray(body[key]) && body[key].length === 0),
  );
}

function syncProtocolUpgradeRequired(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'SYNC_PROTOCOL_UPGRADE_REQUIRED',
        message: 'Upgrade this client before pushing Managed Cloud chat changes.',
      },
      requiredProtocolVersion: 2,
    },
    { status: 409 },
  );
}

function withIsoTimestamps<T>(rows: T[]): T[] {
  return rows.map((row) => {
    const out = { ...(row as Record<string, unknown>) };
    for (const key of ['created_at', 'updated_at', 'deleted_at'] as const) {
      const value = out[key];
      if (value instanceof Date) out[key] = value.toISOString();
    }
    return out as T;
  });
}

/**
 * Compute the SAFE next pull cursor.
 *
 * `conversations` and `messages` are paginated INDEPENDENTLY (separate LIMITs) but
 * share one `server_version` sequence, and a row's version is reassigned on every
 * update (so a conversation can be re-versioned ABOVE its own older messages). If we
 * advanced the cursor to the global max, the lagging table's rows whose version
 * falls in the gap would be `> since` no longer and never returned again — silent
 * loss. So when a table saturates its page, the cursor must not pass the LOWEST
 * saturated frontier (the last/highest version that table delivered); the next page
 * re-requests the overlap, which the client UPSERTs idempotently. When nothing
 * saturates, every row `> since` was delivered, so advance to the global max.
 *
 * Inputs are ordered `by server_version asc`, so the last element is each table's
 * frontier. Exported for direct unit testing.
 */
export function computePullCursor(
  since: string,
  conversations: Array<{ server_version: string }>,
  messages: Array<{ server_version: string }>,
  convSaturated: boolean,
  msgSaturated: boolean,
  artifacts: Array<{ server_version: string }> = [],
  artSaturated = false,
): string {
  if (!convSaturated && !msgSaturated && !artSaturated) {
    return maxServerVersion(since, conversations, messages, artifacts);
  }
  const frontiers: string[] = [];
  if (convSaturated && conversations.length > 0) {
    frontiers.push(conversations[conversations.length - 1]!.server_version);
  }
  if (msgSaturated && messages.length > 0) {
    frontiers.push(messages[messages.length - 1]!.server_version);
  }
  if (artSaturated && artifacts.length > 0) {
    frontiers.push(artifacts[artifacts.length - 1]!.server_version);
  }
  if (frontiers.length === 0) return since;
  return frontiers.reduce((min, v) => (bigintGreater(min, v) ? v : min), frontiers[0]!);
}

function maxServerVersion(
  base: string,
  ...lists: Array<Array<{ server_version: string }>>
): string {
  let max = base;
  for (const list of lists) {
    for (const row of list) {
      if (bigintGreater(row.server_version, max)) max = row.server_version;
    }
  }
  return max;
}

function bigintGreater(a: string, b: string): boolean {
  const na = a.replace(/^0+/, '') || '0';
  const nb = b.replace(/^0+/, '') || '0';
  if (na.length !== nb.length) return na.length > nb.length;
  return na > nb;
}

export const GET = withCorsRoute(withErrorHandler(handlePull));
export const POST = withCorsRoute(withErrorHandler(handlePush));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
