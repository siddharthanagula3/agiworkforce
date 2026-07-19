/**
 * Cross-device cloud chat sync — Phase 0 (delta sync).
 * Design: docs/plans/cross-device-cloud-sync-design-2026-06-20.md
 *
 *   GET  /api/chat/sync?since=<server_version cursor>
 *        → conversations + messages + artifacts with server_version > cursor (incl.
 *          tombstones), scoped to the authenticated user, plus the next cursor.
 *   POST /api/chat/sync  { protocolVersion: 2, conversations, messages, artifacts }
 *        → server-version compare-and-swap for mutable rows and identity-based
 *          idempotency for append-only messages. user_id is set SERVER-SIDE from the
 *          verified session (never from the body); RLS WITH CHECK is the backstop.
 *          The server owns update/deletion timestamps; messages are append-only (only a
 *          deleted_at tombstone may change an existing message).
 *          Artifacts (0039) are the third synced entity — managed-only; the cloud row's
 *          id is the deterministic derived_id for derived artifacts. See
 *          docs/plans/artifact-cloud-sync-design-2026-06-21.md.
 *
 * Trust boundary: this endpoint is the Managed-Cloud store. Local/BYOK conversations
 * have no cloud_id and are never pushed/pulled (enforced client-side per the matrix).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  ChatSyncPullResponseSchema,
  ChatSyncPushRequestSchema,
  ChatSyncPushResponseSchema,
  ServerVersionSchema,
  type ArtifactWireDelta,
  type ConversationWireDelta,
  type MessageWireDelta,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';

const MAX_CONVERSATIONS_PULL = 500;
const MAX_MESSAGES_PULL = 1000;
const MAX_ARTIFACTS_PULL = 500;

type ConversationDelta = ConversationWireDelta;
type MessageDelta = MessageWireDelta;
type ArtifactDelta = ArtifactWireDelta;

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

async function handlePull(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-scoped: every query runs as app_rls with request.jwt.claim.sub bound, so
  // the DB's WITH CHECK policies enforce isolation (not just the user_id filters).
  const { db, userId } = await getUserScopedDb(request);

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get('since') ?? '0';
  const parsedSince = ServerVersionSchema.safeParse(sinceRaw);
  if (!parsedSince.success) {
    throw createError.validation('Invalid chat sync cursor', parsedSince.error);
  }
  const since = parsedSince.data;

  try {
    const conversations = await db.query<ConversationDelta>(
      `
        select id, title, model, project_id, pinned,
               created_at, updated_at, deleted_at, server_version
        from web_conversations
        where user_id = $1 and server_version > $2
        order by server_version asc
        limit ${MAX_CONVERSATIONS_PULL}
      `,
      [userId, since],
    );

    const messages = await db.query<MessageDelta>(
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
    );

    // Artifacts: the third synced entity (managed-only). user_id is denormalized on
    // web_artifacts (like web_conversations) so the filter is direct.
    const artifacts = await db.query<ArtifactDelta>(
      `
        select id, conversation_id, message_id, title, artifact_type, language, content,
               current_version, pinned, tags, created_at, updated_at, deleted_at, server_version
        from web_artifacts
        where user_id = $1 and server_version > $2
        order by server_version asc
        limit ${MAX_ARTIFACTS_PULL}
      `,
      [userId, since],
    );

    const convSaturated = conversations.length >= MAX_CONVERSATIONS_PULL;
    const msgSaturated = messages.length >= MAX_MESSAGES_PULL;
    const artSaturated = artifacts.length >= MAX_ARTIFACTS_PULL;
    // hasMore: a full page on any table means the client should pull again.
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
      ChatSyncPullResponseSchema.parse({ conversations, messages, artifacts, cursor, hasMore }),
    );
  } catch (error) {
    logger.error({ error, userId }, 'Cloud sync pull failed');
    throw createError.internal('Failed to pull sync changes');
  }
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

type BatchRow<T> = {
  kind: 'applied' | 'conflict';
  id: string;
  server_version: string | null;
  current: T | null;
};

async function handlePush(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-scoped: writes run as app_rls with request.jwt.claim.sub bound, so the
  // WITH CHECK policies reject any row whose user_id != the authenticated subject.
  const { db, userId } = await getUserScopedDb(request);

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
            returning existing.id, existing.server_version
          ), inserted as (
            insert into web_conversations
              (id, user_id, title, model, project_id, pinned, created_at, updated_at, deleted_at)
            select incoming.id, $1, incoming.title, incoming.model, incoming.project_id,
                   incoming.pinned, now(), now(),
                   case when incoming.should_delete then now() else null end
              from input as incoming
             where incoming.base_version = 0
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
        [userId, JSON.stringify(conversations)],
      );
      collectBatchRows(rows, applied.conversations, conflicts.conversations);
    }

    if (messages.length > 0) {
      const rows = await db.query<BatchRow<MessageDelta>>(
        `
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
               output_tokens, metadata, created_at, updated_at, deleted_at)
            select incoming.id, incoming.conversation_id, incoming.role, incoming.content,
                   incoming.model, incoming.provider, incoming.input_tokens,
                   incoming.output_tokens, incoming.metadata,
                   now(), now(), case when incoming.should_delete then now() else null end
              from input as incoming
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
        `,
        [userId, JSON.stringify(messages)],
      );
      collectBatchRows(rows, applied.messages, conflicts.messages);
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Max of a set of bigint-as-string server_versions (compares numerically by length then lexicographically). */
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

/** Compare two non-negative integer strings without precision loss. */
function bigintGreater(a: string, b: string): boolean {
  const na = a.replace(/^0+/, '') || '0';
  const nb = b.replace(/^0+/, '') || '0';
  if (na.length !== nb.length) return na.length > nb.length;
  return na > nb;
}

export const GET = withErrorHandler(handlePull);
export const POST = withErrorHandler(handlePush);
