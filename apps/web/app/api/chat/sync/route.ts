/**
 * Cross-device cloud chat sync — Phase 0 (delta sync).
 * Design: docs/plans/cross-device-cloud-sync-design-2026-06-20.md
 *
 *   GET  /api/chat/sync?since=<server_version cursor>
 *        → conversations + messages with server_version > cursor (incl. tombstones),
 *          scoped to the authenticated user, plus the next cursor.
 *   POST /api/chat/sync  { conversations: [...], messages: [...] }
 *        → idempotent UPSERT by id (= cloud_id). user_id is set SERVER-SIDE from the
 *          verified session (never from the body); RLS WITH CHECK is the backstop.
 *          Conversation metadata = last-writer-wins; messages are append-only
 *          (only a deleted_at tombstone may change an existing message).
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
import { getNeonChatDb, requireCurrentUserId } from '@/lib/server/neon-chat';

const MAX_CONVERSATIONS_PULL = 500;
const MAX_MESSAGES_PULL = 1000;
const MAX_CONVERSATIONS_PUSH = 500;
const MAX_MESSAGES_PUSH = 2000;

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

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

async function handlePull(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get('since') ?? '0';
  // server_version is a bigint; parse defensively and clamp to a non-negative integer.
  const since = /^\d{1,19}$/.test(sinceRaw) ? sinceRaw : '0';

  try {
    const db = getNeonChatDb();
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

    // Next cursor = highest server_version returned this page (compare as bigint).
    const cursor = maxServerVersion(since, conversations, messages);
    // hasMore: a full page on either table means the client should pull again.
    const hasMore =
      conversations.length >= MAX_CONVERSATIONS_PULL || messages.length >= MAX_MESSAGES_PULL;

    return NextResponse.json({ conversations, messages, cursor, hasMore });
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

const PushBodySchema = z.object({
  conversations: z.array(PushConversationSchema).max(MAX_CONVERSATIONS_PUSH).optional(),
  messages: z.array(PushMessageSchema).max(MAX_MESSAGES_PUSH).optional(),
});

async function handlePush(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();

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
  const { conversations = [], messages = [] } = parsed.data;

  const db = getNeonChatDb();
  const applied = {
    conversations: [] as Array<{ id: string; server_version: string }>,
    messages: [] as Array<{ id: string; server_version: string }>,
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
            model = excluded.model,
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

    const cursor = maxServerVersion('0', applied.conversations, applied.messages);
    return NextResponse.json({ applied, cursor });
  } catch (error) {
    logger.error({ error, userId }, 'Cloud sync push failed');
    throw createError.internal('Failed to push sync changes');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
