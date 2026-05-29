/**
 * Session Messages API — backed by web_messages table.
 *
 * GET  /api/chat/sessions/[id]/messages  — list messages for a session
 * POST /api/chat/sessions/[id]/messages  — save a single message to a session
 *
 * "Sessions" is a UI alias for web_conversations used by chat-store.ts.
 * This route intentionally skips the LLM call (skipLlm=true equivalent):
 * it only persists the message. LLM orchestration happens in the streaming
 * pipeline; this is for manual/background saves.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  getNeonChatDb,
  requireCurrentUserId,
  normalizeMessageMetadata,
  type ChatMessageRow,
} from '@/lib/server/neon-chat';

type RouteContext = { params: Promise<{ id: string }> };

const SaveMessageSchema = z.object({
  id: z.string().uuid().optional(),
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  content: z.string().min(1).max(100_000),
  model: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

async function handleGetMessages(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();
  const { id: sessionId } = await context.params;

  const db = getNeonChatDb();

  // Verify session ownership
  const [conv] = await db.query<{ id: string }>(
    'select id from web_conversations where id = $1 and user_id = $2 and deleted_at is null limit 1',
    [sessionId, userId],
  );
  if (!conv) throw createError.notFound('Session not found');

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '200', 10);
  const rawOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 200, 1), 500);
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  try {
    const messages = await db.query<ChatMessageRow>(
      `
        select id, role, content, model, provider,
               input_tokens, output_tokens, cost_cents, created_at, metadata
        from web_messages
        where conversation_id = $1
        order by created_at asc
        limit $2 offset $3
      `,
      [sessionId, limit, offset],
    );
    return NextResponse.json({ messages });
  } catch (error) {
    logger.error({ error, sessionId }, 'Failed to fetch session messages');
    throw createError.internal('Failed to fetch messages');
  }
}

async function handleSaveMessage(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();
  const { id: sessionId } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const parsed = SaveMessageSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Invalid request body', parsed.error);
  const { role, content, model, metadata } = parsed.data;

  const db = getNeonChatDb();

  // Verify session ownership
  const [conv] = await db.query<{ id: string }>(
    'select id from web_conversations where id = $1 and user_id = $2 and deleted_at is null limit 1',
    [sessionId, userId],
  );
  if (!conv) throw createError.notFound('Session not found');

  try {
    const [message] = await db.query<ChatMessageRow>(
      `
        insert into web_messages
          (conversation_id, role, content, model, metadata)
        values ($1, $2, $3, $4, $5::jsonb)
        returning id, role, content, model, provider,
                  input_tokens, output_tokens, cost_cents, created_at, metadata
      `,
      [
        sessionId,
        role,
        content.trim(),
        role === 'assistant' ? (model ?? null) : null,
        JSON.stringify(normalizeMessageMetadata(metadata) ?? {}),
      ],
    );

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    logger.error({ error, sessionId }, 'Failed to save session message');
    throw createError.internal('Failed to save message');
  }
}

export const GET = withErrorHandler(handleGetMessages);
export const POST = withErrorHandler(handleSaveMessage);
