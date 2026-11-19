import { applyAgentActivityEvent, type AgentActivityState } from '@agiworkforce/client-runtime';
import {
  AgentTaskStateSchema,
  CloudAgentRunListPageSchema,
  CloudAgentRunSnapshotPageSchema,
  MANAGED_CLOUD_AGENT_RUNS_BASE_PATH,
  managedCloudAgentRunPath,
  type CloudAgentRun,
} from '@agiworkforce/cloud-contracts';
import { messageKindForAgentEvent } from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';
import { apiFetch } from '@/services/api';
import { markConversationForSync, markMessageForSync, syncNow } from '@/services/cloudSyncEngine';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { hydrateStoredCloudMessage } from '@/stores/chat/hydrateCloudMessage';
import type { ChatMessage } from '@/types/chat';

const STATE_PAGE_SIZE = 1;
const RUN_PAGE_SIZE = 500;
const MAX_RUN_PAGES = 40;
const FINISHED_STATES: ReadonlySet<CloudAgentRun['state']> = new Set([
  'ready_for_review',
  'completed',
  'partial',
  'archived',
]);
const ENDED_STATES: ReadonlySet<CloudAgentRun['state']> = new Set([
  'failed',
  'cancelled',
  'timed_out',
]);

export interface UnansweredQuestion {
  id: string;
  createdAt?: string;
  parentId?: string | null;
  metadata?: ChatMessage['metadata'];
}

export type FinishedRunReading =
  | { kind: 'running'; run: { state: string; staleForMs?: number } }
  | { kind: 'answered'; answer: ChatMessage }
  | { kind: 'ended' }
  | { kind: 'elsewhere' }
  | { kind: 'unknown' };

/**
 * The phone names its answer row with the operation id it sends as the turn's
 * idempotency key, and the run keeps that key as its request id, so the row a
 * recovered answer is written to is the one the phone would have saved.
 */
function answerIdFor(run: CloudAgentRun): string | null {
  const operationId = run.requestId.slice(run.requestId.lastIndexOf('.') + 1);
  try {
    return createManagedChatIdempotencyKey({ surface: 'mobile', purpose: 'send', operationId }) ===
      run.requestId
      ? operationId
      : null;
  } catch {
    return null;
  }
}

function laterOf(a: string | undefined, b: string): string {
  const aMs = Date.parse(a ?? '');
  const bMs = Date.parse(b);
  if (!Number.isFinite(aMs)) return b;
  return Number.isFinite(bMs) && bMs > aMs ? b : new Date(aMs + 1).toISOString();
}

export function finishedRunAnswer(input: {
  conversationId: string;
  question: UnansweredQuestion;
  run: CloudAgentRun;
  events: readonly AgentEventEnvelope[];
}): ChatMessage | null {
  const { run, question } = input;
  if (!FINISHED_STATES.has(run.state) || run.conversationId !== input.conversationId) return null;
  const id = answerIdFor(run);
  if (!id) return null;

  let content = '';
  let activity: AgentActivityState | undefined;
  let stopReason: string | undefined;
  let lastSequence = -1;
  for (const envelope of input.events) {
    activity = applyAgentActivityEvent(activity, envelope);
    lastSequence = Math.max(lastSequence, envelope.sequence);
    const { event } = envelope;
    if (messageKindForAgentEvent(event.type) === 'text' && event.type === 'text-delta') {
      content += event.delta;
    }
    if (event.type === 'stop') stopReason = event.reason;
  }
  if (!/\S/.test(content) || stopReason === 'error' || stopReason === 'cancelled') return null;

  const requestedModel = question.metadata?.['requestedModel'];
  return hydrateStoredCloudMessage({
    id,
    conversationId: input.conversationId,
    role: 'assistant',
    content,
    createdAt: laterOf(question.createdAt, run.completedAt ?? run.updatedAt),
    model: run.model,
    ...(question.parentId !== undefined ? { parentId: question.id } : {}),
    metadata: {
      ...(typeof requestedModel === 'string' ? { requestedModel } : {}),
      resolvedModel: run.model,
      finishReason: stopReason === 'max-tokens' ? 'length' : 'stop',
      ...(activity ? { agentActivity: activity } : {}),
      cloudAgentRun: {
        runId: run.id,
        runPath: managedCloudAgentRunPath(run.id),
        lastSequence: Math.max(lastSequence, run.lastEventSequence),
        state: run.state,
      },
    },
  } as ChatMessage);
}

