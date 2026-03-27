/**
 * useTauriEventListeners
 *
 * Custom hook that encapsulates the mega useEffect which registers all Tauri
 * event listeners for the chat stream (stream-start, stream-chunk, stream-end,
 * stream-error, tool-calls, tool-executing, tool-result, agent events,
 * pending messages, deep research events, etc.).
 *
 * All inner helpers (resolveStreamTargetMessageId, upsertToolArtifact, etc.)
 * live inside this hook and are scoped to the listener lifecycle.
 */
import { useEffect } from 'react';
import { listen as _listenBase, isTauri } from '@/lib/tauri-mock';
import { invoke as ipcInvoke } from '@/utils/ipc';
import { useUnifiedChatStore, uuidToDbId } from '@/stores/unified/unifiedChatStore';
import { useBillingStore } from '@/stores/unified/auth';
import { useExecutionStore } from '@/stores/unified/executionStore';
import { formatErrorForChat } from '@/lib/friendlyErrors';
import { toast } from '@/hooks/useToast';
import type { Artifact } from '@/types/chat';
import {
  normalizeToolNameForUi,
  toolNameToArtifactType,
  toolNameToTitle,
  normalizeInlineToolData,
} from './toolDataNormalizers';
import { resolveToolHardTimeoutMs, shouldAbortGenerationOnToolTimeout } from './toolTimeoutPolicy';
import type { StreamBufferRefs, StreamBufferCallbacks } from './useStreamBuffer';

// Typed wrapper for listen to support generics in web build
const listen = <T = unknown>(
  event: string,
  handler: (e: { payload: T }) => void,
): Promise<() => void> => _listenBase(event, handler as (e: { payload: unknown }) => void);

const TOOL_EXECUTION_SOFT_TIMEOUT_MS = 10_000;

export interface UseTauriEventListenersConfig extends StreamBufferRefs, StreamBufferCallbacks {}

