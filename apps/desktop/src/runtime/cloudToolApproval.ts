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
 * The server keeps no loop state, so a suspended turn is resumed statelessly:
 * `POST /api/llm/v1/chat/completions/approve` replays the full prior thread
 * plus the reconstructed assistant `tool_calls` turn and the per-call
 * `tool_approvals` decisions (`ToolApprovalResumeRequestSchema`,
 * `@agiworkforce/cloud-contracts` (`tool-approval-resume.ts`).
 */
import type { StreamEvent } from '@agiworkforce/unified-chat';
import { sendCloudApprovalResume } from '../api/cloudApi';
import { createCloudStreamDeltaSink, type CloudStreamDeltaSink } from './cloudStreamDeltas';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils';

interface PendingApprovalCall {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

interface PendingApprovalTurn {
  model: string;
  /** The thread BEFORE the suspended assistant turn (the request's messageHistory, or a single-user-turn fallback). */
  priorMessages: Array<Record<string, unknown>>;
  calls: PendingApprovalCall[];
  decisions: Map<string, 'approved' | 'rejected'>;
  /** Assistant text streamed before suspension — seeds the reconstructed tool_calls turn. */
  assistantContent: string;
  /** Set once the resume request has been dispatched, to prevent double-submit. */
  resolving: boolean;
}

export interface ResolveApprovalOutcome {
  /** False when the turn suspended again on a further approval request (no final text yet). */
  suspended: boolean;
  /** Full assistant text across the original turn + every resume so far. Only meaningful when `!suspended`. */
  content: string;
  model: string;
}

/**
 * A minimal sink-shaped view — accepted instead of the full
 * `CloudStreamDeltaSink` so callers don't have to construct one just to call
 * `recordTurnOutcome` (both runtimes already have the sink they streamed
 * with in scope at that point).
 */
type SinkOutcome = Pick<
  CloudStreamDeltaSink,
  'isSuspended' | 'getAccumulatedContent' | 'getPendingApprovalCalls'
>;

export class CloudToolApprovalRegistry {
  private readonly turns = new Map<string, PendingApprovalTurn>();

  /**
   * Whether `conversationId` has a suspended turn `resolve()` can actually
   * act on right now. This registry is a per-`ChatRuntime`-instance Map, so
   * it resets on every app restart even though a persisted `awaiting_approval`
   * tool card survives -- callers must check this before wiring live
   * Approve/Reject buttons on a persisted card (see `hasLiveApprovalTurn` on
   * `ChatRuntime`).
   */
  hasLiveTurn(conversationId: string): boolean {
    return this.turns.has(conversationId);
  }

  /**
   * Call after an initial `sendMessage` stream ends. Registers a suspended
   * turn when the sink reports one; otherwise clears any stale entry for the
   * conversation (e.g. a later unrelated turn completed normally).
   */
  recordTurnOutcome(
    conversationId: string,
    model: string,
    priorMessages: Array<Record<string, unknown>>,
    sink: SinkOutcome,
  ): void {
    const calls = sink.getPendingApprovalCalls();
    if (sink.isSuspended() && calls.length > 0) {
      this.turns.set(conversationId, {
        model,
        priorMessages,
        calls,
        decisions: new Map(),
        assistantContent: sink.getAccumulatedContent(),
        resolving: false,
      });
    } else {
      this.turns.delete(conversationId);
    }
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
  ): Promise<ResolveApprovalOutcome | null> {
    const turn = this.turns.get(conversationId);
    if (!turn || turn.resolving) return null;
    if (!turn.calls.some((c) => c.toolCallId === toolCallId)) return null;

    turn.decisions.set(toolCallId, decision);
    if (turn.decisions.size < turn.calls.length) return null;
    turn.resolving = true;

    const assistantToolCallMessage: Record<string, unknown> = {
      role: 'assistant',
      content: turn.assistantContent,
      tool_calls: turn.calls.map((c) => ({
        id: c.toolCallId,
        type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    };
    const toolApprovals = turn.calls.map((c) => ({
      tool_call_id: c.toolCallId,
      decision: turn.decisions.get(c.toolCallId) ?? ('rejected' as const),
    }));

    const sink = createCloudStreamDeltaSink(emit, apiBaseUrl);

    return new Promise<ResolveApprovalOutcome>((resolvePromise) => {
      void sendCloudApprovalResume(
        turn.model,
        [...turn.priorMessages, assistantToolCallMessage],
        toolApprovals,
        sink.onChunk,
        () => {
          const fullContent = turn.assistantContent + sink.getAccumulatedContent();
          if (sink.isSuspended()) {
            // Suspended again on a further tool: register a fresh turn
            // carrying the now-longer thread (this turn's assistant
            // tool_call message + a synthetic tool result per decided call).
            this.turns.set(conversationId, {
              model: turn.model,
              priorMessages: [
                ...turn.priorMessages,
                assistantToolCallMessage,
                ...turn.calls.map((c) => ({
                  role: 'tool',
                  // The real result this tool call actually produced (from
                  // its x_tool_result delta), not a placeholder -- the model
                  // needs the genuine file contents / command output / search
                  // results to reason correctly about the NEXT tool call.
                  // Falls back to the placeholder only if a result somehow
                  // never arrived (e.g. the server didn't emit x_tool_result
                  // for this call), so the thread never carries `undefined`.
                  content:
                    turn.decisions.get(c.toolCallId) === 'approved'
                      ? (sink.getToolResult(c.toolCallId)?.content ?? '(executed)')
                      : 'The user denied permission to run this tool.',
                  tool_call_id: c.toolCallId,
                })),
              ],
              calls: sink.getPendingApprovalCalls(),
              decisions: new Map(),
              assistantContent: fullContent,
              resolving: false,
            });
          } else {
            this.turns.delete(conversationId);
          }
          emit({
            type: 'done',
            ...(sink.getFinishReason() ? { finishReason: sink.getFinishReason() } : {}),
          });
          resolvePromise({
            suspended: sink.isSuspended(),
            content: fullContent,
            model: turn.model,
          });
        },
        (err) => {
          this.turns.delete(conversationId);
          onError(err);
          resolvePromise({ suspended: false, content: '', model: turn.model });
        },
        signal,
        sink.onEvent,
        createManagedChatIdempotencyKey({
          surface: 'desktop',
          purpose: 'tool-resume',
          operationId: uuidv7(),
        }),
      );
    });
  }
}