export async function readFinishedRunAnswer(
  input: { conversationId: string; runId: string; question: UnansweredQuestion },
  signal: AbortSignal,
): Promise<FinishedRunReading> {
  const events: AgentEventEnvelope[] = [];
  let afterSequence = -1;
  for (let page = 0; page < MAX_RUN_PAGES; page += 1) {
    const pageSize = page === 0 ? STATE_PAGE_SIZE : RUN_PAGE_SIZE;
    const response = await apiFetch(
      `${managedCloudAgentRunPath(input.runId)}?after=${afterSequence}&limit=${pageSize}`,
      { method: 'GET', signal },
    );
    if (!response.ok) return { kind: 'unknown' };
    const parsed = CloudAgentRunSnapshotPageSchema.safeParse(await response.json());
    if (!parsed.success) return { kind: 'unknown' };
    const { run } = parsed.data;
    if (ENDED_STATES.has(run.state)) return { kind: 'ended' };
    if (!FINISHED_STATES.has(run.state)) {
      return {
        kind: 'running',
        run: {
          state: run.state,
          ...(typeof run.staleForMs === 'number' ? { staleForMs: run.staleForMs } : {}),
        },
      };
    }
    events.push(...parsed.data.events);
    const nextAfterSequence = parsed.data.nextAfterSequence;
    if (parsed.data.events.length === 0 || nextAfterSequence >= run.lastEventSequence) {
      if (!answerIdFor(run)) return { kind: 'elsewhere' };
      const answer = finishedRunAnswer({ ...input, run, events });
      return answer ? { kind: 'answered', answer } : { kind: 'ended' };
    }
    afterSequence = nextAfterSequence;
  }
  return { kind: 'unknown' };
}

/**
 * Finds the run a send started by the request id the phone sent, in any state.
 * A server that lists only AGI Work runs by request id answers with none, and
 * the caller falls back to the conversation's working runs.
 */
export async function findRunForOperation(
  operationId: string,
  signal: AbortSignal,
): Promise<string | null> {
  let requestId: string;
  try {
    requestId = createManagedChatIdempotencyKey({
      surface: 'mobile',
      purpose: 'send',
      operationId,
    });
  } catch {
    return null;
  }
  const params = new URLSearchParams();
  for (const state of AgentTaskStateSchema.options) params.append('state', state);
  params.set('requestId', requestId);
  params.set('limit', '1');
  const response = await apiFetch(`${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}?${params.toString()}`, {
    method: 'GET',
    signal,
  });
  if (!response.ok) return null;
  const parsed = CloudAgentRunListPageSchema.safeParse(await response.json());
  if (!parsed.success) return null;
  return parsed.data.runs.find((run) => run.requestId === requestId)?.id ?? null;
}

/**
 * Writes the recovered answer under its question and queues it for sync, once:
 * a row already holding that id, from another phone or an earlier recovery,
 * is left as it is.
 */
export function restoreFinishedRunAnswer(
  conversationId: string,
  questionId: string,
  answer: ChatMessage,
): boolean {
  const store = useChatCloudMessageStore.getState();
  const rows = store.messages[conversationId] ?? [];
  if (!rows.some((row) => row.id === questionId) || rows.some((row) => row.id === answer.id)) {
    return false;
  }
  store.setCloudMessages(conversationId, [...rows, answer]);
  const conversation = store.conversations.find((candidate) => candidate.id === conversationId);
  if (conversation?.activeLeafMessageId === questionId) {
    store.patchCloudConversation(conversationId, { activeLeafMessageId: answer.id });
  }
  markConversationForSync(conversationId);
  markMessageForSync(conversationId, answer.id);
  void syncNow();
  return true;
}
