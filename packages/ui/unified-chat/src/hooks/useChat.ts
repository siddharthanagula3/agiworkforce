import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  applyAgentActivityEvent,
  finishAgentActivityLocally,
  QueueFullError,
  type AgentActivityState,
  type MessageQueue,
} from '@agiworkforce/client-runtime';
import {
  classifyTaskLocally,
  resolveAutoRoute,
  type RoutingTrustMode,
} from '@agiworkforce/routing';
import type { ChatHostBridge } from '../lib/hostBridge';
import type { ChatRuntime } from '../lib/runtime';
import type { ChatMessage } from '../lib/types';
import { syncPackageStoreFromHost } from './useHostBridgeSync';
import { useChatStore, getSystemPromptForMode } from '../stores/chatStore';
import { CLOUD_FALLBACK_MODELS, useModelStore } from '../stores/modelStore';
import { useSettingsStore } from '../stores/settingsStore';
import { getSendQueue, defaultBrowserStorage } from '../queue/sendQueue';
import { CONTINUE_GENERATION_INSTRUCTION, isMessageContinuable } from '../lib/continue-generation';
import { getModelMetadataById, type ChatExecutionMode } from '@agiworkforce/types';
import { isCodeExecutionAvailable } from '../lib/codeExecutionAvailability';
import { isModelAdmittedForExecutionMode } from '../lib/modelAdmission';
import { isChatModelSelectable } from '../lib/modelInfo';
import { useTierStore } from '../stores/tierStore';
import { getWritingStyleInstruction, type WritingStyle } from '../lib/writingStyle';

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

