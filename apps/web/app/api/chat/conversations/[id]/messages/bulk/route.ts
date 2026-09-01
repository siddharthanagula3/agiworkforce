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
import { scheduleArtifactIndexing } from '../lib/index-artifacts';
import {
  assertParentInConversation,
  INSERT_MESSAGE_SQL,
  isHttpError,
  lockConversationThread,
  resolveLinearTail,
  setActiveLeaf,
  stampLinearParents,
} from '../lib/message-thread';

type RouteContext = { params: Promise<{ id: string }> };

const MessageItemSchema = z.object({
  id: z.string().uuid().optional(),
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  content: z.string().min(1).max(100_000),
  model: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  parentId: z.string().uuid().optional(),
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

  const [conv] = await db.query<{ id: string; active_leaf_message_id: string | null }>(
    `select id, active_leaf_message_id
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

  type MessageItem = (typeof messages)[number];
  const insertParams = (msg: MessageItem, parent: string | null): unknown[] => [
    msg.id ?? null,
    conversationId,
    msg.role,
    msg.content.trim(),
    msg.role === 'assistant' ? (msg.model ?? null) : null,
    JSON.stringify(normalizeMessageMetadata(msg.metadata) ?? {}),
    parent,
  ];

  const activeLeafMessageId = conv.active_leaf_message_id ?? null;
  const threadScope = { conversationId, userId, organizationId };
  const carriesThread =
    activeLeafMessageId !== null || messages.some((msg) => msg.parentId !== undefined);

  try {
    if (!carriesThread) {
      for (const msg of messages) {
        const [row] = await db.query<ChatMessageRow>(INSERT_MESSAGE_SQL, insertParams(msg, null));
        if (!row) throw createError.validation('Message id belongs to another conversation');
        saved.push(row);
      }
    } else {
      await db.transaction(async (tx) => {
        let leafMessageId = await lockConversationThread(tx, threadScope);
        if (leafMessageId === null) {
          await stampLinearParents(tx, conversationId);
          leafMessageId = await resolveLinearTail(tx, conversationId);
        }

        // The batch chains through itself, so a caller that stamps only the
        // message it is branching from still gets a connected tail.
        for (const msg of messages) {
          if (msg.parentId !== undefined) {
            await assertParentInConversation(tx, conversationId, msg.parentId);
          }
          const [row] = await tx.query<ChatMessageRow>(
            INSERT_MESSAGE_SQL,
            insertParams(msg, msg.parentId ?? leafMessageId),
          );
          if (!row) throw createError.validation('Message id belongs to another conversation');
          saved.push(row);
          leafMessageId = row.id;
        }

        if (leafMessageId !== null) {
          await setActiveLeaf(tx, threadScope, leafMessageId);
        }
      });
    }

    // Same fire-and-forget discovery aid as the single-message route: index
    // any artifacts these bulk-saved assistant messages produce.
    for (const row of saved) {
      if (row.role !== 'assistant') continue;
      scheduleArtifactIndexing({
        db,
        userId,
        conversationId,
        messageId: row.id,
        content: row.content,
      });
    }

    return NextResponse.json({
      saved: saved.length,
      messages: withIsoTimestamps(saved).map((message) =>
        ManagedCloudMessageWireSchema.parse(message),
      ),
    });
  } catch (error) {
    if (isHttpError(error)) throw error;
    logger.error({ error, conversationId }, 'Failed to bulk save messages');
    throw createError.internal('Failed to save messages');
  }
}

export const POST = withCorsRoute(withErrorHandler(handleBulkSave));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
