import type { StreamEvent } from '@agiworkforce/unified-chat';
import type {
  ElicitationPrompt,
  ElicitationResponse,
  ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import { validateElicitationResponses } from '@agiworkforce/cloud-contracts';
import type { AgentActivityState } from '@agiworkforce/client-runtime';
import { createManagedChatIdempotencyKey, sha256 } from '@agiworkforce/utils';
import { sendCloudInputResume, type DesktopCloudRunCleanupCredential } from '../api/cloudApi';
import {
  createCloudStreamDeltaSink,
  mergeCloudStreamMessageProjections,
  type CloudStreamDeltaSink,
  type CloudStreamMessageProjection,
  type CloudToolInputRequest,
} from './cloudStreamDeltas';
import { resumedRunReference, type ResolveApprovalOutcome } from './cloudToolApproval';

export interface CloudElicitationRequest {
  conversationId: string;
  toolCallId: string;
  toolName: string;
  prompts: ElicitationPrompt[];
}

type CloudElicitationAnswerer = (
  toolCallId: string,
  responses: Record<string, ElicitationResponse>,
) => Promise<void>;

interface BridgeEntry {
  request: CloudElicitationRequest;
  answer: CloudElicitationAnswerer;
  answers: Map<string, ElicitationResponse>;
}

type BridgeListener = (requests: CloudElicitationRequest[]) => void;

/**
 * Cloud MCP input requests waiting for the user, shared by the cloud runtime
 * that receives them and the elicitation card that answers them, so local and
 * Managed Cloud elicitation render in one place.
 */
export class CloudElicitationBridge {
  private entries: BridgeEntry[] = [];
  private readonly listeners = new Set<BridgeListener>();

  subscribe(listener: BridgeListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(
    conversationId: string,
    requests: CloudToolInputRequest[],
    answer: CloudElicitationAnswerer,
  ): void {
    this.entries = this.entries.filter((entry) => entry.request.conversationId !== conversationId);
    for (const request of requests) {
      this.entries.push({
        request: {
          conversationId,
          toolCallId: request.toolCallId,
          toolName: request.name,
          prompts: request.prompts,
        },
        answer,
        answers: new Map(),
      });
    }
    this.notify();
  }

  withdraw(conversationId: string): void {
    const before = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.request.conversationId !== conversationId);
    if (this.entries.length !== before) this.notify();
  }

  /**
   * Records one prompt's answer. The run resumes only when every prompt of
   * the tool call has one, matching the web card; a decline or cancel answers
   * the whole call.
   */
  async answer(toolCallId: string, key: string, response: ElicitationResponse): Promise<void> {
    const entry = this.entries.find((candidate) => candidate.request.toolCallId === toolCallId);
    if (!entry) throw new Error('This request is no longer waiting for an answer.');
    if (response.action === 'accept') {
      entry.answers.set(key, response);
    } else {
      for (const prompt of entry.request.prompts) entry.answers.set(prompt.key, response);
    }
    if (entry.answers.size < entry.request.prompts.length) {
      this.notify();
      return;
    }
    const raw = Object.fromEntries(entry.answers);
    const validation = validateElicitationResponses(entry.request.prompts, raw);
    if (!validation.ok) {
      entry.answers.clear();
      this.notify();
      throw new Error(validation.reason);
    }
    this.entries = this.entries.filter((candidate) => candidate !== entry);
    this.notify();
    try {
      await entry.answer(toolCallId, validation.responses);
    } catch (error) {
      entry.answers.clear();
      this.entries.push(entry);
      this.notify();
      throw error;
    }
  }

  /** Prompts of each pending call that still need an answer. */
  private snapshot(): CloudElicitationRequest[] {
    return this.entries.map((entry) => ({
      ...entry.request,
      prompts: entry.request.prompts.filter((prompt) => !entry.answers.has(prompt.key)),
    }));
  }

  private notify(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const cloudElicitationBridge = new CloudElicitationBridge();

interface PendingInputTurn {
  runId: string;
  runReference?: ManagedCloudAgentRunReference;
  assistantMessageId?: string;
  model: string;
  requests: CloudToolInputRequest[];
  answers: Map<string, Record<string, ElicitationResponse>>;
  assistantContent: string;
  resolving: boolean;
  agentActivity?: AgentActivityState;
  messageProjection: CloudStreamMessageProjection;
}

type InputSinkOutcome = Pick<
  CloudStreamDeltaSink,
  | 'isSuspended'
  | 'getAccumulatedContent'
  | 'getPendingInputRequests'
  | 'getAgentActivity'
  | 'getMessageProjection'
>;

export interface ResolveInputOutcome extends ResolveApprovalOutcome {
  sink: CloudStreamDeltaSink;
}

export class CloudToolInputRegistry {
  private readonly turns = new Map<string, PendingInputTurn>();

  recordTurnOutcome(
    conversationId: string,
    run: string | ManagedCloudAgentRunReference | undefined,
    model: string,
    sink: InputSinkOutcome,
    assistantMessageId?: string,
  ): CloudToolInputRequest[] {
    const runId = typeof run === 'string' ? run : run?.runId;
    const requests = sink.getPendingInputRequests();
    if (sink.isSuspended() && requests.length > 0 && runId) {
      this.turns.set(conversationId, {
        runId,
        ...(typeof run === 'object' ? { runReference: run } : {}),
        ...(assistantMessageId ? { assistantMessageId } : {}),
        model,
        requests,
        answers: new Map(),
        assistantContent: sink.getAccumulatedContent(),
        resolving: false,
        messageProjection: sink.getMessageProjection(),
        ...(sink.getAgentActivity() ? { agentActivity: sink.getAgentActivity() } : {}),
      });
      return requests;
    }
    this.turns.delete(conversationId);
    return [];
  }

  hasLiveTurn(conversationId: string): boolean {
    return this.turns.has(conversationId);
  }

  /** The run that answering `toolCallId` resumes, when it is the last answer the turn waits for. */
  runResumedBy(conversationId: string, toolCallId: string): string | null {
    const turn = this.turns.get(conversationId);
    if (!turn || turn.resolving) return null;
    if (!turn.requests.some((request) => request.toolCallId === toolCallId)) return null;
    const unanswered = turn.requests.filter(
      (request) => request.toolCallId !== toolCallId && !turn.answers.has(request.toolCallId),
    );
    return unanswered.length === 0 ? turn.runId : null;
  }

  async resolve(
    conversationId: string,
    toolCallId: string,
    responses: Record<string, ElicitationResponse>,
    emit: (event: StreamEvent) => void,
    apiBaseUrl: string,
    onError: (err: Error) => void,
    signal?: AbortSignal,
    onCredential?: (credential: DesktopCloudRunCleanupCredential) => void,
  ): Promise<ResolveInputOutcome | null> {
    const turn = this.turns.get(conversationId);
    if (!turn || turn.resolving) return null;
    if (!turn.requests.some((request) => request.toolCallId === toolCallId)) return null;

    turn.answers.set(toolCallId, responses);
    if (turn.answers.size < turn.requests.length) return null;
    turn.resolving = true;

    const toolInputs = turn.requests.map((request) => ({
      tool_call_id: request.toolCallId,
      input_responses: turn.answers.get(request.toolCallId) ?? {},
    }));

    let resumeOperationId: string;
    try {
      const digest = await sha256(JSON.stringify({ runId: turn.runId, toolInputs }));
      resumeOperationId = `resume-input-${digest.slice(0, 42)}`;
    } catch (error) {
      turn.resolving = false;
      turn.answers.delete(toolCallId);
      const failure = error instanceof Error ? error : new Error(String(error));
      onError(failure);
      throw failure;
    }

    const sink = createCloudStreamDeltaSink(emit, apiBaseUrl, turn.agentActivity);

    return new Promise<ResolveInputOutcome>((resolvePromise, rejectPromise) => {
      void sendCloudInputResume(
        turn.runId,
        toolInputs,
        sink.onChunk,
        () => {
          this.turns.delete(conversationId);
          const content = turn.assistantContent + sink.getAccumulatedContent();
          const nextActivity = sink.getAgentActivity();
          const messageProjection = mergeCloudStreamMessageProjections(
            turn.messageProjection,
            sink.getMessageProjection(),
          );
          const runReference = resumedRunReference(turn.runReference, sink);
          resolvePromise({
            sink,
            suspended: sink.isSuspended(),
            content,
            model: turn.model,
            runId: turn.runId,
            ...(turn.assistantMessageId ? { assistantMessageId: turn.assistantMessageId } : {}),
            ...(runReference ? { runReference } : {}),
            ...(nextActivity ? { agentActivity: nextActivity } : {}),
            ...(sink.getFinishReason() ? { finishReason: sink.getFinishReason() } : {}),
            ...(sink.getStreamError() ? { streamError: sink.getStreamError() } : {}),
            messageProjection,
          });
        },
        (err) => {
          turn.resolving = false;
          turn.answers.delete(toolCallId);
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
