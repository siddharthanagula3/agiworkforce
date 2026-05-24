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

/** Wire-format message for the LLM provider call - not the canonical UI ChatMessage. */
interface LlmTurnMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

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

  const { content, metadata, model, role, skipLlm } = validationResult.data;

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

  // If skipLlm is true, just save the message and return (used for streaming where LLM is called separately)
  if (skipLlm) {
    let message: ChatMessageRow | undefined;
    try {
      [message] = await db.query<ChatMessageRow>(
        `
          insert into web_messages (conversation_id, role, content, model, metadata)
          values ($1, $2, $3, $4, $5::jsonb)
          returning id, role, content, model, provider, input_tokens, output_tokens, cost_cents, created_at, metadata
        `,
        [
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

  // Save user message
  const [userMessage] = await db.query<ChatMessageRow>(
    `
      insert into web_messages (conversation_id, role, content)
      values ($1, 'user', $2)
      returning id, role, content, model, provider, input_tokens, output_tokens, cost_cents, created_at, metadata
    `,
    [conversationId, content.trim()],
  );

  if (!userMessage) {
    logger.error({ conversationId }, 'Failed to save user message');
    throw createError.internal('Failed to save message');
  }

  // Get conversation history for context
  const history = await db.query<LlmTurnMessage>(
    `
      select role, content
      from web_messages
      where conversation_id = $1
      order by created_at asc
      limit 20
    `,
    [conversationId],
  );

  const messages: LlmTurnMessage[] = (history || []).map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }));

  // Call LLM API
  const llmApiUrl = process.env['NEXT_PUBLIC_SITE_URL'] || 'http://localhost:3001';
  const llmEndpoint = `${llmApiUrl}/api/llm/v1/chat/completions`;

  // Validate outbound URL uses a trusted origin
  const trustedOrigin = new URL(llmApiUrl).origin;
  const actualOrigin = new URL(llmEndpoint).origin;
  if (actualOrigin !== trustedOrigin) {
    logger.error({ llmEndpoint, trustedOrigin, actualOrigin }, 'LLM endpoint origin mismatch');
    // Rollback: delete the user message we already saved
    await db.execute('delete from web_messages where id = $1', [userMessage.id]);
    throw createError.internal('LLM API configuration error');
  }

  const llmResponse = await fetch(llmEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('authorization') || '',
      // Do not forward cookies to internal LLM endpoint - Authorization header is sufficient.
    },
    body: JSON.stringify({
      model: model || conversation.model || 'auto',
      messages,
      stream: false,
    }),
  });

  if (!llmResponse.ok) {
    const errorData = await llmResponse.json().catch(() => ({}));
    logger.error({ status: llmResponse.status, error: errorData }, 'LLM API error');
    // Rollback: delete the user message so the conversation stays consistent
    await db.execute('delete from web_messages where id = $1', [userMessage.id]);
    throw createError.internal('Failed to get AI response');
  }

  const llmData = await llmResponse.json();
  const assistantContent =
    llmData.choices?.[0]?.message?.content || 'I could not generate a response.';
  const usage = llmData.usage || {};

  // Save assistant message
  const [assistantMessage] = await db.query<ChatMessageRow>(
    `
      insert into web_messages (
        conversation_id, role, content, model, provider, input_tokens, output_tokens, cost_cents
      )
      values ($1, 'assistant', $2, $3, $4, $5, $6, $7)
      returning id, role, content, model, provider, input_tokens, output_tokens, cost_cents, created_at, metadata
    `,
    [
      conversationId,
      assistantContent,
      llmData.model || model || null,
      llmData.provider || null,
      usage.prompt_tokens || 0,
      usage.completion_tokens || 0,
      llmData.cost_cents || 0,
    ],
  );

  if (!assistantMessage) {
    logger.error({ conversationId }, 'Failed to save assistant message');
    throw createError.internal('Failed to save AI response');
  }

  // Auto-title conversation from first message
  const [row] = await db.query<{ count: string }>(
    'select count(*)::text as count from web_messages where conversation_id = $1',
    [conversationId],
  );

  if (Number(row?.count ?? 0) <= 2) {
    // First exchange - generate title
    const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
    await db.execute(
      'update web_conversations set title = $1, updated_at = now() where id = $2 and user_id = $3',
      [title, conversationId, userId],
    );
  }

  return NextResponse.json({
    userMessage,
    assistantMessage,
    usage: {
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
    },
  });
}

export const POST = withErrorHandler(handleSendMessage);
