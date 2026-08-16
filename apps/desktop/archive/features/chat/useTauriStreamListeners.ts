import { useEffect } from 'react';
import { listen, isCloudWeb, isTauri, invoke as tauriInvoke } from '../../lib/tauri-mock';
import { invoke as ipcInvoke } from '../../utils/ipc';
import { useChatPreferencesStore } from '../../stores/chatPreferencesStore';
import { useUnifiedChatStore, uuidToDbId } from '../../stores/unifiedChatStore';
import { useChatStore } from '../../stores/chat/chatStore';
import { useBillingStore } from '../../stores/auth';
import { useExecutionStore } from '../../stores/executionStore';
import { toast } from 'sonner';
import { formatErrorForChat } from '../../lib/friendlyErrors';
import {
  normalizeToolNameForUi,
  toolNameToArtifactType,
  toolNameToTitle,
} from '../../lib/chatToolUtils';
import {
  buildMessageArtifactUpdate,
  finalizeRunningMessageArtifacts,
  getMergedMessageArtifacts,
  upsertMessageArtifact,
} from '../../lib/messageArtifacts';
import { findMessageById } from '../../lib/messageLookup';
import {
  resolveActiveStreamMessageId,
  buildCompletedStreamMessageUpdate,
  buildFailedStreamMessageUpdate,
  buildStreamingStateMessageUpdate,
  buildToolCallMessageUpdate,
  buildToolResultStateMessageUpdate,
  resolveTerminalStreamTarget,
} from '../../lib/streamLifecycle';
import { clearRunningToolTrailEntries } from '../../lib/toolStreamRuntime';
import {
  buildRunningToolTimelineEntry,
  buildTerminalToolTimelineUpdate,
} from '../../lib/toolTimelineRuntime';
import {
  buildRunningToolArtifactPatch,
  buildTerminalToolArtifactPatch,
  buildThinkingContentPlan,
} from '../../lib/streamContentRuntime';
import { resolveToolHardTimeoutMs, shouldAbortGenerationOnToolTimeout } from './toolTimeoutPolicy';

const TOOL_EXECUTION_SOFT_TIMEOUT_MS = 10_000;
const AGENT_THINKING_ACTION_SOURCE = 'agent:thinking';
type StreamConversationKey = number | string;

export interface UseTauriStreamListenersConfig {
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  unlistenFnsRef: React.MutableRefObject<Array<() => void | Promise<void>>>;
  listenerSetupGenerationRef: React.MutableRefObject<number>;
  isMountedRef: React.MutableRefObject<boolean>;
  toolExecutionTimeoutsRef: React.MutableRefObject<
    Map<
      string,
      {
        conversationId: StreamConversationKey;
        softTimeoutId: ReturnType<typeof setTimeout>;
        hardTimeoutId: ReturnType<typeof setTimeout>;
      }
    >
  >;
  activeStreamSessionsRef: React.MutableRefObject<Map<StreamConversationKey, string>>;
  streamWatchdogTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  rafIdRef: React.MutableRefObject<number | null>;
  queueStreamUpdate: (messageId: string, fullContent: string) => void;
  clearQueuedStreamUpdates: (messageId?: string) => void;
  markStreamActivity: () => void;
}

