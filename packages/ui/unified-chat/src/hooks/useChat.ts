import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  applyAgentActivityEvent,
  finishAgentActivityLocally,
  startAgentActivityLocally,
  QueueFullError,
  type AgentActivityState,
  type MessageQueue,
} from '@agiworkforce/client-runtime';
import type { AgentTaskState } from '@agiworkforce/types/protocol';
import {
  classifyTaskLocally,
  resolveAutoRoute,
  type RoutingTrustMode,
} from '@agiworkforce/routing';
import type { ChatHostBridge } from '../lib/hostBridge';
import type {
  ChatRuntime,
  CloudApprovalTurnProjection,
  CloudRunReattachment,
} from '../lib/runtime';
import type { Attachment, ChatMessage, MessageRouting } from '../lib/types';
import { syncPackageStoreFromHost } from './useHostBridgeSync';
import { useChatStore, getSystemPromptForMode } from '../stores/chatStore';
import { CLOUD_FALLBACK_MODELS, useModelStore } from '../stores/modelStore';
import { useSettingsStore } from '../stores/settingsStore';
import { defaultBrowserStorage, enqueuePrompt, getSendQueue } from '../queue/sendQueue';
import { CONTINUE_GENERATION_INSTRUCTION, isMessageContinuable } from '../lib/continue-generation';
import {
  classifyManagedQuotaErrorCode,
  getModelMetadataById,
  getNextUpgradeTier,
  type ChatExecutionMode,
  type CloudWorkMode,
} from '@agiworkforce/types';
import { resolveThinkingSendPolicy } from '../lib/thinkingPolicy';
import {
  getRegenerateReplayDecision,
  planRegenerateRollback,
  type RegenerateReplayMetadata,
  type SendReplayMetadataLike,
} from '../lib/regenerateReplay';
import { isCodeExecutionAvailable } from '../lib/codeExecutionAvailability';
import { isWebSearchAvailable } from '@agiworkforce/search';
import { isModelAdmittedForExecutionMode } from '../lib/modelAdmission';
import { isChatModelSelectable } from '../lib/modelInfo';
import { useTierStore } from '../stores/tierStore';
import { getWritingStyleInstruction, type WritingStyle } from '../lib/writingStyle';

const AGENT_TASK_STATES = new Set<AgentTaskState>([
  'queued',
  'running',
  'awaiting_input',
  'ready_for_review',
  'completed',
  'failed',
  'cancelled',
  'paused',
  'archived',
]);

function isAgentTaskState(value: unknown): value is AgentTaskState {
  return typeof value === 'string' && AGENT_TASK_STATES.has(value as AgentTaskState);
}

function formatThoughtSummary(durationMs?: number): string {
  if (durationMs === undefined) return 'Thought process';
  const seconds = Math.max(0, durationMs) / 1_000;
  const formatted = seconds.toFixed(1).replace(/\.0$/, '');
  return `Thought for ${formatted} ${formatted === '1' ? 'second' : 'seconds'}`;
}

function getRoutingContext(
  platform: ReturnType<NonNullable<ChatRuntime['getPlatform']>> | undefined,
  executionMode: ChatExecutionMode,
): { trustMode: RoutingTrustMode; runtimeProfileId: string } | null {
  if (platform === 'web' && executionMode === 'cloud_managed') {
    return { trustMode: 'managed_cloud', runtimeProfileId: 'web/cloud-chat' };
  }
  if (platform === 'desktop') {
    if (executionMode === 'local_only') {
      return { trustMode: 'local', runtimeProfileId: 'desktop/local-chat' };
    }
    if (executionMode === 'byok') {
      return { trustMode: 'byok', runtimeProfileId: 'desktop/byok-chat' };
    }
    return { trustMode: 'managed_cloud', runtimeProfileId: 'desktop/cloud-chat' };
  }
  if (platform === 'mobile') {
    if (executionMode === 'local_only') {
      return { trustMode: 'on_device', runtimeProfileId: 'mobile/local-chat' };
    }
    if (executionMode === 'cloud_managed') {
      return { trustMode: 'managed_cloud', runtimeProfileId: 'mobile/cloud-chat' };
    }
  }
  return null;
}

/**
 * Data-loss-safe turn replacement, used by `regenerate` (and any future
 * edit-and-resend). Mirrors web's `sendReplacingMessages`: the caller has
 * ALREADY removed `messageIds` from the local transcript so the UI is clean
 * while the replacement streams, but the DURABLE rows are still on the server.
 * They are deleted only once the replacement send has actually run; if the send
 * throws before committing anything, `snapshot` is written back so the exchange
 * is never lost. Worst case degrades from data-loss to at most a duplicate row.
 */
interface SendReplacement {
  /** Durable row ids the replacement send supersedes. */
  messageIds: string[];
  /** Exact transcript to restore if the replacement send throws. */
  snapshot: ChatMessage[];
  /** Send options recovered from the replaced user turn's `sendReplay`. */
  replay?: SendReplayMetadataLike | undefined;
}

interface UseChatOptions {
  hostBridge?: ChatHostBridge | null;
  externalAddMessage?: (msg: { role: string; content: string; id?: string }) => void;
  /**
   * Send-pipeline queue. Defaults to the per-surface singleton from
   * `getSendQueue(surfaceId)`. Tests inject a fresh instance for isolation.
   */
  sendQueue?: MessageQueue;
  /**
   * Surface identifier used to scope the queue when `sendQueue` is omitted.
   * Defaults to `'default'` — host apps should pass their own (`'web'`,
   * `'desktop'`, etc.) so persistence keys don't collide.
   */
  surfaceId?: string;
}

const TERMINAL_CLOUD_RUN_STATES = new Set<string>([
  'ready_for_review',
  'completed',
  'failed',
  'cancelled',
  'archived',
]);

/**
 * Read the durable-run checkpoint off a persisted assistant turn, or return
 * null when this turn is finished business and not worth a server round trip.
 */
function readCloudRunReattachment(message: ChatMessage): CloudRunReattachment | null {
  const raw = message.metadata?.['cloudAgentRun'];
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const runId = record['runId'];
  const runPath = record['runPath'];
  const lastSequence = record['lastSequence'];
  if (typeof runId !== 'string' || !runId) return null;
  if (typeof runPath !== 'string' || !runPath) return null;
  if (!Number.isInteger(lastSequence)) return null;
  const state = record['state'];
  if (typeof state === 'string' && TERMINAL_CLOUD_RUN_STATES.has(state)) return null;
  if (message.metadata?.['finishReason']) return null;

  return {
    assistantMessageId: message.id,
    model: message.model ?? '',
    content: message.content,
    runReference: { runId, runPath, lastSequence: lastSequence as number },
    hasPersistedApproval: Boolean(message.metadata?.['cloudApproval']),
  };
}

