
import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { ManagedCloudMessageWireSchema } from '@agiworkforce/cloud-contracts';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withIsoTimestamps } from '@/lib/server/iso-timestamps';
import {
  getNeonChatDb,
  requireCurrentUserId,
  normalizeMessageMetadata,
  type ChatMessageRow,
} from '@/lib/server/neon-chat';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

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
  const userId = await requireCurrentUserId(request);

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

  const parsed = BulkSaveSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Invalid request body', parsed.error);

  const { messages } = parsed.data;

  const db = getNeonChatDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);

  const [conv] = await db.query<{ id: string }>(
    `select id
       from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1`,
    [conversationId, userId, organizationId],
  );
  if (!conv) throw createError.notFound('Conversation not found');

  const saved: ChatMessageRow[] = [];

  try {
    for (const msg of messages) {
      if (msg.id) {
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
                      input_tokens, output_tokens, created_at, metadata
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
          throw createError.validation('Message id belongs to another conversation');
        }
        saved.push(row);
      } else {
        const [row] = await db.query<ChatMessageRow>(
          `
            insert into web_messages
              (conversation_id, role, content, model, metadata)
            values ($1, $2, $3, $4, $5::jsonb)
            returning id, role, content, model, provider,
                      input_tokens, output_tokens, created_at, metadata
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

    return NextResponse.json({
      saved: saved.length,
      messages: withIsoTimestamps(saved).map((message) =>
        ManagedCloudMessageWireSchema.parse(message),
      ),
    });
  } catch (error) {
    if (error && typeof error === 'object' && ('status' in error || 'statusCode' in error)) {
      throw error;
    }
    logger.error({ error, conversationId }, 'Failed to bulk save messages');
    throw createError.internal('Failed to save messages');
  }
}

export const POST = withCorsRoute(withErrorHandler(handleBulkSave));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
