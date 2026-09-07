import 'server-only';

import type {
  CloudAgentOriginSurface,
  CloudAgentRun,
  CloudAgentWorkMode,
} from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  createCloudAgentRun,
  findActiveCloudAgentRunForConversation,
} from '@/lib/services/cloud-agent-run-service';

const CONVERSATION_TURN_LOCK_PREFIX = 'agi:conversation-turn:';
const ACQUIRE_CONVERSATION_TURN_LOCK = 'select pg_advisory_xact_lock(hashtextextended($1, 0))';

export interface ConversationTurnAdmissionInput {
  userId: string;
  requestId: string;
  conversationId?: string;
  originSurface: CloudAgentOriginSurface;
  workMode: CloudAgentWorkMode;
  provider: string;
  model: string;
}

export type ConversationTurnAdmission =
  | { admitted: true; run: CloudAgentRun }
  | { admitted: false; activeRun: CloudAgentRun };

export function conversationTurnLockKey(userId: string, conversationId: string): string {
  return `${CONVERSATION_TURN_LOCK_PREFIX}${userId}:${conversationId}`;
}

export async function admitConversationTurn(
  db: DatabaseAdapter,
  input: ConversationTurnAdmissionInput,
): Promise<ConversationTurnAdmission> {
  const { conversationId } = input;
  if (!conversationId) {
    return { admitted: true, run: await createCloudAgentRun(db, input) };
  }

  return db.transaction(async (tx) => {
    await tx.query(ACQUIRE_CONVERSATION_TURN_LOCK, [
      conversationTurnLockKey(input.userId, conversationId),
    ]);

    const activeRun = await findActiveCloudAgentRunForConversation(tx, {
      userId: input.userId,
      conversationId,
      excludeRequestId: input.requestId,
    });
    if (activeRun) return { admitted: false, activeRun };

    return { admitted: true, run: await createCloudAgentRun(tx, input) };
  });
}
