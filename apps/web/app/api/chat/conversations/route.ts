/**
 * Chat Conversations API
 *
 * GET /api/chat/conversations - List user's conversations
 * POST /api/chat/conversations - Create a new conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreateConversationSchema } from '@/lib/validations/chat';
import {
  getNeonChatDb,
  requireCurrentUserId,
  type ChatConversationRow,
} from '@/lib/server/neon-chat';
import { assertSessionInvariants } from '@agiworkforce/types';
import { buildCloudChatSessionLabel } from '@/lib/services/chat-session-label-service';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parsePositiveInt(raw: string | null, fallback: number, max?: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

async function handleGetConversations(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();

  // Optional title search. Sanitize to prevent oversized ILIKE patterns.
  const url = new URL(request.url);
  const rawQ = url.searchParams.get('q') ?? '';
  const q = rawQ.slice(0, 200).trim();

  // Offset-based pagination so the sidebar can page past the most-recent 50
  // conversations instead of having anything older become unreachable.
  const limit =
    parsePositiveInt(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) ||
    DEFAULT_PAGE_SIZE;
  const offset = parsePositiveInt(url.searchParams.get('offset'), 0);

  try {
    let rows: ChatConversationRow[];
    // Fetch one extra row to cheaply detect whether another page exists
    // without a separate count(*) query.
    if (q) {
      rows = await getNeonChatDb().query<ChatConversationRow>(
        `
          select id, title, model, project_id, pinned, starred, archived, is_temporary, created_at, updated_at
          from web_conversations
          where user_id = $1 and deleted_at is null and title ilike $2
          order by pinned desc, updated_at desc
          limit $3 offset $4
        `,
        [userId, `%${q}%`, limit + 1, offset],
      );
    } else {
      rows = await getNeonChatDb().query<ChatConversationRow>(
        `
          select id, title, model, project_id, pinned, starred, archived, is_temporary, created_at, updated_at
          from web_conversations
          where user_id = $1 and deleted_at is null
          order by pinned desc, updated_at desc
          limit $2 offset $3
        `,
        [userId, limit + 1, offset],
      );
    }

    const hasMore = rows.length > limit;
    const conversations = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      conversations,
      hasMore,
      nextOffset: offset + conversations.length,
    });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch conversations');
    throw createError.internal('Failed to fetch conversations');
  }
}

async function handleCreateConversation(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();

  // AUDIT-008-003: Validate input with Zod schema
  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    // Empty body is fine - defaults will be applied by schema
  }

  const validationResult = CreateConversationSchema.safeParse(rawBody);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }
  const body = validationResult.data;

  try {
    // Accept a client-supplied UUID (offline-first id); fall back to the DB default.
    // ON CONFLICT makes a retried create idempotent, and the owner-guarded WHERE
    // ensures a client can never overwrite another user's conversation by id.
    const [conversation] = await getNeonChatDb().query<ChatConversationRow>(
      `
        insert into web_conversations (id, user_id, title, model, project_id, is_temporary)
        values (coalesce($5::uuid, gen_random_uuid()), $1, $2, $3, $4, $6)
        on conflict (id) do update set
          title = excluded.title,
          model = excluded.model,
          project_id = excluded.project_id,
          updated_at = now()
        where web_conversations.user_id = $1
        returning id, title, model, project_id, pinned, starred, archived, is_temporary, created_at, updated_at
      `,
      [
        userId,
        body.title,
        body.model ?? null,
        body.projectId ?? null,
        body.id ?? null,
        body.isTemporary ?? false,
      ],
    );
    if (!conversation) {
      // The id exists but is owned by another user — never leak or hijack it.
      throw createError.conflict('Conversation id already exists');
    }

    // Session-taxonomy labeling (W5 discipline wave 1 stage 2): every web
    // chat conversation is a `cloud_chat` AppSession. Asserting invariants
    // here — at the actual persistence boundary, right after the insert
    // succeeds — is additive: on the happy path it is silent and the
    // response below is unchanged; a violation surfaces through the SAME
    // catch block and error response this route already has.
    assertSessionInvariants(
      buildCloudChatSessionLabel({
        conversationId: conversation.id,
        ownerUserId: userId,
        projectId: conversation.project_id,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
      }),
    );

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to create conversation');
    throw createError.internal('Failed to create conversation');
  }
}

export const GET = withErrorHandler(handleGetConversations);
export const POST = withErrorHandler(handleCreateConversation);
