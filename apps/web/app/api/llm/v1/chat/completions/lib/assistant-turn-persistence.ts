/**
 * @file Server-side persistence of the assistant turn (findings BUG-10 / STR-5).
 *
 * WHAT WAS BROKEN: the only writer of the assistant message was the BROWSER,
 * at `[DONE]` (`useChatStream.ts`'s `persistAssistant`). `onSuccessfulTurn`
 * on this route was wired solely to auto-memory. A tab close, a crash, or a
 * dropped connection mid-stream therefore lost a turn that had been fully
 * generated and fully billed. The `cancel()` hooks in `managed-agent-stream.ts`
 * and `stream-transform.ts` already ran and settled billing, but persisted
 * nothing, so an aborted turn vanished instead of being kept as truncated.
 *
 * IDEMPOTENCY — WHY THIS NEEDS `assistant_message_id`:
 * `/api/chat/conversations/[id]/messages` upserts `on conflict (id)`, so the
 * server write and the client write collapse into ONE row IF AND ONLY IF they
 * share the row id. There is no other join key: the client id is a browser-
 * generated uuid the server has never seen, and the server request id is not
 * visible to the client. Writing under a server-invented id would leave every
 * saved turn duplicated in the transcript after reload — strictly worse than
 * the bug being fixed.
 *
 * So the request contract now carries an OPTIONAL `assistant_message_id`
 * (`request-processor.ts`), and this module persists only when the caller
 * supplied one. Callers that supply it get durable server-side persistence on
 * both the success and the cancellation path, fully idempotent with their own
 * later save. Callers that do not are skipped with an explicit
 * `assistant_turn_not_server_persisted` warning naming the missing field —
 * never silently, and never by writing a duplicate row.
 *
 * Temporary Chats are excluded, matching the client (`persistAssistant`
 * returns early for them) and the Temporary Chat contract itself.
 */

import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import type { ProcessedRequest } from './request-processor';

/** Marker stored on a turn saved from an aborted/cancelled stream. */
export const TRUNCATED_ASSISTANT_TURN_REASON = 'stream_cancelled';

export interface AssistantTurnSnapshot {
  /** Visible assistant text accumulated so far (may be partial). */
  content: string;
  /** Model that actually served, after any managed failover rotation. */
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  /** True when the stream ended by cancellation/abort rather than completion. */
  truncated: boolean;
  /**
   * Durable run this turn belongs to, when it was produced by the managed
   * agent workflow. Stored under the `cloudAgentRun` metadata key — the SAME
   * key and shape desktop writes from `CloudRuntime.persistAssistantTurn`
   * (see `apps/desktop/src/runtime/cloudMessageMetadata.ts`) — so a turn the
   * server saved while the client was offline reattaches through exactly the
   * code path a client-saved turn does. `lastSequence` is the journal cursor
   * already projected into `content`; a reattaching client resumes strictly
   * after it, which is what keeps replayed prose from being rendered twice.
   */
  runReference?: {
    runId: string;
    runPath: string;
    lastSequence: number;
    /**
     * Run state at the moment this turn was written. Lets a client decide
     * whether the run is worth rejoining without asking the server about every
     * finished conversation it opens.
     */
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

/**
 * Persist (or update) the assistant turn for this request.
 *
 * Never throws: persistence is a durability improvement on a turn that has
 * already been generated and settled, so a database hiccup must not turn a
 * delivered response into a client-visible failure. Failures are logged.
 */
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

  // An empty, non-truncated turn carries nothing worth a row. A truncated turn
  // with no text still records that the turn existed and was cut off, and a
  // turn carrying a run reference is the reattachment anchor for work that is
  // still running server-side — dropping it would strand the run.
  if (!snapshot.content.trim() && !snapshot.truncated && !snapshot.runReference) return;

  const metadata: Record<string, unknown> = {
    serverPersisted: true,
    requestId: processed.requestId,
    provider: snapshot.provider,
    ...(snapshot.truncated
      ? { truncated: true, truncationReason: TRUNCATED_ASSISTANT_TURN_REASON }
      : {}),
    ...(snapshot.runReference ? { cloudAgentRun: snapshot.runReference } : {}),
  };

  try {
    // Ownership is re-asserted in SQL through web_conversations.user_id rather
    // than trusted from the already-validated request: the INSERT ... SELECT
    // produces zero rows for a conversation the caller does not own, so a
    // future refactor that loses the upstream check cannot write cross-tenant.
    // `on conflict (id) do update ... where conversation_id matches` mirrors
    // the client message route exactly, which is what makes the two writers
    // idempotent with each other.
    await getNeonDb().execute(
      `insert into web_messages
         (id, conversation_id, role, content, model, provider, input_tokens, output_tokens, metadata)
       select $1::uuid, c.id, 'assistant', $3, $4, $5, $6, $7, $8::jsonb
         from public.web_conversations c
        where c.id = $2::uuid and c.user_id = $9 and c.deleted_at is null
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

/**
 * Extract the visible assistant text from OpenAI-compatible SSE bytes the
 * agentic loops emit. Used by `managed-agent-stream.ts`, which sees only the
 * wire (the tool loop and research loop hand it encoded chunks, not a text
 * accumulator).
 *
 * Reads ONLY `choices[].delta.content` string deltas: the same field the
 * browser accumulates, so the server-saved text matches what the user saw.
 * Custom `x_*` deltas (tool status, approvals, agent events) carry no visible
 * prose and are skipped.
 */
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
