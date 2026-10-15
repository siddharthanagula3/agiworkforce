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
import { toUserMessage } from '../lib/network-error';
import { SteerRefusedError } from '../lib/runtime';
import type {
  AgentQuestion,
  ChatRuntime,
  CloudApprovalTurnProjection,
  CloudRunReattachment,
  LocalToolScope,
  StreamEvent,
} from '../lib/runtime';
import type { Attachment, ChatMessage, MessageRouting } from '../lib/types';
import { syncPackageStoreFromHost } from './useHostBridgeSync';
import { useChatStore, getSystemPromptForMode } from '../stores/chatStore';
import { CLOUD_FALLBACK_MODELS, useModelStore } from '../stores/modelStore';
import { useSettingsStore } from '../stores/settingsStore';
import { defaultBrowserStorage, enqueuePrompt, getSendQueue } from '../queue/sendQueue';
import { getFollowUps, resolveFollowUpState, useFollowUpStore } from '../queue/followUps';
import { readTodoWriteItems, useTurnTodoStore } from '../components/TurnTodoPanel';
import { useAgentQuestionStore } from '../components/AgentQuestionCard';
import { useTurnNoticeStore } from '../components/TurnNotices';
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
  planEditRollback,
  planRegenerateRollback,
  type RegenerateReplayMetadata,
  type SendReplayMetadataLike,
} from '../lib/regenerateReplay';
import { isCodeExecutionAvailable } from '../lib/codeExecutionAvailability';
import { isWebSearchAvailable } from '@agiworkforce/search';
import { isModelAdmittedForExecutionMode } from '../lib/modelAdmission';
import { isChatModelSelectable } from '../lib/modelInfo';
import { useTierStore } from '../stores/tierStore';
import { resolveSendMediaKind, useMediaModeStore } from '../stores/mediaModeStore';
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

function producesTurnOutput(event: StreamEvent): boolean {
  switch (event.type) {
    case 'content':
      return event.content.trim() !== '';
    case 'tool_call':
    case 'tool_approval_request':
    case 'artifact':
      return true;
    case 'generated_files':
      return event.files.length > 0;
    default:
      return false;
  }
}

/**
 * Whether a send was taken: as a turn that started, or as a follow-up the
 * queue now holds. A send that was turned away has changed nothing, so whoever
 * holds the text still has to keep it.
 */
export type TurnStart = { started: true } | { started: false; reason: string };

const TURN_STARTED: TurnStart = { started: true };
const NO_RUNTIME_REASON = 'This chat is not connected yet.';
const REPLY_RUNNING_REASON = 'A reply is still running.';
const NO_CONVERSATION_REASON = 'Open a conversation before sending a follow-up.';
const SEND_QUEUE_EMPTY_REASON = 'The message could not be handed to the send queue.';

function turnNotStarted(reason: string): TurnStart {
  return { started: false, reason };
}

interface SendReplacement {
  messageIds: string[];
  snapshot: ChatMessage[];
  replay?: SendReplayMetadataLike | undefined;
}

interface UseChatOptions {
  hostBridge?: ChatHostBridge | null;
  externalAddMessage?: (msg: { role: string; content: string; id?: string }) => void;
  sendQueue?: MessageQueue;
  surfaceId?: string;
}

