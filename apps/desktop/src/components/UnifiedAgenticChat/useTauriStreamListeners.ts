/**
 * useTauriStreamListeners
 *
 * Custom hook that sets up all Tauri event listeners for the chat stream.
 * Extracted from the main useEffect in UnifiedAgenticChat.
 */
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
import {
  clearRunningToolTrailEntries,
  reconcileToolArtifactTerminalState,
} from '../../lib/toolStreamRuntime';
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
    // Clear any stale unlisten functions from previous render
    unlistenFnsRef.current = [];

    const setupListeners = async () => {
      // Helper to register unlisten functions as promises resolve
      const registerListener = async (listenerPromise: Promise<() => void>) => {
        try {
          const unlisten = await listenerPromise;
          const isActiveSetup =
            isMountedRef.current && listenerSetupGenerationRef.current === setupGeneration;
          if (isActiveSetup) {
            unlistenFnsRef.current.push(unlisten);
          } else {
            // Component unmounted while setting up, clean up immediately
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

      /**
       * Shared stream teardown helper extracted from stream-end and stream-error handlers.
       * Clears queued updates, abort controller, loading state, tool timeouts, and agent status.
       */
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

          // Create new AbortController for this streaming session
          // This allows handleStopGeneration to cancel the current stream
          abortControllerRef.current = new AbortController();

          // CHT-005 fix: Register this stream session with conversation-to-message mapping
          // This prevents race conditions when multiple streams are active
          const messageId = String(payload.message_id);
          activeStreamSessionsRef.current.set(payload.conversation_id, messageId);

          // Stream has started, but we keep isLoading true until stream-end
          // This allows the UI to show streaming state
          useUnifiedChatStore.getState().setIsLoading(true);
        }),
      );

      // Live status updates: "Connecting...", "Writing response...", "Calling Read(file)..."
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

          // CHT-005 fix: Use session tracking for reliable message identification
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

          // AUDIT-STREAM-033 fix: Only clear global state if we have a valid target
          // This prevents stale stream-end events from one conversation clearing
          // active loading state for a different in-flight chat
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

          // CHT-005 fix: Clean up stream session tracking
          activeStreamSessionsRef.current.delete(payload.conversation_id);

          // AUDIT-STREAM-059 fix: Clear the stream watchdog since we got a valid stream-end
          if (streamWatchdogTimeoutRef.current) {
            clearTimeout(streamWatchdogTimeoutRef.current);
            streamWatchdogTimeoutRef.current = null;
          }

          // Update billing store with new credit info
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

          // Auto-TTS: speak the assistant response when the user's last input was voice
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
                  // Fallback to browser SpeechSynthesis when native TTS is unavailable
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

      // Listen for stream errors
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

          // CHT-005 fix: Use session tracking for reliable message identification
          const sessionMessageId = activeStreamSessionsRef.current.get(payload.conversation_id);
          const targetId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );
          const currentMatchesSession =
            !!currentStreamingId &&
            (currentStreamingId === sessionMessageId || currentStreamingId === messageId);

          // AUDIT-STREAM-033 fix: Only clear global state if we have a valid target
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

          // CHT-005 fix: Clean up stream session tracking on error
          activeStreamSessionsRef.current.delete(payload.conversation_id);

          // AUDIT-STREAM-059 fix: Clear the stream watchdog since we got a valid stream-error
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

      // Pending message event listeners
      registerListener(
        listen<{ id: string; content: string; timestamp: string; conversation_id?: number }>(
          'chat:pending-message-added',
          ({ payload }) => {
            // BUG-IX-05 fix: route to useChatStore (canonical owner of pending messages)
            useChatStore.getState().addPendingMessage(payload);
          },
        ),
      );

      registerListener(
        listen<{ message: { id: string; content: string }; remaining: number }>(
          'chat:pending-message-consumed',
          ({ payload }) => {
            // BUG-IX-05 fix: route to useChatStore (canonical owner of pending messages)
            useChatStore.getState().removePendingMessage(payload.message.id);
          },
        ),
      );

      registerListener(
        listen<{ count: number }>('chat:pending-messages-cleared', () => {
          // BUG-IX-05 fix: route to useChatStore (canonical owner of pending messages)
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

      // Listen for pending messages ready to be processed after stream ends
      registerListener(
        listen<{
          conversation_id: number;
          pending_messages: Array<{ id: string; content: string; timestamp: string }>;
          count: number;
        }>('chat:pending-messages-ready', async ({ payload }) => {
          // Auto-process pending messages by sending them as follow-up
          // This creates a seamless experience where queued messages are automatically sent
          // Process messages sequentially with delays to avoid race conditions
          for (let i = 0; i < payload.pending_messages.length; i++) {
            // Check if component is still mounted before processing each message
            if (!isMountedRef.current) {
              break;
            }

            const pending = payload.pending_messages[i];
            if (!pending) continue;

            // Actually send the pending message as a follow-up
            // Add delay between messages to avoid race conditions
            if (i > 0) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            try {
              // Dispatch a custom event that ChatInputArea listens to for auto-send
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
              // CHT-002 fix: Show user-visible error for pending message send failure
              toast.error('Failed to send queued message. Please try again.');
            }
          }
        }),
      );

      // Listen for agent thinking state
      registerListener(
        listen<{ agent_id?: string; thinking: boolean; phase?: string; message?: string }>(
          'agent:thinking',
          ({ payload }) => {
            const chatState = useUnifiedChatStore.getState();

            // Update action trail with thinking status
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

                // Fallback for stale pre-patch entries that did not tag the source.
                return payload.agent_id === undefined;
              }) ?? null;

            if (matchingEntry) {
              chatState.removeActionTrailEntry(matchingEntry.id);
            }
          },
        ),
      );

      // Listen for agent finished state
      registerListener(
        listen<{
          agent_id?: string;
          success: boolean;
          result?: string;
          error?: string;
          duration_ms?: number;
        }>('agent:finished', ({ payload }) => {
          // Update action trail with completion status
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.success ? 'completed' : 'error',
            message: payload.success
              ? payload.result || 'Task completed successfully'
              : payload.error || 'Task failed',
            fadeAfter: 5000,
            metadata: { duration_ms: payload.duration_ms },
          });

          // Clear any running agent status
          // Note: agent:finished event may not fire in all cases, so we also clear on tool result
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

      // Listen for extended thinking events (thinking:event from ThinkingState)
      // event_type: "start" | "delta" | "complete"
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

      // AUDIT-APPROVAL-047 fix: Removed duplicate tool:confirmation_required handler.
      // The tool confirmation flow is now handled exclusively by useAgenticEvents which
      // adds approvals to pendingApprovals store. Inline approval components then handle
      // user responses via useApprovalActions, which correctly routes to either
      // respond_tool_confirmation (for MCP/tool confirmations) or agent_resolve_approval
      // (for agent-level approvals).

      // Tool execution event listeners - display tool calls in the UI
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

          // CHT-009 fix: Update message metadata so MessageBubble renders the ToolCallCard
          // Find the target message
          const state = useUnifiedChatStore.getState();
          // Resolve deterministically: stream session map first, then explicit payload.message_id.

          const targetMessageId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );

          // If we found a target message, update its metadata
          if (targetMessageId) {
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

          // Add to action trail to show which tools are being called
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

            useUnifiedChatStore.getState().addActionTrailEntry({
              type: 'running',
              message: `Calling ${normalizedToolName}...`,
              metadata: { tool_call_id: tc.id, arguments: tc.arguments },
            });

            // Guard against dropped/missed `chat:tool-executing` events.
            // We start a timeout here as a fallback so every running tool resolves.
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

      // chat:tool-executing — legacy event, also emitted alongside `tool:event`.
      // Timeline creation and action trail updates are handled by the canonical
      // `tool:event` listener in toolStore.ts to avoid duplicate entries.
      // We only retain the timeout scheduling and stream activity tracking here.
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
          // Timeline entry is created by tool:event Started handler in toolStore.
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

      // Listen for agent progress events (iteration tracking for OpenClaw-style runs)
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

          // AUDIT-UI-034: Update message metadata status when tool result arrives
          // This ensures the tool card transitions from "running" to "completed/failed"
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
            useUnifiedChatStore
              .getState()
              .updateMessage(
                targetMessageId,
                buildToolResultStateMessageUpdate({ success: payload.success }),
              );
          }

          // Action trail update for completion is handled by tool:event Completed
          // in toolStore.ts — skip duplicate.  Only clear stale "running" entries
          // as a safety net if tool:event didn't already handle it.
          clearRunningToolTrailEntries(
            useUnifiedChatStore.getState(),
            payload.tool_call_id,
            normalizedToolName,
          );

          // Keep agent status coherent during multi-step runs:
          // a single tool result should update step text, not mark the whole run complete.
          const currentAgent = useUnifiedChatStore.getState().agentStatus;
          if (currentAgent && currentAgent.status === 'running') {
            useUnifiedChatStore.getState().setAgentStatus({
              ...currentAgent,
              currentStep: payload.success
                ? `Completed ${normalizedToolName}`
                : `Failed ${normalizedToolName}`,
            });
          }
        }),
      );

      // AUDIT-STREAM-022 fix: Listen for agi:tool_stream cancelled events
      // This ensures cancellation is properly handled for both event channels:
      // - agi:tool_stream (handled by useAgenticEvents.ts via activeToolStreams)
      // - chat:tool-* (handled here for UI updates)
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
          const { event: streamEvent, timestamp } = event.payload;

          // Mark activity on every AGI tool stream event so the watchdog
          // doesn't fire during long-running tools (e.g. image generation 30-90s)
          markStreamActivity();

          // Only handle cancelled events for cancellation cleanup
          if (streamEvent.type !== 'cancelled') return;

          const cancelledEvent = streamEvent as {
            type: 'cancelled';
            tool_id: string;
            reason?: string;
            duration_ms: number;
          };

          // Clear any tool execution timeout that might be pending
          clearToolExecutionTimeout(cancelledEvent.tool_id);

          const state = useUnifiedChatStore.getState();
          clearRunningToolTrailEntries(state, cancelledEvent.tool_id);

          // Update action trail to reflect cancellation
          state.addActionTrailEntry({
            type: 'error',
            message: `Tool cancelled: ${cancelledEvent.reason || 'Cancelled by user'}`,
            metadata: { tool_call_id: cancelledEvent.tool_id },
            fadeAfter: 3000,
          });

          reconcileToolArtifactTerminalState(state, cancelledEvent.tool_id, {
            status: 'cancelled',
            reason: cancelledEvent.reason,
            completedAt: new Date(timestamp).toISOString(),
            durationMs: cancelledEvent.duration_ms,
            messageState: {
              status: 'cancelled',
              streaming: false,
            },
          });
        }),
      );

      // Deep Research event listeners
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
            // Update the step status
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

      // Tool progress events — show subtle progress indicators when media tools are processing
      registerListener(
        listen<{
          conversation_id: number;
          tool_name: string;
          status: string;
          message?: string;
        }>('chat:tool-progress', ({ payload }) => {
          if (payload.status !== 'processing_result') return;

          // Find the streaming message for this conversation and surface the progress hint
          const state = useUnifiedChatStore.getState();
          const currentId = state.currentStreamingMessageId;
          if (!currentId) return;

          const progressText =
            payload.message ??
            `Processing ${normalizeToolNameForUi(payload.tool_name).replace(/_/g, ' ')}...`;

          state.updateMessage(currentId, {
            ...buildStreamingStateMessageUpdate({
              streaming: true,
              status: 'tool_progress',
              label: progressText,
            }),
          });
        }),
      );

      // Agent mode tool-blocked events — notify user when a tool is blocked by the current mode
      registerListener(
        listen<{ tool_name: string; mode: string }>('tool:blocked_by_mode', ({ payload }) => {
          toast.error(`Tool "${payload.tool_name}" is blocked in Safe mode`);
        }),
      );
    };

    // Start setting up listeners
    setupListeners().catch((error) => {
      console.error('[UnifiedAgenticChat] Failed to setup listeners:', error);
    });

    // Capture ref values inside the effect for safe cleanup
    const activeStreamSessions = activeStreamSessionsRef.current;
    const toolExecutionTimeouts = toolExecutionTimeoutsRef.current;

    return () => {
      // Mark as unmounted first to prevent new registrations
      isMountedRef.current = false;

      // Clean up RAF — copy ref value to variable to avoid stale closure issues
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const currentRafId = rafIdRef.current;
      if (currentRafId) {
        cancelAnimationFrame(currentRafId);
      }

      // Abort any active streaming to prevent background work after unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Clear stale stream session tracking
      activeStreamSessions.clear();
      // Bug #305 fix: Clear the live ref directly instead of a snapshot copy.
      // A snapshot copy clears its own Map but leaves the ref's Map untouched,
      // causing stale timeouts to persist if the hook re-mounts.
      toolExecutionTimeouts.forEach((timeoutEntry) => {
        clearTimeout(timeoutEntry.softTimeoutId);
        clearTimeout(timeoutEntry.hardTimeoutId);
      });
      toolExecutionTimeouts.clear();

      // Clean up all registered listeners - handle both sync and async unlisten functions
      // Some Tauri listeners may return promises that need to be caught to avoid unhandled rejections
      const listeners = [...unlistenFnsRef.current];
      unlistenFnsRef.current = [];

      listeners.forEach((unlisten) => {
        try {
          const result = unlisten();
          // Handle async unlisten functions that return promises
          if (result && typeof result === 'object' && 'catch' in result) {
            (result as Promise<void>).catch((error) => {
              // Suppress "listeners[eventId].handleId" errors - these occur when
              // the event system is cleaning up during component unmount
              if (!String(error).includes('listeners[eventId]')) {
                console.warn('[UnifiedAgenticChat] Async listener cleanup warning:', error);
              }
            });
          }
        } catch (error) {
          // Suppress the specific Tauri internal error during cleanup
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
