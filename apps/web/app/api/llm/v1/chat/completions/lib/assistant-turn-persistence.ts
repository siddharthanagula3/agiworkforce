
import 'server-only';

import { readPersistedInteractiveCards } from '@agiworkforce/cloud-contracts';
import { INTERACTIVE_CARDS_METADATA_KEY, type InteractiveCard } from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import type { ProcessedRequest } from './request-processor';

export const TRUNCATED_ASSISTANT_TURN_REASON = 'stream_cancelled';

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

  try {
    await getNeonDb().execute(
      `insert into web_messages
         (id, conversation_id, role, content, model, provider, input_tokens, output_tokens, metadata)
       select $1::uuid, c.id, 'assistant', $3, $4, $5, $6, $7, $8::jsonb
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
        where web_messages.conversation_id = excluded.conversation_id`,
      [
        messageId,
        conversationId,
        snapshot.content,
        snapshot.model,
        snapshot.provider,
        Math.max(0, Math.trunc(snapshot.inputTokens)),
        Math.max(0, Math.trunc(snapshot.outputTokens)),
        JSON.stringify(metadata),
        userId,
        processed.organizationId ?? null,
      ],
    );
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
