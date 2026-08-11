/**
 * Chat Messages API
 *
 * POST /api/chat/conversations/[id]/messages - Send a message and get AI response
 */

import { NextRequest, NextResponse } from 'next/server';
import { ManagedCloudMessageWireSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withIsoTimestamps } from '@/lib/server/iso-timestamps';
import { CreateMessageSchema } from '@/lib/validations/chat';
import {
  getNeonChatDb,
  normalizeMessageMetadata,
  requireCurrentUserId,
  type ChatMessageRow,
} from '@/lib/server/neon-chat';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

type RouteContext = { params: Promise<{ id: string }> };

async function handleSendMessage(request: NextRequest, context: RouteContext) {
  const userId = await requireCurrentUserId(request);

  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

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

  const db = getNeonChatDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);
  const [conversation] = await db.query<{ id: string; model: string | null }>(
    `
      select id, model
      from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1
    `,
    [conversationId, userId, organizationId],
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
    // Idempotent on the client-supplied id so a retry of an already-committed
    // message (e.g. after a transient network blip on the response path) does
    // NOT throw a unique-violation or create a duplicate. The ON CONFLICT
    // update is scoped to the SAME conversation: a cross-conversation id
    // collision (an attacker POSTing a victim's message id into their own
    // conversation) matches the WHERE on neither side and updates/returns
    // nothing, so this cannot be used to overwrite or read another user's
    // message (IDOR-safe). content/metadata/model are re-asserted from the
    // retry payload, which in the normal flow are identical to the original.
    [message] = await db.query<ChatMessageRow>(
      `
        insert into web_messages (id, conversation_id, role, content, model, metadata)
        values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb)
        on conflict (id) do update
          set content = excluded.content,
              metadata = excluded.metadata,
              model = excluded.model
          where web_messages.conversation_id = excluded.conversation_id
        returning id, role, content, model, provider, input_tokens, output_tokens, created_at, metadata
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
        `update web_conversations
            set title = $1, updated_at = now()
          where id = $2
            and user_id = $3
            and organization_id is not distinct from $4`,
        [title, conversationId, userId, organizationId],
      );
    }
  }

  return NextResponse.json({
    // Normalize the RETURNING row's Date timestamps to ISO before validating, or
    // the wire schema throws a ZodError (created_at "expected string, received
    // Date") -> 400 -> the client's "Couldn't save your message" toast.
    message: message
      ? ManagedCloudMessageWireSchema.parse(withIsoTimestamps([message])[0])
      : undefined,
  });
}

export const POST = withCorsRoute(withErrorHandler(handleSendMessage));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
