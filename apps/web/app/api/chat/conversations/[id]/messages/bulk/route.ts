/**
 * Bulk message save endpoint.
 *
 * POST /api/chat/conversations/[id]/messages/bulk
 *   Upserts an array of messages into a conversation. Uses INSERT ... ON CONFLICT
 *   so the same message ID can be sent multiple times safely (idempotent).
 *   Used by use-chat-persistence.ts saveMessages() for batch persistence.
 *
 * Request body: { messages: Array<{ id?, role, content, model?, metadata? }> }
 * Response:     { saved: number, messages: ChatMessageRow[] }
 *
 * Max 200 messages per call. All messages must belong to the same conversation
 * and user, verified server-side.
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

const MessageItemSchema = z.object({
  id: z.string().uuid().optional(),
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  content: z.string().min(1).max(100_000),
  model: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

const BulkSaveSchema = z.object({
  messages: z.array(MessageItemSchema).min(1).max(200),
});

async function handleBulkSave(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();
  const { id: conversationId } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const parsed = BulkSaveSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Invalid request body', parsed.error);

  const { messages } = parsed.data;

  const db = getNeonChatDb();

  // Verify conversation ownership
  const [conv] = await db.query<{ id: string }>(
    'select id from web_conversations where id = $1 and user_id = $2 and deleted_at is null limit 1',
    [conversationId, userId],
  );
  if (!conv) throw createError.notFound('Conversation not found');

  const saved: ChatMessageRow[] = [];

  try {
    for (const msg of messages) {
      if (msg.id) {
        // Upsert by provided ID.
        //
        // AUDIT-FIX (CRITICAL #17, IDOR): the conflict target is the global
        // PK and msg.id is client-supplied · without the conversation guard
        // on the DO UPDATE, posting a victim's message UUID into the
        // attacker's own (ownership-checked) conversation would overwrite
        // the victim's row and leak its provider/token/cost fields via
        // RETURNING. The WHERE clause makes a foreign-row conflict a no-op,
        // which is rejected explicitly below instead of silently skipped.
        const [row] = await db.query<ChatMessageRow>(
          `
            insert into web_messages
              (id, conversation_id, role, content, model, metadata)
            values ($1, $2, $3, $4, $5, $6::jsonb)
            on conflict (id) do update
              set content = excluded.content,
                  model = excluded.model,
                  metadata = excluded.metadata
              where web_messages.conversation_id = excluded.conversation_id
            returning id, role, content, model, provider,
                      input_tokens, output_tokens, cost_cents, created_at, metadata
          `,
          [
            msg.id,
            conversationId,
            msg.role,
            msg.content.trim(),
            msg.role === 'assistant' ? (msg.model ?? null) : null,
            JSON.stringify(normalizeMessageMetadata(msg.metadata) ?? {}),
          ],
        );
        if (!row) {
          // Conflict on a message that belongs to a different conversation.
          throw createError.validation('Message id belongs to another conversation');
        }
        saved.push(row);
      } else {
        // Insert without explicit ID
        const [row] = await db.query<ChatMessageRow>(
          `
            insert into web_messages
              (conversation_id, role, content, model, metadata)
            values ($1, $2, $3, $4, $5::jsonb)
            returning id, role, content, model, provider,
                      input_tokens, output_tokens, cost_cents, created_at, metadata
          `,
          [
            conversationId,
            msg.role,
            msg.content.trim(),
            msg.role === 'assistant' ? (msg.model ?? null) : null,
            JSON.stringify(normalizeMessageMetadata(msg.metadata) ?? {}),
          ],
        );
        if (row) saved.push(row);
      }
    }

    return NextResponse.json({ saved: saved.length, messages: saved });
  } catch (error) {
    // Re-throw typed AppErrors (e.g. the cross-conversation rejection above).
    if (error && typeof error === 'object' && ('status' in error || 'statusCode' in error)) {
      throw error;
    }
    logger.error({ error, conversationId }, 'Failed to bulk save messages');
    throw createError.internal('Failed to save messages');
  }
}

export const POST = withErrorHandler(handleBulkSave);
