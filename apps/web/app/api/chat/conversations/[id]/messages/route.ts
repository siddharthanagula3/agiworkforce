/**
 * Chat Messages API
 *
 * POST /api/chat/conversations/[id]/messages - Send a message and get AI response
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreateMessageSchema } from '@/lib/validations/chat';
import {
  getNeonChatDb,
  normalizeMessageMetadata,
  requireCurrentUserId,
  type ChatMessageRow,
} from '@/lib/server/neon-chat';

type RouteContext = { params: Promise<{ id: string }> };

async function handleSendMessage(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing POST endpoint
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

  // AUDIT-008-004: Validate input with Zod schema (max content length 100k chars)
  const validationResult = CreateMessageSchema.safeParse(rawBody);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }

  const { id: clientMessageId, content, metadata, model, role, skipLlm } = validationResult.data;

  // G2 / locked trust boundary — completely independent storage silos. `web_messages` is the
  // MANAGED-CLOUD silo. Local Mode and BYOK conversations are device-only and must never be
  // transmitted to AGI (PrivacySection: "All Local Mode conversations stay on your device").
  // Fail closed: a message tagged local/byok is rejected from the cloud silo, so the Local and
  // Cloud storage silos stay structurally independent — not merely conventionally separate.
  // (Web chat runs managed today, so this backstop never fires for current traffic.)
  const trustMode = (metadata as { privacyMode?: unknown } | undefined)?.privacyMode;
  if (trustMode === 'local' || trustMode === 'byok') {
    throw createError.forbidden(
      'Local Mode and BYOK conversations are device-only and are not stored in managed cloud.',
    );
  }

  const db = getNeonChatDb();
  const [conversation] = await db.query<{ id: string; model: string | null }>(
    `
      select id, model
      from web_conversations
      where id = $1 and user_id = $2 and deleted_at is null
      limit 1
    `,
    [conversationId, userId],
  );

  if (!conversation) {
    throw createError.notFound('Conversation not found');
  }

  // All web callers pass skipLlm: true (streaming is handled by /api/llm/v1/chat/completions).
  // The skipLlm=false LLM-inline path was removed as it had zero production callers.
  if (!skipLlm) {
    logger.warn({ conversationId }, 'skipLlm=false is no longer supported; treating as true');
  }

  let message: ChatMessageRow | undefined;
  try {
    [message] = await db.query<ChatMessageRow>(
      `
        insert into web_messages (id, conversation_id, role, content, model, metadata)
        values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb)
        returning id, role, content, model, provider, input_tokens, output_tokens, cost_cents, created_at, metadata
      `,
      [
        clientMessageId ?? null,
        conversationId,
        role,
        content.trim(),
        role === 'assistant' ? (model ?? null) : null,
        JSON.stringify(normalizeMessageMetadata(metadata) ?? {}),
      ],
    );
  } catch (error) {
    logger.error({ error }, 'Failed to save message');
    throw createError.internal('Failed to save message');
  }

  // Auto-title conversation from first user message
  if (role === 'user') {
    const [row] = await db.query<{ count: string }>(
      'select count(*)::text as count from web_messages where conversation_id = $1',
      [conversationId],
    );

    if (Number(row?.count ?? 0) <= 1) {
      // First message - generate title
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      await db.execute(
        'update web_conversations set title = $1, updated_at = now() where id = $2 and user_id = $3',
        [title, conversationId, userId],
      );
    }
  }

  return NextResponse.json({ message });
}

export const POST = withErrorHandler(handleSendMessage);
