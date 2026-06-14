/**
 * Chat Sessions API · backed by web_conversations table.
 *
 * GET  /api/chat/sessions       · list the current user's sessions (newest first)
 * POST /api/chat/sessions       · create a new session (upsert via title+id)
 * PUT  /api/chat/sessions       · alias for POST (upsert semantics)
 *
 * The "sessions" surface is a UI alias for web_conversations used by
 * chat-store.ts. Fields are mapped to the ChatSession shape:
 *   id, title, createdAt, updatedAt, preview (derived), messageCount (derived).
 *
 * NOTE: isPinned / isArchived / projectId are client-side only; the DB schema
 * has `pinned` and `project_id` columns which we map on read but do not
 * enforce in the write path for now.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getNeonChatDb, requireCurrentUserId } from '@/lib/server/neon-chat';

const CreateSessionSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(500).optional().default('New Chat'),
  model: z.string().max(200).optional(),
  pinned: z.boolean().optional().default(false),
  projectId: z.string().max(200).nullable().optional(),
});

type SessionRow = {
  id: string;
  title: string;
  model: string | null;
  pinned: boolean;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  message_count: string;
  preview: string | null;
};

function mapSession(row: SessionRow) {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    isPinned: row.pinned,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: Number(row.message_count),
    preview: row.preview ?? '',
  };
}

async function handleGetSessions(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();
  const db = getNeonChatDb();

  try {
    const rows = await db.query<SessionRow>(
      `
        select
          c.id, c.title, c.model, c.pinned, c.project_id,
          c.created_at, c.updated_at,
          count(m.id)::text as message_count,
          max(m.content) as preview
        from web_conversations c
        left join web_messages m on m.conversation_id = c.id
        where c.user_id = $1 and c.deleted_at is null
        group by c.id
        order by c.updated_at desc
        limit 100
      `,
      [userId],
    );
    return NextResponse.json({ sessions: rows.map(mapSession) });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch sessions');
    throw createError.internal('Failed to fetch sessions');
  }
}

async function handleUpsertSession(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();

  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    /* empty body fine · defaults apply */
  }

  const parsed = CreateSessionSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Invalid request body', parsed.error);
  const body = parsed.data;

  const db = getNeonChatDb();

  try {
    // If an ID was provided, upsert; otherwise always insert.
    //
    // AUDIT-FIX (CRITICAL #16, BOLA): the conflict target is the global PK,
    // and body.id is any client-supplied UUID · without the user_id guard on
    // the DO UPDATE, an authenticated user could overwrite another user's
    // conversation metadata by posting the victim's conversation UUID. The
    // WHERE clause makes a foreign-row conflict update nothing; the missing
    // row is then rejected explicitly below instead of crashing on `row!`.
    const [row] = body.id
      ? await db.query<SessionRow>(
          `
            insert into web_conversations (id, user_id, title, model, pinned, project_id)
            values ($1, $2, $3, $4, $5, $6)
            on conflict (id) do update
              set title = excluded.title,
                  model = coalesce(excluded.model, web_conversations.model),
                  pinned = excluded.pinned,
                  project_id = excluded.project_id,
                  updated_at = now()
              where web_conversations.user_id = excluded.user_id
            returning
              id, title, model, pinned, project_id, created_at, updated_at,
              0::text as message_count,
              null::text as preview
          `,
          [body.id, userId, body.title, body.model ?? null, body.pinned, body.projectId ?? null],
        )
      : await db.query<SessionRow>(
          `
            insert into web_conversations (user_id, title, model, pinned, project_id)
            values ($1, $2, $3, $4, $5)
            returning
              id, title, model, pinned, project_id, created_at, updated_at,
              0::text as message_count,
              null::text as preview
          `,
          [userId, body.title, body.model ?? null, body.pinned, body.projectId ?? null],
        );

    if (!row) {
      // Conflict on a conversation owned by someone else: the guarded upsert
      // touched no rows. Treat as not-found rather than leaking existence.
      throw createError.notFound('Conversation not found');
    }

    return NextResponse.json({ session: mapSession(row) }, { status: 201 });
  } catch (error) {
    // Re-throw typed AppErrors (e.g. the ownership not-found above) as-is.
    if (error && typeof error === 'object' && ('status' in error || 'statusCode' in error)) {
      throw error;
    }
    logger.error({ error, userId }, 'Failed to create session');
    throw createError.internal('Failed to create session');
  }
}

export const GET = withErrorHandler(handleGetSessions);
export const POST = withErrorHandler(handleUpsertSession);
export const PUT = withErrorHandler(handleUpsertSession);