export function useChat(runtime: ChatRuntime | null, options?: UseChatOptions) {
  const externalAddMessageRef = useRef(options?.externalAddMessage);
  externalAddMessageRef.current = options?.externalAddMessage;
  const hostBridgeRef = useRef(options?.hostBridge ?? null);
  hostBridgeRef.current = options?.hostBridge ?? null;
  const cloudAgentRunRef = useRef<{ runId: string; runPath: string } | null>(null);

  // Resolve the send-pipeline queue once per hook instance. Default to the
  // per-surface singleton; storage falls back to localStorage when available.
  const surfaceIdRef = useRef(options?.surfaceId ?? 'default');
  const sendQueueRef = useRef<MessageQueue>(
    options?.sendQueue ??
      getSendQueue(surfaceIdRef.current, {
        storage: defaultBrowserStorage(surfaceIdRef.current) ?? undefined,
      }),
  );

  /**
   * Add message to the host bridge when provided, then to the package store
   * for rendering. Forwards every field the caller passes (isStreaming,
   * toolCalls, thinking/thinkingBlock, artifacts, webSearchResults,
   * generatedFiles, ...) rather than a hardcoded subset -- a message created
   * on a tool_call/artifact/thinking-first event used to render as a bare
   * empty bubble until a SECOND event for it arrived, because those fields
   * were silently dropped on creation.
   *
   * `conversationIdOverride` lets stream-event handlers target the
   * conversation the turn was actually sent to (see streamConvIdRef's doc
   * comment) instead of whatever is currently active. Omit it for the
   * user's own outgoing message -- that add is synchronous with the send
   * click, so activeConversationId is still correct there.
   */
  const addMsg = useCallback(
    (
      msg: Partial<ChatMessage> & { role: string; content: string },
      conversationIdOverride?: string,
    ) => {
      const msgId = msg.id ?? crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const hostBridge = hostBridgeRef.current;

      // Empty assistant rows are a shared rendering concern used to show
      // Thinking/activity before the first token. Do not mirror them into a
      // legacy host store: doing so blanks its conversation summary and emits
      // a host snapshot with no durable assistant content. The runtime owns
      // assistant persistence; user/system turns still reach the host so
      // optimistic creation and title generation remain intact.
      const shouldMirrorToHost = msg.role !== 'assistant' || msg.content.trim().length > 0;
      if (hostBridge?.addMessage && shouldMirrorToHost) {
        hostBridge.addMessage({ role: msg.role, content: msg.content, id: msgId });
      } else if (!hostBridge && externalAddMessageRef.current) {
        externalAddMessageRef.current({ role: msg.role, content: msg.content, id: msgId });
      }

      const pkgStore = useChatStore.getState();
      let convId = conversationIdOverride ?? pkgStore.activeConversationId;

      if (!convId && hostBridge) {
        syncPackageStoreFromHost(hostBridge);
        convId = conversationIdOverride ?? useChatStore.getState().activeConversationId;
      }

      if (convId) {
        pkgStore.addMessage(convId, {
          ...msg,
          ...(msg.role === 'assistant' && cloudAgentRunRef.current
            ? {
                metadata: {
                  ...msg.metadata,
                  cloudAgentRun: { ...cloudAgentRunRef.current },
                },
              }
            : {}),
          id: msgId,
          role: msg.role,
          content: msg.content,
          timestamp,
        } as ChatMessage);
      }
    },
    [],
  );

  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const assistantMessageIdRef = useRef<string | null>(null);
  const assistantMessageIdsRef = useRef(new Map<string, string>());
  const cloudAgentRunsRef = useRef(new Map<string, { runId: string; runPath: string }>());
  /**
   * The conversation the CURRENTLY in-flight turn was sent to -- pinned at
   * each turn-start site (sendMessage / continueGeneration /
   * resolveToolApproval) and read by onStream / stopGeneration instead of
   * the live activeConversationId. Nothing prevents navigating to a
   * different conversation mid-turn (see ConversationItem's onClick). Legacy
   * runtimes use this single pin. Concurrent runtimes stamp every event with
   * its conversation id and use the per-conversation maps above.
   */
  const streamConvIdRef = useRef<string | null>(null);
  const aggregateIsStreaming = useChatStore((s) => s.isStreaming);
  const streamingConversationIds = useChatStore((s) => s.streamingConversationIds);
  const isStreaming = runtime?.supportsConcurrentTurns
    ? Boolean(activeConversationId && streamingConversationIds[activeConversationId])
    : aggregateIsStreaming;
  // Use a ref for active-conversation streaming state to avoid stale callback closures.
  const isStreamingRef = useRef(false);
  isStreamingRef.current = isStreaming;

  // Register stream callback on runtime to receive assistant responses
  useEffect(() => {
    if (!runtime?.onStream) return;

    const unsubscribe = runtime.onStream((event) => {
      const store = useChatStore.getState();
      // Concurrent runtimes must stamp every event. Falling back to the active
      // conversation in that mode could leak one turn into another transcript,
      // so fail closed if the runtime breaks its declared contract.
      const convId = runtime.supportsConcurrentTurns
        ? event.conversationId
        : (event.conversationId ?? streamConvIdRef.current ?? store.activeConversationId);
      if (!convId) return;
      assistantMessageIdRef.current = assistantMessageIdsRef.current.get(convId) ?? null;
      cloudAgentRunRef.current = cloudAgentRunsRef.current.get(convId) ?? null;

      switch (event.type) {
        case 'agent_run': {
          cloudAgentRunRef.current = { runId: event.runId, runPath: event.runPath };
          if (assistantMessageIdRef.current) {
            const message = store.messagesByConversation[convId]?.find(
              (candidate) => candidate.id === assistantMessageIdRef.current,
            );
            if (message) {
              store.updateMessage(convId, message.id, {
                metadata: {
                  ...message.metadata,
                  cloudAgentRun: { runId: event.runId, runPath: event.runPath },
                },
              });
            }
          }
          break;
        }
        case 'content': {
          // Create or append to assistant message
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            addMsg(
              {
                id,
                role: 'assistant',
                content: event.content,
                timestamp: new Date().toISOString(),
                isStreaming: true,
              },
              convId,
            );
          } else {
            // Append content to existing assistant message
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              store.updateMessage(convId, assistantMessageIdRef.current, {
                content: msg.content + event.content,
              });
            }
          }
          break;
        }
        case 'thinking': {
          const completed = event.completed === true;
          const completionStep = completed
            ? [
                {
                  id: crypto.randomUUID(),
                  type: 'done' as const,
                  content: 'Done',
                },
              ]
            : [];
          // Store thinking text in the assistant message
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            addMsg(
              {
                id,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                thinking: event.content,
                isStreaming: true,
                thinkingBlock: {
                  id: crypto.randomUUID(),
                  steps: [
                    {
                      id: crypto.randomUUID(),
                      type: 'thinking',
                      content: event.content,
                    },
                    ...completionStep,
                  ],
                  summary: completed ? formatThoughtSummary(event.durationMs) : 'Thinking…',
                  collapsed: completed,
                  durationMs: event.durationMs,
                },
              },
              convId,
            );
          } else {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const existingThinking = msg.thinking ?? '';
              const existingBlock = msg.thinkingBlock;
              const thinkingStepId =
                existingBlock?.steps.find((s) => s.type === 'thinking')?.id ?? crypto.randomUUID();
              const updatedSteps = existingBlock
                ? [
                    ...existingBlock.steps.filter((s) => s.type !== 'thinking'),
                    {
                      id: thinkingStepId,
                      type: 'thinking' as const,
                      content: existingThinking + event.content,
                    },
                    ...existingBlock.steps.filter((s) => s.type === 'done'),
                  ]
                : [
                    {
                      id: crypto.randomUUID(),
                      type: 'thinking' as const,
                      content: existingThinking + event.content,
                    },
                  ];
              if (completed && !updatedSteps.some((step) => step.type === 'done')) {
                updatedSteps.push(...completionStep);
              }
              store.updateMessage(convId, assistantMessageIdRef.current, {
                thinking: existingThinking + event.content,
                thinkingBlock: {
                  id: existingBlock?.id ?? crypto.randomUUID(),
                  steps: updatedSteps,
                  summary: completed ? formatThoughtSummary(event.durationMs) : 'Thinking…',
                  collapsed: completed,
                  durationMs: event.durationMs,
                },
              });
            }
          }
          break;
        }
        case 'agent_event': {
          const currentMessage = assistantMessageIdRef.current
            ? store.messagesByConversation[convId]?.find(
                (message) => message.id === assistantMessageIdRef.current,
              )
            : undefined;
          const currentActivity = currentMessage?.metadata?.['agentActivity'] as
            | AgentActivityState
            | undefined;
          const agentActivity = applyAgentActivityEvent(currentActivity, event.envelope);

          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            addMsg(
              {
                id,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                isStreaming: true,
                metadata: { agentActivity },
              },
              convId,
            );
          } else if (currentMessage) {
            store.updateMessage(convId, assistantMessageIdRef.current, {
              metadata: { ...currentMessage.metadata, agentActivity },
            });
          }
          break;
        }
        case 'tool_call': {
          // Store tool call info in the assistant message
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            addMsg(
              {
                id,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                isStreaming: true,
                toolCalls: [
                  {
                    id: event.toolCall.id,
                    name: event.toolCall.name,
                    args: event.toolCall.args,
                    status: 'running',
                  },
                ],
              },
              convId,
            );
          } else {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const existingCalls = msg.toolCalls ?? [];
              const existingIdx = existingCalls.findIndex((tc) => tc.id === event.toolCall.id);
              const newCall = {
                id: event.toolCall.id,
                name: event.toolCall.name,
                args: event.toolCall.args,
                status: 'running' as const,
              };
              const updatedCalls =
                existingIdx >= 0
                  ? existingCalls.map((tc, idx) => (idx === existingIdx ? newCall : tc))
                  : [...existingCalls, newCall];
              store.updateMessage(convId, assistantMessageIdRef.current, {
                toolCalls: updatedCalls,
              });
            }
          }
          break;
        }
        case 'tool_result': {
          // Update an existing tool call with its result
          if (assistantMessageIdRef.current) {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const updatedCalls = (msg.toolCalls ?? []).map((tc) =>
                tc.id === event.toolCallId
                  ? {
                      ...tc,
                      result: event.result ?? event.error ?? tc.result,
                      error: event.error,
                      status: event.error ? ('failed' as const) : ('completed' as const),
                      requiresApproval: false,
                    }
                  : tc,
              );
              store.updateMessage(convId, assistantMessageIdRef.current, {
                toolCalls: updatedCalls,
              });
            }
          }
          break;
        }
        case 'tool_approval_request': {
          // The server suspended this turn pending a user decision. Surface
          // an awaiting_approval card — `resolveToolApproval` (below) drives
          // the approve/reject round-trip via `runtime.resolveToolApproval`.
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            addMsg(
              {
                id,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                isStreaming: true,
                toolCalls: [
                  {
                    id: event.toolCallId,
                    name: event.name,
                    args: event.args,
                    status: 'awaiting_approval',
                    requiresApproval: true,
                  },
                ],
              },
              convId,
            );
          } else {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const existingCalls = msg.toolCalls ?? [];
              const existingIdx = existingCalls.findIndex((tc) => tc.id === event.toolCallId);
              const newCall = {
                id: event.toolCallId,
                name: event.name,
                args: event.args,
                status: 'awaiting_approval' as const,
                requiresApproval: true,
              };
              const updatedCalls =
                existingIdx >= 0
                  ? existingCalls.map((tc, idx) => (idx === existingIdx ? newCall : tc))
                  : [...existingCalls, newCall];
              store.updateMessage(convId, assistantMessageIdRef.current, {
                toolCalls: updatedCalls,
              });
            }
          }
          break;
        }
        case 'artifact': {
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            addMsg(
              {
                id,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                isStreaming: true,
                artifacts: [event.artifact],
              },
              convId,
            );
          } else {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const existingArtifacts = msg.artifacts ?? [];
              const artifactIndex = existingArtifacts.findIndex(
                (artifact) => artifact.id === event.artifact.id,
              );
              const updatedArtifacts =
                artifactIndex >= 0
                  ? existingArtifacts.map((artifact, index) =>
                      index === artifactIndex ? event.artifact : artifact,
                    )
                  : [...existingArtifacts, event.artifact];

              store.updateMessage(convId, assistantMessageIdRef.current, {
                artifacts: updatedArtifacts,
              });
            }
          }
          break;
        }
        case 'search_results': {
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            addMsg(
              {
                id,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                isStreaming: true,
                webSearchResults: [event.search],
              },
              convId,
            );
          } else {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const existingSearches = msg.webSearchResults ?? [];
              const searchIndex = existingSearches.findIndex(
                (search) => search.id === event.search.id,
              );
              const updatedSearches =
                searchIndex >= 0
                  ? existingSearches.map((search, index) =>
                      index === searchIndex ? event.search : search,
                    )
                  : [...existingSearches, event.search];

              store.updateMessage(convId, assistantMessageIdRef.current, {
                webSearchResults: updatedSearches,
              });
            }
          }
          break;
        }
        case 'generated_files': {
          if (event.files.length === 0) break;
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            addMsg(
              {
                id,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                isStreaming: true,
                generatedFiles: event.files,
              },
              convId,
            );
          } else {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const existingFiles = msg.generatedFiles ?? [];
              const merged = [...existingFiles];
              for (const file of event.files) {
                const idx = merged.findIndex((f) => f.id === file.id);
                if (idx >= 0) merged[idx] = file;
                else merged.push(file);
              }
              store.updateMessage(convId, assistantMessageIdRef.current, {
                generatedFiles: merged,
              });
            }
          }
          break;
        }
        case 'code_execution_result': {
          // Surface-specific (web-only precedent: MessageMetadata.codeExecutionResult
          // in apps/web/shared/stores/web-chat-store.ts) -- goes in the generic metadata bag per
          // ChatMessage.metadata's own doc comment, not a dedicated typed field.
          if (assistantMessageIdRef.current) {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              store.updateMessage(convId, assistantMessageIdRef.current, {
                metadata: { ...msg.metadata, codeExecutionResult: event.result },
              });
            }
          }
          break;
        }
        case 'research_status': {
          // Managed-cloud runtimes emit progress here after forwarding the
          // capability-gated `research: true` request. Local runtimes never
          // expose the control or claim the capability.
          if (assistantMessageIdRef.current) {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              store.updateMessage(convId, assistantMessageIdRef.current, {
                metadata: { ...msg.metadata, research: event.status },
              });
            }
          }
          break;
        }
        case 'done': {
          // Mark the message as no longer streaming
          let awaitingApproval = false;
          if (assistantMessageIdRef.current) {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              awaitingApproval = (msg.toolCalls ?? []).some(
                (tc) => tc.status === 'awaiting_approval',
              );
              const currentActivity = msg.metadata?.['agentActivity'] as
                | AgentActivityState
                | undefined;
              const completedActivity =
                currentActivity &&
                !awaitingApproval &&
                currentActivity.status !== 'completed' &&
                currentActivity.status !== 'failed' &&
                currentActivity.status !== 'cancelled'
                  ? finishAgentActivityLocally(currentActivity, {
                      status: 'completed',
                      completedAtMs: Date.now(),
                    })
                  : currentActivity;
              const doneUpdates: Partial<ChatMessage> = { isStreaming: false };
              // Record the turn's finish_reason (cloud/WebRuntime supplies it;
              // local/native runtimes omit it) so the Continue-Generation
              // affordance is honest and survives across the turn. Always write
              // it — an undefined value clears any stale 'stopped'/'length'
              // marker left by an interrupted prior attempt. Same treatment
              // for streamError (mid-stream provider failure, additive
              // x_stream_error — see the StreamEvent 'done' doc comment):
              // always write it so a retry of the SAME message id clears any
              // stale marker from a prior failed attempt.
              doneUpdates.metadata = {
                ...msg.metadata,
                ...(completedActivity ? { agentActivity: completedActivity } : {}),
                finishReason: event.finishReason,
                streamError: event.streamError,
              };
              // Mark thinking block as done
              if (msg.thinkingBlock) {
                const hasCompletionStep = msg.thinkingBlock.steps.some((s) => s.type === 'done');
                if (!hasCompletionStep) {
                  doneUpdates.thinkingBlock = {
                    ...msg.thinkingBlock,
                    steps: [
                      ...msg.thinkingBlock.steps,
                      {
                        id: crypto.randomUUID(),
                        type: 'done',
                        content: 'Done',
                      },
                    ],
                    summary:
                      msg.thinkingBlock.summary === 'Thinking…' ||
                      msg.thinkingBlock.summary === 'Thinking...'
                        ? formatThoughtSummary(msg.thinkingBlock.durationMs)
                        : msg.thinkingBlock.summary,
                    collapsed: true,
                  };
                }
              }
              store.updateMessage(convId, assistantMessageIdRef.current, doneUpdates);
            }
          }
          // The server suspends the turn (closes the stream, no final answer
          // yet) rather than finishing it when a tool call needs approval —
          // `onDone` still fires. Keep the ref pointed at this message so the
          // eventual `resolveToolApproval` resume appends its continuation
          // onto the SAME bubble instead of orphaning it. Global `isStreaming`
          // still clears so the composer is usable while the card is pending.
          if (!awaitingApproval) {
            assistantMessageIdRef.current = null;
          }
          store.stopStreaming(convId);
          break;
        }
        case 'error': {
          // Managed quota / rate-limit refusals are not generic failures: the
          // user needs the reason, the reset time, and (when one exists) an
          // upgrade path, all IN the transcript. A toast that disappears over
          // an empty bubble is the behaviour this replaces. Same classifier and
          // same `metadata.paywall` shape web writes (GOV-20).
          const quotaBlock = classifyManagedQuotaErrorCode(event.code);
          if (quotaBlock && assistantMessageIdRef.current) {
            const blockedId = assistantMessageIdRef.current;
            const blocked = store.messagesByConversation[convId]?.find((m) => m.id === blockedId);
            // Null on the top self-serve tier / a sales-assisted plan: there is
            // no self-serve upgrade to offer, so no CTA is rendered.
            const nextTier = getNextUpgradeTier(useTierStore.getState().tier);
            store.updateMessage(convId, blockedId, {
              isStreaming: false,
              error: undefined,
              metadata: {
                ...blocked?.metadata,
                finishReason: 'error',
                paywall: {
                  feature: quotaBlock.feature,
                  requiredTier: nextTier ?? 'basic',
                  reason: event.error || quotaBlock.reason,
                  showUpgradeCta: quotaBlock.showUpgradeCta && nextTier !== null,
                  showResetTime: quotaBlock.showResetTime,
                  suggestStandardModel: quotaBlock.suggestStandardModel,
                  ...(event.resetAt ? { resetAt: event.resetAt } : {}),
                },
              },
            });
            assistantMessageIdRef.current = null;
            store.stopStreaming(convId);
            break;
          }
          if (assistantMessageIdRef.current) {
            const failingId = assistantMessageIdRef.current;
            const current = store.messagesByConversation[convId]?.find((m) => m.id === failingId);
            const failureMessage = event.error || 'Request failed';
            const currentActivity = current?.metadata?.['agentActivity'] as
              | AgentActivityState
              | undefined;
            // A tool call approved just before this error (e.g.
            // resolveToolApproval's resume itself failing outright) was
            // optimistically patched to 'running' and would otherwise stay
            // stuck there forever -- the turn that would report its real
            // result never gets to run.
            const stillRunning = current?.toolCalls?.some((t) => t.status === 'running');
            store.updateMessage(convId, failingId, {
              isStreaming: false,
              error: failureMessage,
              metadata: {
                ...current?.metadata,
                finishReason: 'error',
                streamError: { message: failureMessage },
                ...(currentActivity
                  ? {
                      agentActivity: finishAgentActivityLocally(currentActivity, {
                        status: 'failed',
                        completedAtMs: Date.now(),
                        error: failureMessage,
                      }),
                    }
                  : {}),
              },
              ...(stillRunning
                ? {
                    toolCalls: current!.toolCalls!.map((t) =>
                      t.status === 'running'
                        ? {
                            ...t,
                            status: 'failed' as const,
                            error: failureMessage,
                          }
                        : t,
                    ),
                  }
                : {}),
            });
          }
          assistantMessageIdRef.current = null;
          store.stopStreaming(convId);
          toast.error(event.error || 'Failed to get response');
          break;
        }
      }

      if (assistantMessageIdRef.current) {
        assistantMessageIdsRef.current.set(convId, assistantMessageIdRef.current);
      } else {
        assistantMessageIdsRef.current.delete(convId);
      }
      if (cloudAgentRunRef.current) {
        cloudAgentRunsRef.current.set(convId, cloudAgentRunRef.current);
      } else {
        cloudAgentRunsRef.current.delete(convId);
      }
    });

    return unsubscribe;
  }, [runtime, addMsg]);

  const sendMessage = useCallback(
    (
      content: string,
      agentMode?: string,
      effort?: string,
      attachments?: File[],
      researchEnabled?: boolean,
      writingStyle?: WritingStyle,
      workMode?: CloudWorkMode,
      projectId?: string | null,
      replacement?: SendReplacement,
    ) => {
      if (!runtime || isStreamingRef.current) return;

      const preflightStore = useChatStore.getState();
      const preflightConversation = preflightStore.conversations.find(
        (conversation) => conversation.id === preflightStore.activeConversationId,
      );
      const executionMode =
        preflightConversation?.executionMode ??
        (runtime.getPlatform?.() === 'web' ? 'cloud_managed' : null);
      const preflightModelState = useModelStore.getState();
      const selectedModel =
        preflightModelState.models.find(
          (model) => model.id === preflightModelState.selectedModelId,
        ) ??
        CLOUD_FALLBACK_MODELS.find((model) => model.id === preflightModelState.selectedModelId);

      if (!executionMode || !selectedModel) {
        toast.error('Select a model available for this conversation before sending.');
        return;
      }
      if (!isModelAdmittedForExecutionMode(selectedModel, executionMode)) {
        toast.error('The selected model is not allowed for this conversation boundary.');
        return;
      }
      if (!isChatModelSelectable(selectedModel)) {
        toast.error(selectedModel.unavailableReason ?? 'The selected model is not available.');
        return;
      }

      let resolvedModelId = preflightModelState.selectedModelId;
      let resolvedProvider: string | undefined = selectedModel.provider;
      const isAutoSelection = resolvedModelId.startsWith('auto');
      // Per-message routing provenance for the assistant turn we are about to
      // create. Populated only when the Auto router actually chose the model,
      // so the footer's "Auto routed: … · Pin to <model>" row appears on the
      // turns it describes and nowhere else.
      let autoRouting: MessageRouting | undefined;
      const requiresRegistryAdmission =
        isAutoSelection || executionMode === 'cloud_managed' || executionMode === 'byok';

      if (requiresRegistryAdmission) {
        const routingContext = getRoutingContext(runtime.getPlatform?.(), executionMode);
        if (!routingContext) {
          toast.error('Model routing is not available for this runtime boundary.');
          return;
        }

        const priorMessages =
          (preflightStore.activeConversationId
            ? preflightStore.messagesByConversation[preflightStore.activeConversationId]
            : undefined) ?? [];
        const classifier = classifyTaskLocally(
          content,
          priorMessages.map((message) => ({
            role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
            content: message.content,
          })),
          attachments?.map((file) => ({
            mime: file.type || 'application/octet-stream',
            type: file.name.toLowerCase().includes('screenshot')
              ? 'screenshot'
              : file.type.startsWith('image/')
                ? 'image'
                : file.type.startsWith('video/')
                  ? 'video'
                  : 'document',
          })),
        );
        const previousDecision = preflightModelState.lastRoutingDecision;
        const decision = resolveAutoRoute({
          selection: resolvedModelId,
          taskType: classifier.type,
          subscriptionTier: executionMode === 'byok' ? 'byok' : useTierStore.getState().tier,
          trustMode: routingContext.trustMode,
          runtimeProfileId: routingContext.runtimeProfileId,
          currentModelKey: previousDecision?.routedModelId,
          previousTaskType: previousDecision?.taskType,
        });
        if (decision.status === 'unavailable') {
          // BYOK catalogs can be populated dynamically from a provider after
          // startup (OpenRouter and compatible private gateways are the common
          // cases). Those model ids cannot exist in AGI's static registry, but
          // the host already marked them as direct-provider models and the
          // privileged runtime performs its own provider/model validation.
          // Every known canonical model, every managed-cloud model, and every
          // Auto alias still fails closed through the registry policy.
          const isAdmittedDynamicByokModel =
            executionMode === 'byok' &&
            !isAutoSelection &&
            decision.code === 'unknown_selection' &&
            selectedModel.isByok;
          if (!isAdmittedDynamicByokModel) {
            toast.error(`Model routing unavailable: ${decision.reasons[0] ?? decision.code}`);
            return;
          }
        } else {
          resolvedModelId = decision.modelKey;
          resolvedProvider = decision.provider;

          if (isAutoSelection) {
            const routingReason = `${decision.reason} via ${decision.harnessId}`;
            preflightModelState.setRoutingDecision({
              routedModelId: decision.modelKey,
              taskType: decision.taskType,
              reason: routingReason,
              wasRouted: true,
              timestamp: Date.now(),
            });
            autoRouting = {
              source: 'auto',
              reason: routingReason,
              task: decision.taskType,
              // The concrete model the router landed on — pinning replaces the
              // `auto` alias with this id for subsequent turns.
              pinModel: decision.modelKey,
            };
          }
        }
      }

      // Route the prompt through the priority send queue first. This is the
      // single entry point for every LLM-bound user input: it provides
      // backpressure (lane cap), cancellation (AbortSignal), and round-trip
      // editing (popAllEditable) on top of the existing send pipeline.
      //
      // For direct user-typed input we use the `next` lane (default for user
      // input) so it never starves behind a queued task notification, but
      // also doesn't preempt an in-flight `now`-priority interrupt.
      const queue = sendQueueRef.current;
      try {
        enqueuePrompt(queue, content);
      } catch (err) {
        if (err instanceof QueueFullError) {
          toast.error(`Queue is full (lane "${err.lane}"). Please wait for prior sends to drain.`);
          return;
        }
        throw err;
      }
      // Drain immediately — current behavior is direct send. The queue layer
      // captures the command for cancellation / replay; we don't defer it.
      const queued = queue.dequeue();
      if (!queued) return;

      const store = useChatStore.getState();

      // Add user message — desktop store auto-creates conversation if needed.
      // The id is minted HERE and forwarded to the runtime so the rendered row
      // and its durable row share one identity: regenerate/edit have to delete
      // superseded server rows by the ids the transcript actually holds.
      const userMessageId = crypto.randomUUID();
      addMsg({
        id: userMessageId,
        role: 'user',
        content,
        ...(attachments?.length
          ? {
              attachments: attachments.map((file) => ({
                id: crypto.randomUUID(),
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size,
              })),
            }
          : {}),
      });

      // Re-read after addMsg (which may have synced the convId from desktop store)
      const convId = useChatStore.getState().activeConversationId;

      if (!convId) {
        toast.error('Failed to create conversation');
        return;
      }

      // Pin the turn to its origin conversation -- see streamConvIdRef's
      // doc comment. Must be set before the runtime call so onStream's
      // first event (which can fire before this function returns) already
      // resolves against the right conversation.
      streamConvIdRef.current = convId;
      store.startStreaming(convId);

      const systemPrompt = [
        getSystemPromptForMode(store.activeMode),
        getWritingStyleInstruction(writingStyle),
      ]
        .filter((instruction): instruction is string => Boolean(instruction))
        .join('\n\n');
      const modelState = useModelStore.getState();
      // Capability-clamp thinking/effort against the SELECTED model's catalog
      // reasoning contract before anything reaches the wire. The composer's
      // persisted "off" is only an intent: the Managed Cloud route answers a
      // `thinking_mode: false` on an always-on reasoning model with a 422
      // `invalid_thinking_configuration`, so an unclamped send fails the whole
      // turn before generation. See lib/thinkingPolicy.ts.
      const thinkingPolicy = resolveThinkingSendPolicy({
        modelId: resolvedModelId,
        requestedThinking: replacement?.replay?.thinkingEnabled ?? modelState.thinkingEnabled,
        requestedEffort: effort,
      });
      const requestedWebSearch = replacement?.replay?.webSearchEnabled ?? store.webSearchEnabled;

      // Resolve the selected model's provider so the backend can route it.
      // Without this, a dynamic Local model — e.g. an Ollama model like
      // "gemma4:e4b" that is NOT in the static catalog — reaches the Rust
      // resolver (resolve_provider_and_model) with provider=None and is never
      // routed to Ollama: the send silently no-ops (no /api/chat, no response,
      // no error). The model store carries each model's provider; forward it.
      resolvedProvider ??= modelState.models.find((m) => m.id === resolvedModelId)?.provider;
      const settingsState = useSettingsStore.getState();

      // Re-check managed search at send time so a persisted toggle cannot
      // survive a model/deployment change and become a cosmetic request. Local
      // runtimes keep their native tool path and do not consult Cloud flags.
      const selectedModelMetadata = getModelMetadataById(resolvedModelId);
      const webSearchEnabled =
        requestedWebSearch &&
        (!runtime.supportsManagedWebSearch ||
          isWebSearchAvailable({
            provider: resolvedProvider,
            modelSupportsNativeSearch:
              selectedModelMetadata?.capabilities.search ?? resolvedProvider === 'managed_cloud',
            modelSupportsTools:
              selectedModelMetadata?.capabilities.tools ??
              modelState.models.find((model) => model.id === resolvedModelId)?.supportsTools,
            genericBackendConfigured: settingsState.genericWebSearchDeploymentEnabled,
          }));

      // Code execution: forward the persisted composer preference ONLY when
      // it is currently honest — the selected model's catalog capability,
      // provider (native vs. E2B-gated), and this deployment's E2B cut-over
      // flag all agree it will actually run, AND the active runtime forwards
      // it at all (TauriRuntime doesn't). Recomputed here (not trusted from
      // the toggle's rendered `checked` state) so a stale persisted "on" from
      // a previously-capable model never silently reaches an unsupported one.
      const modelCapabilities = getModelMetadataById(resolvedModelId)?.capabilities;
      const codeExecution =
        Boolean(runtime.supportsCodeExecution) &&
        (replacement?.replay?.codeExecutionEnabled ?? settingsState.codeExecutionEnabled) &&
        isCodeExecutionAvailable(
          modelCapabilities?.codeExecution,
          modelCapabilities?.tools,
          resolvedProvider,
          settingsState.codeExecutionDeploymentEnabled,
        );
      const research = Boolean(runtime.supportsResearch && researchEnabled);
      const effectiveWorkMode = workMode ?? replacement?.replay?.workMode;

      // Reset assistant message ref for new response, then create the shared
      // pre-token row immediately. Without this row, a Local model that takes
      // several seconds before its first delta leaves the transcript visually
      // unchanged even though the native runtime is working. AGI Work enriches
      // the same row with the canonical activity timeline; ordinary chat keeps
      // the lightweight "Thinking…" placeholder rendered by MessageBubble.
      assistantMessageIdRef.current = null;
      cloudAgentRunRef.current = null;
      assistantMessageIdsRef.current.delete(convId);
      cloudAgentRunsRef.current.delete(convId);

      // Build full conversation history for multi-turn context
      const allMessages = store.messagesByConversation[convId] ?? [];
      const messageHistory = allMessages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.attachments?.length ? { attachments: m.attachments } : {}),
      }));

      const assistantMessageId = crypto.randomUUID();
      const startedAtMs = Date.now();
      assistantMessageIdRef.current = assistantMessageId;
      assistantMessageIdsRef.current.set(convId, assistantMessageId);
      addMsg(
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(startedAtMs).toISOString(),
          isStreaming: true,
          // Read by ProvenanceFooter to show what Auto picked and to offer
          // "Pin to <model>". Absent on manual selections.
          ...(autoRouting ? { routing: autoRouting } : {}),
          ...(effectiveWorkMode === 'agiwork'
            ? {
                metadata: {
                  agentActivity: startAgentActivityLocally({
                    sessionId: convId,
                    turnId: assistantMessageId,
                    summary: 'Starting AGI Work',
                    startedAtMs,
                  }),
                },
              }
            : {}),
        },
        convId,
      );

      void runtime
        .sendMessage(convId, content, {
          ...(systemPrompt ? { systemPrompt } : {}),
          model: resolvedModelId,
          ...(resolvedProvider ? { provider: resolvedProvider } : {}),
          userMessageId,
          assistantMessageId,
          webSearch: webSearchEnabled,
          ...(research ? { research: true } : {}),
          ...(effectiveWorkMode ? { workMode: effectiveWorkMode } : {}),
          ...(projectId !== undefined ? { projectId } : {}),
          // `undefined` means the model declares no thinking contract — the
          // field must be OMITTED, not sent as false (DES-C03).
          ...(thinkingPolicy.thinkingEnabled !== undefined
            ? { thinkingEnabled: thinkingPolicy.thinkingEnabled }
            : {}),
          ...(codeExecution ? { codeExecution: true } : {}),
          messageHistory,
          ...(agentMode ? { agentMode } : {}),
          ...(thinkingPolicy.effort ? { effort: thinkingPolicy.effort } : {}),
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
        })
        .then(() => {
          // The replacement turn has run, so its user row is durable on the
          // server. Only now drop the rows it superseded.
          if (replacement && replacement.messageIds.length > 0) {
            void runtime.deleteMessages?.(convId, replacement.messageIds).catch(() => {
              // A failed durable delete leaves at most a stale row that the
              // next reload reconciles; it must never fail the visible turn.
            });
          }
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const failedStore = useChatStore.getState();
          // The replacement never committed: put the exact transcript back
          // rather than leaving the user with a silently truncated thread. The
          // superseded server rows were never touched, so nothing is lost.
          if (replacement) {
            failedStore.setMessages(convId, replacement.snapshot);
          }
          const failedAssistant = replacement
            ? undefined
            : failedStore.messagesByConversation[convId]?.find(
                (candidate) => candidate.id === assistantMessageId,
              );
          if (failedAssistant?.isStreaming) {
            const currentActivity = failedAssistant.metadata?.['agentActivity'] as
              | AgentActivityState
              | undefined;
            failedStore.updateMessage(convId, assistantMessageId, {
              isStreaming: false,
              error: message || 'Failed to send message',
              metadata: {
                ...failedAssistant.metadata,
                finishReason: 'error',
                streamError: { message: message || 'Failed to send message' },
                ...(currentActivity
                  ? {
                      agentActivity: finishAgentActivityLocally(currentActivity, {
                        status: 'failed',
                        completedAtMs: Date.now(),
                        error: message || 'Failed to send message',
                      }),
                    }
                  : {}),
              },
            });
          }
          if (assistantMessageIdRef.current === assistantMessageId) {
            assistantMessageIdRef.current = null;
          }
          if (assistantMessageIdsRef.current.get(convId) === assistantMessageId) {
            assistantMessageIdsRef.current.delete(convId);
          }
          toast.error(
            message ||
              (replacement ? 'Could not regenerate this response' : 'Failed to send message'),
          );
        })
        .finally(() => {
          // Safety net — stop streaming if onStream 'done' wasn't received
          if (useChatStore.getState().streamingConversationIds[convId]) {
            useChatStore.getState().stopStreaming(convId);
          }
        });
    },
    [runtime, addMsg],
  );

  const stopGeneration = useCallback(() => {
    // Target the conversation the in-flight turn actually belongs to, not
    // whatever the user currently has open -- see streamConvIdRef's doc
    // comment. Nothing stops navigating to a different conversation mid-turn
    // and clicking Stop there; it must still stop the real turn rather than
    // silently targeting the wrong (unrelated) conversation id.
    const currentStore = useChatStore.getState();
    const convId = runtime?.supportsConcurrentTurns
      ? currentStore.activeConversationId
      : streamConvIdRef.current;
    if (runtime && convId) {
      runtime.stopGeneration(convId);
      // Continue-Generation (cloud/Web runtime only): the abort path emits no
      // 'done' event, so settle the in-flight assistant message here and, when
      // it has partial text already streamed, mark finish_reason 'stopped'
      // (mirrors web's useChatStream) so the Continue affordance is offered
      // honestly. Gated on the runtime capability — local/native runtimes
      // (TauriRuntime) can't resume in place, so they must NOT get the marker
      // (it would surface a fake, broken Continue button in the Tauri build,
      // which uses TauriRuntime for both local and cloud).
      const partialId = assistantMessageIdsRef.current.get(convId) ?? null;
      if (runtime.supportsContinueGeneration && partialId) {
        const store = useChatStore.getState();
        const msg = store.messagesByConversation[convId]?.find((m) => m.id === partialId);
        if (msg && msg.role === 'assistant') {
          const currentActivity = msg.metadata?.['agentActivity'] as AgentActivityState | undefined;
          store.updateMessage(convId, partialId, {
            isStreaming: false,
            metadata: {
              ...msg.metadata,
              ...(msg.content.trim() ? { finishReason: 'stopped' } : {}),
              ...(currentActivity
                ? {
                    agentActivity: finishAgentActivityLocally(currentActivity, {
                      status: 'cancelled',
                      completedAtMs: Date.now(),
                    }),
                  }
                : {}),
            },
          });
        }
      }
      assistantMessageIdRef.current = null;
      cloudAgentRunRef.current = null;
      assistantMessageIdsRef.current.delete(convId);
      cloudAgentRunsRef.current.delete(convId);
      useChatStore.getState().stopStreaming(convId);
    }
  }, [runtime]);

  /**
   * Continue Generation (ChatGPT/Claude parity, cloud mode): resume a truncated
   * (finish_reason 'length'/'max_tokens') or user-stopped ('stopped') assistant
   * turn. Reuses the normal streaming path — the request thread ends with the
   * partial assistant message followed by an ephemeral user instruction to
   * continue in place (never stored/rendered). The assistant-message ref is
   * pre-seeded to the partial's id so streamed tokens APPEND to the SAME bubble
   * instead of creating a new one. No-op unless the message is continuable
   * (see isMessageContinuable) — no fake availability.
   */
  const continueGeneration = useCallback(
    (assistantMessageId: string) => {
      // Only the cloud/Web runtime can resume a turn in place; never reissue
      // through a runtime that would persist the instruction as a new turn.
      if (!runtime || !runtime.supportsContinueGeneration || isStreamingRef.current) return;
      const convId = useChatStore.getState().activeConversationId;
      if (!convId) return;
      // Pin the turn to its origin conversation -- see streamConvIdRef's
      // doc comment.
      streamConvIdRef.current = convId;

      const store = useChatStore.getState();
      const conversationMessages = store.messagesByConversation[convId] ?? [];
      const messageIndex = conversationMessages.findIndex((m) => m.id === assistantMessageId);
      const message = messageIndex >= 0 ? conversationMessages[messageIndex] : undefined;
      // Only a truncated/stopped assistant turn with non-empty partial content
      // can continue; continuing an earlier turn would fork history.
      if (!message || messageIndex !== conversationMessages.length - 1) return;
      if (!isMessageContinuable(message)) return;

      // Continue with the model that produced the partial answer so voice and
      // capabilities stay coherent; fall back to the current selection.
      const model = message.model || useModelStore.getState().selectedModelId || 'auto';

      // Thread: everything up to AND INCLUDING the partial assistant turn, then
      // the ephemeral continue instruction (request-only, never stored). The
      // cloud wire uses messageHistory as the full thread (content arg ignored
      // when history is present), so append the instruction as the last turn.
      const messageHistory: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
        attachments?: Attachment[];
      }> = [
        ...conversationMessages.slice(0, messageIndex + 1).map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.attachments?.length ? { attachments: m.attachments } : {}),
        })),
        { role: 'user', content: CONTINUE_GENERATION_INSTRUCTION },
      ];

      // Pre-seed the ref so 'content' events append to the SAME bubble, and
      // clear the continuable marker while streaming (re-recorded honestly at
      // stream end — re-offered if truncated again).
      assistantMessageIdRef.current = assistantMessageId;
      assistantMessageIdsRef.current.set(convId, assistantMessageId);
      const persistedRun = message.metadata?.['cloudAgentRun'];
      cloudAgentRunRef.current =
        persistedRun && typeof persistedRun === 'object'
          ? {
              runId: String((persistedRun as Record<string, unknown>)['runId'] ?? ''),
              runPath: String((persistedRun as Record<string, unknown>)['runPath'] ?? ''),
            }
          : null;
      if (cloudAgentRunRef.current) {
        cloudAgentRunsRef.current.set(convId, cloudAgentRunRef.current);
      } else {
        cloudAgentRunsRef.current.delete(convId);
      }
      store.updateMessage(convId, assistantMessageId, {
        isStreaming: true,
        metadata: { ...message.metadata, finishReason: undefined },
      });
      store.startStreaming(convId);

      const systemPrompt = getSystemPromptForMode(store.activeMode);
      void runtime
        .sendMessage(convId, CONTINUE_GENERATION_INSTRUCTION, {
          model,
          messageHistory,
          ...(systemPrompt ? { systemPrompt } : {}),
          isContinuation: true,
          continuationMessageId: assistantMessageId,
        })
        .catch((err: unknown) => {
          const errMessage = err instanceof Error ? err.message : String(err);
          const failedStore = useChatStore.getState();
          const failedMessage = failedStore.messagesByConversation[convId]?.find(
            (candidate) => candidate.id === assistantMessageId,
          );
          if (failedMessage?.isStreaming) {
            failedStore.updateMessage(convId, assistantMessageId, {
              isStreaming: false,
              error: errMessage || 'Failed to continue generation',
              metadata: {
                ...failedMessage.metadata,
                finishReason: 'error',
                streamError: { message: errMessage || 'Failed to continue generation' },
              },
            });
          }
          if (assistantMessageIdRef.current === assistantMessageId) {
            assistantMessageIdRef.current = null;
          }
          if (assistantMessageIdsRef.current.get(convId) === assistantMessageId) {
            assistantMessageIdsRef.current.delete(convId);
          }
          toast.error(errMessage || 'Failed to continue generation');
        })
        .finally(() => {
          if (useChatStore.getState().streamingConversationIds[convId]) {
            useChatStore.getState().stopStreaming(convId);
          }
        });
    },
    [runtime],
  );

  /**
   * Regenerate (web parity): re-run the user turn that produced
   * `assistantMessageId`, replacing the old exchange instead of appending a
   * duplicate one.
   *
   * Rolls back from the PRECEDING user message (see `planRegenerateRollback` —
   * rolling back only the assistant would leave the original prompt in place
   * and re-sending it would duplicate the user turn), then re-sends through the
   * normal pipeline with the send options the original turn recorded. The
   * durable rows are deleted only after the replacement send has run, and the
   * exact transcript is restored if it throws (see `SendReplacement`).
   *
   * Refuses rather than silently sending a different request when the replay
   * cannot be reproduced: skill-guided turns, legacy tool-assisted turns
   * (`getRegenerateReplayDecision`), and turns whose prompt carried file
   * attachments — a persisted row holds attachment metadata, not the bytes, so
   * a resend would quietly drop the files.
   */
  const regenerate = useCallback(
    (assistantMessageId: string) => {
      // Without a durable delete the replacement would sit BESIDE the turn it
      // replaces on the server — a duplicated user message and a stale answer
      // on the next reload. Refuse rather than half-regenerate; hosts gate the
      // affordance on the same capability.
      if (!runtime || !runtime.deleteMessages || isStreamingRef.current) return;
      const store = useChatStore.getState();
      const convId = store.activeConversationId;
      if (!convId) return;
      const messages = store.messagesByConversation[convId] ?? [];
      const plan = planRegenerateRollback(messages, assistantMessageId);
      if (!plan) return;
      const userMessage = messages[plan.userIndex];
      if (!userMessage || !userMessage.content.trim()) return;

      if (userMessage.attachments && userMessage.attachments.length > 0) {
        toast.error(
          'Regenerate is unavailable for a turn with attachments. Re-send the prompt with the files attached.',
        );
        return;
      }

      const decision = getRegenerateReplayDecision({
        userMetadata: userMessage.metadata as RegenerateReplayMetadata | undefined,
        assistantMetadata: messages.find((m) => m.id === assistantMessageId)?.metadata as
          | RegenerateReplayMetadata
          | undefined,
      });
      if (!decision.ok) {
        toast.error(decision.message);
        return;
      }

      const snapshot = messages.map((message) => ({ ...message }));
      // Drop the replaced exchange from the transcript up front so the
      // replacement streams into a clean thread; sendMessage re-adds the user
      // turn. Restored verbatim by SendReplacement if the send throws.
      store.setMessages(convId, messages.slice(0, plan.userIndex));

      sendMessage(
        userMessage.content,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        decision.replay?.workMode,
        undefined,
        {
          messageIds: plan.rollbackIds,
          snapshot,
          replay: decision.replay,
        },
      );
    },
    [runtime, sendMessage],
  );

  /**
   * Resolve one pending tool-approval card. Partial decisions remain visibly
   * awaiting approval and are persisted on the card. Once every call has a
   * decision, the runtime sends the durable run id plus decision set and the
   * continuation extends the same assistant message. Hosts
   * must gate the approve/reject UI on `runtime?.resolveToolApproval` being
   * present — never call this against a runtime that lacks it (no fake
   * availability).
   */
  const resolveToolApproval = useCallback(
    (assistantMessageId: string, toolCallId: string, decision: 'approved' | 'rejected') => {
      if (!runtime?.resolveToolApproval) return;
      const store = useChatStore.getState();
      const convId = store.activeConversationId;
      if (!convId) return;
      // Pin the turn to its origin conversation -- see streamConvIdRef's
      // doc comment. The user is necessarily viewing this conversation right
      // now (the approve/reject button lives in its rendered messages), but
      // the resume's stream can outlast them navigating away afterward.
      streamConvIdRef.current = convId;

      const msgs = store.messagesByConversation[convId];
      const msg = msgs?.find((m) => m.id === assistantMessageId);
      let allDecided = false;
      if (msg) {
        const withDecision = (msg.toolCalls ?? []).map((tc) =>
          tc.id === toolCallId ? { ...tc, approvalDecision: decision } : tc,
        );
        const approvalCalls = withDecision.filter((tc) => tc.requiresApproval);
        allDecided =
          approvalCalls.length > 0 && approvalCalls.every((tc) => Boolean(tc.approvalDecision));
        const updatedCalls = withDecision.map((tc) => {
          if (!allDecided || !tc.requiresApproval) return tc;
          return tc.approvalDecision === 'approved'
            ? { ...tc, status: 'running' as const, requiresApproval: false }
            : {
                ...tc,
                status: 'failed' as const,
                requiresApproval: false,
                error: 'You denied this tool.',
                result: 'The user denied permission to run this tool.',
              };
        });
        store.updateMessage(convId, assistantMessageId, { toolCalls: updatedCalls });
      }

      if (allDecided) {
        // Re-point the ref at this message so continuation events append onto
        // the same bubble. A partial decision does not start a fake stream.
        assistantMessageIdRef.current = assistantMessageId;
        assistantMessageIdsRef.current.set(convId, assistantMessageId);
        const persistedRun = msg?.metadata?.['cloudAgentRun'];
        cloudAgentRunRef.current =
          persistedRun && typeof persistedRun === 'object'
            ? {
                runId: String((persistedRun as Record<string, unknown>)['runId'] ?? ''),
                runPath: String((persistedRun as Record<string, unknown>)['runPath'] ?? ''),
              }
            : null;
        if (cloudAgentRunRef.current) {
          cloudAgentRunsRef.current.set(convId, cloudAgentRunRef.current);
        } else {
          cloudAgentRunsRef.current.delete(convId);
        }
        store.startStreaming(convId);
      }

      void runtime
        .resolveToolApproval(convId, toolCallId, decision)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const failedStore = useChatStore.getState();
          const failedMessage = failedStore.messagesByConversation[convId]?.find(
            (candidate) => candidate.id === assistantMessageId,
          );
          if (failedMessage) {
            failedStore.updateMessage(convId, assistantMessageId, {
              isStreaming: false,
              toolCalls: (failedMessage.toolCalls ?? []).map((call) =>
                call.approvalDecision
                  ? {
                      ...call,
                      status: 'awaiting_approval' as const,
                      requiresApproval: true,
                      error: undefined,
                      result: undefined,
                    }
                  : call,
              ),
            });
            assistantMessageIdRef.current = assistantMessageId;
            assistantMessageIdsRef.current.set(convId, assistantMessageId);
          }
          toast.error(message || 'Failed to resolve tool approval');
        })
        .finally(() => {
          if (useChatStore.getState().streamingConversationIds[convId]) {
            useChatStore.getState().stopStreaming(convId);
          }
        });
    },
    [runtime],
  );

  /**
   * Rejoin a durable run when its conversation is opened.
   *
   * A Managed Cloud run outlives the app: the answer may have been finished, or
   * an approval asked for, while this client was closed. The server saves the
   * turn in that case, so what the transcript shows on reopen is a real but
   * possibly unfinished record. Reattaching streams only what happened AFTER the
   * cursor stored on that message, and the runtime no-ops for a run that has
   * since ended.
   *
   * The two cheap skips below matter: without them every reopened conversation
   * with any cloud history would ask the server about a run that finished weeks
   * ago. A recorded `finishReason` means a client watched this turn end, and a
   * terminal recorded state means the server already said so.
   */
  const lastAssistantMessageId = useChatStore((state) => {
    const messages = activeConversationId
      ? state.messagesByConversation[activeConversationId]
      : undefined;
    if (!messages) return null;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate?.role === 'assistant') return candidate.id;
    }
    return null;
  });
  const reattachedTurnsRef = useRef(new Set<string>());
  useEffect(() => {
    const reattach = runtime?.reattachConversation;
    if (!reattach || !activeConversationId || !lastAssistantMessageId) return;
    // Messages arrive after the conversation is selected, so this effect keys on
    // the last assistant turn rather than the conversation alone — keying on the
    // conversation would run once against an empty transcript and never again.
    const attemptKey = `${activeConversationId}:${lastAssistantMessageId}`;
    if (reattachedTurnsRef.current.has(attemptKey)) return;
    const messages = useChatStore.getState().messagesByConversation[activeConversationId] ?? [];
    const message = messages.find((candidate) => candidate.id === lastAssistantMessageId);
    if (!message || message.isStreaming) return;

    const reattachment = readCloudRunReattachment(message);
    if (!reattachment) return;
    reattachedTurnsRef.current.add(attemptKey);

    // Point the stream refs at the persisted row so replayed content and any
    // rebuilt approval card append to it instead of opening a second bubble.
    assistantMessageIdRef.current = message.id;
    assistantMessageIdsRef.current.set(activeConversationId, message.id);
    streamConvIdRef.current = activeConversationId;

    void (async () => {
      try {
        await reattach.call(runtime, activeConversationId, reattachment);
      } catch (error) {
        // A run we could not rejoin is not a failed turn: what is on screen is
        // still what the server has. Say so quietly and leave the transcript be.
        console.warn('[useChat] Could not reattach to the Cloud run:', error);
      }
    })();
  }, [activeConversationId, lastAssistantMessageId, runtime]);

  const activeApprovalMessages = useChatStore((state) =>
    activeConversationId ? state.messagesByConversation[activeConversationId] : undefined,
  );
  const approvalProjection = ((): CloudApprovalTurnProjection | undefined => {
    const messages = activeApprovalMessages ?? [];
    const message = [...messages]
      .reverse()
      .find(
        (candidate) =>
          candidate.role === 'assistant' &&
          candidate.toolCalls?.some((call) => call.requiresApproval),
      );
    if (!message) return undefined;
    const rawRun = message.metadata?.['cloudAgentRun'];
    if (!rawRun || typeof rawRun !== 'object') return undefined;
    const runId = (rawRun as Record<string, unknown>)['runId'];
    if (typeof runId !== 'string' || !runId) return undefined;
    const rawRunRecord = rawRun as Record<string, unknown>;
    const runPath = rawRunRecord['runPath'];
    const lastSequence = rawRunRecord['lastSequence'];
    const calls = (message.toolCalls ?? [])
      .filter((call) => call.requiresApproval)
      .map((call) => ({
        toolCallId: call.id,
        name: call.name,
        args: call.args,
        ...(call.approvalDecision ? { decision: call.approvalDecision } : {}),
      }));
    if (calls.length === 0) return undefined;
    return {
      assistantMessageId: message.id,
      runId,
      ...(typeof runPath === 'string' && Number.isInteger(lastSequence)
        ? {
            runReference: {
              runId,
              runPath,
              lastSequence: lastSequence as number,
              ...(isAgentTaskState(rawRunRecord['state']) ? { state: rawRunRecord['state'] } : {}),
              ...(typeof rawRunRecord['cancellationRequestedAt'] === 'string' ||
              rawRunRecord['cancellationRequestedAt'] === null
                ? { cancellationRequestedAt: rawRunRecord['cancellationRequestedAt'] }
                : {}),
            },
          }
        : {}),
      model: message.model ?? '',
      assistantContent: message.content,
      calls,
      ...(message.metadata?.['agentActivity']
        ? { agentActivity: message.metadata['agentActivity'] as AgentActivityState }
        : {}),
      messageProjection: {
        ...(message.thinking ? { thinking: message.thinking } : {}),
        ...(message.toolCalls?.length ? { toolCalls: message.toolCalls } : {}),
        ...(message.webSearchResults?.length ? { webSearchResults: message.webSearchResults } : {}),
        ...(message.generatedFiles?.length ? { generatedFiles: message.generatedFiles } : {}),
        ...(message.artifacts?.length ? { artifacts: message.artifacts } : {}),
        ...(message.metadata?.['codeExecutionResult']
          ? {
              codeExecutionResult: message.metadata['codeExecutionResult'] as NonNullable<
                CloudApprovalTurnProjection['messageProjection']
              >['codeExecutionResult'],
            }
          : {}),
        ...(message.metadata?.['research']
          ? {
              research: message.metadata['research'] as NonNullable<
                CloudApprovalTurnProjection['messageProjection']
              >['research'],
            }
          : {}),
      },
    };
  })();
  const isApprovalTurnLive = activeConversationId
    ? (runtime?.hasLiveApprovalTurn?.(activeConversationId, approvalProjection) ?? false)
    : false;
  return {
    sendMessage,
    stopGeneration,
    continueGeneration,
    regenerate,
    resolveToolApproval,
    isStreaming,
    isApprovalTurnLive,
  };
}
