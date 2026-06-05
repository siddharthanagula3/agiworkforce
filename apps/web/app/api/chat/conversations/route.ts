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

async function handleGetConversations(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();

  // Optional title search. Sanitize to prevent oversized ILIKE patterns.
  const url = new URL(request.url);
  const rawQ = url.searchParams.get('q') ?? '';
  const q = rawQ.slice(0, 200).trim();

  try {
    let conversations: ChatConversationRow[];
    if (q) {
      conversations = await getNeonChatDb().query<ChatConversationRow>(
        `
          select id, title, model, project_id, created_at, updated_at
          from web_conversations
          where user_id = $1 and deleted_at is null and title ilike $2
          order by updated_at desc
          limit 50
        `,
        [userId, `%${q}%`],
      );
    } else {
      conversations = await getNeonChatDb().query<ChatConversationRow>(
        `
          select id, title, model, project_id, created_at, updated_at
          from web_conversations
          where user_id = $1 and deleted_at is null
          order by updated_at desc
          limit 50
        `,
        [userId],
      );
    }
    return NextResponse.json({ conversations });
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
    const [conversation] = await getNeonChatDb().query<ChatConversationRow>(
      `
        insert into web_conversations (user_id, title, model, project_id)
        values ($1, $2, $3, $4)
        returning id, title, model, project_id, created_at, updated_at
      `,
      [userId, body.title, body.model ?? null, body.projectId ?? null],
    );
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to create conversation');
    throw createError.internal('Failed to create conversation');
  }
}

export const GET = withErrorHandler(handleGetConversations);
export const POST = withErrorHandler(handleCreateConversation);
