import 'server-only';

import { readPersistedInteractiveCards } from '@agiworkforce/cloud-contracts';
import { INTERACTIVE_CARDS_METADATA_KEY, type InteractiveCard } from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { logger } from '@/lib/logger';
import { scheduleArtifactIndexing } from '@/app/api/chat/conversations/[id]/messages/lib/index-artifacts';
import {
  lockConversationThread,
  messageExists,
  resolveAnsweredParentId,
  setActiveLeaf,
} from '@/app/api/chat/conversations/[id]/messages/lib/message-thread';
import type { ProcessedRequest } from './request-processor';

export const TRUNCATED_ASSISTANT_TURN_REASON = 'stream_cancelled';

// parent_id is absent from the on-conflict set-list for the same reason it is
// in INSERT_MESSAGE_SQL: lineage is decided once, by the insert that created
// the row. A retry re-asserts the payload, never the tree.
const INSERT_ASSISTANT_TURN_SQL = `insert into web_messages
         (id, conversation_id, role, content, model, provider, input_tokens, output_tokens, metadata, parent_id)
       select $1::uuid, c.id, 'assistant', $3::text, $4::text, $5::text,
              $6::integer, $7::integer, $8::jsonb, $11::uuid
         from public.web_conversations c
        where c.id = $2::uuid
          and c.user_id = $9
          and c.organization_id is not distinct from $10::uuid
          and c.deleted_at is null
       on conflict (id) do update
          set content = excluded.content,
              model = excluded.model,
              provider = excluded.provider,
              input_tokens = excluded.input_tokens,
              output_tokens = excluded.output_tokens,
              metadata = web_messages.metadata || excluded.metadata
        where web_messages.conversation_id = excluded.conversation_id`;

export interface AssistantTurnSnapshot {
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  truncated: boolean;
  interactiveCards?: readonly InteractiveCard[];
  runReference?: {
    runId: string;
    runPath: string;
    lastSequence: number;
    state?: string;
  };
}

/**
 * True when this turn can be persisted server-side at all. Exported so callers
 * can skip building an expensive snapshot for a turn that would be dropped.
 */
export function canPersistAssistantTurn(processed: ProcessedRequest): boolean {
  return Boolean(
    processed.conversationId && processed.assistantMessageId && !processed.conversationIsTemporary,
  );
}

