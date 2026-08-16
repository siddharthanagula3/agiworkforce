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
  assistantContent: string;
  resolving: boolean;
  agentActivity?: AgentActivityState;
  messageProjection: CloudStreamMessageProjection;
}

export interface ResolveApprovalOutcome {
  suspended: boolean;
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

  getTurnProjection(conversationId: string): CloudApprovalTurnProjection | undefined {
    const turn = this.turns.get(conversationId);
    return turn ? toProjection(turn) : undefined;
  }

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
