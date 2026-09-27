import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { EXPLICIT_ARTIFACT_DERIVATION_POLICY } from '@agiworkforce/artifacts';
import { MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { normalizeMessageMetadata, type ChatMessageRow } from '@/lib/server/neon-chat';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { assertFreeDailyAllowance } from '@/lib/services/tier-unit-quota-service';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { scheduleArtifactIndexing } from '../messages/lib/index-artifacts';
import { INSERT_MESSAGE_SQL, isHttpError, setActiveLeaf } from '../messages/lib/message-thread';

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_KEPT_MESSAGES = 1000;
const ALREADY_SAVED = 'This chat is already saved.';

const KeptMessageSchema = z.object({
  id: z.string().uuid().optional(),
  role: z.enum(['user', 'assistant']),
  content: z.string().max(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH),
  model: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

const KeepTemporaryChatSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  messages: z.array(KeptMessageSchema).max(MAX_KEPT_MESSAGES),
});

async function handleKeepTemporaryChat(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

  const { id: conversationId } = await context.params;
  if (!UUID_PATTERN.test(conversationId)) throw createError.validation('Choose a chat to save');

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }
  const parsed = KeepTemporaryChatSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Invalid request body', parsed.error);

  const messages = parsed.data.messages.filter((message) => message.content.trim().length > 0);
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const scope = { conversationId, userId, organizationId };

  const [conversation] = await db.query<{ is_temporary: boolean }>(
    `select is_temporary
       from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1`,
    [conversationId, userId, organizationId],
  );
  if (!conversation) throw createError.notFound('Conversation not found');
  if (!conversation.is_temporary) throw createError.conflict(ALREADY_SAVED);

  if (messages.length > 0) {
    await assertFreeDailyAllowance({
      db,
      userId,
      requested: { message_writes: messages.length },
    });
  }

  const saved: ChatMessageRow[] = [];
  let keptFiles = 0;
  try {
    await db.transaction(async (tx) => {
      const flipped = await tx.execute(
        `update web_conversations
            set is_temporary = false,
                title = coalesce($4, title),
                updated_at = now()
          where id = $1
            and user_id = $2
            and organization_id is not distinct from $3
            and deleted_at is null
            and is_temporary`,
        [conversationId, userId, organizationId, parsed.data.title ?? null],
      );
      if (flipped === 0) throw createError.conflict(ALREADY_SAVED);

      let parentId: string | null = null;
      for (const message of messages) {
        const [row] = await tx.query<ChatMessageRow>(INSERT_MESSAGE_SQL, [
          message.id ?? null,
          conversationId,
          message.role,
          message.content.trim(),
          message.role === 'assistant' ? (message.model ?? null) : null,
          JSON.stringify(normalizeMessageMetadata(message.metadata) ?? {}),
          parentId,
        ]);
        if (!row) throw createError.validation('Message id belongs to another conversation');
        saved.push(row);
        parentId = row.id;
      }
      if (parentId !== null) await setActiveLeaf(tx, scope, parentId);

      keptFiles = await tx.execute(
        `update public.media_assets
            set temporary_chat = false
          where conversation_id = $1::uuid
            and user_id = $2
            and organization_id is not distinct from $3
            and temporary_chat
            and deleted_at is null`,
        [conversationId, userId, organizationId],
      );
    });
  } catch (error) {
    if (isHttpError(error)) throw error;
    logger.error({ error, conversationId }, 'Failed to keep temporary chat');
    throw createError.internal('Failed to save this chat');
  }

  for (const row of saved) {
    if (row.role !== 'assistant') continue;
    scheduleArtifactIndexing({
      db,
      userId,
      conversationId,
      messageId: row.id,
      content: row.content,
      ...(row.metadata?.['artifactDerivation'] === EXPLICIT_ARTIFACT_DERIVATION_POLICY
        ? { artifactDerivation: EXPLICIT_ARTIFACT_DERIVATION_POLICY }
        : {}),
    });
  }

  return NextResponse.json({ kept: saved.length, keptFiles });
}

export const POST = withCorsRoute(withErrorHandler(handleKeepTemporaryChat));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
