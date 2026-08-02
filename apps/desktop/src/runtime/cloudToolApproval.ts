/**
 * cloudToolApproval — the per-conversation suspended-turn registry backing
 * `ChatRuntime.resolveToolApproval` for the desktop cloud SSE runtimes
 * (`WebRuntime`, `CloudRuntime`).
 *
 * Mirrors `apps/web/lib/hooks/useChatStream.ts`'s module-level `pendingTurns`
 * registry + `useResolveToolApproval`, adapted to a per-runtime-instance Map
 * (desktop has no cross-component context to share a module-level registry
 * through, and doesn't need one — `ChatRuntime` is already the long-lived
 * owner of per-conversation stream state, see `_abortControllers`).
 *
 * The server owns the private transcript and exact pending-call checkpoint.
 * This registry persists only the durable run reference and UI projection;
 * resume submits the run id plus decisions and can be rehydrated after an app
 * restart from the persisted assistant message.
 */
import type {
  CloudApprovalTurnProjection,
  StreamEvent,
  ToolCall,
} from '@agiworkforce/unified-chat';
import {
  CloudToolApprovalProjectionSchema,
  readPersistedCloudToolApproval,
  type CloudToolApprovalProjection,
  type ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import { sendCloudApprovalResume } from '../api/cloudApi';
import type { DesktopCloudRunCleanupCredential } from '../api/cloudApi';
import {
  createCloudStreamDeltaSink,
  mergeCloudStreamMessageProjections,
  type CloudStreamDeltaSink,
  type CloudStreamMessageProjection,
} from './cloudStreamDeltas';
import { createManagedChatIdempotencyKey, sha256 } from '@agiworkforce/utils';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

interface PendingApprovalCall {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

interface PendingApprovalTurn {
  runId: string;
  runReference?: ManagedCloudAgentRunReference;
  assistantMessageId?: string;
  model: string;
  calls: PendingApprovalCall[];
  decisions: Map<string, 'approved' | 'rejected'>;
  /** Assistant text streamed before suspension — seeds the reconstructed tool_calls turn. */
  assistantContent: string;
  /** Set once the resume request has been dispatched, to prevent double-submit. */
  resolving: boolean;
  /** Canonical activity accumulated before the approval suspension. */
  agentActivity?: AgentActivityState;
  /** Rich transcript fields accumulated across every stream round. */
  messageProjection: CloudStreamMessageProjection;
}

export interface ResolveApprovalOutcome {
  /** False when the turn suspended again on a further approval request (no final text yet). */
  suspended: boolean;
  /** Full assistant text across the original turn + every resume so far. Only meaningful when `!suspended`. */
  content: string;
  model: string;
  runId: string;
  assistantMessageId?: string;
  runReference?: ManagedCloudAgentRunReference;
  pendingProjection?: CloudApprovalTurnProjection;
  agentActivity?: AgentActivityState;
  finishReason?: string;
  streamError?: NonNullable<CloudStreamMessageProjection['streamError']>;
  messageProjection: CloudStreamMessageProjection;
}

function parseApprovalArgs(input: string | undefined): Record<string, unknown> {
  if (!input) return {};
  try {
    const parsed: unknown = JSON.parse(input);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { value: input };
  }
}

function stringifyApprovalArgs(args: Record<string, unknown>): string | undefined {
  if (Object.keys(args).length === 0) return undefined;
  try {
    const serialized = JSON.stringify(args);
    return serialized.length <= 100_000 ? serialized : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Convert the runtime's approval-card projection into the validated durable
 * Cloud metadata contract. Both Desktop Cloud runtimes use this exact mapper
 * so suspend/resume survives reload regardless of host shell.
 */
export function toPersistedCloudApprovalProjection(
  projection: CloudApprovalTurnProjection | undefined,
): CloudToolApprovalProjection | undefined {
  if (!projection) return undefined;
  return CloudToolApprovalProjectionSchema.parse({
    schemaVersion: 1,
    runId: projection.runId,
    calls: projection.calls.map((call) => {
      const input = stringifyApprovalArgs(call.args);
      return {
        toolCallId: call.toolCallId,
        name: call.name,
        ...(input ? { input } : {}),
        ...(call.decision ? { approvalDecision: call.decision } : {}),
      };
    }),
  });
}

/** Rebuild shared Desktop approval cards from validated cloud metadata. */
export function mapPersistedCloudApprovalToolCalls(metadata: unknown): ToolCall[] | undefined {
  const persisted = readPersistedCloudToolApproval(metadata);
  if (!persisted) return undefined;
  return persisted.projection.calls.map((call) => ({
    id: call.toolCallId,
    name: call.name,
    args: parseApprovalArgs(call.input),
    status: 'awaiting_approval',
    requiresApproval: true,
    ...(call.approvalDecision ? { approvalDecision: call.approvalDecision } : {}),
  }));
}

function toProjection(turn: PendingApprovalTurn): CloudApprovalTurnProjection | undefined {
  if (!turn.assistantMessageId) return undefined;
  return {
    assistantMessageId: turn.assistantMessageId,
    runId: turn.runId,
    ...(turn.runReference ? { runReference: turn.runReference } : {}),
    model: turn.model,
    assistantContent: turn.assistantContent,
    calls: turn.calls.map((call) => {
      const decision = turn.decisions.get(call.toolCallId);
      return { ...call, ...(decision ? { decision } : {}) };
    }),
    ...(turn.agentActivity ? { agentActivity: turn.agentActivity } : {}),
    messageProjection: turn.messageProjection,
  };
}

/**
 * A minimal sink-shaped view — accepted instead of the full
 * `CloudStreamDeltaSink` so callers don't have to construct one just to call
 * `recordTurnOutcome` (both runtimes already have the sink they streamed
 * with in scope at that point).
 */
type SinkOutcome = Pick<
  CloudStreamDeltaSink,
  | 'isSuspended'
  | 'getAccumulatedContent'
  | 'getPendingApprovalCalls'
  | 'getAgentActivity'
  | 'getMessageProjection'
>;

export class CloudToolApprovalRegistry {
  private readonly turns = new Map<string, PendingApprovalTurn>();

  /**
   * Hydrates a fresh runtime from the durable UI projection when necessary.
   * The server validates the run ownership and canonical pending call set.
   */
  hasLiveTurn(conversationId: string, projection?: CloudApprovalTurnProjection): boolean {
    if (!this.turns.has(conversationId) && projection?.runId && projection.calls.length > 0) {
      this.turns.set(conversationId, {
        runId: projection.runId,
        ...(projection.runReference ? { runReference: projection.runReference } : {}),
        assistantMessageId: projection.assistantMessageId,
        model: projection.model,
        calls: projection.calls.map(({ toolCallId, name, args }) => ({ toolCallId, name, args })),
        decisions: new Map(
          projection.calls.flatMap((call) =>
            call.decision ? [[call.toolCallId, call.decision] as const] : [],
          ),
        ),
        assistantContent: projection.assistantContent,
        resolving: false,
        messageProjection: projection.messageProjection ?? {},
        ...(projection.agentActivity ? { agentActivity: projection.agentActivity } : {}),
      });
    }
    return this.turns.has(conversationId);
  }

  /**
   * Call after an initial `sendMessage` stream ends. Registers a suspended
   * turn when the sink reports one; otherwise clears any stale entry for the
   * conversation (e.g. a later unrelated turn completed normally).
   */
  recordTurnOutcome(
    conversationId: string,
    run: string | ManagedCloudAgentRunReference | undefined,
    model: string,
    sink: SinkOutcome,
    assistantMessageId?: string,
  ): void {
    const runId = typeof run === 'string' ? run : run?.runId;
    const calls = sink.getPendingApprovalCalls();
    if (sink.isSuspended() && calls.length > 0 && runId) {
      this.turns.set(conversationId, {
        runId,
        ...(typeof run === 'object' ? { runReference: run } : {}),
        ...(assistantMessageId ? { assistantMessageId } : {}),
        model,
        calls,
        decisions: new Map(),
        assistantContent: sink.getAccumulatedContent(),
        resolving: false,
        messageProjection: sink.getMessageProjection(),
        ...(sink.getAgentActivity() ? { agentActivity: sink.getAgentActivity() } : {}),
      });
    } else {
      this.turns.delete(conversationId);
    }
  }

  /** Snapshot used to persist partial decisions before the resume dispatches. */
  getTurnProjection(conversationId: string): CloudApprovalTurnProjection | undefined {
    const turn = this.turns.get(conversationId);
    return turn ? toProjection(turn) : undefined;
  }

  /**
   * Record one tool's approve/reject decision. Once EVERY pending call in the
   * suspended turn has a decision, dispatches the resume request and streams
   * the continuation through `emit` (content/tool_call/tool_result/
   * generated_files/done — the same StreamEvent shapes `sendMessage` emits),
   * appending onto the same assistant message.
   *
   * Returns `null` when the call was ignored (unknown turn/call, already
   * resolving, or still waiting on other pending decisions in the same turn —
   * no network request is made yet). Returns the outcome once the resume
   * request actually runs.
   */
  async resolve(
    conversationId: string,
    toolCallId: string,
    decision: 'approved' | 'rejected',
    emit: (event: StreamEvent) => void,
    apiBaseUrl: string,
    onError: (err: Error) => void,
    signal?: AbortSignal,
    onCredential?: (credential: DesktopCloudRunCleanupCredential) => void,
  ): Promise<ResolveApprovalOutcome | null> {
    const turn = this.turns.get(conversationId);
    if (!turn || turn.resolving) return null;
    if (!turn.calls.some((c) => c.toolCallId === toolCallId)) return null;

    turn.decisions.set(toolCallId, decision);
    if (turn.decisions.size < turn.calls.length) return null;
    turn.resolving = true;

    const toolApprovals = turn.calls.map((c) => ({
      tool_call_id: c.toolCallId,
      decision: turn.decisions.get(c.toolCallId) ?? ('rejected' as const),
    }));

    let resumeOperationId: string;
    try {
      // A transport retry of this exact checkpoint must reuse its billable
      // operation identity, including after a Desktop restart. The run id and
      // ordered, complete decision set are durable inputs, while a fresh UUID
      // here would turn every response-loss retry into a new server operation.
      const digest = await sha256(JSON.stringify({ runId: turn.runId, toolApprovals }));
      resumeOperationId = `resume-${digest.slice(0, 48)}`;
    } catch (error) {
      turn.resolving = false;
      const failure = error instanceof Error ? error : new Error(String(error));
      onError(failure);
      throw failure;
    }

    const sink = createCloudStreamDeltaSink(emit, apiBaseUrl, turn.agentActivity);

    return new Promise<ResolveApprovalOutcome>((resolvePromise, rejectPromise) => {
      void sendCloudApprovalResume(
        turn.runId,
        toolApprovals,
        sink.onChunk,
        () => {
          const fullContent = turn.assistantContent + sink.getAccumulatedContent();
          const nextActivity = sink.getAgentActivity();
          const messageProjection = mergeCloudStreamMessageProjections(
            turn.messageProjection,
            sink.getMessageProjection(),
          );
          const nextRunReference = turn.runReference
            ? {
                ...turn.runReference,
                lastSequence: Math.max(
                  turn.runReference.lastSequence,
                  nextActivity?.lastSequence ?? -1,
                ),
                state: sink.isSuspended()
                  ? ('awaiting_input' as const)
                  : sink.getStreamError()
                    ? ('failed' as const)
                    : ('completed' as const),
              }
            : undefined;
          let pendingProjection: CloudApprovalTurnProjection | undefined;
          if (sink.isSuspended()) {
            // The server advanced the same run to a new approval checkpoint.
            const nextTurn: PendingApprovalTurn = {
              runId: turn.runId,
              ...(nextRunReference ? { runReference: nextRunReference } : {}),
              ...(turn.assistantMessageId ? { assistantMessageId: turn.assistantMessageId } : {}),
              model: turn.model,
              calls: sink.getPendingApprovalCalls(),
              decisions: new Map(),
              assistantContent: fullContent,
              resolving: false,
              messageProjection,
              ...(nextActivity ? { agentActivity: nextActivity } : {}),
            };
            this.turns.set(conversationId, nextTurn);
            pendingProjection = toProjection(nextTurn);
          } else {
            this.turns.delete(conversationId);
          }
          resolvePromise({
            suspended: sink.isSuspended(),
            content: fullContent,
            model: turn.model,
            runId: turn.runId,
            ...(turn.assistantMessageId ? { assistantMessageId: turn.assistantMessageId } : {}),
            ...(nextRunReference ? { runReference: nextRunReference } : {}),
            ...(pendingProjection ? { pendingProjection } : {}),
            ...(nextActivity ? { agentActivity: nextActivity } : {}),
            ...(sink.getFinishReason() ? { finishReason: sink.getFinishReason() } : {}),
            ...(sink.getStreamError() ? { streamError: sink.getStreamError() } : {}),
            messageProjection,
          });
        },
        (err) => {
          turn.resolving = false;
          onError(err);
          rejectPromise(err);
        },
        signal,
        sink.onEvent,
        createManagedChatIdempotencyKey({
          surface: 'desktop',
          purpose: 'tool-resume',
          operationId: resumeOperationId,
        }),
        onCredential,
      );
    });
  }
}
