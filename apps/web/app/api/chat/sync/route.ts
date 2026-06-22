/**
 * Cross-device cloud chat sync — Phase 0 (delta sync).
 * Design: docs/plans/cross-device-cloud-sync-design-2026-06-20.md
 *
 *   GET  /api/chat/sync?since=<server_version cursor>
 *        → conversations + messages + artifacts with server_version > cursor (incl.
 *          tombstones), scoped to the authenticated user, plus the next cursor.
 *   POST /api/chat/sync  { conversations: [...], messages: [...], artifacts: [...] }
 *        → idempotent UPSERT by id (= cloud_id). user_id is set SERVER-SIDE from the
 *          verified session (never from the body); RLS WITH CHECK is the backstop.
 *          Conversation/artifact metadata = last-writer-wins (by updated_at); messages
 *          are append-only (only a deleted_at tombstone may change an existing message).
 *          Artifacts (0039) are the third synced entity — managed-only; the cloud row's
 *          id is the deterministic derived_id for derived artifacts. See
 *          docs/plans/artifact-cloud-sync-design-2026-06-21.md.
 *
 * Trust boundary: this endpoint is the Managed-Cloud store. Local/BYOK conversations
 * have no cloud_id and are never pushed/pulled (enforced client-side per the matrix).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';

const MAX_CONVERSATIONS_PULL = 500;
const MAX_MESSAGES_PULL = 1000;
const MAX_ARTIFACTS_PULL = 500;
const MAX_CONVERSATIONS_PUSH = 500;
const MAX_MESSAGES_PUSH = 2000;
const MAX_ARTIFACTS_PUSH = 500;

type ConversationDelta = {
  id: string;
  title: string;
  model: string | null;
  project_id: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_version: string;
};

type MessageDelta = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  provider: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_version: string;
};

type ArtifactDelta = {
  id: string;
  conversation_id: string;
  message_id: string | null;
  title: string | null;
  artifact_type: string;
  language: string | null;
  content: string;
  current_version: number;
  pinned: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_version: string;
};

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
  // server_version is a bigint; parse defensively and clamp to a non-negative integer.
  const since = /^\d{1,19}$/.test(sinceRaw) ? sinceRaw : '0';

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
               m.input_tokens, m.output_tokens, m.cost_cents, m.metadata,
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

    return NextResponse.json({ conversations, messages, artifacts, cursor, hasMore });
  } catch (error) {
    logger.error({ error, userId }, 'Cloud sync pull failed');
    throw createError.internal('Failed to pull sync changes');
  }
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

const PushConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(500),
  model: z.string().max(200).nullable().optional(),
  projectId: z.string().max(200).nullable().optional(),
  pinned: z.boolean().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
});

const PushMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(1_000_000),
  model: z.string().max(200).nullable().optional(),
  provider: z.string().max(200).nullable().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  costCents: z.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string().datetime().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
});

const PushArtifactSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid().nullable().optional(),
  title: z.string().max(500).nullable().optional(),
  artifactType: z.string().max(50),
  language: z.string().max(50).nullable().optional(),
  content: z.string().max(2_000_000),
  currentVersion: z.number().int().positive().optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
});

const PushBodySchema = z.object({
  conversations: z.array(PushConversationSchema).max(MAX_CONVERSATIONS_PUSH).optional(),
  messages: z.array(PushMessageSchema).max(MAX_MESSAGES_PUSH).optional(),
  artifacts: z.array(PushArtifactSchema).max(MAX_ARTIFACTS_PUSH).optional(),
});

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
  const parsed = PushBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid sync payload', parsed.error);
  }
  const { conversations = [], messages = [], artifacts = [] } = parsed.data;

  const applied = {
    conversations: [] as Array<{ id: string; server_version: string }>,
    messages: [] as Array<{ id: string; server_version: string }>,
    artifacts: [] as Array<{ id: string; server_version: string }>,
  };

  try {
    // Conversations: UPSERT, last-writer-wins on metadata. user_id is forced to the
    // session user, so a client can never write another user's row (RLS WITH CHECK
    // is the DB-level backstop).
    for (const c of conversations) {
      const rows = await db.query<{ id: string; server_version: string }>(
        `
          insert into web_conversations
            (id, user_id, title, model, project_id, pinned, created_at, updated_at, deleted_at)
          values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()), $8::timestamptz, $9::timestamptz)
          on conflict (id) do update set
            title = excluded.title,
            -- A conversation always has a model; a client that doesn't track it
            -- (desktop has no conversations.model column) pushes null. COALESCE so a
            -- null push can never clobber a model another client/device already set.
            -- (project_id/pinned keep last-writer-wins: null/false there are legit
            -- "unassign from project" / "unpin" intents that must propagate.)
            model = coalesce(excluded.model, web_conversations.model),
            project_id = excluded.project_id,
            pinned = excluded.pinned,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
          where web_conversations.user_id = $2
            and excluded.updated_at >= web_conversations.updated_at
          returning id, server_version
        `,
        [
          c.id,
          userId,
          c.title,
          c.model ?? null,
          c.projectId ?? null,
          c.pinned ?? false,
          c.createdAt ?? null,
          c.updatedAt,
          c.deletedAt ?? null,
        ],
      );
      if (rows[0]) applied.conversations.push(rows[0]);
    }

    // Messages: append-only. Insert new messages whose parent conversation the
    // caller owns; on conflict, only a deleted_at tombstone may change (content
    // and the rest are immutable).
    for (const m of messages) {
      const rows = await db.query<{ id: string; server_version: string }>(
        `
          insert into web_messages
            (id, conversation_id, role, content, model, provider,
             input_tokens, output_tokens, cost_cents, metadata, created_at, updated_at, deleted_at)
          select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
                 coalesce($11::timestamptz, now()), now(), $12::timestamptz
          where exists (
            select 1 from web_conversations
            where id = $2 and user_id = $13 and deleted_at is null
          )
          on conflict (id) do update set
            deleted_at = excluded.deleted_at,
            updated_at = now()
          where excluded.deleted_at is not null
          returning id, server_version
        `,
        [
          m.id,
          m.conversationId,
          m.role,
          m.content,
          m.model ?? null,
          m.provider ?? null,
          m.inputTokens ?? 0,
          m.outputTokens ?? 0,
          m.costCents ?? 0,
          JSON.stringify(m.metadata ?? {}),
          m.createdAt ?? null,
          m.deletedAt ?? null,
          userId,
        ],
      );
      if (rows[0]) applied.messages.push(rows[0]);
    }

    // Artifacts: UPSERT, last-writer-wins by updated_at. user_id is forced to the
    // session user; the parent conversation must be owned by the caller. RLS WITH
    // CHECK is the DB-level backstop. A null updated_at can never clobber a newer row.
    for (const a of artifacts) {
      const rows = await db.query<{ id: string; server_version: string }>(
        `
          insert into web_artifacts
            (id, user_id, conversation_id, message_id, title, artifact_type, language,
             content, current_version, pinned, tags, created_at, updated_at, deleted_at)
          select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 coalesce($12::timestamptz, now()), $13::timestamptz, $14::timestamptz
          where exists (
            select 1 from web_conversations where id = $3 and user_id = $2
          )
          on conflict (id) do update set
            title = excluded.title,
            artifact_type = excluded.artifact_type,
            language = excluded.language,
            content = excluded.content,
            current_version = excluded.current_version,
            pinned = excluded.pinned,
            tags = excluded.tags,
            message_id = coalesce(excluded.message_id, web_artifacts.message_id),
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
          where web_artifacts.user_id = $2
            and excluded.updated_at >= web_artifacts.updated_at
          returning id, server_version
        `,
        [
          a.id,
          userId,
          a.conversationId,
          a.messageId ?? null,
          a.title ?? null,
          a.artifactType,
          a.language ?? null,
          a.content,
          a.currentVersion ?? 1,
          a.pinned ?? false,
          a.tags ?? [],
          a.createdAt ?? null,
          a.updatedAt,
          a.deletedAt ?? null,
        ],
      );
      if (rows[0]) applied.artifacts.push(rows[0]);
    }

    const cursor = maxServerVersion(
      '0',
      applied.conversations,
      applied.messages,
      applied.artifacts,
    );
    return NextResponse.json({ applied, cursor });
  } catch (error) {
    logger.error({ error, userId }, 'Cloud sync push failed');
    throw createError.internal('Failed to push sync changes');
  }
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