const TERMINAL_CLOUD_RUN_STATES = new Set<string>([
  'ready_for_review',
  'completed',
  'failed',
  'cancelled',
  'archived',
]);

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

  const surfaceIdRef = useRef(options?.surfaceId ?? 'default');
  const sendQueueRef = useRef<MessageQueue>(
    options?.sendQueue ??
      getSendQueue(surfaceIdRef.current, {
        storage: defaultBrowserStorage(surfaceIdRef.current) ?? undefined,
      }),
  );

  const addMsg = useCallback(
    (
      msg: Partial<ChatMessage> & { role: string; content: string },
      conversationIdOverride?: string,
    ) => {
      const msgId = msg.id ?? crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const hostBridge = hostBridgeRef.current;

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
  const streamConvIdRef = useRef<string | null>(null);
  const aggregateIsStreaming = useChatStore((s) => s.isStreaming);
  const streamingConversationIds = useChatStore((s) => s.streamingConversationIds);
  const isStreaming = runtime?.supportsConcurrentTurns
    ? Boolean(activeConversationId && streamingConversationIds[activeConversationId])
    : aggregateIsStreaming;
  const isStreamingRef = useRef(false);
  isStreamingRef.current = isStreaming;
  const consumedSteerIdsRef = useRef(new Set<string>());
  const turnOutputRef = useRef(new Set<string>());
  const withdrawingSteerIdsRef = useRef(new Set<string>());
  const drainFollowUpsRef = useRef<(conversationId: string) => void>(() => {});

  const placeSteeredMessage = useCallback(
    (conversationId: string, followUpId: string, content: string) => {
      useFollowUpStore.getState().remove(conversationId, followUpId);
      const streamingId = assistantMessageIdsRef.current.get(conversationId);
      if (streamingId) {
        useChatStore.getState().updateMessage(conversationId, streamingId, { isStreaming: false });
        assistantMessageIdsRef.current.delete(conversationId);
      }
      addMsg({ role: 'user', content }, conversationId);
    },
    [addMsg],
  );

  useEffect(() => {
    if (!runtime?.onStream) return;

    const unsubscribe = runtime.onStream((event) => {
      const store = useChatStore.getState();
      const convId = runtime.supportsConcurrentTurns
        ? event.conversationId
        : (event.conversationId ?? streamConvIdRef.current ?? store.activeConversationId);
      if (!convId) return;
      assistantMessageIdRef.current = assistantMessageIdsRef.current.get(convId) ?? null;
      cloudAgentRunRef.current = cloudAgentRunsRef.current.get(convId) ?? null;
      if (producesTurnOutput(event)) turnOutputRef.current.add(convId);

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
            AgentActivityState | undefined;
          const agentActivity = applyAgentActivityEvent(currentActivity, event.envelope);
          if (event.envelope.event.type === 'tool-execution-start') {
            const todos = readTodoWriteItems(event.envelope.event.name, event.envelope.event.input);
            if (todos) useTurnTodoStore.getState().setTodos(convId, todos);
          }

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
          const todos = readTodoWriteItems(event.toolCall.name, event.toolCall.args);
          if (todos) useTurnTodoStore.getState().setTodos(convId, todos);
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
          useAgentQuestionStore.getState().clear(convId);
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
        case 'question': {
          useAgentQuestionStore.getState().ask(convId, event.question);
          break;
        }
        case 'notice': {
          useTurnNoticeStore.getState().add(convId, event.message);
          break;
        }
        case 'steer_consumed': {
          const followUps = useFollowUpStore.getState();
          const steered = followUps.byConversation[convId]?.find(
            (followUp) => followUp.steerId === event.steerId,
          );
          if (!steered) {
            consumedSteerIdsRef.current.add(event.steerId);
            break;
          }
          placeSteeredMessage(convId, steered.id, steered.content);
          assistantMessageIdRef.current = null;
          break;
        }
        case 'research_status': {
          // Research phases stream long before the first content token, so the
          // placeholder has to be created here or the whole planning/searching
          // run shows nothing.
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
                metadata: { research: event.status },
              },
              convId,
            );
          } else {
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
          let awaitingApproval = false;
          if (assistantMessageIdRef.current) {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              awaitingApproval = (msg.toolCalls ?? []).some(
                (tc) => tc.status === 'awaiting_approval',
              );
              const currentActivity = msg.metadata?.['agentActivity'] as
                AgentActivityState | undefined;
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
              doneUpdates.metadata = {
                ...msg.metadata,
                ...(completedActivity ? { agentActivity: completedActivity } : {}),
                ...(event.usage ? { usage: event.usage } : {}),
                finishReason: event.finishReason,
                streamError: event.streamError,
              };
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
          if (!awaitingApproval) {
            assistantMessageIdRef.current = null;
          }
          store.stopStreaming(convId);
          useAgentQuestionStore.getState().clear(convId);
          if (!awaitingApproval) {
            setTimeout(() => drainFollowUpsRef.current(convId), 0);
          }
          break;
        }
        case 'error': {
          useFollowUpStore.getState().hold(convId);
          drainFollowUpsRef.current(convId);
          useAgentQuestionStore.getState().clear(convId);
          const quotaBlock = classifyManagedQuotaErrorCode(event.code);
          if (quotaBlock && assistantMessageIdRef.current) {
            const blockedId = assistantMessageIdRef.current;
            const blocked = store.messagesByConversation[convId]?.find((m) => m.id === blockedId);
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
            const failureMessage = toUserMessage(event.error, 'Request failed');
            const currentActivity = current?.metadata?.['agentActivity'] as
              AgentActivityState | undefined;
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
          toast.error(toUserMessage(event.error, 'Failed to get response'));
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
  }, [runtime, addMsg, placeSteeredMessage]);

  const startTurn = useCallback(
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
      skillName?: string,
      localToolScope?: LocalToolScope,
    ): TurnStart => {
      if (!runtime) return turnNotStarted(NO_RUNTIME_REASON);
      const refuse = (reason: string): TurnStart => {
        toast.error(reason);
        return turnNotStarted(reason);
      };

      const mediaModeState = useMediaModeStore.getState();
      const sendMediaKind = resolveSendMediaKind(mediaModeState.mediaMode, {
        image: runtime.supportsImageGeneration === true,
        video: runtime.supportsVideoGeneration === true,
      });
      mediaModeState.exitMediaMode();

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
        return refuse('Select a model available for this conversation before sending.');
      }
      if (!isModelAdmittedForExecutionMode(selectedModel, executionMode)) {
        return refuse('The selected model is not allowed for this conversation boundary.');
      }
      if (!isChatModelSelectable(selectedModel)) {
        return refuse(selectedModel.unavailableReason ?? 'The selected model is not available.');
      }

      let resolvedModelId = preflightModelState.selectedModelId;
      let resolvedProvider: string | undefined = selectedModel.provider;
      const isAutoSelection = resolvedModelId.startsWith('auto');
      const isExplicitByokSelection = executionMode === 'byok' && !isAutoSelection;
      let autoRouting: MessageRouting | undefined;
      const requiresRegistryAdmission =
        isAutoSelection || executionMode === 'cloud_managed' || executionMode === 'byok';

      if (requiresRegistryAdmission) {
        const routingContext = getRoutingContext(runtime.getPlatform?.(), executionMode);
        if (!routingContext) {
          return refuse('Model routing is not available for this runtime boundary.');
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
          const isAdmittedDynamicByokModel =
            isExplicitByokSelection &&
            decision.code === 'unknown_selection' &&
            selectedModel.isByok;
          if (!isAdmittedDynamicByokModel) {
            return refuse(`Model routing unavailable: ${decision.reasons[0] ?? decision.code}`);
          }
        } else {
          resolvedModelId = decision.modelKey;
          if (!isExplicitByokSelection) {
            resolvedProvider = decision.provider;
          }

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
              pinModel: decision.modelKey,
            };
          }
        }
      }

      const queue = sendQueueRef.current;
      try {
        enqueuePrompt(queue, content);
      } catch (err) {
        if (err instanceof QueueFullError) {
          return refuse(
            `Queue is full (lane "${err.lane}"). Please wait for prior sends to drain.`,
          );
        }
        throw err;
      }
      const queued = queue.dequeue();
      if (!queued) return turnNotStarted(SEND_QUEUE_EMPTY_REASON);

      const store = useChatStore.getState();

      const userMessageId = crypto.randomUUID();
      addMsg({
        id: userMessageId,
        role: 'user',
        content,
        ...(skillName || localToolScope
          ? {
              metadata: {
                sendReplay: {
                  ...(skillName ? { hasSkillInstruction: true, skillName } : {}),
                  ...(localToolScope === 'web_search' ? { webSearchEnabled: true } : {}),
                },
              },
            }
          : {}),
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

      const convId = useChatStore.getState().activeConversationId;

      if (!convId) {
        return refuse('Failed to create conversation');
      }

      streamConvIdRef.current = convId;
      store.startStreaming(convId);
      useTurnTodoStore.getState().clear(convId);
      useTurnNoticeStore.getState().clear(convId);

      const systemPrompt = [
        getSystemPromptForMode(store.activeMode),
        getWritingStyleInstruction(writingStyle),
      ]
        .filter((instruction): instruction is string => Boolean(instruction))
        .join('\n\n');
      const modelState = useModelStore.getState();
      const thinkingPolicy = resolveThinkingSendPolicy({
        modelId: resolvedModelId,
        requestedThinking: replacement?.replay?.thinkingEnabled ?? modelState.thinkingEnabled,
        requestedEffort: effort,
      });
      const requestedWebSearch = replacement?.replay?.webSearchEnabled ?? store.webSearchEnabled;

      resolvedProvider ??= modelState.models.find((m) => m.id === resolvedModelId)?.provider;
      const settingsState = useSettingsStore.getState();

      const selectedModelMetadata = getModelMetadataById(resolvedModelId);
      const webSearchEnabled =
        executionMode === 'local_only'
          ? localToolScope === 'web_search'
          : requestedWebSearch &&
            (!runtime.supportsManagedWebSearch ||
              isWebSearchAvailable({
                provider: resolvedProvider,
                modelSupportsNativeSearch:
                  selectedModelMetadata?.capabilities.search ??
                  resolvedProvider === 'managed_cloud',
                modelSupportsTools:
                  selectedModelMetadata?.capabilities.tools ??
                  modelState.models.find((model) => model.id === resolvedModelId)?.supportsTools,
                genericBackendConfigured: settingsState.genericWebSearchDeploymentEnabled,
              }));

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

      assistantMessageIdRef.current = null;
      cloudAgentRunRef.current = null;
      assistantMessageIdsRef.current.delete(convId);
      cloudAgentRunsRef.current.delete(convId);
      turnOutputRef.current.delete(convId);

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

      let supersededKey: string | null = null;
      // A steer ends the first assistant row and the reply carries on in a new
      // one, so output is whatever the conversation streamed during this turn.
      const turnProducedOutput = () => {
        if (turnOutputRef.current.has(convId)) return true;
        const assistant = useChatStore
          .getState()
          .messagesByConversation[convId]?.find((candidate) => candidate.id === assistantMessageId);
        return Boolean(
          assistant &&
          (assistant.content.trim() ||
            assistant.toolCalls?.length ||
            assistant.artifacts?.length ||
            assistant.generatedFiles?.length),
        );
      };
      const restoreReplaced = () => {
        if (!replacement) return;
        const replacedIds = new Set(replacement.snapshot.map((message) => message.id));
        const failures = (useChatStore.getState().messagesByConversation[convId] ?? []).filter(
          (message) =>
            !replacedIds.has(message.id) &&
            message.role === 'assistant' &&
            message.metadata?.['finishReason'] === 'error',
        );
        useChatStore.getState().setMessages(convId, [...replacement.snapshot, ...failures]);
      };
      const settleSuperseded = (sendFailed: boolean) => {
        const key = supersededKey;
        if (key === null) return;
        supersededKey = null;
        if (!sendFailed && turnProducedOutput()) {
          void runtime.releaseSupersededMessages?.(key).catch(() => {
            // Releasing only frees memory held for a restore that is no longer needed.
          });
          return;
        }
        restoreReplaced();
        void runtime.restoreSupersededMessages?.(key).catch((err: unknown) => {
          toast.error(
            toUserMessage(err, 'The replaced messages could not be put back in this chat.'),
          );
        });
      };

      const send = () =>
        runtime.sendMessage(convId, content, {
          ...(systemPrompt ? { systemPrompt } : {}),
          model: resolvedModelId,
          ...(resolvedProvider ? { provider: resolvedProvider } : {}),
          userMessageId,
          assistantMessageId,
          webSearch: webSearchEnabled,
          ...(localToolScope ? { localToolScope } : {}),
          ...(research ? { research: true } : {}),
          ...(effectiveWorkMode ? { workMode: effectiveWorkMode } : {}),
          ...(skillName ? { skillName } : {}),
          ...(projectId !== undefined ? { projectId } : {}),
          ...(thinkingPolicy.thinkingEnabled !== undefined
            ? { thinkingEnabled: thinkingPolicy.thinkingEnabled }
            : {}),
          ...(codeExecution ? { codeExecution: true } : {}),
          messageHistory,
          ...(agentMode ? { agentMode } : {}),
          ...(thinkingPolicy.effort ? { effort: thinkingPolicy.effort } : {}),
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
          ...(sendMediaKind ? { mediaMode: sendMediaKind } : {}),
        });
      const sent =
        replacement && replacement.messageIds.length > 0 && runtime.supersedeMessages
          ? runtime.supersedeMessages(convId, replacement.messageIds).then((key) => {
              supersededKey = key;
              return send();
            })
          : send();

      void sent
        .then(() => {
          if (supersededKey !== null) {
            settleSuperseded(false);
            return;
          }
          if (replacement && replacement.messageIds.length > 0 && !runtime.supersedeMessages) {
            void runtime.deleteMessages?.(convId, replacement.messageIds).catch(() => {
              // A failed durable delete leaves at most a stale row that the
              // next reload reconciles; it must never fail the visible turn.
            });
          }
        })
        .catch((err: unknown) => {
          const message = toUserMessage(err, 'Failed to send message');
          settleSuperseded(true);
          restoreReplaced();
          const failedStore = useChatStore.getState();
          const failedAssistant = replacement
            ? undefined
            : failedStore.messagesByConversation[convId]?.find(
                (candidate) => candidate.id === assistantMessageId,
              );
          if (failedAssistant?.isStreaming) {
            const currentActivity = failedAssistant.metadata?.['agentActivity'] as
              AgentActivityState | undefined;
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
          if (useChatStore.getState().streamingConversationIds[convId]) {
            useChatStore.getState().stopStreaming(convId);
          }
        });
      return TURN_STARTED;
    },
    [runtime, addMsg],
  );

  const sendMessage = useCallback(
    (...args: Parameters<typeof startTurn>): TurnStart => {
      if (!runtime) return turnNotStarted(NO_RUNTIME_REASON);
      if (isStreamingRef.current) return turnNotStarted(REPLY_RUNNING_REASON);
      const conversationId = useChatStore.getState().activeConversationId;
      if (conversationId) useFollowUpStore.getState().release(conversationId);
      return startTurn(...args);
    },
    [runtime, startTurn],
  );

  /**
   * The follow-up leaves the queue only once its turn has started. A send the
   * preflight turned away keeps the text, with why, and waits for the user.
   */
  const sendFollowUpById = useCallback(
    (conversationId: string, followUpId: string) => {
      const followUp = getFollowUps(conversationId).find((item) => item.id === followUpId);
      if (!followUp || followUp.state !== 'queued') return;
      const start = startTurn(...(followUp.args as Parameters<typeof startTurn>));
      const followUpStore = useFollowUpStore.getState();
      if (!start.started) {
        followUpStore.update(conversationId, followUpId, { heldReason: start.reason });
        return;
      }
      followUpStore.remove(conversationId, followUpId);
      followUpStore.release(conversationId);
    },
    [startTurn],
  );

  const withdrawSteeredFollowUps = useCallback(
    async (conversationId: string) => {
      const followUpStore = useFollowUpStore.getState();
      for (const followUp of getFollowUps(conversationId)) {
        const steerId = followUp.steerId;
        if (followUp.state !== 'steering' || !steerId) continue;
        if (withdrawingSteerIdsRef.current.has(steerId)) continue;
        if (!runtime?.withdrawSteer) {
          // The runtime took the message and cannot be asked whether it read
          // it, so it stays for the user to send or remove.
          followUpStore.update(conversationId, followUp.id, { state: 'queued' });
          followUpStore.hold(conversationId);
          continue;
        }
        withdrawingSteerIdsRef.current.add(steerId);
        try {
          const unread = await runtime.withdrawSteer(conversationId, steerId);
          if (unread) {
            followUpStore.update(conversationId, followUp.id, {
              state: 'queued',
              steerId: undefined,
            });
          } else {
            followUpStore.remove(conversationId, followUp.id);
          }
        } catch {
          // The runtime may still hold the message, so the queue waits for the
          // user instead of sending it again; keeping steerId lets a late
          // steer_consumed place it.
          followUpStore.update(conversationId, followUp.id, { state: 'queued' });
          followUpStore.hold(conversationId);
        } finally {
          withdrawingSteerIdsRef.current.delete(steerId);
        }
      }
    },
    [runtime],
  );

  const drainFollowUps = useCallback(
    async (conversationId: string) => {
      const held = useFollowUpStore.getState().held[conversationId];
      // A steer belongs to the running turn until it ends, by done, stop or
      // error. Opening a chat whose reply is still streaming must leave it be.
      if (!held && useChatStore.getState().streamingConversationIds[conversationId]) return;
      await withdrawSteeredFollowUps(conversationId);
      if (useFollowUpStore.getState().held[conversationId]) return;
      const chat = useChatStore.getState();
      if (chat.activeConversationId !== conversationId) return;
      if (chat.streamingConversationIds[conversationId]) return;
      if (!runtime?.supportsConcurrentTurns && chat.isStreaming) return;
      const next = getFollowUps(conversationId).find(
        (item) => item.state === 'queued' && item.heldReason === undefined,
      );
      if (next) sendFollowUpById(conversationId, next.id);
    },
    [runtime, sendFollowUpById, withdrawSteeredFollowUps],
  );
  drainFollowUpsRef.current = (conversationId) => {
    void drainFollowUps(conversationId);
  };

  useEffect(() => {
    if (activeConversationId) drainFollowUpsRef.current(activeConversationId);
  }, [activeConversationId]);

  const queueFollowUp = useCallback(
    (args: Parameters<typeof startTurn>, invert = false): TurnStart => {
      const conversationId = useChatStore.getState().activeConversationId;
      if (!runtime) return turnNotStarted(NO_RUNTIME_REASON);
      if (!conversationId) return turnNotStarted(NO_CONVERSATION_REASON);
      const [content, , , attachments] = args;
      const followUpStore = useFollowUpStore.getState();
      const state = resolveFollowUpState(
        useSettingsStore.getState().followUpQueueMode,
        invert,
        Boolean(runtime.steer) && !attachments?.length,
      );
      const id = crypto.randomUUID();
      followUpStore.add(conversationId, { id, content, state, args });
      if (state !== 'steering' || !runtime.steer) return TURN_STARTED;
      runtime
        .steer(conversationId, content)
        .then((steered) => {
          if (consumedSteerIdsRef.current.delete(steered.id)) {
            placeSteeredMessage(conversationId, id, content);
            return;
          }
          if (!getFollowUps(conversationId).some((item) => item.id === id)) {
            void runtime.withdrawSteer?.(conversationId, steered.id).then(
              (withdrawn) => {
                if (!withdrawn) toast.info('The reply already read that message.');
              },
              (err: unknown) => {
                toast.error(toUserMessage(err, 'Could not take the message back.'));
              },
            );
            return;
          }
          useFollowUpStore.getState().update(conversationId, id, { steerId: steered.id });
          if (!useChatStore.getState().streamingConversationIds[conversationId]) {
            drainFollowUpsRef.current(conversationId);
          }
        })
        .catch((err: unknown) => {
          if (err instanceof SteerRefusedError) {
            useFollowUpStore
              .getState()
              .update(conversationId, id, { state: 'queued', heldReason: err.reason });
            toast.error(err.reason);
          } else {
            useFollowUpStore.getState().update(conversationId, id, { state: 'queued' });
            toast.error(
              toUserMessage(err, 'Could not steer the reply; it will send when the reply ends.'),
            );
          }
          if (!useChatStore.getState().streamingConversationIds[conversationId]) {
            drainFollowUpsRef.current(conversationId);
          }
        });
      return TURN_STARTED;
    },
    [runtime, placeSteeredMessage],
  );

  const editFollowUp = useCallback((id: string, content: string) => {
    const conversationId = useChatStore.getState().activeConversationId;
    if (!conversationId) return;
    const followUp = getFollowUps(conversationId).find((item) => item.id === id);
    if (!followUp || followUp.state !== 'queued') return;
    const args = [...followUp.args];
    args[0] = content;
    useFollowUpStore
      .getState()
      .update(conversationId, id, { content, args, heldReason: undefined });
  }, []);

  const removeFollowUp = useCallback(
    (id: string) => {
      const conversationId = useChatStore.getState().activeConversationId;
      if (!conversationId) return;
      const followUp = getFollowUps(conversationId).find((item) => item.id === id);
      if (!followUp) return;
      if (followUp.state === 'steering' && followUp.steerId && runtime?.withdrawSteer) {
        void runtime
          .withdrawSteer(conversationId, followUp.steerId)
          .then((withdrawn) => {
            if (withdrawn) {
              useFollowUpStore.getState().remove(conversationId, id);
            } else {
              toast.info('The reply already read that message.');
            }
          })
          .catch((err: unknown) => {
            toast.error(toUserMessage(err, 'Could not take the message back.'));
          });
        return;
      }
      useFollowUpStore.getState().remove(conversationId, id);
    },
    [runtime],
  );

  const answerQuestion = useCallback(
    async (question: AgentQuestion, answer: string | string[]) => {
      const conversationId = useChatStore.getState().activeConversationId;
      if (!runtime?.answerQuestion || !conversationId) {
        throw new Error('This chat cannot answer the agent here.');
      }
      await runtime.answerQuestion(question.id, answer);
      useAgentQuestionStore.getState().clear(conversationId, question.id);
    },
    [runtime],
  );

  const sendFollowUpNow = useCallback(
    (id: string) => {
      const conversationId = useChatStore.getState().activeConversationId;
      if (!conversationId || isStreamingRef.current) return;
      sendFollowUpById(conversationId, id);
    },
    [sendFollowUpById],
  );

  const stopGeneration = useCallback(() => {
    const currentStore = useChatStore.getState();
    const convId = runtime?.supportsConcurrentTurns
      ? currentStore.activeConversationId
      : streamConvIdRef.current;
    if (runtime && convId) {
      useFollowUpStore.getState().hold(convId);
      useAgentQuestionStore.getState().clear(convId);
      runtime.stopGeneration(convId);
      drainFollowUpsRef.current(convId);
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

  const continueGeneration = useCallback(
    (assistantMessageId: string) => {
      if (!runtime || !runtime.supportsContinueGeneration || isStreamingRef.current) return;
      const convId = useChatStore.getState().activeConversationId;
      if (!convId) return;
      streamConvIdRef.current = convId;

      const store = useChatStore.getState();
      const conversationMessages = store.messagesByConversation[convId] ?? [];
      const messageIndex = conversationMessages.findIndex((m) => m.id === assistantMessageId);
      const message = messageIndex >= 0 ? conversationMessages[messageIndex] : undefined;
      if (!message || messageIndex !== conversationMessages.length - 1) return;
      if (!isMessageContinuable(message)) return;

      const model = message.model || useModelStore.getState().selectedModelId || 'auto';

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
          const errMessage = toUserMessage(err, 'Failed to continue generation');
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

  const regenerate = useCallback(
    (assistantMessageId: string) => {
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
          RegenerateReplayMetadata | undefined,
      });
      if (!decision.ok) {
        toast.error(decision.message);
        return;
      }

      const snapshot = messages.map((message) => ({ ...message }));
      store.setMessages(convId, messages.slice(0, plan.userIndex));

      const start = sendMessage(
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
        undefined,
        decision.replay?.webSearchEnabled ? 'web_search' : undefined,
      );
      if (!start.started) store.setMessages(convId, snapshot);
    },
    [runtime, sendMessage],
  );

  /**
   * Re-runs a turn the app closed before finishing. The question it left with
   * no reply is resent in its place, so history keeps one copy of it.
   */
  const retryInterruptedTurn = useCallback(
    (content: string) => {
      if (!runtime || isStreamingRef.current) return;
      const store = useChatStore.getState();
      const convId = store.activeConversationId;
      if (!convId) return;
      const messages = store.messagesByConversation[convId] ?? [];
      const last = messages[messages.length - 1];
      const isOrphan =
        last?.role === 'user' &&
        !last.attachments?.length &&
        last.content.trim().startsWith(content.trim());
      if (!last || !isOrphan || !runtime.deleteMessages) {
        sendMessage(content);
        return;
      }
      const snapshot = messages.map((message) => ({ ...message }));
      store.setMessages(convId, messages.slice(0, -1));
      const start = sendMessage(
        last.content,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { messageIds: [last.id], snapshot },
      );
      if (!start.started) store.setMessages(convId, snapshot);
    },
    [runtime, sendMessage],
  );

  const editAndResend = useCallback(
    (userMessageId: string, newContent: string) => {
      if (!runtime || !runtime.deleteMessages || isStreamingRef.current) return;
      const trimmed = newContent.trim();
      if (!trimmed) return;
      const store = useChatStore.getState();
      const convId = store.activeConversationId;
      if (!convId) return;
      const messages = store.messagesByConversation[convId] ?? [];
      const plan = planEditRollback(messages, userMessageId);
      if (!plan) return;
      const userMessage = messages[plan.userIndex];
      if (!userMessage) return;
      if (trimmed === userMessage.content.trim()) return;

      if (userMessage.attachments && userMessage.attachments.length > 0) {
        toast.error(
          'Editing is unavailable for a turn with attachments. Send a new message with the files attached.',
        );
        return;
      }

      const decision = getRegenerateReplayDecision({
        userMetadata: userMessage.metadata as RegenerateReplayMetadata | undefined,
        assistantMetadata: messages[plan.userIndex + 1]?.metadata as
          RegenerateReplayMetadata | undefined,
      });
      if (!decision.ok) {
        toast.error(decision.message);
        return;
      }

      const snapshot = messages.map((message) => ({ ...message }));
      store.setMessages(convId, messages.slice(0, plan.userIndex));

      const start = sendMessage(
        trimmed,
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
        undefined,
        decision.replay?.webSearchEnabled ? 'web_search' : undefined,
      );
      if (!start.started) store.setMessages(convId, snapshot);
    },
    [runtime, sendMessage],
  );

  const resolveToolApproval = useCallback(
    (assistantMessageId: string, toolCallId: string, decision: 'approved' | 'rejected') => {
      if (!runtime?.resolveToolApproval) return;
      const store = useChatStore.getState();
      const convId = store.activeConversationId;
      if (!convId) return;
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
          const message = toUserMessage(err, 'Failed to send message');
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
    const attemptKey = `${activeConversationId}:${lastAssistantMessageId}`;
    if (reattachedTurnsRef.current.has(attemptKey)) return;
    const messages = useChatStore.getState().messagesByConversation[activeConversationId] ?? [];
    const message = messages.find((candidate) => candidate.id === lastAssistantMessageId);
    if (!message || message.isStreaming) return;

    const reattachment = readCloudRunReattachment(message);
    if (!reattachment) return;
    reattachedTurnsRef.current.add(attemptKey);

    assistantMessageIdRef.current = message.id;
    assistantMessageIdsRef.current.set(activeConversationId, message.id);
    streamConvIdRef.current = activeConversationId;

    void (async () => {
      try {
        await reattach.call(runtime, activeConversationId, reattachment);
      } catch (error) {
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
    queueFollowUp,
    editFollowUp,
    removeFollowUp,
    sendFollowUpNow,
    answerQuestion,
    retryInterruptedTurn,
    stopGeneration,
    continueGeneration,
    regenerate,
    editAndResend,
    resolveToolApproval,
    isStreaming,
    isApprovalTurnLive,
  };
}