export function useTauriEventListeners(config: UseTauriEventListenersConfig): void {
  const {
    abortControllerRef,
    streamBufferRef: _streamBufferRef,
    rafIdRef,
    streamWatchdogTimeoutRef,
    lastStreamActivityAtRef: _lastStreamActivityAtRef,
    unlistenFnsRef,
    listenerSetupGenerationRef,
    isMountedRef,
    toolExecutionTimeoutsRef,
    activeStreamSessionsRef,
    queueStreamUpdate,
    clearQueuedStreamUpdates,
    markStreamActivity,
  } = config;

  // Suppress unused-variable lint for refs that are only read indirectly inside closures
  void _streamBufferRef;
  void _lastStreamActivityAtRef;

  useEffect(() => {
    if (!isTauri) return;

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

      const getConversationMessagesForStream = (conversationId: number) => {
        const state = useUnifiedChatStore.getState();

        if (
          state.activeConversationId &&
          uuidToDbId(state.activeConversationId) === conversationId
        ) {
          return state.messages;
        }

        const matchingConversationId = Object.keys(state.messagesByConversation).find(
          (id) => uuidToDbId(id) === conversationId,
        );

        if (matchingConversationId) {
          return state.messagesByConversation[matchingConversationId] ?? [];
        }

        return [];
      };

      const findMessageById = (messageId: string) => {
        const state = useUnifiedChatStore.getState();
        const direct = state.messages.find((msg) => msg.id === messageId);
        if (direct) return direct;

        for (const messages of Object.values(state.messagesByConversation)) {
          const found = messages.find((msg) => msg.id === messageId);
          if (found) return found;
        }
        return null;
      };

      const resolveStreamTargetMessageId = (
        conversationId: number,
        payloadMessageId?: string | number,
      ): string | null => {
        const state = useUnifiedChatStore.getState();
        const conversationMessages = getConversationMessagesForStream(conversationId);
        const sessionMessageId = activeStreamSessionsRef.current.get(conversationId);
        const normalizedPayloadId =
          payloadMessageId === undefined || payloadMessageId === null
            ? null
            : String(payloadMessageId);

        // Priority 1: Session-tracked message for this conversation
        if (sessionMessageId && conversationMessages.some((m) => m.id === sessionMessageId)) {
          return sessionMessageId;
        }
        // Priority 2: Explicit message ID from payload
        if (
          normalizedPayloadId &&
          conversationMessages.some((m) => String(m.id) === normalizedPayloadId)
        ) {
          return normalizedPayloadId;
        }
        // Priority 3: Current streaming message (only if it belongs to this conversation)
        if (
          state.currentStreamingMessageId &&
          conversationMessages.some((m) => String(m.id) === String(state.currentStreamingMessageId))
        ) {
          return state.currentStreamingMessageId;
        }

        // FALLBACK: Find ANY assistant message in this conversation (even if not streaming)
        if (conversationMessages.length > 0) {
          const streamingAssistant = conversationMessages.find(
            (m) => m.role === 'assistant' && m.metadata?.streaming,
          );
          if (streamingAssistant) {
            return streamingAssistant.id;
          }
          const lastAssistant = [...conversationMessages]
            .reverse()
            .find((m) => m.role === 'assistant');
          if (lastAssistant) {
            return lastAssistant.id;
          }
        }

        // Last resort: use currentStreamingMessageId even if not in this conversation's messages
        if (state.currentStreamingMessageId) {
          return state.currentStreamingMessageId;
        }

        return null;
      };

      const upsertToolArtifact = (
        conversationId: number,
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

        const targetMessage = findMessageById(targetMessageId);
        if (!targetMessage) {
          console.warn('[upsertToolArtifact] Message not found for id:', targetMessageId);
          return;
        }

        const baseArtifacts = [
          ...(targetMessage.artifacts || []),
          ...(((targetMessage.metadata?.artifacts as Artifact[] | undefined) || []).filter(
            (artifact) =>
              !targetMessage.artifacts?.some(
                (existing) => existing.id === artifact.id || existing.content === artifact.content,
              ),
          ) as Artifact[]),
        ] as Artifact[];

        const index = baseArtifacts.findIndex((artifact) => artifact.id === toolCallId);
        const existing = index >= 0 ? baseArtifacts[index] : null;
        const patchToolName = String(
          patch['toolName'] || (existing as Record<string, unknown> | null)?.['toolName'] || 'code',
        );
        const patchContent = String(
          patch['content'] || (existing as Record<string, unknown> | null)?.['content'] || '',
        );
        const nextArtifact = {
          id: toolCallId,
          type: toolNameToArtifactType(patchToolName),
          title: toolNameToTitle(patchToolName),
          content: patchContent,
          ...existing,
          ...patch,
        };

        const nextArtifacts =
          index >= 0
            ? baseArtifacts.map((artifact, i) => (i === index ? nextArtifact : artifact))
            : [...baseArtifacts, nextArtifact];

        state.updateMessage(targetMessageId, {
          artifacts: nextArtifacts as Artifact[],
          metadata: {
            artifacts: nextArtifacts as Artifact[],
          },
        });
      };

      const finalizeRunningArtifactsForMessage = (
        messageId: string,
        status: 'completed' | 'failed' | 'cancelled',
        reason: string,
      ) => {
        const state = useUnifiedChatStore.getState();
        const targetMessage = findMessageById(messageId);
        if (!targetMessage) return;

        const baseArtifacts = [
          ...(targetMessage.artifacts || []),
          ...(((targetMessage.metadata?.artifacts as Artifact[] | undefined) || []).filter(
            (artifact) =>
              !targetMessage.artifacts?.some(
                (existing) => existing.id === artifact.id || existing.content === artifact.content,
              ),
          ) as Artifact[]),
        ] as Artifact[];
        if (baseArtifacts.length === 0) return;

        let changed = false;
        const nextArtifacts = baseArtifacts.map((artifact) => {
          const withRuntimeFields = artifact as Artifact & {
            status?: string;
            success?: boolean;
            error?: string;
            content?: string;
          };
          if (withRuntimeFields.status !== 'running') {
            return artifact;
          }
          changed = true;
          const currentContent = (withRuntimeFields.content || '').trim();
          if (status === 'completed') {
            return {
              ...withRuntimeFields,
              status: 'completed',
              success: true,
              content: currentContent || 'Tool completed. Output included in assistant response.',
            } as Artifact;
          }
          if (status === 'cancelled') {
            return {
              ...withRuntimeFields,
              status: 'cancelled',
              success: false,
              error: reason,
              content: currentContent || reason,
            } as Artifact;
          }
          return {
            ...withRuntimeFields,
            status: 'failed',
            success: false,
            error: reason,
            content: currentContent || reason,
          } as Artifact;
        });

        if (!changed) return;
        state.updateMessage(messageId, {
          artifacts: nextArtifacts as Artifact[],
          metadata: {
            artifacts: nextArtifacts as Artifact[],
          },
        });
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

      const clearToolExecutionTimeout = (toolCallId: string) => {
        const timeoutEntry = toolExecutionTimeoutsRef.current.get(toolCallId);
        if (timeoutEntry) {
          clearTimeout(timeoutEntry.softTimeoutId);
          clearTimeout(timeoutEntry.hardTimeoutId);
          toolExecutionTimeoutsRef.current.delete(toolCallId);
        }
      };

      const scheduleToolExecutionTimeout = (
        toolCallId: string,
        toolName: string,
        conversationId: number,
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
            state.setIsLoading(false);
            state.setStreamingMessage(null);
            if (state.currentStreamingMessageId) {
              state.updateMessage(state.currentStreamingMessageId, {
                metadata: { streaming: false },
              });
            }
            if (isTauri) {
              void ipcInvoke('chat_stop_generation').catch((error: unknown) => {
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
          softTimeoutId,
          hardTimeoutId,
        });
      };

      /**
       * Shared stream teardown helper extracted from stream-end and stream-error handlers.
       * Clears queued updates, abort controller, loading state, tool timeouts, and agent status.
       */
      const finalizeStream = (
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

        const s = useUnifiedChatStore.getState();
        s.setIsLoading(false);
        s.setStreamingMessage(null);
        toolExecutionTimeoutsRef.current.forEach((timeoutEntry) => {
          clearTimeout(timeoutEntry.softTimeoutId);
          clearTimeout(timeoutEntry.hardTimeoutId);
        });
        toolExecutionTimeoutsRef.current.clear();

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
        listen<{ conversation_id: number; message_id: string | number; created_at: string }>(
          'chat:stream-start',
          ({ payload }) => {
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
          },
        ),
      );

      registerListener(
        listen<{
          conversation_id: number;
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
          conversation_id: number;
          message_id: string | number;
          backend_message_id?: number;
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
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
          let finalizedMessageId: string | null = null;
          let hasValidTarget = targetId !== null || currentMatchesSession;

          // AUDIT-STREAM-033 fix: Only clear global state if we have a valid target
          // This prevents stale stream-end events from one conversation clearing
          // active loading state for a different in-flight chat
          if (targetId) {
            finalizedMessageId = targetId;
            state.updateMessage(targetId, {
              metadata: {
                streaming: false,
                tokenCount: payload.usage?.total_tokens,
                cost: payload.credits?.cost_cents ? payload.credits.cost_cents / 100 : undefined,
              },
            });
            finalizeRunningArtifactsForMessage(
              targetId,
              'completed',
              'Tool completed without explicit terminal event.',
            );
          } else if (currentStreamingId && currentMatchesSession) {
            finalizedMessageId = currentStreamingId;
            state.updateMessage(currentStreamingId, {
              metadata: {
                streaming: false,
                tokenCount: payload.usage?.total_tokens,
                cost: payload.credits?.cost_cents ? payload.credits.cost_cents / 100 : undefined,
              },
            });
            finalizeRunningArtifactsForMessage(
              currentStreamingId,
              'completed',
              'Tool completed without explicit terminal event.',
            );
          } else {
            // Fallback: clear any assistant message still marked as streaming to
            // avoid stale "Generating" UI when stream-end IDs don't resolve cleanly.
            const fallbackStreaming = [...state.messages]
              .reverse()
              .find((m) => m.role === 'assistant' && m.metadata?.streaming);
            if (fallbackStreaming) {
              finalizedMessageId = fallbackStreaming.id;
              hasValidTarget = true;
              state.updateMessage(fallbackStreaming.id, {
                metadata: {
                  streaming: false,
                  tokenCount: payload.usage?.total_tokens,
                  cost: payload.credits?.cost_cents ? payload.credits.cost_cents / 100 : undefined,
                },
              });
              finalizeRunningArtifactsForMessage(
                fallbackStreaming.id,
                'completed',
                'Tool completed without explicit terminal event.',
              );
            }
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
            useBillingStore.getState().updateCredits({
              balance_cents: payload.credits.remaining_cents,
              daily_limit_cents: payload.credits.daily_limit ?? null,
              daily_usage_cents: payload.credits.daily_used ?? 0,
            });
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
            finalizeStream(finalizedMessageId, 'completed');
          }
        }),
      );

      // Listen for stream errors
      registerListener(
        listen<{ conversation_id: number; message_id: string | number; error: string }>(
          'chat:stream-error',
          ({ payload }) => {
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
            let hasValidTarget = targetId !== null || currentMatchesSession;
            let finalizedMessageId: string | null = null;

            if (targetId) {
              finalizedMessageId = targetId;
              // Always use friendly error messages — no raw error strings in the UI
              const displayError = formatErrorForChat(payload.error, true);

              state.updateMessage(targetId, {
                content: displayError,
                metadata: { streaming: false },
                error: payload.error,
              });
              finalizeRunningArtifactsForMessage(
                targetId,
                'failed',
                payload.error || 'Tool failed while generating the response.',
              );
            } else if (currentStreamingId && currentMatchesSession) {
              finalizedMessageId = currentStreamingId;
              const displayError = formatErrorForChat(payload.error, true);

              state.updateMessage(currentStreamingId, {
                content: displayError,
                metadata: { streaming: false },
                error: payload.error,
              });
              finalizeRunningArtifactsForMessage(
                currentStreamingId,
                'failed',
                payload.error || 'Tool failed while generating the response.',
              );
            } else {
              // Fallback: clear any assistant message still marked as streaming to
              // avoid stale "Generating" UI when stream-error IDs don't resolve cleanly.
              const fallbackStreaming = [...state.messages]
                .reverse()
                .find((m) => m.role === 'assistant' && m.metadata?.streaming);
              if (fallbackStreaming) {
                finalizedMessageId = fallbackStreaming.id;
                hasValidTarget = true;
                const displayError = formatErrorForChat(payload.error, true);
                state.updateMessage(fallbackStreaming.id, {
                  content: displayError,
                  metadata: { streaming: false },
                  error: payload.error,
                });
                finalizeRunningArtifactsForMessage(
                  fallbackStreaming.id,
                  'failed',
                  payload.error || 'Tool failed while generating the response.',
                );
              }
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
              finalizeStream(finalizedMessageId, 'failed', payload.error);
            }
          },
        ),
      );

      // Pending message event listeners
      registerListener(
        listen<{ id: string; content: string; timestamp: string; conversation_id?: number }>(
          'chat:pending-message-added',
          ({ payload }) => {
            useUnifiedChatStore.getState().addPendingMessage(payload);
          },
        ),
      );

      registerListener(
        listen<{ message: { id: string; content: string }; remaining: number }>(
          'chat:pending-message-consumed',
          ({ payload }) => {
            useUnifiedChatStore.getState().removePendingMessage(payload.message.id);
          },
        ),
      );

      registerListener(
        listen<{ count: number }>('chat:pending-messages-cleared', () => {
          useUnifiedChatStore.getState().clearPendingMessages();
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

            // Remove from pending queue in store
            useUnifiedChatStore.getState().removePendingMessage(pending.id);

            // Clear from backend queue - pass conversation_id to ensure we pop the right message
            try {
              await ipcInvoke('chat_pop_pending_message', {
                request: { conversation_id: payload.conversation_id },
              });
            } catch (err) {
              console.error('[UnifiedAgenticChat] Failed to pop pending message:', err);
              // CHT-002 fix: Show user-visible error for pending message processing failure
              toast({
                variant: 'destructive',
                title: 'Failed to process queued message. Please try again.',
              });
              // AUDIT-005-010 fix: Abort processing this message on pop failure to prevent inconsistent state
              continue;
            }

            // Actually send the pending message as a follow-up
            // Add delay between messages to avoid race conditions
            if (i > 0) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            try {
              // Dispatch a custom event that ChatInputArea listens to for auto-send
              window.dispatchEvent(
                new CustomEvent('chat:auto-send-pending', {
                  detail: { content: pending.content, pendingId: pending.id },
                }),
              );
            } catch (err) {
              console.error('[UnifiedAgenticChat] Failed to send pending message:', err);
              // CHT-002 fix: Show user-visible error for pending message send failure
              toast({
                variant: 'destructive',
                title: 'Failed to send queued message. Please try again.',
              });
            }
          }
        }),
      );

      // Listen for agent thinking state
      registerListener(
        listen<{ agent_id?: string; thinking: boolean; phase?: string; message?: string }>(
          'agent:thinking',
          ({ payload }) => {
            // Update action trail with thinking status
            if (payload.thinking) {
              useUnifiedChatStore.getState().addActionTrailEntry({
                type: 'thinking',
                message: payload.message || payload.phase || 'Thinking...',
                fadeAfter: 30000, // Fade after 30 seconds if not cleared
              });
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

      // AUDIT-APPROVAL-047 fix: Removed duplicate tool:confirmation_required handler.
      // The tool confirmation flow is now handled exclusively by useAgenticEvents which
      // adds approvals to pendingApprovals store. The ApprovalModal then handles
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
              state.updateMessage(targetMessageId, {
                metadata: {
                  // key fields for MessageBubble to detect tool call
                  tool: normalizedFirstToolName,
                  tool_call: firstTool.id,
                  actionId: firstTool.id, // AUDIT-UI-035: Add actionId for MessageBubble store linkage
                  name: normalizedFirstToolName,
                  status: 'running',
                  // also keep streaming true so it shows as active
                  streaming: true,
                },
              });
            }
          }

          // Add to action trail to show which tools are being called
          for (const tc of payload.tool_calls) {
            const normalizedToolName = normalizeToolNameForUi(tc.name);
            let parsedArguments: Record<string, unknown> = {};
            try {
              parsedArguments = tc.arguments
                ? (JSON.parse(tc.arguments) as Record<string, unknown>)
                : {};
            } catch {
              // Keep fallback empty object if arguments are partial/non-JSON.
            }

            upsertToolArtifact(
              payload.conversation_id,
              tc.id,
              {
                toolName: normalizedToolName, // Use normalized tool names for renderer lookups
                type: toolNameToArtifactType(normalizedToolName),
                title: toolNameToTitle(normalizedToolName),
                status: 'running',
                content: '',
                ...(parsedArguments['prompt'] ? { prompt: parsedArguments['prompt'] } : {}),
                ...(parsedArguments['output_path']
                  ? { filePath: parsedArguments['output_path'] }
                  : {}),
                ...(parsedArguments['file_path'] ? { filePath: parsedArguments['file_path'] } : {}),
              },
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
          scheduleToolExecutionTimeout(
            payload.tool_call_id,
            normalizedToolName,
            payload.conversation_id,
            true,
            payload.message_id,
          );

          // Update action trail with executing status
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `Executing ${normalizedToolName}...`,
            metadata: { tool_call_id: payload.tool_call_id },
          });
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

          let parsedData: Record<string, unknown> = payload.result_data || {};
          if (!payload.result_data && payload.result) {
            try {
              const parsed = JSON.parse(payload.result);
              if (parsed && typeof parsed === 'object') {
                parsedData = parsed as Record<string, unknown>;
              }
            } catch {
              // Keep raw string available so inline renderers can still display content.
              parsedData = { raw_result: payload.result };
            }
          }

          const normalizedData = normalizeInlineToolData(normalizedToolName, parsedData);

          upsertToolArtifact(
            payload.conversation_id,
            payload.tool_call_id,
            {
              toolName: normalizedToolName,
              type: toolNameToArtifactType(normalizedToolName),
              title: toolNameToTitle(normalizedToolName),
              status: payload.success ? 'completed' : 'failed',
              success: payload.success,
              error: payload.success ? undefined : payload.result,
              content: payload.result || '',
              ...normalizedData,
            },
            payload.message_id,
          );

          // AUDIT-UI-034: Update message metadata status when tool result arrives
          // This ensures the tool card transitions from "running" to "completed/failed"
          const targetMessageId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );
          if (targetMessageId) {
            useUnifiedChatStore.getState().updateMessage(targetMessageId, {
              metadata: {
                status: payload.success ? 'completed' : 'failed',
                streaming: false, // Stop streaming indicator
              },
            });
          }

          // Update action trail with result
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.success ? 'completed' : 'error',
            message: payload.success
              ? `${normalizedToolName} completed`
              : `${normalizedToolName} failed`,
            metadata: { tool_call_id: payload.tool_call_id, result_preview: payload.result },
            fadeAfter: 3000,
          });

          // Remove the old "running" entry for this tool_call_id to prevent "Running..." from staying
          const state = useUnifiedChatStore.getState();
          const actionTrail = state.actionTrail;
          const runningEntries = actionTrail.filter((entry) => {
            if (entry.type !== 'running') return false;
            const metadataToolCallId = (entry.metadata as Record<string, unknown> | undefined)?.[
              'tool_call_id'
            ];
            if (metadataToolCallId === payload.tool_call_id) return true;
            // Backward compatibility: clear legacy running entries that were added without metadata.
            return (
              entry.message === `Executing ${normalizedToolName}...` ||
              entry.message === `Calling ${normalizedToolName}...`
            );
          });
          for (const runningEntry of runningEntries) {
            state.removeActionTrailEntry(runningEntry.id);
          }

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

          // Update action trail to reflect cancellation
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'error',
            message: `Tool cancelled: ${cancelledEvent.reason || 'Cancelled by user'}`,
            metadata: { tool_call_id: cancelledEvent.tool_id },
            fadeAfter: 3000,
          });

          // Update message metadata to reflect cancelled status
          // We need to find the message that contains this tool's artifact
          const state = useUnifiedChatStore.getState();
          for (const message of state.messages) {
            const artifacts = message.artifacts || [];
            const artifactIndex = artifacts.findIndex((a) => a.id === cancelledEvent.tool_id);
            if (artifactIndex >= 0) {
              const existingArtifact = artifacts[artifactIndex];
              if (existingArtifact) {
                const updatedArtifact = {
                  ...existingArtifact,
                  metadata: {
                    ...existingArtifact.metadata,
                    status: 'cancelled',
                    error: cancelledEvent.reason,
                    completedAt: new Date(timestamp).toISOString(),
                    duration_ms: cancelledEvent.duration_ms,
                  },
                };
                const updatedArtifacts = [...artifacts];
                updatedArtifacts[artifactIndex] = updatedArtifact;

                state.updateMessage(message.id, {
                  artifacts: updatedArtifacts,
                  metadata: {
                    ...message.metadata,
                    artifacts: updatedArtifacts,
                    status: 'cancelled',
                    streaming: false,
                  },
                });
              }
              break;
            }
          }
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
            const existingSteps = task.steps ?? [];
            // Update the step status
            const updatedSteps = existingSteps.map((step: any, index: any) => {
              if (index === payload.step_index || step.id === payload.step_id) {
                return { ...step, status: 'running' as const, timestamp: Date.now() };
              }
              return step;
            });
            executionStore.updateResearchTask(payload.task_id, {
              steps: updatedSteps,
              progress:
                existingSteps.length > 0
                  ? Math.round((payload.step_index / existingSteps.length) * 100)
                  : (task.progress ?? 0),
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
            const existingSteps = task.steps ?? [];
            const updatedSteps = existingSteps.map((step: any, index: any) => {
              if (index === payload.step_index || step.id === payload.step_id) {
                return {
                  ...step,
                  status: payload.success ? ('completed' as const) : ('failed' as const),
                  details: payload.details,
                };
              }
              return step;
            });
            const completedCount = updatedSteps.filter((s: any) => s.status === 'completed').length;
            executionStore.updateResearchTask(payload.task_id, {
              steps: updatedSteps,
              progress:
                existingSteps.length > 0
                  ? Math.round((completedCount / existingSteps.length) * 100)
                  : (task.progress ?? 0),
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
              findings: [...(task.findings ?? []), payload.finding],
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
            const existingSources = task.sources ?? [];
            executionStore.updateResearchTask(payload.task_id, {
              sources: [
                ...existingSources,
                {
                  id: `${payload.task_id}-source-${existingSources.length}-${Date.now()}`,
                  title: payload.source.title,
                  url: payload.source.url,
                  domain: payload.source.domain,
                  snippet: '',
                  relevanceScore: 0,
                  fetchedAt: new Date(),
                },
              ],
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
            const updatedSteps = (task.steps ?? []).map((step: any) => ({
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
    };

    // Start setting up listeners
    setupListeners().catch((error) => {
      console.error('[UnifiedAgenticChat] Failed to setup listeners:', error);
    });

    // Capture ref values inside the effect for safe cleanup
    const activeStreamSessions = activeStreamSessionsRef.current;

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
      // Copy ref value to variable for cleanup to avoid stale closure issues
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const timeouts = new Map(toolExecutionTimeoutsRef.current);
      timeouts.forEach((timeoutEntry) => {
        clearTimeout(timeoutEntry.softTimeoutId);
        clearTimeout(timeoutEntry.hardTimeoutId);
      });
      timeouts.clear();

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
  }, [
    clearQueuedStreamUpdates,
    markStreamActivity,
    queueStreamUpdate,
    abortControllerRef,
    rafIdRef,
    streamWatchdogTimeoutRef,
    unlistenFnsRef,
    listenerSetupGenerationRef,
    isMountedRef,
    toolExecutionTimeoutsRef,
    activeStreamSessionsRef,
  ]);
}