export function useChat(runtime: ChatRuntime | null, options?: UseChatOptions) {
  const externalAddMessageRef = useRef(options?.externalAddMessage);
  externalAddMessageRef.current = options?.externalAddMessage;
  const hostBridgeRef = useRef(options?.hostBridge ?? null);
  hostBridgeRef.current = options?.hostBridge ?? null;

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

      if (hostBridge?.addMessage) {
        hostBridge.addMessage({ role: msg.role, content: msg.content, id: msgId });
      } else if (externalAddMessageRef.current) {
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
  /**
   * The conversation the CURRENTLY in-flight turn was sent to -- pinned at
   * each turn-start site (sendMessage / continueGeneration /
   * resolveToolApproval) and read by onStream / stopGeneration instead of
   * the live activeConversationId. Nothing prevents navigating to a
   * different conversation mid-turn (see ConversationItem's onClick), and
   * without this pin every subsequent stream event would resolve against
   * whatever conversation is now active: updateMessage no-ops when the
   * message id isn't found there, so the rest of the response is silently
   * dropped for the conversation actually streaming. There is still only
   * one in-flight turn at a time (isStreamingRef's guard below is
   * unchanged) -- this ref tracks WHICH conversation that turn belongs to,
   * it does not add concurrent-turn support.
   */
  const streamConvIdRef = useRef<string | null>(null);
  // Use ref for isStreaming to avoid stale closures in useCallback
  const isStreamingRef = useRef(false);
  isStreamingRef.current = useChatStore((s) => s.isStreaming);

  // Register stream callback on runtime to receive assistant responses
  useEffect(() => {
    if (!runtime?.onStream) return;

    const unsubscribe = runtime.onStream((event) => {
      const store = useChatStore.getState();
      // Pinned to the conversation this turn was sent to -- see
      // streamConvIdRef's doc comment. Falls back to activeConversationId
      // only so an onStream event firing before any send (shouldn't happen)
      // doesn't hard no-op.
      const convId = streamConvIdRef.current ?? store.activeConversationId;
      if (!convId) return;

      switch (event.type) {
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
                  ],
                  summary: 'Thinking...',
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
                  ]
                : [
                    {
                      id: crypto.randomUUID(),
                      type: 'thinking' as const,
                      content: existingThinking + event.content,
                    },
                  ];
              store.updateMessage(convId, assistantMessageIdRef.current, {
                thinking: existingThinking + event.content,
                thinkingBlock: {
                  id: existingBlock?.id ?? crypto.randomUUID(),
                  steps: updatedSteps,
                  summary: 'Thinking...',
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
                    summary: 'Thought process',
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
          store.stopStreaming();
          break;
        }
        case 'error': {
          if (assistantMessageIdRef.current) {
            const failingId = assistantMessageIdRef.current;
            const current = store.messagesByConversation[convId]?.find((m) => m.id === failingId);
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
              ...(currentActivity
                ? {
                    metadata: {
                      ...current?.metadata,
                      agentActivity: finishAgentActivityLocally(currentActivity, {
                        status: 'failed',
                        completedAtMs: Date.now(),
                        error: event.error || 'Request failed',
                      }),
                    },
                  }
                : {}),
              ...(stillRunning
                ? {
                    toolCalls: current!.toolCalls!.map((t) =>
                      t.status === 'running'
                        ? {
                            ...t,
                            status: 'failed' as const,
                            error: event.error || 'Request failed',
                          }
                        : t,
                    ),
                  }
                : {}),
            });
          }
          assistantMessageIdRef.current = null;
          store.stopStreaming();
          toast.error(event.error || 'Failed to get response');
          break;
        }
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
            preflightModelState.setRoutingDecision({
              routedModelId: decision.modelKey,
              taskType: decision.taskType,
              reason: `${decision.reason} via ${decision.harnessId}`,
              wasRouted: true,
              timestamp: Date.now(),
            });
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
        queue.enqueue({ value: content, mode: 'prompt' });
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

      // Add user message — desktop store auto-creates conversation if needed
      addMsg({
        id: crypto.randomUUID(),
        role: 'user',
        content,
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
      store.startStreaming();

      const systemPrompt = [
        getSystemPromptForMode(store.activeMode),
        getWritingStyleInstruction(writingStyle),
      ]
        .filter((instruction): instruction is string => Boolean(instruction))
        .join('\n\n');
      const modelState = useModelStore.getState();
      const thinkingEnabled = modelState.thinkingEnabled;
      const webSearchEnabled = store.webSearchEnabled;

      // Resolve the selected model's provider so the backend can route it.
      // Without this, a dynamic Local model — e.g. an Ollama model like
      // "gemma4:e4b" that is NOT in the static catalog — reaches the Rust
      // resolver (resolve_provider_and_model) with provider=None and is never
      // routed to Ollama: the send silently no-ops (no /api/chat, no response,
      // no error). The model store carries each model's provider; forward it.
      resolvedProvider ??= modelState.models.find((m) => m.id === resolvedModelId)?.provider;

      // Code execution: forward the persisted composer preference ONLY when
      // it is currently honest — the selected model's catalog capability,
      // provider (native vs. E2B-gated), and this deployment's E2B cut-over
      // flag all agree it will actually run, AND the active runtime forwards
      // it at all (TauriRuntime doesn't). Recomputed here (not trusted from
      // the toggle's rendered `checked` state) so a stale persisted "on" from
      // a previously-capable model never silently reaches an unsupported one.
      const settingsState = useSettingsStore.getState();
      const modelCapabilities = getModelMetadataById(resolvedModelId)?.capabilities;
      const codeExecution =
        Boolean(runtime.supportsCodeExecution) &&
        settingsState.codeExecutionEnabled &&
        isCodeExecutionAvailable(
          modelCapabilities?.codeExecution,
          resolvedProvider,
          settingsState.codeExecutionDeploymentEnabled,
        );
      const research = Boolean(runtime.supportsResearch && researchEnabled);

      // Reset assistant message ref for new response
      assistantMessageIdRef.current = null;

      // Build full conversation history for multi-turn context
      const allMessages = store.messagesByConversation[convId] ?? [];
      const messageHistory = allMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      void runtime
        .sendMessage(convId, content, {
          ...(systemPrompt ? { systemPrompt } : {}),
          model: resolvedModelId,
          ...(resolvedProvider ? { provider: resolvedProvider } : {}),
          webSearch: webSearchEnabled,
          ...(research ? { research: true } : {}),
          thinkingEnabled,
          ...(codeExecution ? { codeExecution: true } : {}),
          messageHistory,
          ...(agentMode ? { agentMode } : {}),
          ...(effort ? { effort } : {}),
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          toast.error(message || 'Failed to send message');
        })
        .finally(() => {
          // Safety net — stop streaming if onStream 'done' wasn't received
          if (useChatStore.getState().isStreaming) {
            useChatStore.getState().stopStreaming();
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
    const convId = streamConvIdRef.current;
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
      const partialId = assistantMessageIdRef.current;
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
      useChatStore.getState().stopStreaming();
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
      const model = message.model || useModelStore.getState().selectedModelId;

      // Thread: everything up to AND INCLUDING the partial assistant turn, then
      // the ephemeral continue instruction (request-only, never stored). The
      // cloud wire uses messageHistory as the full thread (content arg ignored
      // when history is present), so append the instruction as the last turn.
      const messageHistory = [
        ...conversationMessages
          .slice(0, messageIndex + 1)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: CONTINUE_GENERATION_INSTRUCTION },
      ];

      // Pre-seed the ref so 'content' events append to the SAME bubble, and
      // clear the continuable marker while streaming (re-recorded honestly at
      // stream end — re-offered if truncated again).
      assistantMessageIdRef.current = assistantMessageId;
      store.updateMessage(convId, assistantMessageId, {
        isStreaming: true,
        metadata: { ...message.metadata, finishReason: undefined },
      });
      store.startStreaming();

      void runtime
        .sendMessage(convId, CONTINUE_GENERATION_INSTRUCTION, {
          model,
          messageHistory,
        })
        .catch((err: unknown) => {
          const errMessage = err instanceof Error ? err.message : String(err);
          toast.error(errMessage || 'Failed to continue generation');
        })
        .finally(() => {
          if (useChatStore.getState().isStreaming) {
            useChatStore.getState().stopStreaming();
          }
        });
    },
    [runtime],
  );

  /**
   * Resolve one pending tool-approval card (see the 'tool_approval_request'
   * StreamEvent handling above). Gives immediate optimistic feedback
   * (approved → running, rejected → failed — mirrors
   * `useChatStream.ts`'s `useResolveToolApproval`) then delegates the actual
   * resume round-trip to `runtime.resolveToolApproval`, which is a no-op
   * until EVERY pending call in the suspended turn has a decision. Hosts
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
      if (msg) {
        const updatedCalls = (msg.toolCalls ?? []).map((tc) =>
          tc.id === toolCallId
            ? decision === 'approved'
              ? { ...tc, status: 'running' as const, requiresApproval: false }
              : {
                  ...tc,
                  status: 'failed' as const,
                  requiresApproval: false,
                  error: 'You denied this tool.',
                  result: 'The user denied permission to run this tool.',
                }
            : tc,
        );
        store.updateMessage(convId, assistantMessageId, { toolCalls: updatedCalls });
      }

      // Re-point the ref at this message (it may have been cleared since
      // suspension) so the resume's content/tool_call/tool_result/done
      // events append onto the SAME bubble, and re-flip isStreaming so the
      // composer reflects the in-flight resume.
      assistantMessageIdRef.current = assistantMessageId;
      store.startStreaming();

      void runtime
        .resolveToolApproval(convId, toolCallId, decision)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          toast.error(message || 'Failed to resolve tool approval');
        })
        .finally(() => {
          if (useChatStore.getState().isStreaming) {
            useChatStore.getState().stopStreaming();
          }
        });
    },
    [runtime],
  );

  const isStreaming = useChatStore((s) => s.isStreaming);
  // The approval registry backing resolveToolApproval is process-memory-only
  // (see ChatRuntime.hasLiveApprovalTurn's doc comment) -- hosts must gate
  // live Approve/Reject buttons on this instead of just resolveToolApproval's
  // presence, or a persisted awaiting_approval card left over from a prior
  // app session renders wired buttons that silently no-op.
  const isApprovalTurnLive = activeConversationId
    ? (runtime?.hasLiveApprovalTurn?.(activeConversationId) ?? false)
    : false;
  return {
    sendMessage,
    stopGeneration,
    continueGeneration,
    resolveToolApproval,
    isStreaming,
    isApprovalTurnLive,
  };
}