export async function persistAssistantTurn(params: {
  processed: ProcessedRequest;
  userId: string;
  snapshot: AssistantTurnSnapshot;
}): Promise<void> {
  const { processed, userId, snapshot } = params;
  const conversationId = processed.conversationId;
  const messageId = processed.assistantMessageId;

  if (!conversationId) return;
  if (processed.conversationIsTemporary) return;
  if (!messageId) {
    logger.warn(
      {
        event: 'assistant_turn_not_server_persisted',
        userId,
        requestId: processed.requestId,
        conversationId,
      },
      'Assistant turn was not persisted server-side: the request carried no assistant_message_id, and inventing one would duplicate the client-saved row',
    );
    return;
  }

  const interactiveCards = readPersistedInteractiveCards({
    [INTERACTIVE_CARDS_METADATA_KEY]: snapshot.interactiveCards,
  });
  if (
    !snapshot.content.trim() &&
    !snapshot.truncated &&
    !snapshot.runReference &&
    interactiveCards.length === 0
  ) {
    return;
  }

  const metadata: Record<string, unknown> = {
    serverPersisted: true,
    requestId: processed.requestId,
    provider: snapshot.provider,
    ...(snapshot.truncated
      ? { truncated: true, truncationReason: TRUNCATED_ASSISTANT_TURN_REASON }
      : {}),
    ...(snapshot.runReference ? { cloudAgentRun: snapshot.runReference } : {}),
  };
  if (interactiveCards.length > 0) {
    metadata[INTERACTIVE_CARDS_METADATA_KEY] = interactiveCards;
  }

  const threadScope = {
    conversationId,
    userId,
    organizationId: processed.organizationId ?? null,
  };
  const insertParams = (parentId: string | null): unknown[] => [
    messageId,
    conversationId,
    snapshot.content,
    snapshot.model,
    snapshot.provider,
    Math.max(0, Math.trunc(snapshot.inputTokens)),
    Math.max(0, Math.trunc(snapshot.outputTokens)),
    JSON.stringify(metadata),
    userId,
    threadScope.organizationId,
    parentId,
  ];

  try {
    // This runs after the response, and for a cancelled stream after the request
    // context is gone, so there is no session left for the RLS pool to bind. The
    // scope is claimed from the user id the turn itself carries, which the caller
    // resolved while the request still had one.
    const db = createClaimedUserScopedDb(getNeonDb(), {
      userId,
      organizationId: threadScope.organizationId,
    });
    const [conversation] = await db.query<{ active_leaf_message_id: string | null }>(
      `select active_leaf_message_id
         from web_conversations
        where id = $1
          and user_id = $2
          and organization_id is not distinct from $3
          and deleted_at is null
        limit 1`,
      [conversationId, userId, threadScope.organizationId],
    );

    // A conversation nobody has branched takes the single statement it always
    // has, and a conversation this request cannot see falls through it to the
    // same zero-row no-op rather than to a lock that would throw.
    const affected =
      (conversation?.active_leaf_message_id ?? null) === null
        ? await db.execute(INSERT_ASSISTANT_TURN_SQL, insertParams(null))
        : await db.transaction(async (tx) => {
            const lockedLeafMessageId = await lockConversationThread(tx, threadScope);
            // The branch this request read was undone before it owned the lock,
            // so the conversation is linear again and takes the linear write.
            if (lockedLeafMessageId === null) {
              return tx.execute(INSERT_ASSISTANT_TURN_SQL, insertParams(null));
            }

            // Probed before the insert: afterwards the row exists either way,
            // and a replay is no longer distinguishable from a first write.
            const alreadyWritten = await messageExists(tx, conversationId, messageId);
            const parentId = await resolveAnsweredParentId(tx, conversationId, lockedLeafMessageId);
            const written = await tx.execute(INSERT_ASSISTANT_TURN_SQL, insertParams(parentId));

            // A replay must not drag the visible path back onto a turn the
            // reader has already moved past: a cloud agent run can settle long
            // after the client saved this same row and the conversation went on.
            if (written > 0 && !alreadyWritten) {
              await setActiveLeaf(tx, threadScope, messageId);
            }
            return written;
          });

    // Same fire-and-forget contract as the client-save path
    // (scheduleArtifactIndexing in messages/route.ts): a discovery aid, never a
    // correctness requirement, so a failure here must never surface to the
    // turn that already completed. Gated on affected > 0, the INSERT is a
    // SELECT ... FROM web_conversations WHERE user/org match, so a mismatch
    // silently inserts nothing, and indexing a message that was never written
    // would violate web_artifact_index's FK on message_id.
    if (affected > 0) {
      scheduleArtifactIndexing({
        db,
        userId,
        conversationId,
        messageId,
        content: snapshot.content,
      });
    }
  } catch (error) {
    logger.error(
      {
        event: 'assistant_turn_persist_failed',
        error,
        userId,
        requestId: processed.requestId,
        conversationId,
      },
      'Assistant turn could not be persisted server-side; the client copy remains the only record',
    );
  }
}

export function extractAssistantTextDelta(value: Uint8Array): string {
  const text = new TextDecoder().decode(value);
  let out = '';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const payload = JSON.parse(line.slice(6)) as {
        choices?: Array<{ delta?: { content?: unknown } }>;
      };
      for (const choice of payload.choices ?? []) {
        if (typeof choice.delta?.content === 'string') out += choice.delta.content;
      }
    } catch {
      // Non-JSON/custom SSE lines carry no assistant prose.
    }
  }
  return out;
}