export function useTauriStreamListeners(config: UseTauriStreamListenersConfig) {
  const {
    abortControllerRef,
    unlistenFnsRef,
    listenerSetupGenerationRef,
    isMountedRef,
    toolExecutionTimeoutsRef,
    activeStreamSessionsRef,
    streamWatchdogTimeoutRef,
    rafIdRef,
    queueStreamUpdate,
    clearQueuedStreamUpdates,
    markStreamActivity,
  } = config;

  useEffect(() => {
    if (!isTauri && !isCloudWeb) return;

    const setupGeneration = ++listenerSetupGenerationRef.current;
    isMountedRef.current = true;
    unlistenFnsRef.current = [];

    const setupListeners = async () => {
      const registerListener = async (listenerPromise: Promise<() => void>) => {
        try {
          const unlisten = await listenerPromise;
          const isActiveSetup =
            isMountedRef.current && listenerSetupGenerationRef.current === setupGeneration;
          if (isActiveSetup) {
            unlistenFnsRef.current.push(unlisten);
          } else {
            unlisten();
          }
        } catch (error) {
          console.error('[UnifiedAgenticChat] Failed to setup listener:', error);
        }
      };

      const getConversationMessagesForStream = (conversationId: StreamConversationKey) => {
        const state = useUnifiedChatStore.getState();

        if (
          state.activeConversationId &&
          ((typeof conversationId === 'string' && state.activeConversationId === conversationId) ||
            (typeof conversationId === 'number' &&
              uuidToDbId(state.activeConversationId) === conversationId))
        ) {
          return state.messages;
        }

        const matchingConversationId =
          typeof conversationId === 'string'
            ? conversationId
            : Object.keys(state.messagesByConversation).find(
                (id) => uuidToDbId(id) === conversationId,
              );

        if (matchingConversationId) {
          return state.messagesByConversation[matchingConversationId] ?? [];
        }

        return [];
      };

      const resolveStreamTargetMessageId = (
        conversationId: StreamConversationKey,
        payloadMessageId?: string | number,
      ): string | null => {
        const state = useUnifiedChatStore.getState();
        const conversationMessages = getConversationMessagesForStream(conversationId);
        const sessionMessageId = activeStreamSessionsRef.current.get(conversationId);
        return resolveActiveStreamMessageId(state, {
          conversationMessages,
          sessionMessageId,
          payloadMessageId,
          currentStreamingMessageId: state.currentStreamingMessageId,
        });
      };

      const upsertToolArtifact = (
        conversationId: StreamConversationKey,
        toolCallId: string,
        patch: Record<string, unknown>,
        payloadMessageId?: string | number,
      ) => {
        const state = useUnifiedChatStore.getState();
        const targetMessageId = resolveStreamTargetMessageId(conversationId, payloadMessageId);
        if (!targetMessageId) {
          console.warn('[upsertToolArtifact] No target message found for toolCallId:', toolCallId);
          return;
        }

        const targetMessage = findMessageById(useUnifiedChatStore.getState(), targetMessageId);
        if (!targetMessage) {
          console.warn('[upsertToolArtifact] Message not found for id:', targetMessageId);
          return;
        }

        const baseArtifacts = getMergedMessageArtifacts(targetMessage);
        const existing = baseArtifacts.find((artifact) => artifact.id === toolCallId) ?? null;
        const patchToolName = String(
          patch['toolName'] || (existing as Record<string, unknown> | null)?.['toolName'] || 'code',
        );
        const patchContent = String(
          patch['content'] || (existing as Record<string, unknown> | null)?.['content'] || '',
        );
        const nextArtifact = {
          ...(existing ? { ...existing } : {}),
          ...patch,
          id: toolCallId,
          type: toolNameToArtifactType(patchToolName),
          title: toolNameToTitle(patchToolName),
          content: patchContent,
        };

        state.updateMessage(
          targetMessageId,
          buildMessageArtifactUpdate(
            targetMessage,
            upsertMessageArtifact(targetMessage, nextArtifact),
          ),
        );
      };

      const finalizeRunningArtifactsForMessage = (
        messageId: string,
        status: 'completed' | 'failed' | 'cancelled',
        reason: string,
      ) => {
        const state = useUnifiedChatStore.getState();
        const targetMessage = findMessageById(state, messageId);
        if (!targetMessage) return;

        const nextArtifacts = finalizeRunningMessageArtifacts(targetMessage, { status, reason });
        if (!nextArtifacts) return;
        state.updateMessage(messageId, buildMessageArtifactUpdate(targetMessage, nextArtifacts));
      };

      const clearAgentIterationEntries = () => {
        const state = useUnifiedChatStore.getState();
        const entriesToRemove = state.actionTrail.filter((entry) => {
          if (entry.type !== 'running') return false;
          const metadata = entry.metadata as Record<string, unknown> | undefined;
          if (metadata?.['agent_progress'] === true) return true;
          return entry.message.startsWith('Agent iteration ');
        });
        for (const entry of entriesToRemove) {
          state.removeActionTrailEntry(entry.id);
        }
      };

      const getToolTimelineEntry = (messageId: string, toolCallId: string) => {
        return useChatStore
          .getState()
          .toolTimelineByMessage[messageId]?.find((entry) => entry.id === toolCallId);
      };

      const ensureToolTimelineEntry = (
        conversationId: number,
        input: {
          toolCallId: string;
          rawName?: string | null;
          argumentsText?: string | null;
          displayName?: string | null;
          displayArgs?: string | null;
        },
        payloadMessageId?: string | number,
      ): string | null => {
        const targetMessageId = resolveStreamTargetMessageId(conversationId, payloadMessageId);
        if (!targetMessageId) {
          return null;
        }

        const existingEntry = getToolTimelineEntry(targetMessageId, input.toolCallId);
        if (existingEntry) {
          useChatStore.getState().updateToolTimelineEntry(targetMessageId, input.toolCallId, {
            ...buildRunningToolTimelineEntry({
              id: input.toolCallId,
              rawName: input.rawName,
              argumentsText: input.argumentsText,
              displayName: input.displayName,
              displayArgs: input.displayArgs,
              existing: existingEntry,
            }),
            status: 'running',
          });
          return targetMessageId;
        }

        useChatStore.getState().addToolTimelineEntry(
          targetMessageId,
          buildRunningToolTimelineEntry({
            id: input.toolCallId,
            rawName: input.rawName,
            argumentsText: input.argumentsText,
            displayName: input.displayName,
            displayArgs: input.displayArgs,
          }),
        );
        return targetMessageId;
      };

      const clearToolExecutionTimeout = (toolCallId: string) => {
        const timeoutEntry = toolExecutionTimeoutsRef.current.get(toolCallId);
        if (timeoutEntry) {
          clearTimeout(timeoutEntry.softTimeoutId);
          clearTimeout(timeoutEntry.hardTimeoutId);
          toolExecutionTimeoutsRef.current.delete(toolCallId);
        }
      };

      const clearToolExecutionTimeoutsForConversation = (conversationId: StreamConversationKey) => {
        for (const [toolCallId, timeoutEntry] of toolExecutionTimeoutsRef.current.entries()) {
          if (timeoutEntry.conversationId !== conversationId) {
            continue;
          }
          clearTimeout(timeoutEntry.softTimeoutId);
          clearTimeout(timeoutEntry.hardTimeoutId);
          toolExecutionTimeoutsRef.current.delete(toolCallId);
        }
      };

      const syncGlobalStreamingState = () => {
        const state = useUnifiedChatStore.getState();
        const activeConversationKey = state.activeConversationId
          ? (uuidToDbId(state.activeConversationId) ?? state.activeConversationId)
          : undefined;
        const activeConversationStreamId =
          activeConversationKey !== undefined
            ? (activeStreamSessionsRef.current.get(activeConversationKey) ?? null)
            : null;
        const streamSessionValues = [...activeStreamSessionsRef.current.values()];
        const fallbackStreamId =
          streamSessionValues.length > 0
            ? streamSessionValues[streamSessionValues.length - 1]!
            : null;
        const nextStreamingMessageId = activeConversationStreamId ?? fallbackStreamId;

        state.setIsLoading(nextStreamingMessageId !== null);
        state.setStreamingMessage(nextStreamingMessageId);
      };

      const scheduleToolExecutionTimeout = (
        toolCallId: string,
        toolName: string,
        conversationId: StreamConversationKey,
        resetExisting: boolean,
        payloadMessageId?: string | number,
      ) => {
        if (resetExisting) {
          clearToolExecutionTimeout(toolCallId);
        } else if (toolExecutionTimeoutsRef.current.has(toolCallId)) {
          return;
        }

        const toolHardTimeoutMs = resolveToolHardTimeoutMs(toolName);
        const softTimeoutId = setTimeout(() => {
          if (!isMountedRef.current) return;
          if (!toolExecutionTimeoutsRef.current.has(toolCallId)) return;

          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `${toolName} is still running... retrying status check`,
            metadata: {
              tool_call_id: toolCallId,
              timeout_ms: TOOL_EXECUTION_SOFT_TIMEOUT_MS,
            },
            fadeAfter: 3500,
          });
        }, TOOL_EXECUTION_SOFT_TIMEOUT_MS);

        const hardTimeoutId = setTimeout(() => {
          if (!isMountedRef.current) return;
          if (!toolExecutionTimeoutsRef.current.has(toolCallId)) return;

          console.warn(
            `[UnifiedAgenticChat] Tool execution timed out: ${toolName} (${toolCallId})`,
          );
          const timeoutMessage =
            'Tool is taking longer than expected. Waiting for a final result from the agent.';
          const abortOnTimeout = shouldAbortGenerationOnToolTimeout(toolName);

          if (abortOnTimeout) {
            upsertToolArtifact(
              conversationId,
              toolCallId,
              {
                toolName,
                type: toolNameToArtifactType(toolName),
                title: toolNameToTitle(toolName),
                status: 'failed',
                success: false,
                error:
                  'Tool timed out waiting for completion. Please retry the request or narrow the operation scope.',
                content:
                  'Tool timed out waiting for completion. Please retry the request or narrow the operation scope.',
              },
              payloadMessageId,
            );
            useUnifiedChatStore.getState().addActionTrailEntry({
              type: 'error',
              message: `${toolName} timed out after ${Math.round(toolHardTimeoutMs / 1000)}s`,
              metadata: {
                tool_call_id: toolCallId,
                timeout_ms: toolHardTimeoutMs,
              },
              fadeAfter: 4500,
            });

            const state = useUnifiedChatStore.getState();
            const conversationStreamMessageId =
              activeStreamSessionsRef.current.get(conversationId) ?? null;
            if (conversationStreamMessageId) {
              clearQueuedStreamUpdates(conversationStreamMessageId);
              state.updateMessage(
                conversationStreamMessageId,
                buildStreamingStateMessageUpdate({ streaming: false }),
              );
            }
            activeStreamSessionsRef.current.delete(conversationId);
            clearToolExecutionTimeoutsForConversation(conversationId);
            syncGlobalStreamingState();
            if (isTauri) {
              void ipcInvoke('chat_stop_generation', { conversationId }).catch((error: unknown) => {
                console.warn(
                  '[UnifiedAgenticChat] Failed to stop generation after tool timeout:',
                  error,
                );
              });
            }
          } else {
            upsertToolArtifact(
              conversationId,
              toolCallId,
              {
                toolName,
                type: toolNameToArtifactType(toolName),
                title: toolNameToTitle(toolName),
                status: 'running',
                success: undefined,
                content: timeoutMessage,
                timeoutWarning: true,
              },
              payloadMessageId,
            );
            useUnifiedChatStore.getState().addActionTrailEntry({
              type: 'running',
              message: `${toolName} is taking longer than expected. Waiting for completion...`,
              metadata: {
                tool_call_id: toolCallId,
                timeout_ms: toolHardTimeoutMs,
                timeout_warning: true,
              },
              fadeAfter: 5000,
            });
          }
          clearToolExecutionTimeout(toolCallId);
        }, toolHardTimeoutMs);

        toolExecutionTimeoutsRef.current.set(toolCallId, {
          conversationId,
          softTimeoutId,
          hardTimeoutId,
        });
      };

      const finalizeStream = (
        conversationId: StreamConversationKey,
        finalizedMessageId: string | null,
        agentOutcome: 'completed' | 'failed',
        agentError?: string,
      ) => {
        if (finalizedMessageId) {
          clearQueuedStreamUpdates(finalizedMessageId);
        } else {
          clearQueuedStreamUpdates();
        }
        abortControllerRef.current = null;

        clearToolExecutionTimeoutsForConversation(conversationId);
        syncGlobalStreamingState();

        const currentAgent = useUnifiedChatStore.getState().agentStatus;
        if (currentAgent?.status === 'running') {
          useUnifiedChatStore.getState().setAgentStatus({
            ...currentAgent,
            status: agentOutcome,
            completedAt: new Date(),
            ...(agentOutcome === 'failed' && agentError ? { error: agentError } : {}),
          });
        }
        clearAgentIterationEntries();
      };

      registerListener(
        listen<{
          conversation_id: StreamConversationKey;
          message_id: string | number;
          created_at: string;
        }>('chat:stream-start', ({ payload }) => {
          if (!isMountedRef.current) return;
          markStreamActivity();

          abortControllerRef.current = new AbortController();

          const messageId = String(payload.message_id);
          activeStreamSessionsRef.current.set(payload.conversation_id, messageId);

          useUnifiedChatStore.getState().setIsLoading(true);
        }),
      );

      registerListener(
        listen<{
          conversation_id: StreamConversationKey;
          message_id: string | number;
          phase: string;
          message: string;
        }>('chat:stream-status', ({ payload }) => {
          if (!isMountedRef.current) return;
          markStreamActivity();

          const chatState = useUnifiedChatStore.getState();
          const trailType =
            payload.phase === 'connecting'
              ? 'searching'
              : payload.phase === 'tool_executing' || payload.phase === 'tool_call'
                ? 'running'
                : 'thinking';

          chatState.addActionTrailEntry({
            type: trailType as 'thinking' | 'searching' | 'running',
            message: payload.message,
            fadeAfter: 30000,
            metadata: {
              source: 'chat:stream-status',
              phase: payload.phase,
              messageId: String(payload.message_id),
            },
          });
        }),
      );

      registerListener(
        listen<{
          conversation_id: StreamConversationKey;
          message_id: string | number;
          delta: string;
          content: string;
        }>('chat:stream-chunk', ({ payload }) => {
          markStreamActivity();
          const authoritativeId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );

          if (authoritativeId) {
            queueStreamUpdate(authoritativeId, payload.content);
          }
        }),
      );

      registerListener(
        listen<{
          conversation_id: StreamConversationKey;
          message_id: string | number;
          backend_message_id?: number;
          usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
            cache_read_tokens?: number;
            cache_creation_tokens?: number;
          };
          credits?: {
            cost_cents: number;
            remaining_cents: number;
            daily_limit?: number;
            daily_used?: number;
            daily_remaining?: number;
            daily_reset_at?: string;
          };
        }>('chat:stream-end', ({ payload }) => {
          markStreamActivity();
          const state = useUnifiedChatStore.getState();
          const messageId = String(payload.message_id);
          const currentStreamingId = state.currentStreamingMessageId;

          const sessionMessageId = activeStreamSessionsRef.current.get(payload.conversation_id);
          const targetId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );
          const currentMatchesSession =
            !!currentStreamingId &&
            (currentStreamingId === sessionMessageId || currentStreamingId === messageId);
          const resolution = resolveTerminalStreamTarget({
            resolvedTargetId: targetId,
            currentStreamingMessageId: currentStreamingId,
            currentMatchesSession,
            conversationMessages: getConversationMessagesForStream(payload.conversation_id),
          });
          const { finalizedMessageId } = resolution;
          const { hasValidTarget } = resolution;

          if (finalizedMessageId) {
            state.updateMessage(
              finalizedMessageId,
              buildCompletedStreamMessageUpdate({
                totalTokens: payload.usage?.total_tokens,
                costCents: payload.credits?.cost_cents,
              }),
            );
            finalizeRunningArtifactsForMessage(
              finalizedMessageId,
              'completed',
              'Tool completed without explicit terminal event.',
            );
          }

          activeStreamSessionsRef.current.delete(payload.conversation_id);

          if (streamWatchdogTimeoutRef.current) {
            clearTimeout(streamWatchdogTimeoutRef.current);
            streamWatchdogTimeoutRef.current = null;
          }

          if (payload.credits) {
            useBillingStore.getState().updateCredits(payload.credits);
          }

          const hasOtherActiveStreams = activeStreamSessionsRef.current.size > 0;
          const shouldClearGlobalState = hasValidTarget || !hasOtherActiveStreams;

          if (!hasValidTarget) {
            console.warn(
              '[UnifiedAgenticChat] stream-end received without valid target; applying fallback cleanup policy',
              {
                payloadMessageId: messageId,
                sessionMessageId,
                currentStreamingId,
                finalizedMessageId,
                hasOtherActiveStreams,
              },
            );
          }

          if (shouldClearGlobalState) {
            finalizeStream(payload.conversation_id, finalizedMessageId, 'completed');
          }

          const chatPrefs = useChatPreferencesStore.getState();
          if (
            chatPrefs.lastInputWasVoice &&
            chatPrefs.chatPreferences.autoTTS &&
            finalizedMessageId
          ) {
            chatPrefs.setLastInputWasVoice(false);
            const assistantMsg = findMessageById(
              useUnifiedChatStore.getState(),
              finalizedMessageId,
            );
            if (assistantMsg?.content && assistantMsg.role === 'assistant') {
              const clean = assistantMsg.content
                .replace(/```[\s\S]*?```/g, '')
                .replace(/`[^`]+`/g, '')
                .replace(/^#{1,6}\s+/gm, '')
                .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
                .trim();
              if (clean) {
                tauriInvoke('voice_tts_speak', { text: clean }).catch(() => {
                  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(clean);
                    utterance.rate = 1.05;
                    window.speechSynthesis.speak(utterance);
                  }
                });
              }
            }
          }
        }),
      );

      registerListener(
        listen<{
          conversation_id: StreamConversationKey;
          message_id: string | number;
          error: string;
        }>('chat:stream-error', ({ payload }) => {
          markStreamActivity();
          const state = useUnifiedChatStore.getState();
          const messageId = String(payload.message_id);
          const currentStreamingId = state.currentStreamingMessageId;

          const sessionMessageId = activeStreamSessionsRef.current.get(payload.conversation_id);
          const targetId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );
          const currentMatchesSession =
            !!currentStreamingId &&
            (currentStreamingId === sessionMessageId || currentStreamingId === messageId);

          const resolution = resolveTerminalStreamTarget({
            resolvedTargetId: targetId,
            currentStreamingMessageId: currentStreamingId,
            currentMatchesSession,
            conversationMessages: getConversationMessagesForStream(payload.conversation_id),
          });
          const { finalizedMessageId } = resolution;
          const { hasValidTarget } = resolution;

          if (finalizedMessageId) {
            const displayError = formatErrorForChat(payload.error, true);
            state.updateMessage(
              finalizedMessageId,
              buildFailedStreamMessageUpdate({
                displayError,
                rawError: payload.error,
              }),
            );
            finalizeRunningArtifactsForMessage(
              finalizedMessageId,
              'failed',
              payload.error || 'Tool failed while generating the response.',
            );
          }

          activeStreamSessionsRef.current.delete(payload.conversation_id);

          if (streamWatchdogTimeoutRef.current) {
            clearTimeout(streamWatchdogTimeoutRef.current);
            streamWatchdogTimeoutRef.current = null;
          }

          const hasOtherActiveStreams = activeStreamSessionsRef.current.size > 0;
          const shouldClearGlobalState = hasValidTarget || !hasOtherActiveStreams;

          if (!hasValidTarget) {
            console.warn(
              '[UnifiedAgenticChat] stream-error received without valid target; applying fallback cleanup policy',
              {
                payloadMessageId: messageId,
                sessionMessageId,
                currentStreamingId,
                finalizedMessageId,
                hasOtherActiveStreams,
              },
            );
          }

          if (shouldClearGlobalState) {
            finalizeStream(payload.conversation_id, finalizedMessageId, 'failed', payload.error);
          }
        }),
      );

      registerListener(
        listen<{ id: string; content: string; timestamp: string; conversation_id?: number }>(
          'chat:pending-message-added',
          ({ payload }) => {
            useChatStore.getState().addPendingMessage(payload);
          },
        ),
      );

      registerListener(
        listen<{ message: { id: string; content: string }; remaining: number }>(
          'chat:pending-message-consumed',
          ({ payload }) => {
            useChatStore.getState().removePendingMessage(payload.message.id);
          },
        ),
      );

      registerListener(
        listen<{ count: number }>('chat:pending-messages-cleared', () => {
          useChatStore.getState().clearPendingMessages();
        }),
      );

      registerListener(
        listen<{
          pending_messages: Array<{ id: string; content: string }>;
          current_tool?: string;
          current_phase?: string;
          count: number;
        }>('chat:pending-context-available', () => {
          // This event is informational - the AI can use pending messages to adjust behavior
          // The messages are already in the store, so we don't need to do anything here
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          pending_messages: Array<{ id: string; content: string; timestamp: string }>;
          count: number;
        }>('chat:pending-messages-ready', async ({ payload }) => {
          for (let i = 0; i < payload.pending_messages.length; i++) {
            if (!isMountedRef.current) {
              break;
            }

            const pending = payload.pending_messages[i];
            if (!pending) continue;

            if (i > 0) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            try {
              window.dispatchEvent(
                new CustomEvent('chat:auto-send-pending', {
                  detail: {
                    pendingMessage: {
                      ...pending,
                      conversation_id: payload.conversation_id,
                    },
                  },
                }),
              );
            } catch (err) {
              console.error('[UnifiedAgenticChat] Failed to send pending message:', err);
              toast.error('Failed to send queued message. Please try again.');
            }
          }
        }),
      );

      registerListener(
        listen<{ agent_id?: string; thinking: boolean; phase?: string; message?: string }>(
          'agent:thinking',
          ({ payload }) => {
            const chatState = useUnifiedChatStore.getState();

            if (payload.thinking) {
              chatState.addActionTrailEntry({
                type: 'thinking',
                message: payload.message || payload.phase || 'Thinking...',
                fadeAfter: 30000, // Fade after 30 seconds if not cleared
                metadata: {
                  source: AGENT_THINKING_ACTION_SOURCE,
                  ...(payload.agent_id ? { agentId: payload.agent_id } : {}),
                },
              });
              return;
            }

            const matchingEntry =
              [...chatState.getActiveActionTrail()].reverse().find((entry) => {
                if (entry.type !== 'thinking') {
                  return false;
                }

                const metadataSource = entry.metadata?.['source'];
                const metadataAgentId = entry.metadata?.['agentId'];

                if (metadataSource === AGENT_THINKING_ACTION_SOURCE) {
                  return payload.agent_id === undefined || metadataAgentId === payload.agent_id;
                }

                return payload.agent_id === undefined;
              }) ?? null;

            if (matchingEntry) {
              chatState.removeActionTrailEntry(matchingEntry.id);
            }
          },
        ),
      );

      registerListener(
        listen<{
          agent_id?: string;
          success: boolean;
          result?: string;
          error?: string;
          duration_ms?: number;
        }>('agent:finished', ({ payload }) => {
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.success ? 'completed' : 'error',
            message: payload.success
              ? payload.result || 'Task completed successfully'
              : payload.error || 'Task failed',
            fadeAfter: 5000,
            metadata: { duration_ms: payload.duration_ms },
          });

          const currentAgent = useUnifiedChatStore.getState().agentStatus;
          if (currentAgent && currentAgent.status === 'running') {
            useUnifiedChatStore.getState().setAgentStatus({
              ...currentAgent,
              status: payload.success ? 'completed' : 'failed',
              completedAt: new Date(),
              error: payload.error,
            });
          }
          clearAgentIterationEntries();
        }),
      );

      registerListener(
        listen<{
          event_type: 'start' | 'delta' | 'complete';
          content: string;
          message_id?: string | null;
          tokens?: number | null;
          timestamp: number;
        }>('thinking:event', ({ payload }) => {
          if (!isMountedRef.current) return;
          markStreamActivity();

          const state = useUnifiedChatStore.getState();
          const activeStreamValues = [...activeStreamSessionsRef.current.values()];
          const fallbackSessionMessageId =
            activeStreamValues.length > 0
              ? activeStreamValues[activeStreamValues.length - 1]!
              : null;
          const targetMessageId = resolveActiveStreamMessageId(state, {
            conversationMessages: state.messages,
            sessionMessageId: fallbackSessionMessageId,
            payloadMessageId: payload.message_id,
            currentStreamingMessageId: state.currentStreamingMessageId,
          });

          if (!targetMessageId) return;

          const chatState = useChatStore.getState();
          const plan = buildThinkingContentPlan(payload.event_type, payload.content);

          if (plan.clear) {
            chatState.clearThinkingContent(targetMessageId);
          }
          if (plan.append) {
            chatState.appendThinkingContent(targetMessageId, plan.append);
          }
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          message_id?: string | number;
          tool_calls: Array<{
            index: number;
            id: string;
            name: string;
            arguments: string;
          }>;
          streaming: boolean;
        }>('chat:tool-calls', ({ payload }) => {
          markStreamActivity();

          const state = useUnifiedChatStore.getState();
          const targetMessageId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );

          if (!isTauri && targetMessageId) {
            const firstTool = payload.tool_calls[0];
            if (firstTool) {
              const normalizedFirstToolName = normalizeToolNameForUi(firstTool.name);
              state.updateMessage(
                targetMessageId,
                buildToolCallMessageUpdate({
                  toolName: normalizedFirstToolName,
                  toolCallId: firstTool.id,
                }),
              );
            }
          }

          for (const tc of payload.tool_calls) {
            const normalizedToolName = normalizeToolNameForUi(tc.name);

            ensureToolTimelineEntry(
              payload.conversation_id,
              {
                toolCallId: tc.id,
                rawName: tc.name,
                argumentsText: tc.arguments,
              },
              payload.message_id,
            );

            upsertToolArtifact(
              payload.conversation_id,
              tc.id,
              buildRunningToolArtifactPatch(tc.name, tc.arguments),
              payload.message_id,
            );

            if (!isTauri) {
              useUnifiedChatStore.getState().addActionTrailEntry({
                type: 'running',
                message: `Calling ${normalizedToolName}...`,
                metadata: { tool_call_id: tc.id, arguments: tc.arguments },
              });
            }

            scheduleToolExecutionTimeout(
              tc.id,
              normalizedToolName,
              payload.conversation_id,
              false,
              payload.message_id,
            );
          }
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          message_id?: string | number;
          tool_call_id: string;
          tool_name: string;
          arguments: string;
        }>('chat:tool-executing', ({ payload }) => {
          markStreamActivity();
          const normalizedToolName = normalizeToolNameForUi(payload.tool_name);
          // Only ensure it exists as a safety net if the tool:event was missed.
          const targetMessageId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );
          if (targetMessageId && !getToolTimelineEntry(targetMessageId, payload.tool_call_id)) {
            ensureToolTimelineEntry(
              payload.conversation_id,
              {
                toolCallId: payload.tool_call_id,
                rawName: payload.tool_name,
                argumentsText: payload.arguments,
              },
              payload.message_id,
            );
          }
          scheduleToolExecutionTimeout(
            payload.tool_call_id,
            normalizedToolName,
            payload.conversation_id,
            true,
            payload.message_id,
          );
          // Action trail entry is created by tool:event Started — skip duplicate.
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          iteration: number;
          max_iterations: number;
          status: string;
          tool_count?: number;
        }>('chat:agent-progress', ({ payload }) => {
          markStreamActivity();
          clearAgentIterationEntries();
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.status === 'limit_reached' ? 'error' : 'running',
            message:
              payload.status === 'limit_reached'
                ? `Agent reached iteration limit (${payload.max_iterations})`
                : `Agent iteration ${payload.iteration}/${payload.max_iterations}${payload.tool_count ? ` — ${payload.tool_count} tool(s)` : ''}`,
            metadata: {
              agent_progress: true,
              iteration: payload.iteration,
              max_iterations: payload.max_iterations,
            },
            fadeAfter: payload.status === 'limit_reached' ? 5000 : 60000,
          });
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          message_id?: string | number;
          tool_call_id: string;
          tool_name: string;
          success: boolean;
          result: string;
          result_data?: Record<string, unknown>;
        }>('chat:tool-result', ({ payload }) => {
          markStreamActivity();
          const normalizedToolName = normalizeToolNameForUi(payload.tool_name);
          clearToolExecutionTimeout(payload.tool_call_id);

          upsertToolArtifact(
            payload.conversation_id,
            payload.tool_call_id,
            buildTerminalToolArtifactPatch({
              toolName: payload.tool_name,
              success: payload.success,
              result: payload.result,
              resultData: payload.result_data,
            }),
            payload.message_id,
          );

          const targetMessageId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );
          if (targetMessageId) {
            if (!getToolTimelineEntry(targetMessageId, payload.tool_call_id)) {
              useChatStore.getState().addToolTimelineEntry(
                targetMessageId,
                buildRunningToolTimelineEntry({
                  id: payload.tool_call_id,
                  rawName: payload.tool_name,
                }),
              );
            }
            useChatStore.getState().updateToolTimelineEntry(
              targetMessageId,
              payload.tool_call_id,
              buildTerminalToolTimelineUpdate({
                success: payload.success,
                error: payload.success ? null : payload.result,
              }),
            );
            if (!isTauri) {
              useUnifiedChatStore
                .getState()
                .updateMessage(
                  targetMessageId,
                  buildToolResultStateMessageUpdate({ success: payload.success }),
                );
            }
          }

          // as a safety net if tool:event didn't already handle it.
          clearRunningToolTrailEntries(
            useUnifiedChatStore.getState(),
            payload.tool_call_id,
            normalizedToolName,
          );

          if (!isTauri) {
            const currentAgent = useUnifiedChatStore.getState().agentStatus;
            if (currentAgent && currentAgent.status === 'running') {
              useUnifiedChatStore.getState().setAgentStatus({
                ...currentAgent,
                currentStep: payload.success
                  ? `Completed ${normalizedToolName}`
                  : `Failed ${normalizedToolName}`,
              });
            }
          }
        }),
      );

      registerListener(
        listen<{
          event: {
            type: string;
            tool_id: string;
            reason?: string;
            duration_ms: number;
          };
          timestamp: string;
        }>('agi:tool_stream', (event) => {
          if (!isMountedRef.current) return;
          const { event: streamEvent } = event.payload;

          markStreamActivity();

          if (streamEvent.type !== 'cancelled') return;

          const cancelledEvent = streamEvent as {
            type: 'cancelled';
            tool_id: string;
            reason?: string;
            duration_ms: number;
          };

          clearToolExecutionTimeout(cancelledEvent.tool_id);

          // Canonical cancellation state is handled by runtime activity listeners.
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          step_id: string;
          step_index: number;
          description: string;
        }>('research:step_started', ({ payload }) => {
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            const updatedSteps = task.steps.map((step, index) => {
              if (index === payload.step_index || step.id === payload.step_id) {
                return { ...step, status: 'running' as const, timestamp: Date.now() };
              }
              return step;
            });
            executionStore.updateResearchTask(payload.task_id, {
              steps: updatedSteps,
              progress: Math.round((payload.step_index / task.steps.length) * 100),
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          step_id: string;
          step_index: number;
          success: boolean;
          details?: string;
        }>('research:step_completed', ({ payload }) => {
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            const updatedSteps = task.steps.map((step, index) => {
              if (index === payload.step_index || step.id === payload.step_id) {
                return {
                  ...step,
                  status: payload.success ? ('completed' as const) : ('failed' as const),
                  details: payload.details,
                };
              }
              return step;
            });
            const completedCount = updatedSteps.filter((s) => s.status === 'completed').length;
            executionStore.updateResearchTask(payload.task_id, {
              steps: updatedSteps,
              progress: Math.round((completedCount / task.steps.length) * 100),
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          finding: string;
        }>('research:finding_added', ({ payload }) => {
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            executionStore.updateResearchTask(payload.task_id, {
              findings: [...task.findings, payload.finding],
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          source: { title: string; url: string; domain?: string };
        }>('research:source_added', ({ payload }) => {
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            executionStore.updateResearchTask(payload.task_id, {
              sources: [...task.sources, payload.source],
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          success: boolean;
          time_elapsed?: string;
        }>('research:completed', ({ payload }) => {
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            const updatedSteps = task.steps.map((step) => ({
              ...step,
              status: payload.success ? ('completed' as const) : step.status,
            }));
            executionStore.updateResearchTask(payload.task_id, {
              status: payload.success ? 'completed' : 'failed',
              progress: 100,
              steps: updatedSteps,
              timeElapsed: payload.time_elapsed,
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          time_elapsed: string;
        }>('research:progress', ({ payload }) => {
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            executionStore.updateResearchTask(payload.task_id, {
              timeElapsed: payload.time_elapsed,
            });
          }
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          tool_name: string;
          status: string;
          message?: string;
        }>('chat:tool-progress', ({ payload }) => {
          if (payload.status !== 'processing_result') return;

          const state = useUnifiedChatStore.getState();
          const targetMessageId = resolveStreamTargetMessageId(payload.conversation_id);
          if (!targetMessageId) return;

          const progressText =
            payload.message ??
            `Processing ${normalizeToolNameForUi(payload.tool_name).replace(/_/g, ' ')}...`;

          state.updateMessage(targetMessageId, {
            ...buildStreamingStateMessageUpdate({
              streaming: true,
              status: 'tool_progress',
              label: progressText,
            }),
          });
        }),
      );

      registerListener(
        listen<{ tool_name: string; mode: string; hint?: string }>(
          'tool:blocked_by_mode',
          ({ payload }) => {
            const modeLabel = payload.mode || 'current';
            const hint = payload.hint || 'Change agent mode to allow this tool.';
            const message = `${payload.tool_name} is blocked in ${modeLabel} mode. ${hint}`;
            const eventId = `tool-blocked-${payload.tool_name}-${Date.now()}`;

            toast.error(message);
            useUnifiedChatStore.getState().addActionTrailEntry({
              type: 'error',
              message,
              fadeAfter: 10000,
              metadata: {
                toolName: payload.tool_name,
                mode: modeLabel,
                hint,
              },
            });
            useUnifiedChatStore.getState().addActionLogEntry({
              id: eventId,
              actionId: eventId,
              type: 'approval',
              title: 'Tool blocked by mode',
              description: message,
              status: 'failed',
              error: message,
              metadata: {
                toolName: payload.tool_name,
                mode: modeLabel,
                hint,
              },
            });
          },
        ),
      );

      registerListener(
        listen<{
          maxIterations: number;
          message: string;
        }>('agent:loop-iteration-limit', ({ payload }) => {
          toast.warning(payload.message || 'Agent reached iteration limit and was stopped');
        }),
      );

      registerListener(
        listen<{
          cumulativeCost: number;
          sessionLimit: number;
          message: string;
        }>('agent:budget-exceeded', ({ payload }) => {
          toast.error(payload.message || 'Agent session budget exceeded');
        }),
      );

      registerListener(
        listen<{
          cumulativeCost: number;
          sessionLimit: number;
          percentUsed: number;
          message: string;
        }>('agent:budget-warning', ({ payload }) => {
          toast.warning(payload.message || 'Agent approaching session budget limit');
        }),
      );
    };

    setupListeners().catch((error) => {
      console.error('[UnifiedAgenticChat] Failed to setup listeners:', error);
    });

    const activeStreamSessions = activeStreamSessionsRef.current;
    const toolExecutionTimeouts = toolExecutionTimeoutsRef.current;

    return () => {
      isMountedRef.current = false;

      // eslint-disable-next-line react-hooks/exhaustive-deps
      const currentRafId = rafIdRef.current;
      if (currentRafId) {
        cancelAnimationFrame(currentRafId);
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      activeStreamSessions.clear();
      toolExecutionTimeouts.forEach((timeoutEntry) => {
        clearTimeout(timeoutEntry.softTimeoutId);
        clearTimeout(timeoutEntry.hardTimeoutId);
      });
      toolExecutionTimeouts.clear();

      const listeners = [...unlistenFnsRef.current];
      unlistenFnsRef.current = [];

      listeners.forEach((unlisten) => {
        try {
          const result = unlisten();
          if (result && typeof result === 'object' && 'catch' in result) {
            (result as Promise<void>).catch((error) => {
              if (!String(error).includes('listeners[eventId]')) {
                console.warn('[UnifiedAgenticChat] Async listener cleanup warning:', error);
              }
            });
          }
        } catch (error) {
          if (!String(error).includes('listeners[eventId]')) {
            console.error('[UnifiedAgenticChat] Error during listener cleanup:', error);
          }
        }
      });
    };
    // AUDIT-005-014 fix: Remove stable store actions from dependency array
    // updateMessage and setStreamingMessage are stable zustand actions that don't change
    // Including them causes unnecessary re-registrations of event listeners
    // Refs are intentionally excluded — they are stable mutable containers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearQueuedStreamUpdates, markStreamActivity, queueStreamUpdate]);
}
