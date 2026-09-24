import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getProviderOffering } from '@agiworkforce/types';
import { EXPLICIT_ARTIFACT_DERIVATION_POLICY } from '@agiworkforce/artifacts';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { normalizeMessageMetadata, type ChatMessageRow } from '@/lib/server/neon-chat';
import { scheduleArtifactIndexing } from './index-artifacts';
import { scheduleConversationTitleGeneration } from './generate-title';
import { resolveSavedMessageSourceUrls } from './resolve-source-urls';
import {
  assertParentInConversation,
  conversationIsUnbranched,
  INSERT_MESSAGE_SQL,
  isHttpError,
  lockConversationThread,
  resolveParentId,
  setActiveLeaf,
  stampLinearParents,
  type ThreadScope,
} from './message-thread';

export interface PersistConversationMessageInput {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  metadata?: unknown;
  parentId?: string | null;
}

const PG_UNDEFINED_COLUMN = '42703';

async function markConversationActivated(
  db: DatabaseAdapter,
  scope: ThreadScope,
): Promise<boolean | null> {
  try {
    const updated = await db.execute(
      `update web_conversations
          set activated_at = now()
        where id = $1
          and user_id = $2
          and organization_id is not distinct from $3
          and activated_at is null`,
      [scope.conversationId, scope.userId, scope.organizationId],
    );
    return updated > 0;
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== PG_UNDEFINED_COLUMN) throw error;
    logger.warn(
      { conversationId: scope.conversationId },
      '[chat] web_conversations.activated_at is missing (migration 0268 not applied?)',
    );
    return null;
  }
}

export async function persistConversationMessage(input: {
  db: DatabaseAdapter;
  scope: ThreadScope;
  message: PersistConversationMessageInput;
}): Promise<ChatMessageRow> {
  const { db, scope, message: requestedMessage } = input;
  const [conversation] = await db.query<{
    id: string;
    model: string | null;
    active_leaf_message_id: string | null;
  }>(
    `select id, model, active_leaf_message_id
       from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1`,
    [scope.conversationId, scope.userId, scope.organizationId],
  );

  if (!conversation) throw createError.notFound('Conversation not found');

  const storedMetadata = await resolveSavedMessageSourceUrls(
    normalizeMessageMetadata(requestedMessage.metadata) ?? {},
  );
  const insertParams = (parent: string | null): unknown[] => [
    requestedMessage.id ?? null,
    scope.conversationId,
    requestedMessage.role,
    requestedMessage.content.trim(),
    requestedMessage.role === 'assistant' ? (requestedMessage.model ?? null) : null,
    JSON.stringify(storedMetadata),
    parent,
  ];

  let persisted: ChatMessageRow | undefined;
  try {
    if (requestedMessage.parentId === undefined && conversation.active_leaf_message_id === null) {
      [persisted] = await db.query<ChatMessageRow>(INSERT_MESSAGE_SQL, insertParams(null));
    } else {
      persisted = await db.transaction(async (tx) => {
        const lockedLeafMessageId = await lockConversationThread(tx, scope);
        if (requestedMessage.parentId !== undefined && requestedMessage.parentId !== null) {
          await assertParentInConversation(tx, scope.conversationId, requestedMessage.parentId);
        }
        if (
          lockedLeafMessageId === null &&
          (await conversationIsUnbranched(tx, scope.conversationId))
        ) {
          await stampLinearParents(tx, scope.conversationId);
        }

        const [inserted] = await tx.query<ChatMessageRow>(
          INSERT_MESSAGE_SQL,
          insertParams(resolveParentId(requestedMessage.parentId, lockedLeafMessageId)),
        );
        if (!inserted) throw createError.validation('Message id belongs to another conversation');

        await setActiveLeaf(tx, scope, inserted.id);
        return inserted;
      });
    }
  } catch (error) {
    if (isHttpError(error)) throw error;
    logger.error({ error }, 'Failed to save message');
    throw createError.internal('Failed to save message');
  }

  if (!persisted) throw createError.internal('Failed to save message');

  if (requestedMessage.role === 'assistant') {
    scheduleArtifactIndexing({
      db,
      userId: scope.userId,
      conversationId: scope.conversationId,
      messageId: persisted.id,
      content: requestedMessage.content.trim(),
      ...(storedMetadata['artifactDerivation'] === EXPLICIT_ARTIFACT_DERIVATION_POLICY
        ? { artifactDerivation: EXPLICIT_ARTIFACT_DERIVATION_POLICY }
        : {}),
    });
  }

  if (requestedMessage.role === 'user') {
    const activated = await markConversationActivated(db, scope);
    let isFirstUserMessage = activated === true;
    if (activated === null) {
      const [row] = await db.query<{ count: string }>(
        'select count(*)::text as count from web_messages where conversation_id = $1 and deleted_at is null',
        [scope.conversationId],
      );
      isFirstUserMessage = Number(row?.count ?? 0) <= 1;
    }

    if (isFirstUserMessage) {
      const truncatedTitle =
        requestedMessage.content.slice(0, 50) + (requestedMessage.content.length > 50 ? '...' : '');
      await db.execute(
        `update web_conversations
            set title = $1, updated_at = now()
          where id = $2
            and user_id = $3
            and organization_id is not distinct from $4`,
        [truncatedTitle, scope.conversationId, scope.userId, scope.organizationId],
      );

      if (!getProviderOffering(conversation.model ?? '')) {
        scheduleConversationTitleGeneration({
          db,
          conversationId: scope.conversationId,
          userId: scope.userId,
          organizationId: scope.organizationId,
          content: requestedMessage.content,
          expectedCurrentTitle: truncatedTitle,
        });
      }
    }
  }

  return persisted;
}
